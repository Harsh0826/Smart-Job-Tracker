import { apiClient } from "./client";

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
  score_breakdown: {
    total: number;
    dimensions: Record<string, DimensionScore>;
    lowConfidence: string[];
    requiredYears: number | null;
  } | null;
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

export async function getDiscoverySummary(): Promise<DiscoverySummary> {
  return (await apiClient.get<DiscoverySummary>("/discovery/summary")).data;
}

export async function listDiscoveredJobs(filters: JobFilters = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  return (await apiClient.get<{ total: number; items: DiscoveredJobListItem[] }>("/discovery/jobs", { params })).data;
}

export async function getDiscoveredJob(id: string): Promise<DiscoveredJob> {
  return (await apiClient.get<DiscoveredJob>(`/discovery/jobs/${id}`)).data;
}

export async function runDiscoveryNow(): Promise<RunSummary> {
  return (await apiClient.post<RunSummary>("/discovery/run", {}, { timeout: 5 * 60_000 })).data;
}

export async function promoteDiscoveredJob(id: string) {
  return (await apiClient.post<{ application_id: string; created: boolean }>(`/discovery/jobs/${id}/promote`)).data;
}

export async function archiveDiscoveredJob(id: string, archived = true) {
  return (await apiClient.post(`/discovery/jobs/${id}/archive`, { archived })).data;
}
