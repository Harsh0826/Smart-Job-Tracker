import { NextFunction, Response } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { masterProfileSchema } from "../discovery/profile";
import { createDiscoveryRepository } from "../discovery/repository";
import { runDiscoveryForUser } from "../discovery/service";
import { AuthRequest } from "../middleware/auth";
import { ApiError } from "../utils/apiError";

const repo = createDiscoveryRepository(supabase);

function userId(req: AuthRequest): string {
  if (!req.user?.id) throw new ApiError(401, "Unauthorized");
  return req.user.id;
}

const uuid = z.string().uuid();

const LIST_COLUMNS =
  "id, provider, title, company, location, work_arrangement, employment_type, posted_at, posted_at_source, first_seen_at, applicant_count, match_score, freshness_status, shortlisted, listing_status, apply_url, application_id, missing_required_skills, work_auth_flags, archived_at";

const listQuery = z.object({
  shortlisted: z.enum(["true", "false", "all"]).default("true"),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  q: z.string().trim().max(100).optional(),
  company: z.string().trim().max(100).optional(),
  location: z.string().trim().max(100).optional(),
  workArrangement: z.enum(["remote", "hybrid", "onsite", "unknown"]).optional(),
  skill: z.string().trim().max(50).optional(),
  postedWithinHours: z.coerce.number().int().min(1).max(24 * 60).optional(),
  includeArchived: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Escape PostgREST ilike wildcards and filter-syntax characters in user input. */
function likePattern(value: string): string {
  return `%${value.replace(/[%_,()\\]/g, (c) => `\\${c}`)}%`;
}

export async function runDiscoveryHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const summary = await runDiscoveryForUser(userId(req), "manual");
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
}

export async function listRunsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { data, error } = await supabase
      .from("discovery_runs")
      .select("*")
      .eq("user_id", userId(req))
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function listJobsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const q = listQuery.parse(req.query);
    let query = supabase
      .from("discovered_jobs")
      .select(LIST_COLUMNS, { count: "exact" })
      .eq("user_id", userId(req));
    if (q.shortlisted !== "all") query = query.eq("shortlisted", q.shortlisted === "true");
    if (q.includeArchived === "false") query = query.is("archived_at", null);
    if (q.minScore !== undefined) query = query.gte("match_score", q.minScore);
    if (q.q) query = query.ilike("title", likePattern(q.q));
    if (q.company) query = query.ilike("company", likePattern(q.company));
    if (q.location) query = query.ilike("location", likePattern(q.location));
    if (q.workArrangement) query = query.eq("work_arrangement", q.workArrangement);
    if (q.skill) query = query.contains("required_skills", [q.skill]);
    if (q.postedWithinHours) {
      query = query.gte("posted_at", new Date(Date.now() - q.postedWithinHours * 3_600_000).toISOString());
    }
    const { data, error, count } = await query
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(q.offset, q.offset + q.limit - 1);
    if (error) throw error;
    res.json({ total: count ?? 0, items: data ?? [] });
  } catch (error) {
    next(error);
  }
}

export async function getJobHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    const { data, error } = await supabase
      .from("discovered_jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId(req))
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Discovered job not found");
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function promoteJobHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    const result = await repo.promote(userId(req), id);
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function archiveJobHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    const { archived } = z.object({ archived: z.boolean().default(true) }).parse(req.body ?? {});
    const { data, error } = await supabase
      .from("discovered_jobs")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("user_id", userId(req))
      .select("id, archived_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, "Discovered job not found");
    res.json(data);
  } catch (error) {
    next(error);
  }
}

export async function discoverySummaryHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const uid = userId(req);
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const count = async (build: (q: any) => any) => {
      const { count: c, error } = await build(
        supabase.from("discovered_jobs").select("id", { count: "exact", head: true }).eq("user_id", uid)
      );
      if (error) throw error;
      return c ?? 0;
    };
    const [total, freshLast24h, shortlisted] = await Promise.all([
      count((q) => q),
      count((q) => q.gte("posted_at", since).eq("freshness_status", "fresh")),
      count((q) => q.eq("shortlisted", true)),
    ]);
    const { data: scores, error } = await supabase
      .from("discovered_jobs")
      .select("match_score")
      .eq("user_id", uid)
      .eq("shortlisted", true)
      .not("match_score", "is", null);
    if (error) throw error;
    const avg = scores?.length ? Math.round(scores.reduce((s, r) => s + (r.match_score ?? 0), 0) / scores.length) : null;
    res.json({ totalDiscovered: total, freshLast24h, shortlistedAbove70: shortlisted, averageShortlistScore: avg });
  } catch (error) {
    next(error);
  }
}

export async function getMasterProfileHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const profile = await repo.getCurrentMasterProfile(userId(req));
    if (!profile) throw new ApiError(404, "No Master Resume uploaded yet");
    res.json(profile);
  } catch (error) {
    next(error);
  }
}

export async function putMasterProfileHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const body = z
      .object({ profile: masterProfileSchema, sourceFileName: z.string().max(255).nullable().optional() })
      .parse(req.body);
    const saved = await repo.saveMasterProfile(userId(req), body.profile, body.sourceFileName ?? null);
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
}
