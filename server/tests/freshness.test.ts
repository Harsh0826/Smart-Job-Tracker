import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectEvergreen, evaluateFreshness } from "../src/discovery/freshness";
import { hoursAgo, job, NOW } from "./helpers";

describe("evaluateFreshness", () => {
  it("accepts a posting published inside the 24h window", () => {
    const result = evaluateFreshness(job({ postedAt: hoursAgo(23.9) }), NOW);

    assert.equal(result.status, "fresh");
    assert.ok(result.ageHours! > 23 && result.ageHours! < 24);
  });

  it("rejects a posting older than 24h", () => {
    const result = evaluateFreshness(job({ postedAt: hoursAgo(24.1) }), NOW);

    assert.equal(result.status, "stale");
  });

  it("marks an unknown posting date as unverified instead of fresh", () => {
    const unknownDate = job({ postedAt: null, sourceUpdatedAt: hoursAgo(1) });
    const result = evaluateFreshness(unknownDate, NOW);

    assert.equal(result.status, "unverified");
  });

  it("does not treat a recently updated old listing as new", () => {
    const updatedOldListing = job({
      postedAt: hoursAgo(240),
      sourceUpdatedAt: hoursAgo(1),
    });
    const result = evaluateFreshness(updatedOldListing, NOW);

    assert.equal(result.status, "stale");
  });

  it("rejects unlisted postings and future timestamps", () => {
    const unlisted = job({ isListed: false });
    const future = job({ postedAt: hoursAgo(-5) });

    assert.equal(evaluateFreshness(unlisted, NOW).status, "invalid");
    assert.equal(evaluateFreshness(future, NOW).status, "invalid");
  });

  it("tolerates small clock skew", () => {
    const slightlyAhead = job({ postedAt: hoursAgo(-0.1) });

    assert.equal(evaluateFreshness(slightlyAhead, NOW).status, "fresh");
  });

  it("compares timestamps with offsets correctly", () => {
    // 05:00 at -05:00 is 10:00Z, 3h before NOW.
    const postedAt = new Date("2026-11-16T05:00:00-05:00").toISOString();
    const result = evaluateFreshness(job({ postedAt }), NOW);

    assert.equal(Math.round(result.ageHours!), 3);
  });
});

describe("detectEvergreen", () => {
  it("flags talent-pool and future-opportunity listings", () => {
    assert.ok(
      detectEvergreen({
        title: "Software Engineer - Talent Pool",
        descriptionText: "",
      })
    );
    assert.ok(
      detectEvergreen({
        title: "Support Specialist - Future Opportunities",
        descriptionText: "",
      })
    );
    assert.ok(
      detectEvergreen({
        title: "Engineer",
        descriptionText: "This is a general application for future roles.",
      })
    );
  });

  it("leaves normal postings alone", () => {
    assert.equal(detectEvergreen(job()), null);
  });
});
