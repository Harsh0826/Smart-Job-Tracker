import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalSkill, extractRequirementSkills, extractSkills } from "../src/discovery/skills";
import { FULLSTACK_JD } from "./helpers";

describe("extractSkills", () => {
  it("does not confuse Java with JavaScript", () => {
    assert.deepEqual(extractSkills("We use JavaScript").includes("Java"), false);
    assert.ok(extractSkills("Java and Spring Boot").includes("Java"));
  });

  it("matches symbols and dotted names", () => {
    const s = extractSkills("C++, C#, Node.js, Next.js and CI/CD");
    for (const k of ["C++", "C#", "Node.js", "Next.js", "CI/CD"]) assert.ok(s.includes(k), k);
  });

  it("ignores ambiguous words without tech context", () => {
    assert.ok(!extractSkills("Please express your interest by spring.").includes("Express"));
    assert.ok(extractSkills("APIs built with Node and Express on PostgreSQL").includes("Express"));
  });

  it("canonicalises resume skill spellings", () => {
    assert.equal(canonicalSkill("ReactJS"), "React");
    assert.equal(canonicalSkill("postgres"), "PostgreSQL");
    assert.equal(canonicalSkill("Underwater basket weaving"), null);
  });
});

describe("extractRequirementSkills", () => {
  it("separates required from nice-to-have skills", () => {
    const { required, preferred } = extractRequirementSkills(FULLSTACK_JD);
    for (const k of ["React", "Node.js", "PostgreSQL", "TypeScript", "JWT"]) assert.ok(required.includes(k), k);
    for (const k of ["Docker", "Kubernetes", "Terraform"]) assert.ok(preferred.includes(k), k);
    assert.ok(!preferred.includes("React"));
  });

  it("routes inline 'is a plus' lines to preferred", () => {
    const { required, preferred } = extractRequirementSkills("Requirements\n• Python\n• Experience with Go (golang) is a plus");
    assert.ok(required.includes("Python"));
    assert.ok(preferred.includes("Go"));
  });
});
