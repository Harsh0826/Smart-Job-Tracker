import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectEvergreen, evaluateFreshness } from "../src/discovery/freshness";
import { hoursAgo, job, NOW } from "./helpers";

describe("evaluateFreshness", () => {
  it("accepts a posting published inside the 24h window", () => {
    const r = evaluateFreshness(job({ postedAt: hoursAgo(23.9) }), NOW);
    assert.equal(r.status, "fresh");
    assert.ok(r.ageHours! > 23 && r.ageHours! < 24);
  });

  it("rejects a posting older than 24h", () => {
    assert.equal(evaluateFreshness(job({ postedAt: hoursAgo(24.1) }), NOW).status, "stale");
  });

  it("marks an unknown posting date as unverified, never fresh", () => {
    const r = evaluateFreshness(job({ postedAt: null, sourceUpdatedAt: hoursAgo(1) }), NOW);
    assert.equal(r.status, "unverified");
  });

  it("does not treat a recently updated old listing as new", () => {
    // updated 1h ago, first published 10 days ago
    const r = evaluateFreshness(job({ postedAt: hoursAgo(240), sourceUpdatedAt: hoursAgo(1) }), NOW);
    assert.equal(r.status, "stale");
  });

  it("rejects unlisted postings and future timestamps", () => {
    assert.equal(evaluateFreshness(job({ isListed: false }), NOW).status, "invalid");
    assert.equal(evaluateFreshness(job({ postedAt: hoursAgo(-5) }), NOW).status, "invalid");
  });

  it("tolerates small clock skew", () => {
    assert.equal(evaluateFreshness(job({ postedAt: hoursAgo(-0.1) }), NOW).status, "fresh");
  });

  it("compares timestamps with offsets correctly", () => {
    // 2026-11-16T05:00:00-05:00 == 10:00Z, 3h before NOW
    const r = evaluateFreshness(job({ postedAt: new Date("2026-11-16T05:00:00-05:00").toISOString() }), NOW);
    assert.equal(Math.round(r.ageHours!), 3);
  });
});

describe("detectEvergreen", () => {
  it("flags talent-pool and future-opportunity listings", () => {
    assert.ok(detectEvergreen({ title: "Software Engineer - Talent Pool", descriptionText: "" }));
    assert.ok(detectEvergreen({ title: "Support Specialist - Future Opportunities", descriptionText: "" }));
    assert.ok(detectEvergreen({ title: "Engineer", descriptionText: "This is a general application for future roles." }));
  });

  it("leaves normal postings alone", () => {
    assert.equal(detectEvergreen(job()), null);
  });
});
