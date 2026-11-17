import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experienceMonths, buildCandidateProfile } from "../src/discovery/profile";
import { extractRequiredYears, extractWorkAuthFlags, scoreJob, SHORTLIST_THRESHOLD, WEIGHTS } from "../src/discovery/scoring";
import { candidate, job, NOW, TEST_MASTER } from "./helpers";

describe("weights", () => {
  it("match the specified 35/20/20/15/10 split", () => {
    assert.deepEqual(WEIGHTS, { technicalSkills: 0.35, experience: 0.2, responsibilities: 0.2, roleRelevance: 0.15, location: 0.1 });
    assert.equal(SHORTLIST_THRESHOLD, 70);
  });
});

describe("scoreJob", () => {
  it("scores a closely matching GTA full-stack role above the threshold", () => {
    const s = scoreJob(job(), candidate());
    assert.ok(s.total >= 70, `expected >= 70, got ${s.total}`);
    assert.equal(s.dimensions.roleRelevance.score, 1);
    assert.equal(s.dimensions.location.score, 1);
    assert.deepEqual(s.missingRequiredSkills, []);
    assert.ok(s.missingPreferredSkills.includes("Docker"));
  });

  it("total equals the weighted sum of dimensions", () => {
    const s = scoreJob(job(), candidate());
    const sum = Object.values(s.dimensions).reduce((a, d) => a + d.score * d.weight, 0);
    assert.equal(s.total, Math.round(sum * 100));
  });

  it("gives non-engineering roles zero role relevance", () => {
    const s = scoreJob(job({ title: "Account Executive, Enterprise Sales" }), candidate());
    assert.equal(s.dimensions.roleRelevance.score, 0);
  });

  it("penalises senior roles for an early-career resume", () => {
    const s = scoreJob(job({ title: "Staff Software Engineer" }), candidate());
    assert.ok(s.dimensions.experience.score <= 0.3);
    assert.ok(s.total < scoreJob(job(), candidate()).total);
  });

  it("does not award skill credit when the posting lists no recognisable skills", () => {
    const s = scoreJob(job({ descriptionText: "Join our team. Great culture and benefits." }), candidate());
    assert.equal(s.dimensions.technicalSkills.score, 0.3);
    assert.ok(s.lowConfidence.includes("technicalSkills"));
    assert.ok(s.total < 70);
  });

  it("does not credit skills the resume lacks", () => {
    const javaJd = "Requirements\n• Java\n• Spring Boot\n• Kafka\n• Kubernetes";
    const s = scoreJob(job({ descriptionText: javaJd, title: "Backend Developer" }), candidate());
    assert.equal(s.dimensions.technicalSkills.score, 0);
    assert.deepEqual(s.missingRequiredSkills.sort(), ["Java", "Kafka", "Kubernetes", "Spring"].sort());
  });

  it("scores location by distance from Brampton and arrangement", () => {
    const c = candidate();
    assert.equal(scoreJob(job({ location: "Vancouver, BC", locations: ["Vancouver, BC"], workArrangement: "onsite" }), c).dimensions.location.score, 0.1);
    assert.equal(scoreJob(job({ location: "Remote - Canada", locations: ["Remote - Canada"], workArrangement: "remote" }), c).dimensions.location.score, 1);
    assert.equal(scoreJob(job({ location: "Ottawa, ON", locations: ["Ottawa, ON"], workArrangement: "onsite" }), c).dimensions.location.score, 0.35);
    assert.equal(scoreJob(job({ location: "Austin, TX", locations: ["Austin, TX"], country: null }), c).dimensions.location.score, 0);
  });
});

describe("extractRequiredYears", () => {
  it("finds the smallest stated requirement", () => {
    assert.equal(extractRequiredYears("3+ years of experience with Python; 5 years experience preferred"), 3);
    assert.equal(extractRequiredYears("2-4 years of professional software experience"), 2);
    assert.equal(extractRequiredYears("No experience requirement stated"), null);
  });
});

describe("extractWorkAuthFlags", () => {
  it("surfaces citizenship and clearance requirements for manual review", () => {
    const flags = extractWorkAuthFlags("Great role. Must be a Canadian citizen. Secret clearance required. We offer benefits.");
    assert.equal(flags.length, 2);
  });
});

describe("candidate profile", () => {
  it("counts overlapping roles once", () => {
    assert.equal(
      experienceMonths([{ start: "2024-01", end: "2024-12" }, { start: "2024-06", end: "2025-03" }], NOW),
      15
    );
  });

  it("derives skills only from the resume", () => {
    const c = buildCandidateProfile(TEST_MASTER, undefined, NOW);
    assert.ok(c.skills.includes("Amazon S3"));
    assert.ok(c.skills.includes("Jest"));
    assert.ok(!c.skills.includes("Kubernetes"));
    assert.equal(c.experienceMonths, 24);
  });
});
