import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalUrl, findDuplicate, jobFingerprint, normalizeTitle, toKnownJob } from "../src/discovery/dedup";
import { hoursAgo, job, NOW } from "./helpers";

describe("canonicalUrl", () => {
  it("strips tracking params, fragments, www and trailing slashes but keeps job ids", () => {
    assert.equal(
      canonicalUrl("https://WWW.Asana.com/jobs/apply/8318674/?utm_source=x&gh_src=abc&gh_jid=8318674#apply"),
      "https://asana.com/jobs/apply/8318674?gh_jid=8318674"
    );
  });
});

describe("normalizeTitle / fingerprint", () => {
  it("treats cosmetic title variants as the same opening", () => {
    assert.equal(normalizeTitle("Sr. Software Engineer (Req #123) - Toronto"), "senior software engineer");
    const a = jobFingerprint({ company: "Acme Inc.", title: "Sr. Backend Developer", location: "Toronto, ON" });
    const b = jobFingerprint({ company: "ACME", title: "Senior Backend Developer", location: "Toronto" });
    assert.equal(a, b);
  });
});

describe("findDuplicate", () => {
  const existing = job({ externalId: "1", postedAt: hoursAgo(5) });

  it("detects the same posting by provider id", () => {
    const known = [toKnownJob(existing, "db-1", hoursAgo(5))];
    assert.equal(findDuplicate(existing, known, NOW)?.kind, "same_posting");
  });

  it("detects the same posting by URL across providers", () => {
    const known = [toKnownJob(existing, "db-1", hoursAgo(5))];
    const other = job({ provider: "lever", externalId: "zzz", sourceUrl: existing.sourceUrl + "?utm_source=li" });
    assert.equal(findDuplicate(other, known, NOW)?.kind, "same_posting");
  });

  it("flags a new posting ID on an already-posted requisition as a repost", () => {
    const old = job({ externalId: "1", requisitionId: "R-77", postedAt: hoursAgo(400) });
    const fresh = job({
      externalId: "2",
      requisitionId: "R-77",
      title: "Different title",
      sourceUrl: "https://x/2",
      applyUrl: "https://x/2/apply",
      postedAt: hoursAgo(2),
    });
    assert.equal(findDuplicate(fresh, [toKnownJob(old, "db-1", hoursAgo(400))], NOW)?.kind, "repost");
  });

  it("flags same company/title/location first seen long ago as a repost", () => {
    const old = job({ externalId: "1", postedAt: hoursAgo(300) });
    const fresh = job({ externalId: "2", sourceUrl: "https://x/2", applyUrl: "https://x/2/apply", postedAt: hoursAgo(2) });
    assert.equal(findDuplicate(fresh, [toKnownJob(old, "db-1", hoursAgo(300))], NOW)?.kind, "repost");
  });

  it("flags same company/title/location seen recently on another board as a duplicate", () => {
    const first = job({ externalId: "1", postedAt: hoursAgo(2) });
    const second = job({ provider: "ashby", externalId: "b", sourceUrl: "https://y/b", applyUrl: "https://y/b", postedAt: hoursAgo(2) });
    assert.equal(findDuplicate(second, [toKnownJob(first, "db-1", hoursAgo(1))], NOW)?.kind, "cross_source_duplicate");
  });

  it("returns null for a genuinely new job", () => {
    const other = job({ externalId: "9", title: "Backend Developer", sourceUrl: "https://z/9", applyUrl: "https://z/9" });
    assert.equal(findDuplicate(other, [toKnownJob(existing, "db-1", hoursAgo(5))], NOW), null);
  });
});
