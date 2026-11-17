export type Provider = "greenhouse" | "lever" | "ashby";

export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unknown";

export interface BoardConfig {
  provider: Provider;
  // Board slug, e.g. "hootsuite" for boards-api.greenhouse.io/v1/boards/hootsuite
  token: string;
  company: string;
  website?: string | null;
}

export interface NormalizedJob {
  provider: Provider;
  boardToken: string;
  externalId: string;
  // Used to spot reposts of the same opening under a new posting ID.
  requisitionId: string | null;
  title: string;
  company: string;
  companyWebsite: string | null;
  location: string;
  locations: string[];
  country: string | null;
  workArrangement: WorkArrangement;
  employmentType: string | null;
  // Null when the source does not expose the original publish time.
  postedAt: string | null;
  postedAtSource: string | null;
  // Last-modified time from the source, not used as a posting date.
  sourceUpdatedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  descriptionText: string;
  sourceUrl: string;
  applyUrl: string;
  // Public job-board APIs do not expose applicant counts.
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
  skills: string[];
  experienceMonths: number;
  titles: string[];
  experienceText: string;
  targetRoles: string[];
  preferredCities: string[];
  preferredRegion: string;
  country: string;
}

export interface DimensionScore {
  score: number; // 0 to 1
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
  duplicateOf?: {
    kind: "same_posting" | "cross_source_duplicate" | "repost";
    existingId: string;
  };
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
  nearMisses: EvaluatedJob[];
  evaluated: EvaluatedJob[];
}
