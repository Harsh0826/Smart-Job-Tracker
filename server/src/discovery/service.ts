import { supabase } from "../config/supabase";
import { ApiError } from "../utils/apiError";
import { loadBoards } from "./boards";
import { createHttpClient } from "./http";
import { runDiscoveryPipeline } from "./pipeline";
import { buildCandidateProfile, masterProfileSchema } from "./profile";
import { createDiscoveryRepository, DiscoveryRepository } from "./repository";
import { SHORTLIST_THRESHOLD } from "./scoring";
import { BoardConfig, EvaluatedJob } from "./types";

type ShortlistItem = {
  discoveredJobId: string | null;
  applicationId: string | null;
  company: string;
  title: string;
  location: string;
  workArrangement: string;
  postedAt: string | null;
  ageHours: number | null;
  matchScore: number;
  applyUrl: string;
  workAuthorizationFlags: string[];
};

export interface RunSummary {
  runId: string;
  boardsQueried: number;
  boardErrors: { board: string; error: string }[];
  postingsFetched: number;
  rejectedCounts: Record<string, number>;
  inserted: number;
  closedPostings: number;
  expiredApplications: number;
  shortlisted: ShortlistItem[];
  nearMisses: { company: string; title: string; matchScore: number; reason: string | null }[];
}

// Blocks overlapping runs for one user. A run left "running" longer than this is treated as crashed.
const RUN_LOCK_MINUTES = 30;
const WINDOW_HOURS = 24;

function toShortlistItem(
  evaluation: EvaluatedJob,
  discoveredJobId: string | null,
  applicationIds: Map<string, string>
): ShortlistItem {
  let applicationId: string | null = null;

  if (discoveredJobId) {
    applicationId = applicationIds.get(discoveredJobId) ?? null;
  }

  return {
    discoveredJobId,
    applicationId,
    company: evaluation.job.company,
    title: evaluation.job.title,
    location: evaluation.job.location,
    workArrangement: evaluation.job.workArrangement,
    postedAt: evaluation.job.postedAt,
    ageHours: evaluation.freshness.ageHours,
    matchScore: evaluation.score!.total,
    applyUrl: evaluation.job.applyUrl,
    workAuthorizationFlags: evaluation.score!.workAuthorizationFlags,
  };
}

export async function runDiscoveryForUser(
  userId: string,
  trigger: "manual" | "scheduled" | "cli",
  deps: { repo?: DiscoveryRepository; boards?: BoardConfig[]; log?: (m: string) => void } = {}
): Promise<RunSummary> {
  const repo = deps.repo ?? createDiscoveryRepository(supabase);
  const log = deps.log ?? ((m: string) => console.log(m));

  const master = await repo.getCurrentMasterProfile(userId);

  if (!master) {
    throw new ApiError(
      409,
      "Upload your Master Resume first (PUT /api/profile/master). Matching uses it as the only source of your experience."
    );
  }

  const parsed = masterProfileSchema.safeParse(master.profile);

  if (!parsed.success) {
    throw new ApiError(422, "Stored Master Resume profile is invalid", parsed.error.flatten());
  }

  const lockSince = new Date(Date.now() - RUN_LOCK_MINUTES * 60_000).toISOString();
  const runningRun = await repo.findRunningRun(userId, lockSince);

  if (runningRun) {
    throw new ApiError(409, "A discovery run is already in progress");
  }

  const runId = await repo.createRun(userId, trigger, WINDOW_HOURS, SHORTLIST_THRESHOLD);

  try {
    const known = await repo.loadKnownJobs(userId);

    const report = await runDiscoveryPipeline({
      boards: deps.boards ?? loadBoards(),
      candidate: buildCandidateProfile(parsed.data),
      http: createHttpClient(),
      known,
      windowHours: WINDOW_HOURS,
      threshold: SHORTLIST_THRESHOLD,
      log,
    });

    const saved = await repo.saveEvaluations(userId, runId, report.evaluated, known);
    const closed = await repo.markClosedPostings(
      userId,
      known,
      report.evaluated,
      report.boardsSucceeded
    );

    const applicationIds = new Map<string, string>();

    for (const jobId of saved.shortlistedIds) {
      const promoted = await repo.promote(userId, jobId);
      applicationIds.set(jobId, String(promoted.application_id));
    }

    await repo.finishRun(runId, report);

    // Reload so newly inserted postings can be matched back to their stored IDs.
    const stored = await repo.loadKnownJobs(userId);
    const storedIdByKey = new Map<string, string>();

    for (const item of stored) {
      storedIdByKey.set(`${item.provider}:${item.externalId}`, item.id);
    }

    const shortlisted = report.shortlisted.map((evaluation) => {
      const key = `${evaluation.job.provider}:${evaluation.job.externalId}`;
      const discoveredJobId = storedIdByKey.get(key) ?? null;
      return toShortlistItem(evaluation, discoveredJobId, applicationIds);
    });

    const nearMisses = report.nearMisses.map((evaluation) => ({
      company: evaluation.job.company,
      title: evaluation.job.title,
      matchScore: evaluation.score?.total ?? 0,
      reason: evaluation.rejectionDetail,
    }));

    return {
      runId,
      boardsQueried: report.boardsQueried,
      boardErrors: report.boardErrors,
      postingsFetched: report.postingsFetched,
      rejectedCounts: report.rejectedCounts as Record<string, number>,
      inserted: saved.inserted,
      closedPostings: closed.closed,
      expiredApplications: closed.expiredApplications.length,
      shortlisted,
      nearMisses,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    try {
      await repo.finishRun(runId, null, message);
    } catch (finishError) {
      log(`[discovery] could not mark run failed: ${finishError}`);
    }

    throw error;
  }
}
