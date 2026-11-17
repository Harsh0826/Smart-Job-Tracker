/**
 * Transparent compatibility score (0–100). Every dimension returns a 0..1 score plus a one-line
 * explanation, so the dashboard can show exactly why a job scored what it did.
 *
 *   Technical skills          35%
 *   Experience and seniority  20%
 *   Responsibilities          20%
 *   Role relevance            15%
 *   Location / arrangement    10%
 *
 * Missing information never earns credit: if a posting lists no recognisable skills the technical
 * score is low and flagged as low-confidence rather than assumed to match.
 */
import { isCanadaJob, isGta, isOntario, ONTARIO_COMMUTE_CITIES } from "./location";
import { expandImpliedSkills, extractRequirementSkills, extractSkills, splitSections } from "./skills";
import { CandidateProfile, DimensionScore, NormalizedJob, ScoreBreakdown } from "./types";

export const SHORTLIST_THRESHOLD = 70;

export const WEIGHTS = {
  technicalSkills: 0.35,
  experience: 0.2,
  responsibilities: 0.2,
  roleRelevance: 0.15,
  location: 0.1,
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// --- Technical ----------------------------------------------------------------------------------

function technicalScore(required: string[], preferred: string[], candidate: Set<string>) {
  const matchedReq = required.filter((s) => candidate.has(s));
  const matchedPref = preferred.filter((s) => candidate.has(s));
  const missingReq = required.filter((s) => !candidate.has(s));
  const missingPref = preferred.filter((s) => !candidate.has(s));
  const lowConfidence: string[] = [];

  let score: number;
  let explanation: string;
  if (required.length === 0 && preferred.length === 0) {
    score = 0.3;
    explanation = "No recognisable technical skills in the posting; scored conservatively";
    lowConfidence.push("technicalSkills");
  } else if (required.length === 0) {
    score = matchedPref.length / preferred.length;
    explanation = `${matchedPref.length}/${preferred.length} listed skills matched (no separate required list)`;
    lowConfidence.push("technicalSkills");
  } else {
    const r = matchedReq.length / required.length;
    const p = preferred.length ? matchedPref.length / preferred.length : r;
    score = 0.8 * r + 0.2 * p;
    explanation = `${matchedReq.length}/${required.length} required and ${matchedPref.length}/${preferred.length} preferred skills matched`;
  }
  return {
    dim: { score: round2(score), weight: WEIGHTS.technicalSkills, explanation } as DimensionScore,
    matched: [...matchedReq, ...matchedPref],
    missingReq,
    missingPref,
    lowConfidence,
  };
}

// --- Experience ---------------------------------------------------------------------------------

const SENIOR_TITLE = /\b(senior|sr\.?|staff|principal|lead|architect|manager|director|head of|vp)\b/i;
const JUNIOR_TITLE = /\b(junior|jr\.?|entry[- ]level|new grad|graduate|associate|intern|co-?op|early career)\b/i;
const LEVEL_I = /\b(engineer|developer)\s+(i|1)\b/i;

/** Smallest "N+ years" / "N-M years" requirement stated in the posting, if any. */
export function extractRequiredYears(text: string): number | null {
  const re = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+\w+){0,4}?\s+(?:experience|exp\b)/gi;
  const found: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (n > 0 && n <= 20) found.push(n);
  }
  return found.length ? Math.min(...found) : null;
}

function experienceScore(job: NormalizedJob, candidateYears: number, requiredYears: number | null) {
  const lowConfidence: string[] = [];
  const senior = SENIOR_TITLE.test(job.title);
  const junior = JUNIOR_TITLE.test(job.title) || LEVEL_I.test(job.title);
  const yrs = round2(candidateYears);
  let score: number;
  let explanation: string;

  if (requiredYears !== null) {
    const gap = requiredYears - candidateYears;
    score = gap <= 0 ? 1 : gap <= 1 ? 0.7 : gap <= 2 ? 0.4 : gap <= 3 ? 0.2 : 0;
    explanation = `Requires ${requiredYears}+ years; resume shows ~${yrs}`;
  } else if (senior) {
    score = candidateYears >= 5 ? 0.8 : 0.15;
    explanation = `Senior-level title with no stated years; resume shows ~${yrs}`;
    lowConfidence.push("experience");
  } else if (junior) {
    score = 1;
    explanation = `Junior/entry-level title; resume shows ~${yrs} years`;
  } else {
    score = candidateYears >= 2 ? 0.8 : 0.6;
    explanation = `No stated years or level; resume shows ~${yrs}`;
    lowConfidence.push("experience");
  }
  if (senior && candidateYears < 5) score = Math.min(score, 0.3);
  return { dim: { score: round2(score), weight: WEIGHTS.experience, explanation } as DimensionScore, lowConfidence };
}

// --- Responsibilities ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  ("about above across after again against along also among another any are around based because been before being below " +
    "between both build building can could daily each either ensure etc every from have help including into its join just " +
    "like make many more most must need other others our over own part per role same should some such team teams than that " +
    "their them then there these they this those through together under until upon using very want well were what when " +
    "where which while will with within work working would year years your you we who how all and the for not but").split(" ")
);

function stem(word: string): string {
  return word.replace(/(ing|ed|es|s|ment|ments|ly|er|ers|ion|ions)$/, "");
}

function contentTerms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z+#.]{3,}/g) ?? [])
    .map((w) => w.replace(/\.+$/, ""))
    .filter((w) => !STOPWORDS.has(w));
}

function responsibilitiesScore(job: NormalizedJob, candidate: CandidateProfile) {
  const sections = splitSections(job.descriptionText);
  const respText = sections.responsibilities.trim() || job.descriptionText.slice(0, 4000);
  const freq = new Map<string, number>();
  for (const w of contentTerms(respText)) freq.set(stem(w), (freq.get(stem(w)) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w]) => w);
  const candStems = new Set(contentTerms(candidate.experienceText).map(stem));
  const termOverlap = top.length ? top.filter((w) => candStems.has(w)).length / top.length : 0;

  const respSkills = extractSkills(respText);
  const candSkills = new Set(candidate.skills);
  const skillOverlap = respSkills.length ? respSkills.filter((s) => candSkills.has(s)).length / respSkills.length : termOverlap;

  // Term overlap between two different documents rarely exceeds ~60%, so 0.6 maps to full credit.
  const score = clamp01(0.5 * skillOverlap + 0.5 * clamp01(termOverlap / 0.6));
  const lowConfidence = sections.responsibilities.trim() ? [] : ["responsibilities"];
  return {
    dim: {
      score: round2(score),
      weight: WEIGHTS.responsibilities,
      explanation: `${Math.round(termOverlap * 100)}% of key responsibility terms and ${Math.round(skillOverlap * 100)}% of responsibility tech appear in resume experience`,
    } as DimensionScore,
    lowConfidence,
  };
}

// --- Role relevance -----------------------------------------------------------------------------

const ROLE_FAMILIES: { family: string; re: RegExp }[] = [
  { family: "full-stack", re: /full[- ]?stack/i },
  { family: "frontend", re: /front[- ]?end|\bui (engineer|developer)|\bweb (developer|engineer)|react (developer|engineer)/i },
  { family: "backend", re: /back[- ]?end|\bapi (engineer|developer)|server[- ]side/i },
  { family: "software", re: /software (engineer|developer)|\bswe\b|\bsoftware dev|application developer|\bprogrammer\b|\bdeveloper\b/i },
  { family: "cloud", re: /\bcloud (engineer|developer)|\baws (engineer|developer)/i },
  { family: "devops", re: /devops|(site|system|systems|production) reliability|reliability engineer|\bsre\b|platform engineer|infrastructure engineer|build (and|&) release/i },
  { family: "ai-app", re: /\b(ai|llm|genai|gen ai|generative ai|ml|machine learning|applied ai)\b.{0,20}\b(engineer|developer)\b|\bai application/i },
];

const IRRELEVANT_TITLE =
  /\b(sales|account (executive|manager)|marketing|recruit(er|ing)|talent acquisition|product manager|program manager|project manager|data scientist|analyst|customer (success|support)|support specialist|legal|counsel|finance|accountant|payroll|people partner|hr\b|human resources|copywriter|content writer|office manager|executive assistant|business development|partnerships)\b/i;
const ENGINEERING_MANAGEMENT = /\b(engineering manager|manager,? (software|engineering)|director|vp|head of)\b/i;
const ADJACENT_ENGINEERING = /\b(engineer|developer|sdet|qa|automation)\b/i;

export function roleFamilies(title: string): string[] {
  return ROLE_FAMILIES.filter((f) => f.re.test(title)).map((f) => f.family);
}

function roleRelevanceScore(job: NormalizedJob, candidate: CandidateProfile): DimensionScore {
  const title = job.title;
  const targetFamilies = new Set(candidate.targetRoles.flatMap(roleFamilies));
  if (IRRELEVANT_TITLE.test(title) && !/engineer|developer/i.test(title)) {
    return { score: 0, weight: WEIGHTS.roleRelevance, explanation: "Non-engineering role" };
  }
  if (ENGINEERING_MANAGEMENT.test(title)) {
    return { score: 0.1, weight: WEIGHTS.roleRelevance, explanation: "People-management role" };
  }
  const families = roleFamilies(title);
  const hit = families.filter((f) => targetFamilies.has(f));
  if (hit.length) {
    return { score: 1, weight: WEIGHTS.roleRelevance, explanation: `Title matches target role family: ${hit.join(", ")}` };
  }
  if (ADJACENT_ENGINEERING.test(title)) {
    return { score: 0.35, weight: WEIGHTS.roleRelevance, explanation: "Adjacent engineering role outside target families" };
  }
  return { score: 0, weight: WEIGHTS.roleRelevance, explanation: "Title does not match any target role" };
}

// --- Location -----------------------------------------------------------------------------------

function locationScore(job: NormalizedJob): DimensionScore {
  const w = WEIGHTS.location;
  const canada = isCanadaJob(job.locations, job.country);
  if (!canada) return { score: 0, weight: w, explanation: "No Canadian location listed" };
  const locs = job.locations.length ? job.locations : [job.location];
  const gta = locs.some(isGta);
  const ontarioCommute = locs.some((l) => ONTARIO_COMMUTE_CITIES.some((c) => l.toLowerCase().includes(c)));
  const ontario = locs.some(isOntario);
  const remoteCanada = job.workArrangement === "remote" || locs.some((l) => /remote/i.test(l) && /canada|\bCA\b|ontario/i.test(l));

  if (remoteCanada) return { score: 1, weight: w, explanation: "Remote role open to Canada" };
  if (gta) {
    const s = job.workArrangement === "unknown" ? 0.9 : 1;
    return { score: s, weight: w, explanation: `${job.workArrangement === "unknown" ? "Arrangement unstated" : job.workArrangement} in the GTA` };
  }
  if (ontarioCommute) {
    const s = job.workArrangement === "hybrid" ? 0.7 : 0.5;
    return { score: s, weight: w, explanation: "Ontario location within commuting range of Brampton" };
  }
  if (ontario) return { score: 0.35, weight: w, explanation: "Ontario location outside the GTA" };
  return { score: 0.1, weight: w, explanation: "Canadian location outside Ontario, not remote" };
}

// --- Work authorization flags -------------------------------------------------------------------

const WORK_AUTH_PATTERNS = [
  /canadian citizen(ship)?/i,
  /\bcitizenship\b/i,
  /permanent residen(t|cy)/i,
  /security clearance|secret clearance|reliability status|enhanced reliability|controlled goods/i,
  /(no|not able to|unable to|cannot|will not) (provide )?(visa )?sponsor/i,
  /authori[sz]ed to work in the (u\.?s\.?|united states)/i,
  /must be (legally )?(eligible|authori[sz]ed) to work/i,
];

export function extractWorkAuthFlags(text: string): string[] {
  const flags: string[] = [];
  for (const sentence of text.split(/(?<=[.!?\n])\s+/)) {
    if (WORK_AUTH_PATTERNS.some((re) => re.test(sentence))) {
      const s = sentence.trim().slice(0, 220);
      if (s && !flags.includes(s)) flags.push(s);
    }
    if (flags.length >= 4) break;
  }
  return flags;
}

// --- Total --------------------------------------------------------------------------------------

export function scoreJob(job: NormalizedJob, candidate: CandidateProfile): ScoreBreakdown {
  const { required, preferred } = extractRequirementSkills(job.descriptionText);
  const candidateSkills = expandImpliedSkills(candidate.skills);
  const tech = technicalScore(required, preferred, candidateSkills);
  const requiredYears = extractRequiredYears(job.descriptionText);
  const exp = experienceScore(job, candidate.experienceMonths / 12, requiredYears);
  const resp = responsibilitiesScore(job, candidate);
  const role = roleRelevanceScore(job, candidate);
  const loc = locationScore(job);

  const dimensions = {
    technicalSkills: tech.dim,
    experience: exp.dim,
    responsibilities: resp.dim,
    roleRelevance: role,
    location: loc,
  };
  const total = Math.round(Object.values(dimensions).reduce((sum, d) => sum + d.score * d.weight, 0) * 100);

  return {
    total,
    dimensions,
    requiredSkills: required,
    preferredSkills: preferred,
    matchedSkills: tech.matched,
    missingRequiredSkills: tech.missingReq,
    missingPreferredSkills: tech.missingPref,
    requiredYears,
    workAuthorizationFlags: extractWorkAuthFlags(job.descriptionText),
    lowConfidence: [...tech.lowConfidence, ...exp.lowConfidence, ...resp.lowConfidence],
  };
}
