import { HttpClient } from "./http";
import { inferWorkArrangement, isCanadaJob } from "./location";
import { htmlToText, normalizeWhitespace } from "./text";
import { BoardConfig, NormalizedJob, Provider, WorkArrangement } from "./types";

// LinkedIn and Indeed are not supported: they have no public job API and their terms prohibit scraping.

const REQUISITION_ID_FORMAT = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,40}$/;
const PLACEHOLDER_REQUISITION_ID = /^(n\/?a|na|tbd|none|null|0+|-)$/i;

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  let date: Date;

  if (typeof value === "number") {
    date = new Date(value);
  } else {
    date = new Date(String(value));
  }

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

// Requisition IDs only help repost detection when they look like real identifiers.
export function cleanRequisitionId(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const id = String(value).trim();

  // Rejects blanks and free text such as "See Opening ID".
  if (!REQUISITION_ID_FORMAT.test(id)) return null;
  if (PLACEHOLDER_REQUISITION_ID.test(id)) return null;

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
  if (isCanadaJob(locations, null)) return "Canada";

  return null;
}

function uniqueNonEmpty(values: string[]): string[] {
  const nonEmpty = values.filter(Boolean);
  return [...new Set(nonEmpty)];
}

function workplaceTypeToArrangement(workplaceType: string | null | undefined): WorkArrangement | null {
  const value = (workplaceType ?? "").toLowerCase();

  if (value === "remote" || value === "hybrid" || value === "onsite") {
    return value;
  }

  return null;
}

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

interface GreenhouseCurrencyRange {
  min_value?: string | number;
  max_value?: string | number;
  unit?: string;
}

function greenhouseSalary(metadata: GreenhouseJob["metadata"]) {
  for (const field of metadata ?? []) {
    if (field.value_type !== "currency_range") continue;
    if (!field.value || typeof field.value !== "object") continue;

    const range = field.value as GreenhouseCurrencyRange;
    const min = Number(range.min_value);
    const max = Number(range.max_value);

    if (!Number.isFinite(min) && !Number.isFinite(max)) continue;

    return {
      salaryMin: Number.isFinite(min) ? min : null,
      salaryMax: Number.isFinite(max) ? max : null,
      salaryCurrency: range.unit ?? null,
    };
  }

  return { salaryMin: null, salaryMax: null, salaryCurrency: null };
}

export function normalizeGreenhouse(raw: GreenhouseJob, board: BoardConfig): NormalizedJob {
  const description = htmlToText(raw.content ?? "");
  const primaryLocation = normalizeWhitespace(raw.location?.name ?? "");

  const officeLocations = (raw.offices ?? [])
    .map((office) => normalizeWhitespace(office.location || office.name || ""))
    .filter(Boolean);

  const locations = uniqueNonEmpty([primaryLocation, ...officeLocations]);

  const requisitionId =
    cleanRequisitionId(raw.requisition_id) ?? cleanRequisitionId(raw.internal_job_id);

  const workArrangement = inferWorkArrangement(
    primaryLocation,
    ...officeLocations,
    description.slice(0, 1500)
  );

  // updated_at changes on every edit, so only first_published is used as the posting date.
  const postedAt = toIso(raw.first_published);

  return {
    provider: "greenhouse",
    boardToken: board.token,
    externalId: String(raw.id),
    requisitionId,
    title: normalizeWhitespace(raw.title),
    company: board.company || raw.company_name || board.token,
    companyWebsite: board.website ?? null,
    location: primaryLocation || locations[0] || "Unknown",
    locations,
    country: countryFromLocations(locations, null),
    workArrangement,
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

interface LeverPosting {
  id: string;
  text: string;
  categories?: {
    commitment?: string;
    location?: string;
    team?: string;
    department?: string;
    allLocations?: string[];
  };
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
    .map((list) => `${list.text ?? ""}\n${htmlToText(list.content ?? "")}`)
    .join("\n\n");

  const mainDescription = raw.descriptionPlain ?? htmlToText(raw.description ?? "");

  const description = [mainDescription, listText, raw.additionalPlain ?? ""]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const primaryLocation = normalizeWhitespace(raw.categories?.location ?? "");
  const allLocations = (raw.categories?.allLocations ?? []).map(normalizeWhitespace);
  const locations = uniqueNonEmpty([primaryLocation, ...allLocations]);

  // Lever's country field is an ISO code, so "CA" here does mean Canada.
  let country: string | null = null;

  if (raw.country === "CA") {
    country = "Canada";
  } else if (raw.country) {
    country = raw.country;
  }

  const workArrangement =
    workplaceTypeToArrangement(raw.workplaceType) ??
    inferWorkArrangement(primaryLocation, description.slice(0, 1500));

  // Lever only exposes createdAt. A posting is published at or after creation, so this errs on the old side.
  const postedAt = toIso(raw.createdAt);

  return {
    provider: "lever",
    boardToken: board.token,
    externalId: raw.id,
    requisitionId: null,
    title: normalizeWhitespace(raw.text),
    company: board.company || board.token,
    companyWebsite: board.website ?? null,
    location: primaryLocation || "Unknown",
    locations,
    country: countryFromLocations(locations, country),
    workArrangement,
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

interface AshbyPostalAddress {
  addressCountry?: string;
  addressRegion?: string;
  addressLocality?: string;
}

interface AshbyCompensationComponent {
  compensationType?: string;
  minValue?: number | null;
  maxValue?: number | null;
  currencyCode?: string | null;
}

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: {
    location?: string;
    address?: { postalAddress?: { addressCountry?: string } };
  }[];
  address?: { postalAddress?: AshbyPostalAddress };
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
    summaryComponents?: AshbyCompensationComponent[];
  };
}

function ashbyCountry(raw: AshbyJob, locations: string[]): string | null {
  const countries: string[] = [];

  const primaryCountry = raw.address?.postalAddress?.addressCountry;
  if (primaryCountry) {
    countries.push(primaryCountry);
  }

  for (const secondary of raw.secondaryLocations ?? []) {
    const secondaryCountry = secondary.address?.postalAddress?.addressCountry;
    if (secondaryCountry) {
      countries.push(secondaryCountry);
    }
  }

  if (countries.some((country) => /canada/i.test(country))) return "Canada";
  if (countries.length > 0) return countries[0];

  return countryFromLocations(locations, null);
}

// Ashby sends values like "FullTime".
function formatAshbyEmploymentType(employmentType: string | undefined): string | null {
  if (!employmentType) return null;

  const hyphenated = employmentType.replace(/([a-z])([A-Z])/g, "$1-$2");
  return hyphenated.replace("Full-Time", "Full-time");
}

export function normalizeAshby(raw: AshbyJob, board: BoardConfig): NormalizedJob {
  const primaryLocation = normalizeWhitespace(raw.location ?? "");

  const secondaryLocations = (raw.secondaryLocations ?? [])
    .map((secondary) => normalizeWhitespace(secondary.location ?? ""))
    .filter(Boolean);

  const locations = uniqueNonEmpty([primaryLocation, ...secondaryLocations]);
  const country = ashbyCountry(raw, locations);

  let workArrangement = workplaceTypeToArrangement(raw.workplaceType);

  if (!workArrangement) {
    workArrangement = raw.isRemote ? "remote" : inferWorkArrangement(primaryLocation);
  }

  const salary = raw.compensation?.summaryComponents?.find(
    (component) => component.compensationType === "Salary"
  );

  const description = raw.descriptionPlain?.trim() || htmlToText(raw.descriptionHtml ?? "");
  const employmentType = formatAshbyEmploymentType(raw.employmentType);
  const postedAt = toIso(raw.publishedAt);

  return {
    provider: "ashby",
    boardToken: board.token,
    externalId: raw.id,
    requisitionId: null,
    title: normalizeWhitespace(raw.title),
    company: board.company || board.token,
    companyWebsite: board.website ?? null,
    location: primaryLocation || "Unknown",
    locations,
    country,
    workArrangement,
    employmentType: employmentType ?? inferEmploymentType(raw.title),
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

const ENDPOINTS: Record<Provider, (token: string) => string> = {
  greenhouse: (token) =>
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
  lever: (token) => `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
  ashby: (token) =>
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`,
};

export async function fetchBoard(board: BoardConfig, http: HttpClient): Promise<NormalizedJob[]> {
  const url = ENDPOINTS[board.provider](board.token);
  const data = await http.getJson<unknown>(url);

  switch (board.provider) {
    case "greenhouse": {
      const jobs = (data as { jobs?: GreenhouseJob[] }).jobs ?? [];
      return jobs.map((job) => normalizeGreenhouse(job, board));
    }

    case "lever": {
      if (!Array.isArray(data)) {
        throw new Error(`Lever board "${board.token}" did not return a list`);
      }

      return (data as LeverPosting[]).map((posting) => normalizeLever(posting, board));
    }

    case "ashby": {
      const jobs = (data as { jobs?: AshbyJob[] }).jobs ?? [];
      return jobs.map((job) => normalizeAshby(job, board));
    }
  }
}
