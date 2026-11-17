import { findDuplicate, jobFingerprint, KnownJob, toKnownJob } from "./dedup";
import { DEFAULT_WINDOW_HOURS, detectEvergreen, evaluateFreshness } from "./freshness";
import { HttpClient } from "./http";
import { isCanadaJob } from "./location";
import { SHORTLIST_THRESHOLD, scoreJob } from "./scoring";
import { fetchBoard } from "./sources";
import {
  BoardConfig,
  CandidateProfile,
  DiscoveryRunReport,
  EvaluatedJob,
  NormalizedJob,
  RejectionReason,
} from "./types";

export interface PipelineOptions {
  boards: BoardConfig[];
  candidate: CandidateProfile;
  http: HttpClient;
  known: KnownJob[];
  now?: Date;
  windowHours?: number;
  threshold?: number;
  maxShortlist?: number;
  concurrency?: number;
  fetchBoardImpl?: typeof fetchBoard;
  log?: (msg: string) => void;
}

const DEFAULT_MAX_SHORTLIST = 5;
const DEFAULT_CONCURRENCY = 4;
const MAX_NEAR_MISSES = 10;
const NEAR_MISS_MARGIN = 15;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex++;
      results[index] = await fn(items[index]);
    }
  }

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(limit, items.length);

  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return results;
}

function boardName(board: BoardConfig): string {
  return `${board.provider}/${board.token}`;
}

function postingKey(job: { provider: string; externalId: string }): string {
  return `${job.provider}:${job.externalId}`;
}

function reject(
  job: NormalizedJob,
  base: Omit<EvaluatedJob, "rejection" | "rejectionDetail" | "job">,
  reason: RejectionReason,
  detail: string
): EvaluatedJob {
  return { job, ...base, rejection: reason, rejectionDetail: detail };
}

function compareByScoreThenAge(a: EvaluatedJob, b: EvaluatedJob): number {
  const scoreDiff = (b.score?.total ?? 0) - (a.score?.total ?? 0);

  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return (a.freshness.ageHours ?? 99) - (b.freshness.ageHours ?? 99);
}

// Cheap gates run first. The score threshold only applies to fresh, unique, relevant postings.
export function evaluateJob(
  job: NormalizedJob,
  ctx: {
    candidate: CandidateProfile;
    known: KnownJob[];
    now: Date;
    windowHours: number;
    threshold: number;
  }
): EvaluatedJob {
  const freshness = evaluateFreshness(job, ctx.now, ctx.windowHours);
  const base = { freshness, score: null, fingerprint: jobFingerprint(job) };

  const locations = job.locations.length ? job.locations : [job.location];

  if (!isCanadaJob(locations, job.country)) {
    return reject(job, base, "not_canada", `Location "${job.location}" is outside Canada`);
  }

  if (freshness.status === "invalid") {
    return reject(job, base, "unlisted", freshness.reason);
  }

  if (freshness.status === "unverified") {
    return reject(job, base, "unverified_date", freshness.reason);
  }

  if (freshness.status === "stale") {
    return reject(job, base, "stale", freshness.reason);
  }

  const evergreen = detectEvergreen(job);

  if (evergreen) {
    return reject(job, base, "evergreen", evergreen);
  }

  const duplicate = findDuplicate(job, ctx.known, ctx.now, ctx.windowHours);

  if (duplicate) {
    const withDuplicate = {
      ...base,
      duplicateOf: { kind: duplicate.kind, existingId: duplicate.existingId },
    };
    const reason: RejectionReason = duplicate.kind === "repost" ? "repost" : "duplicate";

    return reject(job, withDuplicate, reason, duplicate.detail);
  }

  const score = scoreJob(job, ctx.candidate);
  const scored = { ...base, score };
  const roleRelevance = score.dimensions.roleRelevance;

  if (roleRelevance.score === 0) {
    return reject(job, scored, "irrelevant_role", roleRelevance.explanation);
  }

  if (score.total < ctx.threshold) {
    return reject(job, scored, "below_threshold", `Score ${score.total} < ${ctx.threshold}`);
  }

  return { job, ...scored, rejection: null, rejectionDetail: null };
}

export async function runDiscoveryPipeline(opts: PipelineOptions): Promise<DiscoveryRunReport> {
  const now = opts.now ?? new Date();
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  // A caller can raise the threshold but not lower it below SHORTLIST_THRESHOLD.
  const threshold = Math.max(opts.threshold ?? SHORTLIST_THRESHOLD, SHORTLIST_THRESHOLD);
  const maxShortlist = opts.maxShortlist ?? DEFAULT_MAX_SHORTLIST;
  const doFetch = opts.fetchBoardImpl ?? fetchBoard;
  const log = opts.log ?? (() => {});
  const startedAt = new Date().toISOString();

  const boardErrors: DiscoveryRunReport["boardErrors"] = [];

  const results = await mapLimit(
    opts.boards,
    opts.concurrency ?? DEFAULT_CONCURRENCY,
    async (board) => {
      try {
        const jobs = await doFetch(board, opts.http);
        log(`[discovery] ${boardName(board)}: ${jobs.length} postings`);
        return jobs;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        boardErrors.push({ board: boardName(board), error: message });
        log(`[discovery] ${boardName(board)} failed: ${message}`);
        return [];
      }
    }
  );

  const postings = results.flat();

  // Postings scored in this run are added here, so the same opening on two boards is caught.
  const known = [...opts.known];
  const knownIds = new Set(known.map(postingKey));

  // Stale postings still in the feed count as history, so a "new" posting matching one is a repost.
  for (const job of postings) {
    if (knownIds.has(postingKey(job))) {
      continue;
    }

    const freshness = evaluateFreshness(job, now, windowHours);

    if (freshness.status === "stale" && job.postedAt) {
      known.push(toKnownJob(job, `feed:${postingKey(job)}`, job.postedAt));
    }
  }

  const evaluated: EvaluatedJob[] = [];

  for (const job of postings) {
    const result = evaluateJob(job, {
      candidate: opts.candidate,
      known,
      now,
      windowHours,
      threshold,
    });

    evaluated.push(result);

    const wasScored =
      result.rejection === null ||
      result.rejection === "below_threshold" ||
      result.rejection === "irrelevant_role";

    if (wasScored) {
      known.push(toKnownJob(job, `run:${postingKey(job)}`, now.toISOString()));
    }
  }

  const rejectedCounts: DiscoveryRunReport["rejectedCounts"] = {};

  for (const item of evaluated) {
    if (!item.rejection) {
      continue;
    }

    rejectedCounts[item.rejection] = (rejectedCounts[item.rejection] ?? 0) + 1;
  }

  const qualifying = evaluated
    .filter((item) => item.rejection === null)
    .sort(compareByScoreThenAge);

  const nearMissFloor = threshold - NEAR_MISS_MARGIN;
  const nearMisses = evaluated
    .filter((item) => item.rejection === "below_threshold" && (item.score?.total ?? 0) >= nearMissFloor)
    .sort(compareByScoreThenAge)
    .slice(0, MAX_NEAR_MISSES);

  const failedBoards = new Set(boardErrors.map((item) => item.board));
  const boardsSucceeded = opts.boards
    .map(boardName)
    .filter((name) => !failedBoards.has(name));

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    boardsQueried: opts.boards.length,
    boardsSucceeded,
    boardErrors,
    postingsFetched: postings.length,
    rejectedCounts,
    shortlisted: qualifying.slice(0, maxShortlist),
    nearMisses,
    evaluated,
  };
}
