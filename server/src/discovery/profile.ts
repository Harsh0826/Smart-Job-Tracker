/**
 * Candidate profile for matching, derived ONLY from the Master Resume.
 *
 * The Master Resume is stored as the career-copilot `CareerProfile` JSON (career-copilot/backend/
 * app/schemas/profile.py), produced by its Document Parser from the uploaded resume file. Skills
 * count only if the resume states them (skills section or experience/project text); target roles and
 * locations are preferences, not experience.
 */
import { z } from "zod";
import { canonicalSkill, expandImpliedSkills, extractSkills } from "./skills";
import { CandidateProfile } from "./types";

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const masterProfileSchema = z.object({
  version: z.number().int().optional(),
  contact: z.object({ name: z.string().min(1) }).passthrough(),
  summary: z.string().nullable().optional(),
  experiences: z
    .array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          company: z.string(),
          location: z.string().nullable().optional(),
          start: yearMonth,
          end: yearMonth.nullable().optional(),
          bullets: z.array(z.object({ id: z.string(), text: z.string() }).passthrough()).default([]),
        })
        .passthrough()
    )
    .default([]),
  education: z.array(z.object({}).passthrough()).default([]),
  skills: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  projects: z
    .array(z.object({ name: z.string(), bullets: z.array(z.string()).default([]) }).passthrough())
    .optional(),
}).passthrough();

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

function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Union of employment intervals in months, so overlapping roles are not double-counted. */
export function experienceMonths(experiences: { start: string; end?: string | null }[], now = new Date()): number {
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const intervals = experiences
    .map((e) => [monthIndex(e.start), e.end ? monthIndex(e.end) : current] as [number, number])
    .filter(([s, e]) => e >= s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of intervals) {
    if (s > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart + 1;
      curStart = s;
      curEnd = e;
    } else curEnd = Math.max(curEnd, e);
  }
  if (curEnd >= 0) total += curEnd - curStart + 1;
  return total;
}

export function buildCandidateProfile(
  master: MasterProfile,
  prefs: SearchPreferences = DEFAULT_PREFERENCES,
  now = new Date()
): CandidateProfile {
  const bulletText = master.experiences.flatMap((e) => e.bullets.map((b) => b.text));
  const projectText = (master.projects ?? []).flatMap((p) => [p.name, ...p.bullets]);
  const experienceText = [master.summary ?? "", ...bulletText, ...projectText].join("\n");

  const skills = new Set<string>();
  for (const s of master.skills) {
    const canon = canonicalSkill(s);
    if (canon) skills.add(canon);
  }
  for (const s of extractSkills(experienceText)) skills.add(s);

  return {
    skills: [...expandImpliedSkills(skills)],
    experienceMonths: experienceMonths(master.experiences, now),
    titles: master.experiences.map((e) => e.title),
    experienceText,
    targetRoles: prefs.targetRoles,
    preferredCities: prefs.preferredCities,
    preferredRegion: prefs.preferredRegion,
    country: prefs.country,
  };
}
