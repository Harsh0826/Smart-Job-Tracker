import { FreshnessResult, NormalizedJob } from "./types";

export const DEFAULT_WINDOW_HOURS = 24;
/** Tolerated clock skew between provider servers and ours before a date counts as "in the future". */
const FUTURE_SKEW_HOURS = 0.25;

/**
 * Strict freshness: a job is "fresh" only when the source exposes its original publish time and that
 * time is within `windowHours` of `now`. Unknown dates are "unverified" (never fresh); a source's
 * last-updated time is never substituted for the posting date.
 */
export function evaluateFreshness(
  job: Pick<NormalizedJob, "postedAt" | "isListed">,
  now: Date,
  windowHours = DEFAULT_WINDOW_HOURS
): FreshnessResult {
  if (!job.isListed) return { status: "invalid", ageHours: null, reason: "Posting is unlisted or closed" };
  if (!job.postedAt) {
    return { status: "unverified", ageHours: null, reason: "Source does not expose an original posting time" };
  }
  const posted = new Date(job.postedAt);
  if (Number.isNaN(posted.getTime())) {
    return { status: "unverified", ageHours: null, reason: `Unparseable posting time "${job.postedAt}"` };
  }
  const ageHours = (now.getTime() - posted.getTime()) / 3_600_000;
  if (ageHours < -FUTURE_SKEW_HOURS) {
    return { status: "invalid", ageHours, reason: "Posting time is in the future; treated as unreliable" };
  }
  const age = Math.max(0, ageHours);
  if (age > windowHours) {
    return { status: "stale", ageHours: age, reason: `Posted ${formatAge(age)} ago (window ${windowHours}h)` };
  }
  return { status: "fresh", ageHours: age, reason: `Posted ${formatAge(age)} ago` };
}

export function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

const EVERGREEN_PATTERNS = [
  /\btalent (pool|community|network|pipeline)\b/i,
  /\bgeneral (application|interest)\b/i,
  /\bfuture (opportunit|opening|role)/i,
  /\bevergreen\b/i,
  /\bexpression of interest\b/i,
  /\bopen application\b/i,
  /\bcan'?t find (the|a) (right )?role\b/i,
  /\bpipeline (role|requisition|posting)\b/i,
  /\bnot (currently )?an active (opening|role|requisition)\b/i,
];

/** Pipeline / evergreen listings are not real openings even when recently (re)published. */
export function detectEvergreen(job: Pick<NormalizedJob, "title" | "descriptionText">): string | null {
  const head = `${job.title}\n${job.descriptionText.slice(0, 1500)}`;
  for (const re of EVERGREEN_PATTERNS) {
    const m = re.exec(head);
    if (m) return `Evergreen/pipeline listing ("${m[0]}")`;
  }
  return null;
}
