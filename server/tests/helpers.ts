import { buildCandidateProfile, MasterProfile } from "../src/discovery/profile";
import { CandidateProfile, NormalizedJob } from "../src/discovery/types";

export const NOW = new Date("2026-11-16T13:00:00.000Z"); // 08:00 America/Toronto

export function hoursAgo(h: number, now = NOW): string {
  return new Date(now.getTime() - h * 3_600_000).toISOString();
}

export const FULLSTACK_JD = `About the role
We are hiring a Full-Stack Developer to build our customer platform.

What you'll do
• Build and maintain REST APIs with Node.js and Express backed by PostgreSQL
• Develop responsive React and TypeScript user interfaces
• Integrate the OpenAI API into product features
• Deploy services on AWS and store documents in Amazon S3
• Write unit tests and participate in code reviews

Requirements
• 1+ years of professional software development experience
• Strong JavaScript and TypeScript skills
• Experience with React, Node.js, SQL and PostgreSQL
• Familiarity with JWT authentication and REST API design

Nice to have
• Docker and Kubernetes
• Terraform`;

export function job(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    provider: "greenhouse",
    boardToken: "acme",
    externalId: "1001",
    requisitionId: null,
    title: "Full-Stack Developer",
    company: "Acme",
    companyWebsite: null,
    location: "Toronto, Ontario, Canada",
    locations: ["Toronto, Ontario, Canada"],
    country: "Canada",
    workArrangement: "hybrid",
    employmentType: "Full-time",
    postedAt: hoursAgo(3),
    postedAtSource: "greenhouse.first_published",
    sourceUpdatedAt: hoursAgo(1),
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    descriptionText: FULLSTACK_JD,
    sourceUrl: "https://job-boards.greenhouse.io/acme/jobs/1001",
    applyUrl: "https://job-boards.greenhouse.io/acme/jobs/1001",
    applicantCount: null,
    isListed: true,
    ...overrides,
  };
}

/** A fictional test resume — not the user's. */
export const TEST_MASTER: MasterProfile = {
  contact: { name: "Test Candidate" },
  summary: "Full-stack developer building web applications with React and Node.js.",
  experiences: [
    {
      id: "e1",
      title: "Software Developer",
      company: "Example Corp",
      start: "2024-01",
      end: "2025-12",
      bullets: [
        { id: "e1.b1", text: "Built REST APIs with Node.js, Express and PostgreSQL for an internal platform" },
        { id: "e1.b2", text: "Developed React and TypeScript user interfaces and wrote unit tests with Jest" },
        { id: "e1.b3", text: "Integrated the OpenAI API and stored documents in Amazon S3 on AWS" },
        { id: "e1.b4", text: "Implemented JWT authentication and participated in code reviews" },
      ],
    },
  ],
  education: [],
  skills: ["JavaScript", "TypeScript", "Python", "React", "Node.js", "PostgreSQL", "SQL", "AWS", "REST APIs", "JWT"],
  certifications: [],
};

export function candidate(): CandidateProfile {
  return buildCandidateProfile(TEST_MASTER, undefined, NOW);
}
