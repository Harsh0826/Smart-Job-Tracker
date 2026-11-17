import { supabase } from "../config/supabase";
import { ApiError } from "../utils/apiError";
import { loadBoards } from "./boards";
import { createHttpClient } from "./http";
import { runDiscoveryPipeline } from "./pipeline";
import { buildCandidateProfile, masterProfileSchema } from "./profile";
import { createDiscoveryRepository, DiscoveryRepository } from "./repository";
import { SHORTLIST_THRESHOLD } from "./scoring";
import { BoardConfig } from "./types";

export interface RunSummary {
  runId: string;
  boardsQueried: number;
  boardErrors: { board: string; error: string }[];
  postingsFetched: number;
  rejectedCounts: Record<string, number>;
  inserted: number;
  closedPostings: number;
  expiredApplications: number;
  shortlisted: {
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
  }[];
  nearMisses: { company: string; title: string; matchScore: number; reason: string | null }[];
}

const RUN_LOCK_MINUTES = 30;

export async function runDiscoveryForUser(
  userId: string,
  trigger: "manual" | "scheduled" | "cli",
  deps: { repo?: DiscoveryRepository; boards?: BoardConfig[]; log?: (m: string) => void } = {}
): Promise<RunSummary> {
  const repo = deps.repo ?? createDiscoveryRepository(supabase);
  const log = deps.log ?? ((m: string) => console.log(m));

  const master = await repo.getCurrentMasterProfile(userId);
  if (!master) {
    throw new ApiError(409, "Upload your Master Resume first (PUT /api/profile/master). Matching uses it as the only source of your experience.");
  }
  const parsed = masterProfileSchema.safeParse(master.profile);
  if (!parsed.success) throw new ApiError(422, "Stored Master Resume profile is invalid", parsed.error.flatten());

  const lockSince = new Date(Date.now() - RUN_LOCK_MINUTES * 60_000).toISOString();
  if (await repo.findRunningRun(userId, lockSince)) {
    throw new ApiError(409, "A discovery run is already in progress");
  }

  const windowHours = 24;
  const runId = await repo.createRun(userId, trigger, windowHours, SHORTLIST_THRESHOLD);
  try {
    const known = await repo.loadKnownJobs(userId);
    const report = await runDiscoveryPipeline({
      boards: deps.boards ?? loadBoards(),
      candidate: buildCandidateProfile(parsed.data),
      http: createHttpClient(),
      known,
      windowHours,
      threshold: SHORTLIST_THRESHOLD,
      log,
    });

    const saved = await repo.saveEvaluations(userId, runId, report.evaluated, known);
    const closed = await repo.markClosedPostings(userId, known, report.evaluated, report.boardsSucceeded);

    const appIds = new Map<string, string>();
    for (const jobId of saved.shortlistedIds) {
      const promoted = await repo.promote(userId, jobId);
      appIds.set(jobId, String(promoted.application_id));
    }
    await repo.finishRun(runId, report);

    // Map shortlisted evaluations back to stored IDs for the response.
    const stored = await repo.loadKnownJobs(userId);
    const idByKey = new Map(stored.map((s) => [`${s.provider}:${s.externalId}`, s.id]));

    return {
      runId,
      boardsQueried: report.boardsQueried,
      boardErrors: report.boardErrors,
      postingsFetched: report.postingsFetched,
      rejectedCounts: report.rejectedCounts as Record<string, number>,
      inserted: saved.inserted,
      closedPostings: closed.closed,
      expiredApplications: closed.expiredApplications.length,
      shortlisted: report.shortlisted.map((e) => {
        const id = idByKey.get(`${e.job.provider}:${e.job.externalId}`) ?? null;
        return {
          discoveredJobId: id,
          applicationId: id ? appIds.get(id) ?? null : null,
          company: e.job.company,
          title: e.job.title,
          location: e.job.location,
          workArrangement: e.job.workArrangement,
          postedAt: e.job.postedAt,
          ageHours: e.freshness.ageHours,
          matchScore: e.score!.total,
          applyUrl: e.job.applyUrl,
          workAuthorizationFlags: e.score!.workAuthorizationFlags,
        };
      }),
      nearMisses: report.nearMisses.map((e) => ({
        company: e.job.company,
        title: e.job.title,
        matchScore: e.score?.total ?? 0,
        reason: e.rejectionDetail,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repo.finishRun(runId, null, message).catch((e) => log(`[discovery] could not mark run failed: ${e}`));
    throw error;
  }
}
