import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanRequisitionId, normalizeAshby, normalizeGreenhouse, normalizeLever } from "../src/discovery/sources";
import { htmlToText } from "../src/discovery/text";

const gh = { provider: "greenhouse" as const, token: "acme", company: "Acme" };

describe("Greenhouse adapter", () => {
  const raw = {
    id: 8221711,
    internal_job_id: 3558277,
    requisition_id: "20260159",
    title: "Backend Developer",
    location: { name: "Toronto, Ontario" },
    offices: [{ name: "Toronto", location: "Toronto, ON, Canada" }],
    first_published: "2026-11-16T05:05:31-05:00",
    updated_at: "2026-11-16T07:02:25-05:00",
    absolute_url: "https://job-boards.greenhouse.io/acme/jobs/8221711",
    content: "&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Node.js&amp;nbsp;and PostgreSQL&lt;/li&gt;&lt;/ul&gt;",
    metadata: [{ name: "Pay", value_type: "currency_range", value: { min_value: "90000", max_value: "110000", unit: "CAD" } }],
  };

  it("uses first_published, never updated_at, as the posting date", () => {
    const j = normalizeGreenhouse(raw, gh);
    assert.equal(j.postedAt, new Date("2026-11-16T10:05:31Z").toISOString());
    assert.equal(j.postedAtSource, "greenhouse.first_published");
    assert.equal(j.sourceUpdatedAt, new Date("2026-11-16T12:02:25Z").toISOString());
  });

  it("leaves postedAt null when first_published is missing", () => {
    const j = normalizeGreenhouse({ ...raw, first_published: null }, gh);
    assert.equal(j.postedAt, null);
    assert.equal(j.postedAtSource, null);
  });

  it("decodes double-encoded HTML content and parses salary", () => {
    const j = normalizeGreenhouse(raw, gh);
    assert.match(j.descriptionText, /Requirements\n• Node\.js and PostgreSQL/);
    assert.deepEqual([j.salaryMin, j.salaryMax, j.salaryCurrency], [90000, 110000, "CAD"]);
    assert.equal(j.country, "Canada");
    assert.equal(j.applicantCount, null);
  });
});

describe("Lever adapter", () => {
  const raw = {
    id: "ad208490",
    text: "Frontend Developer",
    categories: { commitment: "Full-time", location: "Toronto" },
    createdAt: 1794834000000,
    country: "CA",
    workplaceType: "hybrid",
    descriptionPlain: "Build React apps.",
    lists: [{ text: "Requirements", content: "<li>React</li><li>TypeScript</li>" }],
    hostedUrl: "https://jobs.lever.co/acme/ad208490",
    applyUrl: "https://jobs.lever.co/acme/ad208490/apply",
    salaryRange: { min: 80000, max: 100000, currency: "CAD" },
  };

  it("maps createdAt epoch ms, country code and workplace type", () => {
    const j = normalizeLever(raw, { provider: "lever", token: "acme", company: "Acme" });
    assert.equal(j.postedAt, new Date(1794834000000).toISOString());
    assert.equal(j.postedAtSource, "lever.createdAt");
    assert.equal(j.country, "Canada");
    assert.equal(j.workArrangement, "hybrid");
    assert.equal(j.employmentType, "Full-time");
    assert.match(j.descriptionText, /Requirements\n• React\n• TypeScript/);
    assert.equal(j.applyUrl, raw.applyUrl);
  });
});

describe("Ashby adapter", () => {
  const raw = {
    id: "7133d205",
    title: "Full-Stack Engineer",
    location: "Toronto",
    secondaryLocations: [{ location: "Vancouver", address: { postalAddress: { addressCountry: "Canada" } } }],
    address: { postalAddress: { addressCountry: "Canada", addressRegion: "Ontario" } },
    employmentType: "FullTime",
    publishedAt: "2026-11-16T08:21:37.401+00:00",
    isListed: true,
    isRemote: true,
    workplaceType: "Remote",
    descriptionPlain: "Work on our platform.",
    jobUrl: "https://jobs.ashbyhq.com/acme/7133d205",
    applyUrl: "https://jobs.ashbyhq.com/acme/7133d205/application",
  };

  it("maps publishedAt, isListed and workplace type", () => {
    const j = normalizeAshby(raw, { provider: "ashby", token: "acme", company: "Acme" });
    assert.equal(j.postedAt, "2026-11-16T08:21:37.401Z");
    assert.equal(j.workArrangement, "remote");
    assert.equal(j.employmentType, "Full-time");
    assert.deepEqual(j.locations, ["Toronto", "Vancouver"]);
    assert.equal(j.isListed, true);
    assert.equal(normalizeAshby({ ...raw, isListed: false }, { provider: "ashby", token: "acme", company: "Acme" }).isListed, false);
  });
});

describe("cleanRequisitionId", () => {
  it("keeps real identifiers and drops placeholders", () => {
    assert.equal(cleanRequisitionId("20260159"), "20260159");
    assert.equal(cleanRequisitionId("MH156"), "MH156");
    assert.equal(cleanRequisitionId("See Opening ID"), null);
    assert.equal(cleanRequisitionId("N/A"), null);
    assert.equal(cleanRequisitionId(""), null);
  });
});

describe("htmlToText", () => {
  it("keeps list items and headings on their own lines", () => {
    assert.equal(htmlToText("<h2>Requirements</h2><ul><li>Python</li><li>SQL</li></ul>"), "Requirements\n• Python\n• SQL");
  });
});
