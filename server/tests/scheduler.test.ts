import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextRunAt } from "../src/discovery/scheduler";

describe("nextRunAt (08:00 America/Toronto)", () => {
  it("handles EST (UTC-5)", () => {
    assert.equal(nextRunAt(new Date("2026-11-16T12:00:00Z"), 8, 0).toISOString(), "2026-11-16T13:00:00.000Z");
  });

  it("rolls to the next day once 08:00 has passed", () => {
    assert.equal(nextRunAt(new Date("2026-11-16T13:00:00Z"), 8, 0).toISOString(), "2026-11-17T13:00:00.000Z");
  });

  it("handles EDT (UTC-4)", () => {
    assert.equal(nextRunAt(new Date("2026-07-01T05:00:00Z"), 8, 0).toISOString(), "2026-07-01T12:00:00.000Z");
  });

  it("handles the spring-forward DST change", () => {
    // DST starts 2026-03-08 02:00 local; 08:00 that day is EDT.
    assert.equal(nextRunAt(new Date("2026-03-07T14:00:00Z"), 8, 0).toISOString(), "2026-03-08T12:00:00.000Z");
  });
});
