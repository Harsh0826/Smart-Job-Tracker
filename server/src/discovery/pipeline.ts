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

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function reject(
  job: NormalizedJob,
  base: Omit<EvaluatedJob, "rejection" | "rejectionDetail" | "job">,
  reason: RejectionReason,
  detail: string
): EvaluatedJob {
  return { job, ...base, rejection: reason, rejectionDetail: detail };
}

/**
 * Evaluate one already-fetched posting. Order matters: cheap hard gates first, scoring last, and the
 * score threshold is applied only to fresh, unique, relevant postings.
 */
export function evaluateJob(
  job: NormalizedJob,
  ctx: { candidate: CandidateProfile; known: KnownJob[]; now: Date; windowHours: number; threshold: number }
): EvaluatedJob {
  const freshness = evaluateFreshness(job, ctx.now, ctx.windowHours);
  const base = { freshness, score: null, fingerprint: jobFingerprint(job) };

  if (!isCanadaJob(job.locations.length ? job.locations : [job.location], job.country)) {
    return reject(job, base, "not_canada", `Location "${job.location}" is outside Canada`);
  }
  if (freshness.status === "invalid") return reject(job, base, "unlisted", freshness.reason);
  if (freshness.status === "unverified") return reject(job, base, "unverified_date", freshness.reason);
  if (freshness.status === "stale") return reject(job, base, "stale", freshness.reason);

  const evergreen = detectEvergreen(job);
  if (evergreen) return reject(job, base, "evergreen", evergreen);

  const dup = findDuplicate(job, ctx.known, ctx.now, ctx.windowHours);
  if (dup) {
    const withDup = { ...base, duplicateOf: { kind: dup.kind, existingId: dup.existingId } };
    return reject(job, withDup, dup.kind === "repost" ? "repost" : "duplicate", dup.detail);
  }

  const score = scoreJob(job, ctx.candidate);
  const scored = { ...base, score };
  if (score.dimensions.roleRelevance.score === 0) {
    return reject(job, scored, "irrelevant_role", score.dimensions.roleRelevance.explanation);
  }
  if (score.total < ctx.threshold) {
    return reject(job, scored, "below_threshold", `Score ${score.total} < ${ctx.threshold}`);
  }
  return { job, ...scored, rejection: null, rejectionDetail: null };
}

export async function runDiscoveryPipeline(opts: PipelineOptions): Promise<DiscoveryRunReport> {
  const now = opts.now ?? new Date();
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const threshold = Math.max(opts.threshold ?? SHORTLIST_THRESHOLD, SHORTLIST_THRESHOLD);
  const maxShortlist = opts.maxShortlist ?? 5;
  const doFetch = opts.fetchBoardImpl ?? fetchBoard;
  const log = opts.log ?? (() => {});
  const startedAt = new Date().toISOString();

  const boardErrors: DiscoveryRunReport["boardErrors"] = [];
  const results = await mapLimit(opts.boards, opts.concurrency ?? 4, async (board) => {
    try {
      const jobs = await doFetch(board, opts.http);
      log(`[discovery] ${board.provider}/${board.token}: ${jobs.length} postings`);
      return jobs;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      boardErrors.push({ board: `${board.provider}/${board.token}`, error: message });
      log(`[discovery] ${board.provider}/${board.token} failed: ${message}`);
      return [];
    }
  });

  const postings = results.flat();
  // Known jobs grow as we accept postings, so the same opening listed on two boards in one run is caught.
  const known = [...opts.known];
  // Older postings in today's feed are history too: a "new" posting that matches one of them is a repost.
  const knownIds = new Set(known.map((k) => `${k.provider}:${k.externalId}`));
  for (const job of postings) {
    if (knownIds.has(`${job.provider}:${job.externalId}`)) continue;
    const f = evaluateFreshness(job, now, windowHours);
    if (f.status === "stale" && job.postedAt) known.push(toKnownJob(job, `feed:${job.provider}:${job.externalId}`, job.postedAt));
  }
  const evaluated: EvaluatedJob[] = [];
  for (const job of postings) {
    const result = evaluateJob(job, { candidate: opts.candidate, known, now, windowHours, threshold });
    evaluated.push(result);
    if (result.rejection === null || result.rejection === "below_threshold" || result.rejection === "irrelevant_role") {
      known.push(toKnownJob(job, `run:${job.provider}:${job.externalId}`, now.toISOString()));
    }
  }

  const rejectedCounts: DiscoveryRunReport["rejectedCounts"] = {};
  for (const e of evaluated) if (e.rejection) rejectedCounts[e.rejection] = (rejectedCounts[e.rejection] ?? 0) + 1;

  const byScore = (a: EvaluatedJob, b: EvaluatedJob) =>
    (b.score?.total ?? 0) - (a.score?.total ?? 0) || (a.freshness.ageHours ?? 99) - (b.freshness.ageHours ?? 99);

  const qualifying = evaluated.filter((e) => e.rejection === null).sort(byScore);
  const nearMisses = evaluated
    .filter((e) => e.rejection === "below_threshold" && (e.score?.total ?? 0) >= threshold - 15)
    .sort(byScore)
    .slice(0, 10);

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    boardsQueried: opts.boards.length,
    boardsSucceeded: opts.boards
      .filter((b) => !boardErrors.some((e) => e.board === `${b.provider}/${b.token}`))
      .map((b) => `${b.provider}/${b.token}`),
    boardErrors,
    postingsFetched: postings.length,
    rejectedCounts,
    shortlisted: qualifying.slice(0, maxShortlist),
    nearMisses,
    evaluated,
  };
}
