import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalSkill,
  extractRequirementSkills,
  extractSkills,
} from "../src/discovery/skills";
import { FULLSTACK_JD } from "./helpers";

describe("extractSkills", () => {
  it("does not confuse Java with JavaScript", () => {
    assert.deepEqual(extractSkills("We use JavaScript").includes("Java"), false);
    assert.ok(extractSkills("Java and Spring Boot").includes("Java"));
  });

  it("matches symbols and dotted names", () => {
    const skills = extractSkills("C++, C#, Node.js, Next.js and CI/CD");

    for (const skill of ["C++", "C#", "Node.js", "Next.js", "CI/CD"]) {
      assert.ok(skills.includes(skill), skill);
    }
  });

  it("ignores ambiguous words without tech context", () => {
    const plainText = "Please express your interest by spring.";
    const techText = "APIs built with Node and Express on PostgreSQL";

    assert.ok(!extractSkills(plainText).includes("Express"));
    assert.ok(extractSkills(techText).includes("Express"));
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

    for (const skill of ["React", "Node.js", "PostgreSQL", "TypeScript", "JWT"]) {
      assert.ok(required.includes(skill), skill);
    }

    for (const skill of ["Docker", "Kubernetes", "Terraform"]) {
      assert.ok(preferred.includes(skill), skill);
    }

    assert.ok(!preferred.includes("React"));
  });

  it("routes inline 'is a plus' lines to preferred", () => {
    const description =
      "Requirements\n• Python\n• Experience with Go (golang) is a plus";
    const { required, preferred } = extractRequirementSkills(description);

    assert.ok(required.includes("Python"));
    assert.ok(preferred.includes("Go"));
  });
});
