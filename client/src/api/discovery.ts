import { apiClient } from "./client";

// A run queries every job board, so it can take a few minutes.
const RUN_TIMEOUT_MS = 5 * 60 * 1000;

export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unknown";

export interface DiscoveredJobListItem {
  id: string;
  provider: string;
  title: string;
  company: string;
  location: string | null;
  work_arrangement: WorkArrangement;
  employment_type: string | null;
  posted_at: string | null;
  posted_at_source: string | null;
  first_seen_at: string;
  applicant_count: number | null;
  match_score: number | null;
  freshness_status: "fresh" | "stale" | "unverified" | "invalid";
  shortlisted: boolean;
  listing_status: "open" | "closed";
  apply_url: string;
  application_id: string | number | null;
  missing_required_skills: string[];
  work_auth_flags: string[];
  archived_at: string | null;
}

export interface DimensionScore {
  score: number;
  weight: number;
  explanation: string;
}

export interface ScoreBreakdown {
  total: number;
  dimensions: Record<string, DimensionScore>;
  lowConfidence: string[];
  requiredYears: number | null;
}

export interface DiscoveredJob extends DiscoveredJobListItem {
  description: string | null;
  source_url: string;
  required_skills: string[];
  preferred_skills: string[];
  matched_skills: string[];
  missing_preferred_skills: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  score_breakdown: ScoreBreakdown | null;
}

export interface DiscoveredJobList {
  total: number;
  items: DiscoveredJobListItem[];
}

export interface DiscoverySummary {
  totalDiscovered: number;
  freshLast24h: number;
  shortlistedAbove70: number;
  averageShortlistScore: number | null;
}

export interface RunSummary {
  runId: string;
  boardsQueried: number;
  boardErrors: { board: string; error: string }[];
  postingsFetched: number;
  rejectedCounts: Record<string, number>;
  shortlisted: { company: string; title: string; matchScore: number }[];
  nearMisses: { company: string; title: string; matchScore: number }[];
}

export interface PromoteResult {
  application_id: string;
  created: boolean;
}

export interface JobFilters {
  minScore?: number;
  q?: string;
  company?: string;
  location?: string;
  workArrangement?: WorkArrangement | "";
  skill?: string;
  postedWithinHours?: number;
  shortlisted?: "true" | "false" | "all";
}

function buildJobParams(filters: JobFilters) {
  const params: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;

    params[key] = value;
  }

  return params;
}

export async function getDiscoverySummary(): Promise<DiscoverySummary> {
  const response = await apiClient.get<DiscoverySummary>("/discovery/summary");
  return response.data;
}

export async function listDiscoveredJobs(
  filters: JobFilters = {}
): Promise<DiscoveredJobList> {
  const response = await apiClient.get<DiscoveredJobList>("/discovery/jobs", {
    params: buildJobParams(filters),
  });

  return response.data;
}

export async function getDiscoveredJob(id: string): Promise<DiscoveredJob> {
  const response = await apiClient.get<DiscoveredJob>(`/discovery/jobs/${id}`);
  return response.data;
}

export async function runDiscoveryNow(): Promise<RunSummary> {
  const response = await apiClient.post<RunSummary>(
    "/discovery/run",
    {},
    { timeout: RUN_TIMEOUT_MS }
  );

  return response.data;
}

export async function promoteDiscoveredJob(id: string): Promise<PromoteResult> {
  const response = await apiClient.post<PromoteResult>(
    `/discovery/jobs/${id}/promote`
  );

  return response.data;
}

export async function archiveDiscoveredJob(id: string, archived = true) {
  const response = await apiClient.post(`/discovery/jobs/${id}/archive`, {
    archived,
  });

  return response.data;
}
