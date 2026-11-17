import { SupabaseClient } from "@supabase/supabase-js";
import { canonicalUrl, KnownJob } from "./dedup";
import { DiscoveryRunReport, EvaluatedJob, Provider } from "./types";

const PAGE = 1000;
const CHUNK = 200;

const KNOWN_JOB_COLUMNS =
  "id, provider, board_token, external_id, canonical_url, canonical_apply_url, fingerprint, requisition_id, posted_at, first_seen_at, shortlisted, listing_status, application_id";

const PRE_APPLICATION_STATUSES = ["DISCOVERED", "UNDER_REVIEW", "READY_TO_APPLY", "SAVED"];

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }

  return out;
}

function roundToTenth(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Math.round(value * 10) / 10;
}

export interface StoredKnownJob extends KnownJob {
  shortlisted: boolean;
  listingStatus: "open" | "closed";
  boardToken: string;
  applicationId: string | null;
}

function toStoredKnownJob(row: Record<string, any>): StoredKnownJob {
  return {
    id: row.id,
    provider: row.provider as Provider,
    boardToken: row.board_token,
    externalId: row.external_id,
    canonicalUrl: row.canonical_url,
    canonicalApplyUrl: row.canonical_apply_url,
    fingerprint: row.fingerprint,
    requisitionId: row.requisition_id,
    postedAt: row.posted_at,
    firstSeenAt: row.first_seen_at,
    shortlisted: row.shortlisted,
    listingStatus: row.listing_status,
    applicationId: row.application_id === null ? null : String(row.application_id),
  };
}

function toDiscoveredJobRow(userId: string, runId: string, evaluation: EvaluatedJob) {
  const { job, freshness, score } = evaluation;
  const keepDescription = score !== null && evaluation.rejection !== "irrelevant_role";

  return {
    user_id: userId,
    last_run_id: runId,
    provider: job.provider,
    board_token: job.boardToken,
    external_id: job.externalId,
    requisition_id: job.requisitionId,
    title: job.title,
    company: job.company,
    company_website: job.companyWebsite,
    location: job.location,
    locations: job.locations,
    country: job.country,
    work_arrangement: job.workArrangement,
    employment_type: job.employmentType,
    posted_at: job.postedAt,
    posted_at_source: job.postedAtSource,
    source_updated_at: job.sourceUpdatedAt,
    salary_min: job.salaryMin,
    salary_max: job.salaryMax,
    salary_currency: job.salaryCurrency,
    description: keepDescription ? job.descriptionText : null,
    source_url: job.sourceUrl,
    apply_url: job.applyUrl,
    canonical_url: canonicalUrl(job.sourceUrl),
    canonical_apply_url: canonicalUrl(job.applyUrl),
    fingerprint: evaluation.fingerprint,
    applicant_count: job.applicantCount,
    freshness_status: freshness.status,
    age_hours_at_discovery: roundToTenth(freshness.ageHours),
    match_score: score?.total ?? null,
    score_breakdown: score ?? null,
    required_skills: score?.requiredSkills ?? [],
    preferred_skills: score?.preferredSkills ?? [],
    matched_skills: score?.matchedSkills ?? [],
    missing_required_skills: score?.missingRequiredSkills ?? [],
    missing_preferred_skills: score?.missingPreferredSkills ?? [],
    work_auth_flags: score?.workAuthorizationFlags ?? [],
    rejection_reason: evaluation.rejection,
    rejection_detail: evaluation.rejectionDetail,
    shortlisted: evaluation.rejection === null,
  };
}

export function createDiscoveryRepository(db: SupabaseClient) {
  return {
    async loadKnownJobs(userId: string): Promise<StoredKnownJob[]> {
      const rows: StoredKnownJob[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await db
          .from("discovered_jobs")
          .select(KNOWN_JOB_COLUMNS)
          .eq("user_id", userId)
          .order("first_seen_at", { ascending: true })
          .range(from, from + PAGE - 1);

        if (error) throw error;

        for (const row of data ?? []) {
          rows.push(toStoredKnownJob(row));
        }

        hasMore = (data?.length ?? 0) >= PAGE;
        from += PAGE;
      }

      return rows;
    },

    async findRunningRun(userId: string, sinceIso: string) {
      const { data, error } = await db
        .from("discovery_runs")
        .select("id, started_at")
        .eq("user_id", userId)
        .eq("status", "running")
        .gte("started_at", sinceIso)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return data;
    },

    async createRun(
      userId: string,
      trigger: "manual" | "scheduled" | "cli",
      windowHours: number,
      threshold: number
    ) {
      const { data, error } = await db
        .from("discovery_runs")
        .insert({ user_id: userId, trigger, window_hours: windowHours, threshold })
        .select("id")
        .single();

      if (error) throw error;

      return data.id as string;
    },

    async finishRun(runId: string, report: DiscoveryRunReport | null, error?: string) {
      const { error: dbError } = await db
        .from("discovery_runs")
        .update({
          status: error ? "failed" : "succeeded",
          finished_at: new Date().toISOString(),
          boards_queried: report?.boardsQueried ?? null,
          postings_fetched: report?.postingsFetched ?? null,
          shortlisted_count: report?.shortlisted.length ?? null,
          rejected_counts: report?.rejectedCounts ?? null,
          board_errors: report?.boardErrors ?? null,
          error: error ?? null,
        })
        .eq("id", runId);

      if (dbError) throw dbError;
    },

    // Postings already stored are only touched, so an earlier shortlist decision and first_seen_at are kept.
    async saveEvaluations(
      userId: string,
      runId: string,
      evaluated: EvaluatedJob[],
      known: StoredKnownJob[]
    ) {
      const now = new Date().toISOString();
      const existing = new Map<string, string>();
      const touchIds: string[] = [];
      const inserts: Record<string, unknown>[] = [];

      for (const item of known) {
        existing.set(`${item.provider}:${item.externalId}`, item.id);
      }

      for (const evaluation of evaluated) {
        if (evaluation.rejection === "not_canada") {
          continue;
        }

        const key = `${evaluation.job.provider}:${evaluation.job.externalId}`;
        const existingId = existing.get(key);

        if (existingId) {
          touchIds.push(existingId);
          continue;
        }

        inserts.push(toDiscoveredJobRow(userId, runId, evaluation));
      }

      const inserted: { id: string; provider: string; external_id: string; shortlisted: boolean }[] = [];

      for (const batch of chunks(inserts, CHUNK)) {
        const { data, error } = await db
          .from("discovered_jobs")
          .upsert(batch, { onConflict: "user_id,provider,external_id", ignoreDuplicates: true })
          .select("id, provider, external_id, shortlisted");

        if (error) throw error;

        inserted.push(...(data ?? []));
      }

      const shortlistedIds = new Set<string>();

      for (const row of inserted) {
        if (row.shortlisted) {
          shortlistedIds.add(row.id);
        }
      }

      for (const batch of chunks(touchIds, CHUNK)) {
        const { error } = await db
          .from("discovered_jobs")
          .update({
            last_seen_at: now,
            last_verified_at: now,
            listing_status: "open",
            last_run_id: runId,
          })
          .in("id", batch);

        if (error) throw error;
      }

      return {
        inserted: inserted.length,
        touched: touchIds.length,
        shortlistedIds: [...shortlistedIds],
      };
    },

    // An open posting missing from a board that fetched fine this run has been taken down.
    async markClosedPostings(
      userId: string,
      known: StoredKnownJob[],
      evaluated: EvaluatedJob[],
      boardsSucceeded: string[]
    ) {
      const okBoards = new Set(boardsSucceeded);
      const seen = new Set<string>();

      for (const evaluation of evaluated) {
        seen.add(`${evaluation.job.provider}:${evaluation.job.externalId}`);
      }

      const closed = known.filter(
        (item) =>
          item.listingStatus === "open" &&
          okBoards.has(`${item.provider}/${item.boardToken}`) &&
          !seen.has(`${item.provider}:${item.externalId}`)
      );

      const now = new Date().toISOString();
      const closedIds = closed.map((item) => item.id);

      for (const batch of chunks(closedIds, CHUNK)) {
        const { error } = await db
          .from("discovered_jobs")
          .update({ listing_status: "closed", last_verified_at: now })
          .in("id", batch);

        if (error) throw error;
      }

      const applicationIds: string[] = [];

      for (const item of closed) {
        if (item.applicationId !== null) {
          applicationIds.push(item.applicationId);
        }
      }

      const expired: string[] = [];

      for (const batch of chunks(applicationIds, CHUNK)) {
        const { data, error } = await db
          .from("applications")
          .update({ status: "EXPIRED" })
          .eq("user_id", userId)
          .in("id", batch)
          .in("status", PRE_APPLICATION_STATUSES)
          .select("id");

        if (error) throw error;

        for (const row of data ?? []) {
          expired.push(String(row.id));
        }
      }

      if (expired.length) {
        const events = expired.map((id) => ({
          application_id: id,
          user_id: userId,
          event_type: "status_changed",
          to_status: "EXPIRED",
          detail: { reason: "Posting no longer listed on the employer's job board" },
        }));

        const { error } = await db.from("application_events").insert(events);

        if (error) throw error;
      }

      return { closed: closed.length, expiredApplications: expired };
    },

    async promote(
      userId: string,
      jobId: string
    ): Promise<{ application_id: string; created: boolean }> {
      const { data, error } = await db.rpc("promote_discovered_job", {
        p_job_id: jobId,
        p_user_id: userId,
      });

      if (error) throw error;

      return data as { application_id: string; created: boolean };
    },

    async getCurrentMasterProfile(userId: string) {
      const { data, error } = await db
        .from("master_profiles")
        .select("id, version, profile, source_file_name, created_at")
        .eq("user_id", userId)
        .eq("is_current", true)
        .maybeSingle();

      if (error) throw error;

      return data;
    },

    // Each save adds a new version. Older versions stay with is_current = false.
    async saveMasterProfile(userId: string, profile: unknown, sourceFileName: string | null) {
      const current = await this.getCurrentMasterProfile(userId);
      const version = (current?.version ?? 0) + 1;

      if (current) {
        const { error } = await db
          .from("master_profiles")
          .update({ is_current: false })
          .eq("id", current.id);

        if (error) throw error;
      }

      const { data, error } = await db
        .from("master_profiles")
        .insert({
          user_id: userId,
          version,
          profile,
          source_file_name: sourceFileName,
          is_current: true,
        })
        .select("id, version, created_at")
        .single();

      if (error) {
        // Put the previous version back so the user still has a current profile.
        if (current) {
          await db.from("master_profiles").update({ is_current: true }).eq("id", current.id);
        }

        throw error;
      }

      return data;
    },
  };
}

export type DiscoveryRepository = ReturnType<typeof createDiscoveryRepository>;
