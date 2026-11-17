import "./setupEnv";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { supabase } from "../src/config/supabase";
import { jobFingerprint } from "../src/discovery/dedup";
import { evaluateFreshness } from "../src/discovery/freshness";
import { masterProfileSchema } from "../src/discovery/profile";
import { createDiscoveryRepository } from "../src/discovery/repository";
import { scoreJob } from "../src/discovery/scoring";
import { EvaluatedJob } from "../src/discovery/types";
import { errorHandler } from "../src/middleware/erroHandler";
import { rateLimit } from "../src/middleware/rateLimit";
import { getOverviewAnalytics } from "../src/services/analytics.service";
import { updateApplication } from "../src/services/application.service";
import { ApiError } from "../src/utils/apiError";
import { createFakeSupabase } from "./fakeSupabase";
import { candidate, job, NOW, TEST_MASTER } from "./helpers";

function fakeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, unknown>,
  };

  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };

  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };

  res.setHeader = (key: string, value: unknown) => {
    res.headers[key] = value;
    return value;
  };

  return res;
}

// Swaps the shared supabase client's query methods for a fake during one test.
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
    const apiErrorRes = fakeRes();
    errorHandler(new ApiError(409, "busy"), req, apiErrorRes, () => {});
    assert.equal(apiErrorRes.statusCode, 409);

    const notFoundRes = fakeRes();
    const notFoundError = {
      code: "PGRST116",
      message: "JSON object requested, multiple (or no) rows returned",
    };
    errorHandler(notFoundError, req, notFoundRes, () => {});
    assert.equal(notFoundRes.statusCode, 404);
  });

  it("hides database internals in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const originalConsoleError = console.error;
    const dbError = {
      message: "relation secret_table does not exist",
      code: "42P01",
      hint: "x",
    };

    process.env.NODE_ENV = "production";
    const res = fakeRes();

    console.error = () => {};
    errorHandler(dbError, req, res, () => {});
    console.error = originalConsoleError;
    process.env.NODE_ENV = previousNodeEnv;

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
  });
});

describe("rateLimit", () => {
  it("allows max requests per window then returns 429", () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 2, name: "test" });
    const req: any = { user: { id: "u1" } };
    let passed = 0;

    for (let i = 0; i < 3; i++) {
      const res = fakeRes();
      middleware(req, res, () => passed++);

      if (i === 2) {
        assert.equal(res.statusCode, 429);
      }
    }

    assert.equal(passed, 2);
  });
});

describe("updateApplication", () => {
  it("only writes whitelisted fields (no user_id / deleted_at overwrite)", async () => {
    const fake = createFakeSupabase(() => ({ data: { id: "a1" } }));
    const restore = withFakeSupabase(fake);
    const payload = {
      notes: "hi",
      user_id: "attacker",
      deleted_at: null,
      id: "x",
    };

    try {
      await updateApplication("a1", "u1", payload as any);

      const query = fake.queries[0];
      const update = fake.op(query, "update")!.args[0] as Record<string, unknown>;
      assert.deepEqual(update, { notes: "hi" });

      const eqArgs = query.ops
        .filter((recorded) => recorded.op === "eq")
        .map((recorded) => recorded.args);
      assert.deepEqual(eqArgs, [
        ["id", "a1"],
        ["user_id", "u1"],
      ]);
    } finally {
      restore();
    }
  });

  it("rejects unknown statuses and accepts new lifecycle statuses", async () => {
    const fake = createFakeSupabase(() => ({ data: { id: "a1" } }));
    const restore = withFakeSupabase(fake);

    try {
      await assert.rejects(
        updateApplication("a1", "u1", { status: "HIRED" as any }),
        /Invalid status/
      );

      await updateApplication("a1", "u1", { status: "READY_TO_APPLY" });

      const lastQuery = fake.queries.at(-1)!;
      assert.deepEqual(fake.op(lastQuery, "update")!.args[0], {
        status: "READY_TO_APPLY",
      });
    } finally {
      restore();
    }
  });
});

describe("analytics", () => {
  it("is scoped to the requesting user and excludes deleted rows", async () => {
    const rows = [
      { status: "APPLIED" },
      { status: "PHONE_SCREEN" },
      { status: "DISCOVERED" },
      { status: "OFFER" },
    ];
    const fake = createFakeSupabase(() => ({ data: rows }));
    const restore = withFakeSupabase(fake);

    try {
      const result = await getOverviewAnalytics("u1");
      const query = fake.queries[0];

      assert.deepEqual(fake.op(query, "eq")!.args, ["user_id", "u1"]);
      assert.deepEqual(fake.op(query, "is")!.args, ["deleted_at", null]);
      assert.equal(result.SCREENING, 1);
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

    const badExperience = { ...TEST_MASTER.experiences[0], start: "Jan 2024" };
    const badProfile = { ...TEST_MASTER, experiences: [badExperience] };
    assert.equal(masterProfileSchema.safeParse(badProfile).success, false);
  });
});

describe("discovery repository", () => {
  function evaluated(externalId: string, shortlisted: boolean): EvaluatedJob {
    const evaluatedJob = job({
      externalId,
      sourceUrl: `https://e/${externalId}`,
      applyUrl: `https://e/${externalId}`,
    });

    return {
      job: evaluatedJob,
      freshness: evaluateFreshness(evaluatedJob, NOW),
      score: scoreJob(evaluatedJob, candidate()),
      fingerprint: jobFingerprint(evaluatedJob),
      rejection: shortlisted ? null : "below_threshold",
      rejectionDetail: null,
    };
  }

  function hasOp(query: { ops: { op: string }[] }, name: string) {
    return query.ops.some((recorded) => recorded.op === name);
  }

  it("inserts new postings and only updates already stored ones", async () => {
    const insertedRow = {
      id: "new-1",
      provider: "greenhouse",
      external_id: "new",
      shortlisted: true,
    };
    const fake = createFakeSupabase((query) => {
      if (hasOp(query, "upsert")) {
        return { data: [insertedRow] };
      }

      return { data: [] };
    });
    const repo = createDiscoveryRepository(fake.client);

    const known = [
      {
        id: "old-1",
        provider: "greenhouse" as const,
        externalId: "old",
        canonicalUrl: "https://e/old",
        canonicalApplyUrl: null,
        fingerprint: "f",
        requisitionId: null,
        postedAt: null,
        firstSeenAt: NOW.toISOString(),
        shortlisted: true,
        listingStatus: "open" as const,
        boardToken: "acme",
        applicationId: "app-9",
      },
    ];
    const evaluations = [evaluated("new", true), evaluated("old", false)];

    const result = await repo.saveEvaluations("u1", "run-1", evaluations, known);

    const upsertQuery = fake.queries.find((query) => hasOp(query, "upsert"))!;
    const rows = fake.op(upsertQuery, "upsert")!.args[0] as Record<string, unknown>[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].external_id, "new");
    assert.equal(rows[0].user_id, "u1");
    assert.equal(rows[0].applicant_count, null);
    assert.ok(
      !("first_seen_at" in rows[0]),
      "first_seen_at must come from the DB default"
    );

    const touchQuery = fake.queries.find((query) => hasOp(query, "update"))!;
    const patch = fake.op(touchQuery, "update")!.args[0] as Record<string, unknown>;
    assert.deepEqual(Object.keys(patch).sort(), [
      "last_run_id",
      "last_seen_at",
      "last_verified_at",
      "listing_status",
    ]);
    assert.deepEqual(fake.op(touchQuery, "in")!.args, ["id", ["old-1"]]);
    assert.deepEqual(result.shortlistedIds, ["new-1"]);
  });

  it("marks vanished postings closed and expires only pre-application tracker rows", async () => {
    const fake = createFakeSupabase((query) => {
      if (query.table === "applications") {
        return { data: [{ id: "app-9" }] };
      }

      return { data: [] };
    });
    const repo = createDiscoveryRepository(fake.client);

    const known = [
      {
        id: "gone",
        provider: "greenhouse" as const,
        externalId: "gone",
        canonicalUrl: "",
        canonicalApplyUrl: null,
        fingerprint: "f",
        requisitionId: null,
        postedAt: null,
        firstSeenAt: "",
        shortlisted: true,
        listingStatus: "open" as const,
        boardToken: "acme",
        applicationId: "app-9",
      },
      {
        id: "other-board",
        provider: "greenhouse" as const,
        externalId: "x",
        canonicalUrl: "",
        canonicalApplyUrl: null,
        fingerprint: "g",
        requisitionId: null,
        postedAt: null,
        firstSeenAt: "",
        shortlisted: false,
        listingStatus: "open" as const,
        boardToken: "failed-board",
        applicationId: null,
      },
    ];

    const succeededBoards = ["greenhouse/acme"];

    const result = await repo.markClosedPostings("u1", known, [], succeededBoards);
    assert.equal(result.closed, 1);

    const appUpdate = fake.queries.find((query) => query.table === "applications")!;
    assert.deepEqual(fake.op(appUpdate, "update")!.args[0], { status: "EXPIRED" });

    const statusFilter = appUpdate.ops
      .filter((recorded) => recorded.op === "in")
      .find((recorded) => recorded.args[0] === "status")!;
    assert.ok(!(statusFilter.args[1] as string[]).includes("APPLIED"));
    assert.ok(fake.queries.some((query) => query.table === "application_events"));
  });
});
