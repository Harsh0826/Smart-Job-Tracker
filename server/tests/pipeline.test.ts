import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toKnownJob } from "../src/discovery/dedup";
import { runDiscoveryPipeline } from "../src/discovery/pipeline";
import { BoardConfig, NormalizedJob } from "../src/discovery/types";
import { candidate, hoursAgo, job, NOW } from "./helpers";

const http = { getJson: async () => ({}) } as any;

function boards(...tokens: string[]): BoardConfig[] {
  return tokens.map((t) => ({ provider: "greenhouse", token: t, company: t }));
}

function feed(map: Record<string, NormalizedJob[] | Error>) {
  return async (board: BoardConfig) => {
    const v = map[board.token];
    if (v instanceof Error) throw v;
    return v ?? [];
  };
}

function uniqueJob(i: number, extra: Partial<NormalizedJob> = {}): NormalizedJob {
  const titles = ["Full-Stack Developer", "Backend Developer", "Frontend Developer", "Software Developer", "Full Stack Engineer", "Junior Software Engineer", "Software Engineer"];
  return job({
    externalId: `id-${i}`,
    title: titles[i % titles.length],
    company: `Company ${i}`,
    sourceUrl: `https://example.test/${i}`,
    applyUrl: `https://example.test/${i}/apply`,
    ...extra,
  });
}

describe("runDiscoveryPipeline", () => {
  it("shortlists fresh, Canadian, relevant matches and rejects the rest with reasons", async () => {
    const report = await runDiscoveryPipeline({
      boards: boards("a"),
      candidate: candidate(),
      http,
      known: [],
      now: NOW,
      fetchBoardImpl: feed({
        a: [
          uniqueJob(1),
          uniqueJob(2, { postedAt: hoursAgo(30) }),
          uniqueJob(3, { postedAt: null }),
          uniqueJob(4, { location: "Austin, TX", locations: ["Austin, TX"], country: null }),
          uniqueJob(5, { title: "Account Executive" }),
          uniqueJob(6, { title: "Software Engineer - Talent Community" }),
        ],
      }),
    });
    assert.deepEqual(report.shortlisted.map((e) => e.job.externalId), ["id-1"]);
    assert.deepEqual(report.rejectedCounts, {
      stale: 1,
      unverified_date: 1,
      not_canada: 1,
      irrelevant_role: 1,
      evergreen: 1,
    });
  });

  it("never lowers the 70 threshold, even if asked", async () => {
    const weak = uniqueJob(1, { descriptionText: "Requirements\n• Java\n• Kafka" });
    const report = await runDiscoveryPipeline({
      boards: boards("a"), candidate: candidate(), http, known: [], now: NOW, threshold: 10,
      fetchBoardImpl: feed({ a: [weak] }),
    });
    assert.equal(report.shortlisted.length, 0);
    assert.equal(report.rejectedCounts.below_threshold, 1);
  });

  it("caps the shortlist at 5 and returns fewer when fewer qualify", async () => {
    const many = Array.from({ length: 8 }, (_, i) => uniqueJob(i));
    const full = await runDiscoveryPipeline({ boards: boards("a"), candidate: candidate(), http, known: [], now: NOW, fetchBoardImpl: feed({ a: many }) });
    assert.equal(full.shortlisted.length, 5);
    const few = await runDiscoveryPipeline({ boards: boards("a"), candidate: candidate(), http, known: [], now: NOW, fetchBoardImpl: feed({ a: many.slice(0, 2) }) });
    assert.equal(few.shortlisted.length, 2);
  });

  it("keeps going when a board fails", async () => {
    const report = await runDiscoveryPipeline({
      boards: boards("down", "up"), candidate: candidate(), http, known: [], now: NOW,
      fetchBoardImpl: feed({ down: new Error("HTTP 503"), up: [uniqueJob(1)] }),
    });
    assert.equal(report.boardErrors.length, 1);
    assert.deepEqual(report.boardsSucceeded, ["greenhouse/up"]);
    assert.equal(report.shortlisted.length, 1);
  });

  it("collapses the same opening listed on two boards in one run", async () => {
    const a = uniqueJob(1);
    const b = { ...uniqueJob(1), provider: "lever" as const, externalId: "lever-1", sourceUrl: "https://other/1", applyUrl: "https://other/1/apply" };
    const report = await runDiscoveryPipeline({ boards: boards("a", "b"), candidate: candidate(), http, known: [], now: NOW, fetchBoardImpl: feed({ a: [a], b: [b] }) });
    assert.equal(report.shortlisted.length, 1);
    assert.equal(report.rejectedCounts.duplicate, 1);
  });

  it("does not re-shortlist a posting already stored", async () => {
    const a = uniqueJob(1);
    const report = await runDiscoveryPipeline({
      boards: boards("a"), candidate: candidate(), http, now: NOW,
      known: [toKnownJob(a, "db-1", hoursAgo(5))],
      fetchBoardImpl: feed({ a: [a] }),
    });
    assert.equal(report.shortlisted.length, 0);
    assert.equal(report.evaluated[0].duplicateOf?.kind, "same_posting");
  });

  it("detects a repost against an older posting in the same feed", async () => {
    const old = uniqueJob(1, { externalId: "old", sourceUrl: "https://e/old", applyUrl: "https://e/old", postedAt: hoursAgo(500) });
    const fresh = uniqueJob(1, { externalId: "new", sourceUrl: "https://e/new", applyUrl: "https://e/new" });
    const report = await runDiscoveryPipeline({ boards: boards("a"), candidate: candidate(), http, known: [], now: NOW, fetchBoardImpl: feed({ a: [old, fresh] }) });
    assert.equal(report.shortlisted.length, 0);
    assert.equal(report.rejectedCounts.repost, 1);
  });
});
