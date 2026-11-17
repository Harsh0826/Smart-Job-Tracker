import { createHash } from "node:crypto";
import { NormalizedJob, Provider } from "./types";

const TRACKING_PARAMS = /^(utm_|gh_src$|source$|src$|ref$|lever-source|lever-origin|ashby_)/i;

/** Lowercased host, no fragment, no tracking params, no trailing slash. Keeps job-identifying params (e.g. gh_jid). */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    const path = u.pathname.replace(/\/+$/, "") || "/";
    const query = u.searchParams.toString();
    return `${u.protocol}//${u.host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|incorporated|ltd|limited|llc|corp|corporation|co|technologies|technology|labs)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ") // req ids, locations in brackets
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/\bswe\b/g, "software engineer")
    .replace(/\bdev\b/g, "developer")
    .replace(/\s[-–—|,]\s.*$/, "") // trailing " - Toronto" / " | Remote"
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

function primaryCity(location: string): string {
  return location.split(/[,;/|]/)[0].toLowerCase().replace(/[^a-z]+/g, " ").trim();
}

/** Same company + same normalised title + same primary city => the same opening. */
export function jobFingerprint(job: Pick<NormalizedJob, "company" | "title" | "location">): string {
  const key = `${normalizeCompany(job.company)}|${normalizeTitle(job.title)}|${primaryCity(job.location)}`;
  return createHash("sha1").update(key).digest("hex");
}

export interface KnownJob {
  id: string;
  provider: Provider;
  externalId: string;
  canonicalUrl: string;
  canonicalApplyUrl: string | null;
  fingerprint: string;
  requisitionId: string | null;
  postedAt: string | null;
  firstSeenAt: string;
}

export type DuplicateKind = "same_posting" | "cross_source_duplicate" | "repost";

export interface DuplicateMatch {
  kind: DuplicateKind;
  existingId: string;
  detail: string;
}

/**
 * Classify a job against what we already know.
 *  - same_posting: identical provider+externalId or identical URL (already tracked — update, don't insert)
 *  - repost: same requisition, or same fingerprint first seen before the freshness window, under a
 *            new posting ID — an old opening that looks new
 *  - cross_source_duplicate: same fingerprint seen recently (e.g. listed on two boards)
 */
export function findDuplicate(
  job: NormalizedJob,
  known: KnownJob[],
  now: Date,
  windowHours = 24
): DuplicateMatch | null {
  const url = canonicalUrl(job.sourceUrl);
  const applyUrl = canonicalUrl(job.applyUrl);
  const fp = jobFingerprint(job);

  for (const k of known) {
    if (k.provider === job.provider && k.externalId === job.externalId) {
      return { kind: "same_posting", existingId: k.id, detail: "Same provider posting ID" };
    }
    if (k.canonicalUrl === url || (k.canonicalApplyUrl && k.canonicalApplyUrl === applyUrl)) {
      return { kind: "same_posting", existingId: k.id, detail: "Same posting URL" };
    }
  }

  for (const k of known) {
    if (job.requisitionId && k.requisitionId === job.requisitionId && k.provider === job.provider) {
      return { kind: "repost", existingId: k.id, detail: `Requisition ${job.requisitionId} was already posted` };
    }
  }

  for (const k of known) {
    if (k.fingerprint !== fp) continue;
    const firstSeenHours = (now.getTime() - new Date(k.firstSeenAt).getTime()) / 3_600_000;
    const earlierPost = k.postedAt && job.postedAt && new Date(k.postedAt) < new Date(job.postedAt);
    if (firstSeenHours > windowHours || earlierPost) {
      return {
        kind: "repost",
        existingId: k.id,
        detail: `Same company/title/location first seen ${Math.round(firstSeenHours)}h ago under another posting ID`,
      };
    }
    return { kind: "cross_source_duplicate", existingId: k.id, detail: "Same company/title/location already captured" };
  }
  return null;
}

export function toKnownJob(job: NormalizedJob, id: string, firstSeenAt: string): KnownJob {
  return {
    id,
    provider: job.provider,
    externalId: job.externalId,
    canonicalUrl: canonicalUrl(job.sourceUrl),
    canonicalApplyUrl: canonicalUrl(job.applyUrl),
    fingerprint: jobFingerprint(job),
    requisitionId: job.requisitionId,
    postedAt: job.postedAt,
    firstSeenAt,
  };
}
