/**
 * Supabase persistence for discovery. Reads/writes only the tables added in
 * supabase/migrations/20261116000000_job_discovery.sql, plus the promote_discovered_job RPC which
 * creates the tracker application row atomically.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { canonicalUrl, KnownJob } from "./dedup";
import { DiscoveryRunReport, EvaluatedJob, Provider } from "./types";

const PAGE = 1000;
const CHUNK = 200;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface StoredKnownJob extends KnownJob {
  shortlisted: boolean;
  listingStatus: "open" | "closed";
  boardToken: string;
  applicationId: string | null;
}

export function createDiscoveryRepository(db: SupabaseClient) {
  return {
    async loadKnownJobs(userId: string): Promise<StoredKnownJob[]> {
      const rows: StoredKnownJob[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from("discovered_jobs")
          .select(
            "id, provider, board_token, external_id, canonical_url, canonical_apply_url, fingerprint, requisition_id, posted_at, first_seen_at, shortlisted, listing_status, application_id"
          )
          .eq("user_id", userId)
          .order("first_seen_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of data ?? []) {
          rows.push({
            id: r.id,
            provider: r.provider as Provider,
            boardToken: r.board_token,
            externalId: r.external_id,
            canonicalUrl: r.canonical_url,
            canonicalApplyUrl: r.canonical_apply_url,
            fingerprint: r.fingerprint,
            requisitionId: r.requisition_id,
            postedAt: r.posted_at,
            firstSeenAt: r.first_seen_at,
            shortlisted: r.shortlisted,
            listingStatus: r.listing_status,
            applicationId: r.application_id === null ? null : String(r.application_id),
          });
        }
        if (!data || data.length < PAGE) break;
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

    async createRun(userId: string, trigger: "manual" | "scheduled" | "cli", windowHours: number, threshold: number) {
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

    /**
     * Persist a run. New postings are inserted with their evaluation; postings we already store are
     * only touched (last_seen_at) so an earlier shortlist decision and first_seen_at are never lost.
     * Non-Canadian postings are not stored.
     */
    async saveEvaluations(userId: string, runId: string, evaluated: EvaluatedJob[], known: StoredKnownJob[]) {
      const now = new Date().toISOString();
      const existing = new Map(known.map((k) => [`${k.provider}:${k.externalId}`, k.id]));
      const shortlistedIds = new Set<string>();
      const touchIds: string[] = [];
      const inserts: Record<string, unknown>[] = [];

      for (const e of evaluated) {
        if (e.rejection === "not_canada") continue;
        const key = `${e.job.provider}:${e.job.externalId}`;
        const existingId = existing.get(key);
        if (existingId) {
          touchIds.push(existingId);
          continue;
        }
        const keepDescription = e.score !== null && e.rejection !== "irrelevant_role";
        inserts.push({
          user_id: userId,
          last_run_id: runId,
          provider: e.job.provider,
          board_token: e.job.boardToken,
          external_id: e.job.externalId,
          requisition_id: e.job.requisitionId,
          title: e.job.title,
          company: e.job.company,
          company_website: e.job.companyWebsite,
          location: e.job.location,
          locations: e.job.locations,
          country: e.job.country,
          work_arrangement: e.job.workArrangement,
          employment_type: e.job.employmentType,
          posted_at: e.job.postedAt,
          posted_at_source: e.job.postedAtSource,
          source_updated_at: e.job.sourceUpdatedAt,
          salary_min: e.job.salaryMin,
          salary_max: e.job.salaryMax,
          salary_currency: e.job.salaryCurrency,
          description: keepDescription ? e.job.descriptionText : null,
          source_url: e.job.sourceUrl,
          apply_url: e.job.applyUrl,
          canonical_url: canonicalUrl(e.job.sourceUrl),
          canonical_apply_url: canonicalUrl(e.job.applyUrl),
          fingerprint: e.fingerprint,
          applicant_count: e.job.applicantCount,
          freshness_status: e.freshness.status,
          age_hours_at_discovery: e.freshness.ageHours === null ? null : Math.round(e.freshness.ageHours * 10) / 10,
          match_score: e.score?.total ?? null,
          score_breakdown: e.score ?? null,
          required_skills: e.score?.requiredSkills ?? [],
          preferred_skills: e.score?.preferredSkills ?? [],
          matched_skills: e.score?.matchedSkills ?? [],
          missing_required_skills: e.score?.missingRequiredSkills ?? [],
          missing_preferred_skills: e.score?.missingPreferredSkills ?? [],
          work_auth_flags: e.score?.workAuthorizationFlags ?? [],
          rejection_reason: e.rejection,
          rejection_detail: e.rejectionDetail,
          shortlisted: e.rejection === null,
        });
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
      for (const r of inserted) if (r.shortlisted) shortlistedIds.add(r.id);

      for (const batch of chunks(touchIds, CHUNK)) {
        const { error } = await db
          .from("discovered_jobs")
          .update({ last_seen_at: now, last_verified_at: now, listing_status: "open", last_run_id: runId })
          .in("id", batch);
        if (error) throw error;
      }
      return { inserted: inserted.length, touched: touchIds.length, shortlistedIds: [...shortlistedIds] };
    },

    /**
     * Postings that were open, belong to a board that fetched successfully this run, and are no longer
     * in its feed have been taken down. Pre-application tracker rows linked to them become EXPIRED.
     */
    async markClosedPostings(userId: string, known: StoredKnownJob[], evaluated: EvaluatedJob[], boardsSucceeded: string[]) {
      const okBoards = new Set(boardsSucceeded);
      const seen = new Set(evaluated.map((e) => `${e.job.provider}:${e.job.externalId}`));
      const closed = known.filter(
        (k) =>
          k.listingStatus === "open" &&
          okBoards.has(`${k.provider}/${k.boardToken}`) &&
          !seen.has(`${k.provider}:${k.externalId}`)
      );
      const now = new Date().toISOString();
      for (const batch of chunks(closed.map((c) => c.id), CHUNK)) {
        const { error } = await db
          .from("discovered_jobs")
          .update({ listing_status: "closed", last_verified_at: now })
          .in("id", batch);
        if (error) throw error;
      }
      const appIds = closed.map((c) => c.applicationId).filter((id): id is string => id !== null);
      const expired: string[] = [];
      for (const batch of chunks(appIds, CHUNK)) {
        const { data, error } = await db
          .from("applications")
          .update({ status: "EXPIRED" })
          .eq("user_id", userId)
          .in("id", batch)
          .in("status", ["DISCOVERED", "UNDER_REVIEW", "READY_TO_APPLY", "SAVED"])
          .select("id");
        if (error) throw error;
        expired.push(...(data ?? []).map((r) => String(r.id)));
      }
      if (expired.length) {
        const { error } = await db.from("application_events").insert(
          expired.map((id) => ({
            application_id: id,
            user_id: userId,
            event_type: "status_changed",
            to_status: "EXPIRED",
            detail: { reason: "Posting no longer listed on the employer's job board" },
          }))
        );
        if (error) throw error;
      }
      return { closed: closed.length, expiredApplications: expired };
    },

    async promote(userId: string, jobId: string): Promise<{ application_id: string; created: boolean }> {
      const { data, error } = await db.rpc("promote_discovered_job", { p_job_id: jobId, p_user_id: userId });
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

    /** New version every save; previous versions are kept (is_current = false). */
    async saveMasterProfile(userId: string, profile: unknown, sourceFileName: string | null) {
      const current = await this.getCurrentMasterProfile(userId);
      const version = (current?.version ?? 0) + 1;
      if (current) {
        const { error } = await db.from("master_profiles").update({ is_current: false }).eq("id", current.id);
        if (error) throw error;
      }
      const { data, error } = await db
        .from("master_profiles")
        .insert({ user_id: userId, version, profile, source_file_name: sourceFileName, is_current: true })
        .select("id, version, created_at")
        .single();
      if (error) {
        if (current) await db.from("master_profiles").update({ is_current: true }).eq("id", current.id);
        throw error;
      }
      return data;
    },
  };
}

export type DiscoveryRepository = ReturnType<typeof createDiscoveryRepository>;
