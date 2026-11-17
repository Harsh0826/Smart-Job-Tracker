import "./setupEnv";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { supabase } from "../src/config/supabase";
import { masterProfileSchema } from "../src/discovery/profile";
import { createDiscoveryRepository } from "../src/discovery/repository";
import { EvaluatedJob } from "../src/discovery/types";
import { errorHandler } from "../src/middleware/erroHandler";
import { rateLimit } from "../src/middleware/rateLimit";
import { getOverviewAnalytics } from "../src/services/analytics.service";
import { updateApplication } from "../src/services/application.service";
import { ApiError } from "../src/utils/apiError";
import { createFakeSupabase } from "./fakeSupabase";
import { candidate, job, TEST_MASTER } from "./helpers";
import { scoreJob } from "../src/discovery/scoring";
import { evaluateFreshness } from "../src/discovery/freshness";
import { jobFingerprint } from "../src/discovery/dedup";
import { NOW } from "./helpers";

function fakeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} as Record<string, unknown> };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => (res.headers[k] = v);
  return res;
}

/** Swap the shared supabase client's query methods for a fake during one test. */
function withFakeSupabase(fake: ReturnType<typeof createFakeSupabase>) {
  const original = { from: supabase.from, rpc: supabase.rpc };
  (supabase as any).from = fake.client.from;
  (supabase as any).rpc = fake.client.rpc;
  return () => Object.assign(supabase, original);
}

describe("errorHandler", () => {
  const req: any = { method: "GET", originalUrl: "/x" };
  it("maps validation errors to 400", () => {
    const res = fakeRes();
    const parsed = z.object({ a: z.string() }).safeParse({});
    errorHandler(parsed.error, req, res, () => {});
    assert.equal(res.statusCode, 400);
  });

  it("maps ApiError and PostgREST not-found codes", () => {
    const res1 = fakeRes();
    errorHandler(new ApiError(409, "busy"), req, res1, () => {});
    assert.equal(res1.statusCode, 409);
    const res2 = fakeRes();
    errorHandler({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, req, res2, () => {});
    assert.equal(res2.statusCode, 404);
  });

  it("hides database internals in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const res = fakeRes();
    const origError = console.error;
    console.error = () => {};
    errorHandler({ message: "relation secret_table does not exist", code: "42P01", hint: "x" }, req, res, () => {});
    console.error = origError;
    process.env.NODE_ENV = prev;
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
  });
});

describe("rateLimit", () => {
  it("allows max requests per window then returns 429", () => {
    const mw = rateLimit({ windowMs: 60_000, max: 2, name: "test" });
    const req: any = { user: { id: "u1" } };
    let passed = 0;
    for (let i = 0; i < 3; i++) {
      const res = fakeRes();
      mw(req, res, () => passed++);
      if (i === 2) assert.equal(res.statusCode, 429);
    }
    assert.equal(passed, 2);
  });
});

describe("updateApplication", () => {
  it("only writes whitelisted fields (no user_id / deleted_at overwrite)", async () => {
    const fake = createFakeSupabase(() => ({ data: { id: "a1" } }));
    const restore = withFakeSupabase(fake);
    try {
      await updateApplication("a1", "u1", { notes: "hi", user_id: "attacker", deleted_at: null, id: "x" } as any);
      const update = fake.op(fake.queries[0], "update")!.args[0] as Record<string, unknown>;
      assert.deepEqual(update, { notes: "hi" });
      const eqs = fake.queries[0].ops.filter((o) => o.op === "eq").map((o) => o.args);
      assert.deepEqual(eqs, [["id", "a1"], ["user_id", "u1"]]);
    } finally {
      restore();
    }
  });

  it("rejects unknown statuses and accepts new lifecycle statuses", async () => {
    const fake = createFakeSupabase(() => ({ data: { id: "a1" } }));
    const restore = withFakeSupabase(fake);
    try {
      await assert.rejects(updateApplication("a1", "u1", { status: "HIRED" as any }), /Invalid status/);
      await updateApplication("a1", "u1", { status: "READY_TO_APPLY" });
      assert.deepEqual(fake.op(fake.queries.at(-1)!, "update")!.args[0], { status: "READY_TO_APPLY" });
    } finally {
      restore();
    }
  });
});

describe("analytics", () => {
  it("is scoped to the requesting user and excludes deleted rows", async () => {
    const fake = createFakeSupabase(() => ({
      data: [{ status: "APPLIED" }, { status: "PHONE_SCREEN" }, { status: "DISCOVERED" }, { status: "OFFER" }],
    }));
    const restore = withFakeSupabase(fake);
    try {
      const result = await getOverviewAnalytics("u1");
      const q = fake.queries[0];
      assert.deepEqual(fake.op(q, "eq")!.args, ["user_id", "u1"]);
      assert.deepEqual(fake.op(q, "is")!.args, ["deleted_at", null]);
      assert.equal(result.SCREENING, 1); // PHONE_SCREEN now counted (was always 0 before)
      assert.equal(result.total, 3);
      assert.equal(result.preApplication, 1);
    } finally {
      restore();
    }
  });
});

describe("master profile validation", () => {
  it("accepts a career-copilot profile and rejects malformed dates", () => {
    assert.ok(masterProfileSchema.safeParse(TEST_MASTER).success);
    const bad = { ...TEST_MASTER, experiences: [{ ...TEST_MASTER.experiences[0], start: "Jan 2024" }] };
    assert.equal(masterProfileSchema.safeParse(bad).success, false);
  });
});

describe("discovery repository", () => {
  function evaluated(externalId: string, shortlisted: boolean): EvaluatedJob {
    const j = job({ externalId, sourceUrl: `https://e/${externalId}`, applyUrl: `https://e/${externalId}` });
    return {
      job: j,
      freshness: evaluateFreshness(j, NOW),
      score: scoreJob(j, candidate()),
      fingerprint: jobFingerprint(j),
      rejection: shortlisted ? null : "below_threshold",
      rejectionDetail: null,
    };
  }

  it("inserts new postings but only touches already-stored ones", async () => {
    const fake = createFakeSupabase((q) =>
      q.ops.some((o) => o.op === "upsert") ? { data: [{ id: "new-1", provider: "greenhouse", external_id: "new", shortlisted: true }] } : { data: [] }
    );
    const repo = createDiscoveryRepository(fake.client);
    const known = [
      {
        id: "old-1", provider: "greenhouse" as const, externalId: "old", canonicalUrl: "https://e/old", canonicalApplyUrl: null,
        fingerprint: "f", requisitionId: null, postedAt: null, firstSeenAt: NOW.toISOString(), shortlisted: true,
        listingStatus: "open" as const, boardToken: "acme", applicationId: "app-9",
      },
    ];
    const result = await repo.saveEvaluations("u1", "run-1", [evaluated("new", true), evaluated("old", false)], known);

    const upsert = fake.queries.find((q) => q.ops.some((o) => o.op === "upsert"))!;
    const rows = fake.op(upsert, "upsert")!.args[0] as Record<string, unknown>[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].external_id, "new");
    assert.equal(rows[0].user_id, "u1");
    assert.equal(rows[0].applicant_count, null);
    assert.ok(!("first_seen_at" in rows[0]), "first_seen_at must come from the DB default");

    const touch = fake.queries.find((q) => q.ops.some((o) => o.op === "update"))!;
    const patch = fake.op(touch, "update")!.args[0] as Record<string, unknown>;
    assert.deepEqual(Object.keys(patch).sort(), ["last_run_id", "last_seen_at", "last_verified_at", "listing_status"]);
    assert.deepEqual(fake.op(touch, "in")!.args, ["id", ["old-1"]]);
    assert.deepEqual(result.shortlistedIds, ["new-1"]);
  });

  it("marks vanished postings closed and expires only pre-application tracker rows", async () => {
    const fake = createFakeSupabase((q) => (q.table === "applications" ? { data: [{ id: "app-9" }] } : { data: [] }));
    const repo = createDiscoveryRepository(fake.client);
    const known = [
      {
        id: "gone", provider: "greenhouse" as const, externalId: "gone", canonicalUrl: "", canonicalApplyUrl: null, fingerprint: "f",
        requisitionId: null, postedAt: null, firstSeenAt: "", shortlisted: true, listingStatus: "open" as const, boardToken: "acme", applicationId: "app-9",
      },
      {
        id: "other-board", provider: "greenhouse" as const, externalId: "x", canonicalUrl: "", canonicalApplyUrl: null, fingerprint: "g",
        requisitionId: null, postedAt: null, firstSeenAt: "", shortlisted: false, listingStatus: "open" as const, boardToken: "failed-board", applicationId: null,
      },
    ];
    const r = await repo.markClosedPostings("u1", known, [], ["greenhouse/acme"]);
    assert.equal(r.closed, 1);
    const appUpdate = fake.queries.find((q) => q.table === "applications")!;
    assert.deepEqual(fake.op(appUpdate, "update")!.args[0], { status: "EXPIRED" });
    const statusFilter = appUpdate.ops.filter((o) => o.op === "in").find((o) => o.args[0] === "status")!;
    assert.ok(!(statusFilter.args[1] as string[]).includes("APPLIED"));
    assert.ok(fake.queries.some((q) => q.table === "application_events"));
  });
});
