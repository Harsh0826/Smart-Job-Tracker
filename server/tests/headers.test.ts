import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeHeaderFileName } from "../src/utils/headers";

describe("safeHeaderFileName", () => {
  it("leaves normal file names unchanged", () => {
    assert.equal(safeHeaderFileName("resume_2026.pdf"), "resume_2026.pdf");
  });

  it("replaces quotes, backslashes and line breaks", () => {
    assert.equal(safeHeaderFileName('a"b\\c\r\nd.pdf'), "a_b_c__d.pdf");
  });
});
