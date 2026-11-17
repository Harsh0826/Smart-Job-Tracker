import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCandidateProfile, experienceMonths } from "../src/discovery/profile";
import {
  extractRequiredYears,
  extractWorkAuthFlags,
  scoreJob,
  SHORTLIST_THRESHOLD,
  WEIGHTS,
} from "../src/discovery/scoring";
import { candidate, job, NOW, TEST_MASTER } from "./helpers";

describe("weights", () => {
  it("match the specified 35/20/20/15/10 split", () => {
    assert.deepEqual(WEIGHTS, {
      technicalSkills: 0.35,
      experience: 0.2,
      responsibilities: 0.2,
      roleRelevance: 0.15,
      location: 0.1,
    });
    assert.equal(SHORTLIST_THRESHOLD, 70);
  });
});

describe("scoreJob", () => {
  it("scores a closely matching GTA full-stack role above the threshold", () => {
    const score = scoreJob(job(), candidate());

    assert.ok(score.total >= 70, `expected >= 70, got ${score.total}`);
    assert.equal(score.dimensions.roleRelevance.score, 1);
    assert.equal(score.dimensions.location.score, 1);
    assert.deepEqual(score.missingRequiredSkills, []);
    assert.ok(score.missingPreferredSkills.includes("Docker"));
  });

  it("total equals the weighted sum of dimensions", () => {
    const score = scoreJob(job(), candidate());

    let weightedSum = 0;
    for (const dimension of Object.values(score.dimensions)) {
      weightedSum += dimension.score * dimension.weight;
    }

    assert.equal(score.total, Math.round(weightedSum * 100));
  });

  it("gives non-engineering roles zero role relevance", () => {
    const salesJob = job({ title: "Account Executive, Enterprise Sales" });
    const score = scoreJob(salesJob, candidate());

    assert.equal(score.dimensions.roleRelevance.score, 0);
  });

  it("penalises senior roles for an early-career resume", () => {
    const score = scoreJob(job({ title: "Staff Software Engineer" }), candidate());
    const baseline = scoreJob(job(), candidate());

    assert.ok(score.dimensions.experience.score <= 0.3);
    assert.ok(score.total < baseline.total);
  });

  it("does not award skill credit when the posting lists no recognisable skills", () => {
    const vagueJob = job({
      descriptionText: "Join our team. Great culture and benefits.",
    });
    const score = scoreJob(vagueJob, candidate());

    assert.equal(score.dimensions.technicalSkills.score, 0.3);
    assert.ok(score.lowConfidence.includes("technicalSkills"));
    assert.ok(score.total < 70);
  });

  it("does not credit skills the resume lacks", () => {
    const javaJd = "Requirements\n• Java\n• Spring Boot\n• Kafka\n• Kubernetes";
    const javaJob = job({ descriptionText: javaJd, title: "Backend Developer" });
    const score = scoreJob(javaJob, candidate());

    assert.equal(score.dimensions.technicalSkills.score, 0);
    assert.deepEqual(
      score.missingRequiredSkills.sort(),
      ["Java", "Kafka", "Kubernetes", "Spring"].sort()
    );
  });

  it("scores location by distance from Brampton and arrangement", () => {
    const profile = candidate();

    function locationScore(overrides: Parameters<typeof job>[0]) {
      return scoreJob(job(overrides), profile).dimensions.location.score;
    }

    const vancouverOnsite = locationScore({
      location: "Vancouver, BC",
      locations: ["Vancouver, BC"],
      workArrangement: "onsite",
    });
    const remoteCanada = locationScore({
      location: "Remote - Canada",
      locations: ["Remote - Canada"],
      workArrangement: "remote",
    });
    const ottawaOnsite = locationScore({
      location: "Ottawa, ON",
      locations: ["Ottawa, ON"],
      workArrangement: "onsite",
    });
    const austin = locationScore({
      location: "Austin, TX",
      locations: ["Austin, TX"],
      country: null,
    });

    assert.equal(vancouverOnsite, 0.1);
    assert.equal(remoteCanada, 1);
    assert.equal(ottawaOnsite, 0.35);
    assert.equal(austin, 0);
  });
});

describe("extractRequiredYears", () => {
  it("finds the smallest stated requirement", () => {
    assert.equal(
      extractRequiredYears(
        "3+ years of experience with Python; 5 years experience preferred"
      ),
      3
    );
    assert.equal(
      extractRequiredYears("2-4 years of professional software experience"),
      2
    );
    assert.equal(extractRequiredYears("No experience requirement stated"), null);
  });
});

describe("extractWorkAuthFlags", () => {
  it("surfaces citizenship and clearance requirements for manual review", () => {
    const description =
      "Great role. Must be a Canadian citizen. Secret clearance required. We offer benefits.";
    const flags = extractWorkAuthFlags(description);

    assert.equal(flags.length, 2);
  });
});

describe("candidate profile", () => {
  it("counts overlapping roles once", () => {
    const roles = [
      { start: "2024-01", end: "2024-12" },
      { start: "2024-06", end: "2025-03" },
    ];

    assert.equal(experienceMonths(roles, NOW), 15);
  });

  it("derives skills only from the resume", () => {
    const profile = buildCandidateProfile(TEST_MASTER, undefined, NOW);

    assert.ok(profile.skills.includes("Amazon S3"));
    assert.ok(profile.skills.includes("Jest"));
    assert.ok(!profile.skills.includes("Kubernetes"));
    assert.equal(profile.experienceMonths, 24);
  });
});
