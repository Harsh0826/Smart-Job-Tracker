/**
 * Provider adapters for public, unauthenticated job-board APIs that employers publish on purpose:
 *   Greenhouse  https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *   Lever       https://api.lever.co/v0/postings/{token}?mode=json
 *   Ashby       https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true
 *
 * Posting-date provenance (the freshness filter depends on this being right):
 *   Greenhouse: `first_published` is the original publish time. `updated_at` changes on every edit
 *               and is NEVER used as a posting date.
 *   Lever:      `createdAt` (epoch ms). A posting is published at or after creation, so a createdAt
 *               inside the window guarantees the publish time is too (conservative).
 *   Ashby:      `publishedAt`.
 *
 * LinkedIn and Indeed are intentionally not implemented: neither offers a public job-search API and
 * their terms prohibit scraping. Workday tenants only expose relative dates ("Posted Today"), which
 * cannot be verified, so they are left for a later adapter that would mark dates unverified.
 */

import { HttpClient } from "./http";
import { inferWorkArrangement, isCanadaJob } from "./location";
import { htmlToText, normalizeWhitespace } from "./text";
import { BoardConfig, NormalizedJob, Provider } from "./types";

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Requisition IDs are only useful for repost detection when they look like real identifiers. */
export function cleanRequisitionId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,40}$/.test(id)) return null; // rejects "See Opening ID", blanks
  if (/^(n\/?a|na|tbd|none|null|0+|-)$/i.test(id)) return null;
  return id;
}

function inferEmploymentType(...hints: (string | null | undefined)[]): string | null {
  const text = hints.filter(Boolean).join(" ").toLowerCase();
  if (/\bintern(ship)?\b|co-?op\b/.test(text)) return "Internship";
  if (/\bcontract(or)?\b|\btemporary\b|fixed[- ]term/.test(text)) return "Contract";
  if (/\bpart[- ]time\b/.test(text)) return "Part-time";
  if (/\bfull[- ]time\b|\bpermanent\b|fulltime/.test(text)) return "Full-time";
  return null;
}

function countryFromLocations(locations: string[], explicit: string | null): string | null {
  if (explicit) return explicit;
  return isCanadaJob(locations, null) ? "Canada" : null;
}

// --- Greenhouse ---------------------------------------------------------------------------------

interface GreenhouseJob {
  id: number;
  internal_job_id?: number | null;
  requisition_id?: string | null;
  title: string;
  company_name?: string;
  location?: { name?: string };
  offices?: { name?: string; location?: string | null }[];
  first_published?: string | null;
  updated_at?: string | null;
  absolute_url: string;
  content?: string;
  metadata?: { name?: string; value?: unknown; value_type?: string }[] | null;
}

function greenhouseSalary(meta: GreenhouseJob["metadata"]) {
  for (const m of meta ?? []) {
    if (m.value_type !== "currency_range" || !m.value || typeof m.value !== "object") continue;
    const v = m.value as { min_value?: string | number; max_value?: string | number; unit?: string };
    const min = Number(v.min_value);
    const max = Number(v.max_value);
    if (Number.isFinite(min) || Number.isFinite(max)) {
      return {
        salaryMin: Number.isFinite(min) ? min : null,
        salaryMax: Number.isFinite(max) ? max : null,
        salaryCurrency: v.unit ?? null,
      };
    }
  }
  return { salaryMin: null, salaryMax: null, salaryCurrency: null };
}

export function normalizeGreenhouse(raw: GreenhouseJob, board: BoardConfig): NormalizedJob {
  const description = htmlToText(raw.content ?? "");
  const primary = normalizeWhitespace(raw.location?.name ?? "");
  const officeLocations = (raw.offices ?? [])
    .map((o) => normalizeWhitespace(o.location || o.name || ""))
    .filter(Boolean);
  const locations = [...new Set([primary, ...officeLocations].filter(Boolean))];
  const postedAt = toIso(raw.first_published);
  return {
    provider: "greenhouse",
    boardToken: board.token,
    externalId: String(raw.id),
    requisitionId: cleanRequisitionId(raw.requisition_id) ?? cleanRequisitionId(raw.internal_job_id),
    title: normalizeWhitespace(raw.title),
    company: board.company || raw.company_name || board.token,
    companyWebsite: board.website ?? null,
    location: primary || locations[0] || "Unknown",
    locations,
    country: countryFromLocations(locations, null),
    workArrangement: inferWorkArrangement(primary, ...officeLocations, description.slice(0, 1500)),
    employmentType: inferEmploymentType(raw.title, description.slice(0, 2000)),
    postedAt,
    postedAtSource: postedAt ? "greenhouse.first_published" : null,
    sourceUpdatedAt: toIso(raw.updated_at),
    ...greenhouseSalary(raw.metadata),
    descriptionText: description,
    sourceUrl: raw.absolute_url,
    applyUrl: raw.absolute_url,
    applicantCount: null,
    isListed: true,
  };
}

// --- Lever --------------------------------------------------------------------------------------

interface LeverPosting {
  id: string;
  text: string;
  categories?: { commitment?: string; location?: string; team?: string; department?: string; allLocations?: string[] };
  createdAt?: number;
  country?: string | null;
  workplaceType?: string | null;
  descriptionPlain?: string;
  description?: string;
  lists?: { text?: string; content?: string }[];
  additionalPlain?: string;
  hostedUrl: string;
  applyUrl?: string;
  salaryRange?: { min?: number; max?: number; currency?: string } | null;
}

export function normalizeLever(raw: LeverPosting, board: BoardConfig): NormalizedJob {
  const listText = (raw.lists ?? [])
    .map((l) => `${l.text ?? ""}\n${htmlToText(l.content ?? "")}`)
    .join("\n\n");
  const description = [raw.descriptionPlain ?? htmlToText(raw.description ?? ""), listText, raw.additionalPlain ?? ""]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const primary = normalizeWhitespace(raw.categories?.location ?? "");
  const locations = [...new Set([primary, ...(raw.categories?.allLocations ?? []).map(normalizeWhitespace)].filter(Boolean))];
  const country = raw.country === "CA" ? "Canada" : raw.country ? raw.country : null;
  const wp = (raw.workplaceType ?? "").toLowerCase();
  const postedAt = toIso(raw.createdAt);
  return {
    provider: "lever",
    boardToken: board.token,
    externalId: raw.id,
    requisitionId: null,
    title: normalizeWhitespace(raw.text),
    company: board.company || board.token,
    companyWebsite: board.website ?? null,
    location: primary || "Unknown",
    locations,
    country: country === "Canada" ? "Canada" : countryFromLocations(locations, country),
    workArrangement:
      wp === "remote" || wp === "hybrid" || wp === "onsite" ? wp : inferWorkArrangement(primary, description.slice(0, 1500)),
    employmentType: inferEmploymentType(raw.categories?.commitment, raw.text),
    postedAt,
    postedAtSource: postedAt ? "lever.createdAt" : null,
    sourceUpdatedAt: null,
    salaryMin: raw.salaryRange?.min ?? null,
    salaryMax: raw.salaryRange?.max ?? null,
    salaryCurrency: raw.salaryRange?.currency ?? null,
    descriptionText: description,
    sourceUrl: raw.hostedUrl,
    applyUrl: raw.applyUrl ?? raw.hostedUrl,
    applicantCount: null,
    isListed: true,
  };
}

// --- Ashby --------------------------------------------------------------------------------------

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string; address?: { postalAddress?: { addressCountry?: string } } }[];
  address?: { postalAddress?: { addressCountry?: string; addressRegion?: string; addressLocality?: string } };
  employmentType?: string;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string | null;
  descriptionPlain?: string;
  descriptionHtml?: string;
  jobUrl: string;
  applyUrl?: string;
  compensation?: {
    summaryComponents?: { compensationType?: string; minValue?: number | null; maxValue?: number | null; currencyCode?: string | null }[];
  };
}

export function normalizeAshby(raw: AshbyJob, board: BoardConfig): NormalizedJob {
  const primary = normalizeWhitespace(raw.location ?? "");
  const secondary = (raw.secondaryLocations ?? []).map((s) => normalizeWhitespace(s.location ?? "")).filter(Boolean);
  const locations = [...new Set([primary, ...secondary].filter(Boolean))];
  const countries = [
    raw.address?.postalAddress?.addressCountry,
    ...(raw.secondaryLocations ?? []).map((s) => s.address?.postalAddress?.addressCountry),
  ].filter(Boolean) as string[];
  const country = countries.some((c) => /canada/i.test(c)) ? "Canada" : countries[0] ?? countryFromLocations(locations, null);
  const wp = (raw.workplaceType ?? "").toLowerCase();
  const salary = raw.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary");
  const description = raw.descriptionPlain?.trim() || htmlToText(raw.descriptionHtml ?? "");
  const postedAt = toIso(raw.publishedAt);
  const employment = raw.employmentType
    ? raw.employmentType.replace(/([a-z])([A-Z])/g, "$1-$2").replace("Full-Time", "Full-time")
    : null;
  return {
    provider: "ashby",
    boardToken: board.token,
    externalId: raw.id,
    requisitionId: null,
    title: normalizeWhitespace(raw.title),
    company: board.company || board.token,
    companyWebsite: board.website ?? null,
    location: primary || "Unknown",
    locations,
    country,
    workArrangement:
      wp === "remote" ? "remote" : wp === "hybrid" ? "hybrid" : wp === "onsite" ? "onsite" : raw.isRemote ? "remote" : inferWorkArrangement(primary),
    employmentType: employment ?? inferEmploymentType(raw.title),
    postedAt,
    postedAtSource: postedAt ? "ashby.publishedAt" : null,
    sourceUpdatedAt: null,
    salaryMin: salary?.minValue ?? null,
    salaryMax: salary?.maxValue ?? null,
    salaryCurrency: salary?.currencyCode ?? null,
    descriptionText: description,
    sourceUrl: raw.jobUrl,
    applyUrl: raw.applyUrl ?? raw.jobUrl,
    applicantCount: null,
    isListed: raw.isListed !== false,
  };
}

// --- Fetch --------------------------------------------------------------------------------------

const ENDPOINTS: Record<Provider, (token: string) => string> = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/jobs?content=true`,
  lever: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}?includeCompensation=true`,
};

export async function fetchBoard(board: BoardConfig, http: HttpClient): Promise<NormalizedJob[]> {
  const url = ENDPOINTS[board.provider](board.token);
  const data = await http.getJson<unknown>(url);
  switch (board.provider) {
    case "greenhouse": {
      const jobs = (data as { jobs?: GreenhouseJob[] }).jobs ?? [];
      return jobs.map((j) => normalizeGreenhouse(j, board));
    }
    case "lever": {
      if (!Array.isArray(data)) throw new Error(`Lever board "${board.token}" did not return a list`);
      return (data as LeverPosting[]).map((j) => normalizeLever(j, board));
    }
    case "ashby": {
      const jobs = (data as { jobs?: AshbyJob[] }).jobs ?? [];
      return jobs.map((j) => normalizeAshby(j, board));
    }
  }
}
