import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toKnownJob } from "../src/discovery/dedup";
import { runDiscoveryPipeline } from "../src/discovery/pipeline";
import { BoardConfig, NormalizedJob } from "../src/discovery/types";
import { candidate, hoursAgo, job, NOW } from "./helpers";

type PipelineOptions = Parameters<typeof runDiscoveryPipeline>[0];
type BoardFeed = Record<string, NormalizedJob[] | Error>;

const http = { getJson: async () => ({}) } as any;

const TITLES = [
  "Full-Stack Developer",
  "Backend Developer",
  "Frontend Developer",
  "Software Developer",
  "Full Stack Engineer",
  "Junior Software Engineer",
  "Software Engineer",
];

function boards(...tokens: string[]): BoardConfig[] {
  return tokens.map((token) => ({
    provider: "greenhouse",
    token,
    company: token,
  }));
}

function feed(jobsByBoard: BoardFeed) {
  return async (board: BoardConfig) => {
    const result = jobsByBoard[board.token];

    if (result instanceof Error) throw result;

    return result ?? [];
  };
}

function uniqueJob(i: number, extra: Partial<NormalizedJob> = {}): NormalizedJob {
  return job({
    externalId: `id-${i}`,
    title: TITLES[i % TITLES.length],
    company: `Company ${i}`,
    sourceUrl: `https://example.test/${i}`,
    applyUrl: `https://example.test/${i}/apply`,
    ...extra,
  });
}

function runPipeline(
  boardTokens: string[],
  jobsByBoard: BoardFeed,
  overrides: Partial<PipelineOptions> = {}
) {
  return runDiscoveryPipeline({
    boards: boards(...boardTokens),
    candidate: candidate(),
    http,
    known: [],
    now: NOW,
    fetchBoardImpl: feed(jobsByBoard),
    ...overrides,
  });
}

describe("runDiscoveryPipeline", () => {
  it("shortlists fresh, Canadian, relevant matches and rejects the rest with reasons", async () => {
    const postings = [
      uniqueJob(1),
      uniqueJob(2, { postedAt: hoursAgo(30) }),
      uniqueJob(3, { postedAt: null }),
      uniqueJob(4, {
        location: "Austin, TX",
        locations: ["Austin, TX"],
        country: null,
      }),
      uniqueJob(5, { title: "Account Executive" }),
      uniqueJob(6, { title: "Software Engineer - Talent Community" }),
    ];

    const report = await runPipeline(["a"], { a: postings });

    const shortlistedIds = report.shortlisted.map((e) => e.job.externalId);
    assert.deepEqual(shortlistedIds, ["id-1"]);
    assert.deepEqual(report.rejectedCounts, {
      stale: 1,
      unverified_date: 1,
      not_canada: 1,
      irrelevant_role: 1,
      evergreen: 1,
    });
  });

  it("keeps the 70 threshold when a lower one is passed", async () => {
    const weak = uniqueJob(1, {
      descriptionText: "Requirements\n• Java\n• Kafka",
    });

    const report = await runPipeline(["a"], { a: [weak] }, { threshold: 10 });

    assert.equal(report.shortlisted.length, 0);
    assert.equal(report.rejectedCounts.below_threshold, 1);
  });

  it("caps the shortlist at 5 and returns fewer when fewer qualify", async () => {
    const many = Array.from({ length: 8 }, (_, i) => uniqueJob(i));

    const full = await runPipeline(["a"], { a: many });
    assert.equal(full.shortlisted.length, 5);

    const few = await runPipeline(["a"], { a: many.slice(0, 2) });
    assert.equal(few.shortlisted.length, 2);
  });

  it("keeps going when a board fails", async () => {
    const report = await runPipeline(["down", "up"], {
      down: new Error("HTTP 503"),
      up: [uniqueJob(1)],
    });

    assert.equal(report.boardErrors.length, 1);
    assert.deepEqual(report.boardsSucceeded, ["greenhouse/up"]);
    assert.equal(report.shortlisted.length, 1);
  });

  it("collapses the same opening listed on two boards in one run", async () => {
    const onGreenhouse = uniqueJob(1);
    const onLever = {
      ...uniqueJob(1),
      provider: "lever" as const,
      externalId: "lever-1",
      sourceUrl: "https://other/1",
      applyUrl: "https://other/1/apply",
    };

    const report = await runPipeline(["a", "b"], {
      a: [onGreenhouse],
      b: [onLever],
    });

    assert.equal(report.shortlisted.length, 1);
    assert.equal(report.rejectedCounts.duplicate, 1);
  });

  it("does not shortlist a posting that is already stored", async () => {
    const stored = uniqueJob(1);
    const known = [toKnownJob(stored, "db-1", hoursAgo(5))];

    const report = await runPipeline(["a"], { a: [stored] }, { known });

    assert.equal(report.shortlisted.length, 0);
    assert.equal(report.evaluated[0].duplicateOf?.kind, "same_posting");
  });

  it("detects a repost against an older posting in the same feed", async () => {
    const old = uniqueJob(1, {
      externalId: "old",
      sourceUrl: "https://e/old",
      applyUrl: "https://e/old",
      postedAt: hoursAgo(500),
    });
    const fresh = uniqueJob(1, {
      externalId: "new",
      sourceUrl: "https://e/new",
      applyUrl: "https://e/new",
    });

    const report = await runPipeline(["a"], { a: [old, fresh] });

    assert.equal(report.shortlisted.length, 0);
    assert.equal(report.rejectedCounts.repost, 1);
  });
});
