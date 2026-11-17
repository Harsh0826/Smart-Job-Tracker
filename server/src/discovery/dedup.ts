import { createHash } from "node:crypto";
import { NormalizedJob, Provider } from "./types";

const TRACKING_PARAMS = /^(utm_|gh_src$|source$|src$|ref$|lever-source|lever-origin|ashby_)/i;
const MS_PER_HOUR = 3_600_000;

// Strips tracking params but keeps the ones that identify the job, such as gh_jid.
export function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    const keys = [...parsed.searchParams.keys()];

    for (const key of keys) {
      if (TRACKING_PARAMS.test(key)) {
        parsed.searchParams.delete(key);
      }
    }

    parsed.searchParams.sort();

    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    const query = parsed.searchParams.toString();
    const base = `${parsed.protocol}//${parsed.host}${path}`;

    if (!query) {
      return base;
    }

    return `${base}?${query}`;
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
    // Drop bracketed text such as requisition IDs or locations.
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/\bswe\b/g, "software engineer")
    .replace(/\bdev\b/g, "developer")
    // Drop a trailing suffix such as " - Toronto" or " | Remote".
    .replace(/\s[-–—|,]\s.*$/, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

function primaryCity(location: string): string {
  const firstPart = location.split(/[,;/|]/)[0];

  return firstPart
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

// Same company, normalised title and primary city means the same opening.
export function jobFingerprint(job: Pick<NormalizedJob, "company" | "title" | "location">): string {
  const company = normalizeCompany(job.company);
  const title = normalizeTitle(job.title);
  const city = primaryCity(job.location);
  const key = `${company}|${title}|${city}`;

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

export function findDuplicate(
  job: NormalizedJob,
  known: KnownJob[],
  now: Date,
  windowHours = 24
): DuplicateMatch | null {
  const url = canonicalUrl(job.sourceUrl);
  const applyUrl = canonicalUrl(job.applyUrl);
  const fingerprint = jobFingerprint(job);

  // A job we already track is updated in place, not inserted again.
  for (const existing of known) {
    if (existing.provider === job.provider && existing.externalId === job.externalId) {
      return { kind: "same_posting", existingId: existing.id, detail: "Same provider posting ID" };
    }

    const sameUrl = existing.canonicalUrl === url;
    const sameApplyUrl = Boolean(existing.canonicalApplyUrl) && existing.canonicalApplyUrl === applyUrl;

    if (sameUrl || sameApplyUrl) {
      return { kind: "same_posting", existingId: existing.id, detail: "Same posting URL" };
    }
  }

  if (job.requisitionId) {
    for (const existing of known) {
      if (existing.requisitionId === job.requisitionId && existing.provider === job.provider) {
        return {
          kind: "repost",
          existingId: existing.id,
          detail: `Requisition ${job.requisitionId} was already posted`,
        };
      }
    }
  }

  for (const existing of known) {
    if (existing.fingerprint !== fingerprint) continue;

    const firstSeenHours = (now.getTime() - new Date(existing.firstSeenAt).getTime()) / MS_PER_HOUR;

    let postedEarlier = false;
    if (existing.postedAt && job.postedAt) {
      postedEarlier = new Date(existing.postedAt) < new Date(job.postedAt);
    }

    // Seen before the window, or posted earlier, means an old opening under a new posting ID.
    if (firstSeenHours > windowHours || postedEarlier) {
      return {
        kind: "repost",
        existingId: existing.id,
        detail: `Same company/title/location first seen ${Math.round(firstSeenHours)}h ago under another posting ID`,
      };
    }

    // Seen recently, so it is most likely the same job listed on another board.
    return {
      kind: "cross_source_duplicate",
      existingId: existing.id,
      detail: "Same company/title/location already captured",
    };
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
