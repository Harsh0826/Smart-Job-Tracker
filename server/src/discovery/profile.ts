import { z } from "zod";
import { canonicalSkill, expandImpliedSkills, extractSkills } from "./skills";
import { CandidateProfile } from "./types";

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const experienceSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    company: z.string(),
    location: z.string().nullable().optional(),
    start: yearMonth,
    end: yearMonth.nullable().optional(),
    bullets: z
      .array(z.object({ id: z.string(), text: z.string() }).passthrough())
      .default([]),
  })
  .passthrough();

const projectSchema = z
  .object({
    name: z.string(),
    bullets: z.array(z.string()).default([]),
  })
  .passthrough();

// Matches CareerProfile in career-copilot/backend/app/schemas/profile.py.
export const masterProfileSchema = z
  .object({
    version: z.number().int().optional(),
    contact: z.object({ name: z.string().min(1) }).passthrough(),
    summary: z.string().nullable().optional(),
    experiences: z.array(experienceSchema).default([]),
    education: z.array(z.object({}).passthrough()).default([]),
    skills: z.array(z.string()).default([]),
    certifications: z.array(z.string()).default([]),
    projects: z.array(projectSchema).optional(),
  })
  .passthrough();

export type MasterProfile = z.infer<typeof masterProfileSchema>;

export interface SearchPreferences {
  targetRoles: string[];
  preferredCities: string[];
  preferredRegion: string;
  country: string;
}

export const DEFAULT_PREFERENCES: SearchPreferences = {
  targetRoles: [
    "Full-Stack Software Engineer",
    "Frontend Developer",
    "Backend Developer",
    "Junior Software Engineer",
    "Software Developer",
    "Cloud / AWS Developer",
    "DevOps Engineer",
    "AI / LLM Application Developer",
  ],
  preferredCities: ["Brampton", "Toronto", "Mississauga", "GTA"],
  preferredRegion: "Ontario",
  country: "Canada",
};

function monthIndex(yearMonthValue: string): number {
  const [year, month] = yearMonthValue.split("-").map(Number);
  return year * 12 + (month - 1);
}

// Overlapping roles are merged so the same months are not counted twice.
export function experienceMonths(
  experiences: { start: string; end?: string | null }[],
  now = new Date()
): number {
  const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const intervals: [number, number][] = [];

  for (const experience of experiences) {
    const start = monthIndex(experience.start);
    const end = experience.end ? monthIndex(experience.end) : currentMonth;

    if (end >= start) {
      intervals.push([start, end]);
    }
  }

  intervals.sort((a, b) => a[0] - b[0]);

  let total = 0;
  let spanStart = -1;
  let spanEnd = -1;

  for (const [start, end] of intervals) {
    if (start > spanEnd) {
      if (spanEnd >= 0) {
        total += spanEnd - spanStart + 1;
      }

      spanStart = start;
      spanEnd = end;
    } else {
      spanEnd = Math.max(spanEnd, end);
    }
  }

  if (spanEnd >= 0) {
    total += spanEnd - spanStart + 1;
  }

  return total;
}

// Skills only count if the resume states them. Target roles and locations are preferences.
export function buildCandidateProfile(
  master: MasterProfile,
  prefs: SearchPreferences = DEFAULT_PREFERENCES,
  now = new Date()
): CandidateProfile {
  const textParts: string[] = [master.summary ?? ""];

  for (const experience of master.experiences) {
    for (const bullet of experience.bullets) {
      textParts.push(bullet.text);
    }
  }

  for (const project of master.projects ?? []) {
    textParts.push(project.name, ...project.bullets);
  }

  const experienceText = textParts.join("\n");

  const skills = new Set<string>();

  for (const skill of master.skills) {
    const canonical = canonicalSkill(skill);

    if (canonical) {
      skills.add(canonical);
    }
  }

  for (const skill of extractSkills(experienceText)) {
    skills.add(skill);
  }

  return {
    skills: [...expandImpliedSkills(skills)],
    experienceMonths: experienceMonths(master.experiences, now),
    titles: master.experiences.map((experience) => experience.title),
    experienceText,
    targetRoles: prefs.targetRoles,
    preferredCities: prefs.preferredCities,
    preferredRegion: prefs.preferredRegion,
    country: prefs.country,
  };
}
