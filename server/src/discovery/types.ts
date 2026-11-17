/**
 * Shared types for the job discovery engine.
 *
 * A posting flows: provider JSON -> NormalizedJob -> FreshnessResult -> ScoreBreakdown -> stored row.
 * Every field that could not be established from the source is null (never guessed).
 */

export type Provider = "greenhouse" | "lever" | "ashby";

export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unknown";

export interface BoardConfig {
  provider: Provider;
  /** Board slug, e.g. "hootsuite" for boards-api.greenhouse.io/v1/boards/hootsuite */
  token: string;
  company: string;
  website?: string | null;
}

export interface NormalizedJob {
  provider: Provider;
  boardToken: string;
  externalId: string;
  /** Requisition / internal ID, used to spot reposts of the same opening under a new posting ID. */
  requisitionId: string | null;
  title: string;
  company: string;
  companyWebsite: string | null;
  location: string;
  /** Every location string the posting lists (primary + secondary). */
  locations: string[];
  country: string | null;
  workArrangement: WorkArrangement;
  employmentType: string | null;
  /** ISO-8601 UTC. Null when the source does not expose the original publish time. */
  postedAt: string | null;
  /** Which source field postedAt came from, so the UI can show provenance. */
  postedAtSource: string | null;
  /** Last-modified time from the source. Never used as a posting date. */
  sourceUpdatedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  descriptionText: string;
  sourceUrl: string;
  applyUrl: string;
  /** Public job-board APIs do not expose applicant counts. */
  applicantCount: number | null;
  isListed: boolean;
}

export type FreshnessStatus = "fresh" | "stale" | "unverified" | "invalid";

export interface FreshnessResult {
  status: FreshnessStatus;
  ageHours: number | null;
  reason: string;
}

export interface CandidateProfile {
  /** Skills that appear in the Master Resume (canonical names from the taxonomy). */
  skills: string[];
  /** Total months of professional experience, overlapping roles counted once. */
  experienceMonths: number;
  titles: string[];
  /** All experience/project bullet text, used for responsibility overlap. */
  experienceText: string;
  targetRoles: string[];
  /** Locations the candidate accepts for onsite / hybrid work. */
  preferredCities: string[];
  preferredRegion: string;
  country: string;
}

export interface DimensionScore {
  /** 0..1 */
  score: number;
  weight: number;
  explanation: string;
}

export interface ScoreBreakdown {
  total: number;
  dimensions: {
    technicalSkills: DimensionScore;
    experience: DimensionScore;
    responsibilities: DimensionScore;
    roleRelevance: DimensionScore;
    location: DimensionScore;
  };
  requiredSkills: string[];
  preferredSkills: string[];
  matchedSkills: string[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];
  requiredYears: number | null;
  /** Phrases the candidate must check against their own work authorization. */
  workAuthorizationFlags: string[];
  lowConfidence: string[];
}

export type RejectionReason =
  | "not_canada"
  | "unlisted"
  | "stale"
  | "unverified_date"
  | "evergreen"
  | "repost"
  | "duplicate"
  | "irrelevant_role"
  | "below_threshold";

export interface EvaluatedJob {
  job: NormalizedJob;
  freshness: FreshnessResult;
  score: ScoreBreakdown | null;
  fingerprint: string;
  rejection: RejectionReason | null;
  rejectionDetail: string | null;
  /** Set when the posting is already stored (same provider ID / URL) or duplicates another record. */
  duplicateOf?: { kind: "same_posting" | "cross_source_duplicate" | "repost"; existingId: string };
}

export interface DiscoveryRunReport {
  startedAt: string;
  finishedAt: string;
  boardsQueried: number;
  boardsSucceeded: string[];
  boardErrors: { board: string; error: string }[];
  postingsFetched: number;
  rejectedCounts: Partial<Record<RejectionReason, number>>;
  shortlisted: EvaluatedJob[];
  /** Fresh, relevant postings that scored below threshold (kept for transparency). */
  nearMisses: EvaluatedJob[];
  evaluated: EvaluatedJob[];
}
