import { NextFunction, Response } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase";
import { masterProfileSchema } from "../discovery/profile";
import { createDiscoveryRepository } from "../discovery/repository";
import { runDiscoveryForUser } from "../discovery/service";
import { AuthRequest } from "../middleware/auth";
import { ApiError } from "../utils/apiError";

const repo = createDiscoveryRepository(supabase);

const HOUR_MS = 3_600_000;

const LIST_COLUMNS =
  "id, provider, title, company, location, work_arrangement, employment_type, posted_at, posted_at_source, first_seen_at, applicant_count, match_score, freshness_status, shortlisted, listing_status, apply_url, application_id, missing_required_skills, work_auth_flags, archived_at";

const uuid = z.string().uuid();

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

const archiveBody = z.object({
  archived: z.boolean().default(true),
});

const masterProfileBody = z.object({
  profile: masterProfileSchema,
  sourceFileName: z.string().max(255).nullable().optional(),
});

// Escapes ilike wildcards and PostgREST filter characters in user input.
function likePattern(value: string): string {
  return `%${value.replace(/[%_,()\\]/g, (c) => `\\${c}`)}%`;
}

function countDiscoveredJobs(userId: string) {
  return supabase
    .from("discovered_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
}

async function countOf(
  query: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  const { count, error } = await query;

  if (error) throw error;

  return count ?? 0;
}

export async function runDiscoveryHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const summary = await runDiscoveryForUser(req.user.id, "manual");
    return res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
}

export async function listRunsHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("discovery_runs")
      .select("*")
      .eq("user_id", req.user.id)
      .order("started_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

export async function listJobsHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const filters = listQuery.parse(req.query);

    let query = supabase
      .from("discovered_jobs")
      .select(LIST_COLUMNS, { count: "exact" })
      .eq("user_id", req.user.id);

    if (filters.shortlisted !== "all") {
      query = query.eq("shortlisted", filters.shortlisted === "true");
    }

    if (filters.includeArchived === "false") {
      query = query.is("archived_at", null);
    }

    if (filters.minScore !== undefined) {
      query = query.gte("match_score", filters.minScore);
    }

    if (filters.q) {
      query = query.ilike("title", likePattern(filters.q));
    }

    if (filters.company) {
      query = query.ilike("company", likePattern(filters.company));
    }

    if (filters.location) {
      query = query.ilike("location", likePattern(filters.location));
    }

    if (filters.workArrangement) {
      query = query.eq("work_arrangement", filters.workArrangement);
    }

    if (filters.skill) {
      query = query.contains("required_skills", [filters.skill]);
    }

    if (filters.postedWithinHours) {
      const postedAfter = new Date(Date.now() - filters.postedWithinHours * HOUR_MS);
      query = query.gte("posted_at", postedAfter.toISOString());
    }

    const { data, error, count } = await query
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(filters.offset, filters.offset + filters.limit - 1);

    if (error) throw error;

    return res.status(200).json({ total: count ?? 0, items: data ?? [] });
  } catch (error) {
    next(error);
  }
}

export async function getJobHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = uuid.parse(req.params.id);

    const { data, error } = await supabase
      .from("discovered_jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new ApiError(404, "Discovered job not found");
    }

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

export async function promoteJobHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = uuid.parse(req.params.id);
    const result = await repo.promote(req.user.id, id);

    if (result.created) {
      return res.status(201).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function archiveJobHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = uuid.parse(req.params.id);
    const { archived } = archiveBody.parse(req.body ?? {});
    const archivedAt = archived ? new Date().toISOString() : null;

    const { data, error } = await supabase
      .from("discovered_jobs")
      .update({ archived_at: archivedAt })
      .eq("id", id)
      .eq("user_id", req.user.id)
      .select("id, archived_at")
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new ApiError(404, "Discovered job not found");
    }

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

export async function discoverySummaryHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.id;
    const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();

    const [total, freshLast24h, shortlisted] = await Promise.all([
      countOf(countDiscoveredJobs(userId)),
      countOf(
        countDiscoveredJobs(userId).gte("posted_at", since).eq("freshness_status", "fresh")
      ),
      countOf(countDiscoveredJobs(userId).eq("shortlisted", true)),
    ]);

    const { data: scores, error } = await supabase
      .from("discovered_jobs")
      .select("match_score")
      .eq("user_id", userId)
      .eq("shortlisted", true)
      .not("match_score", "is", null);

    if (error) throw error;

    let averageShortlistScore: number | null = null;

    if (scores?.length) {
      let sum = 0;

      for (const row of scores) {
        sum += row.match_score ?? 0;
      }

      averageShortlistScore = Math.round(sum / scores.length);
    }

    return res.status(200).json({
      totalDiscovered: total,
      freshLast24h,
      shortlistedAbove70: shortlisted,
      averageShortlistScore,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMasterProfileHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const profile = await repo.getCurrentMasterProfile(req.user.id);

    if (!profile) {
      throw new ApiError(404, "No Master Resume uploaded yet");
    }

    return res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
}

export async function putMasterProfileHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const body = masterProfileBody.parse(req.body);

    const saved = await repo.saveMasterProfile(
      req.user.id,
      body.profile,
      body.sourceFileName ?? null
    );

    return res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
}
