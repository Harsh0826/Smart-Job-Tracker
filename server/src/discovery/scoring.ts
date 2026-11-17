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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// A posting with no recognisable skills gets a low score and is flagged, instead of being assumed to match.
function technicalScore(required: string[], preferred: string[], candidate: Set<string>) {
  const matchedRequired = required.filter((skill) => candidate.has(skill));
  const matchedPreferred = preferred.filter((skill) => candidate.has(skill));
  const missingRequired = required.filter((skill) => !candidate.has(skill));
  const missingPreferred = preferred.filter((skill) => !candidate.has(skill));
  const lowConfidence: string[] = [];

  let score: number;
  let explanation: string;

  if (required.length === 0 && preferred.length === 0) {
    score = 0.3;
    explanation = "No recognisable technical skills in the posting; scored conservatively";
    lowConfidence.push("technicalSkills");
  } else if (required.length === 0) {
    score = matchedPreferred.length / preferred.length;
    explanation = `${matchedPreferred.length}/${preferred.length} listed skills matched (no separate required list)`;
    lowConfidence.push("technicalSkills");
  } else {
    const requiredRatio = matchedRequired.length / required.length;
    let preferredRatio = requiredRatio;

    if (preferred.length > 0) {
      preferredRatio = matchedPreferred.length / preferred.length;
    }

    score = 0.8 * requiredRatio + 0.2 * preferredRatio;
    explanation = `${matchedRequired.length}/${required.length} required and ${matchedPreferred.length}/${preferred.length} preferred skills matched`;
  }

  const dim: DimensionScore = {
    score: round2(score),
    weight: WEIGHTS.technicalSkills,
    explanation,
  };

  return {
    dim,
    matched: [...matchedRequired, ...matchedPreferred],
    missingReq: missingRequired,
    missingPref: missingPreferred,
    lowConfidence,
  };
}

const SENIOR_TITLE = /\b(senior|sr\.?|staff|principal|lead|architect|manager|director|head of|vp)\b/i;
const JUNIOR_TITLE = /\b(junior|jr\.?|entry[- ]level|new grad|graduate|associate|intern|co-?op|early career)\b/i;
const LEVEL_I = /\b(engineer|developer)\s+(i|1)\b/i;

// Returns the smallest "N+ years" or "N-M years" requirement in the posting.
export function extractRequiredYears(text: string): number | null {
  const pattern =
    /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+\w+){0,4}?\s+(?:experience|exp\b)/gi;
  const years: number[] = [];

  let match = pattern.exec(text);

  while (match !== null) {
    const value = Number(match[1]);

    if (value > 0 && value <= 20) {
      years.push(value);
    }

    match = pattern.exec(text);
  }

  if (years.length === 0) return null;

  return Math.min(...years);
}

function yearsGapScore(gap: number): number {
  if (gap <= 0) return 1;
  if (gap <= 1) return 0.7;
  if (gap <= 2) return 0.4;
  if (gap <= 3) return 0.2;

  return 0;
}

function experienceScore(job: NormalizedJob, candidateYears: number, requiredYears: number | null) {
  const lowConfidence: string[] = [];
  const isSenior = SENIOR_TITLE.test(job.title);
  const isJunior = JUNIOR_TITLE.test(job.title) || LEVEL_I.test(job.title);
  const years = round2(candidateYears);

  let score: number;
  let explanation: string;

  if (requiredYears !== null) {
    score = yearsGapScore(requiredYears - candidateYears);
    explanation = `Requires ${requiredYears}+ years; resume shows ~${years}`;
  } else if (isSenior) {
    score = candidateYears >= 5 ? 0.8 : 0.15;
    explanation = `Senior-level title with no stated years; resume shows ~${years}`;
    lowConfidence.push("experience");
  } else if (isJunior) {
    score = 1;
    explanation = `Junior/entry-level title; resume shows ~${years} years`;
  } else {
    score = candidateYears >= 2 ? 0.8 : 0.6;
    explanation = `No stated years or level; resume shows ~${years}`;
    lowConfidence.push("experience");
  }

  // A senior title caps the score for under 5 years, even when the stated years are close.
  if (isSenior && candidateYears < 5) {
    score = Math.min(score, 0.3);
  }

  const dim: DimensionScore = {
    score: round2(score),
    weight: WEIGHTS.experience,
    explanation,
  };

  return { dim, lowConfidence };
}

const STOPWORD_TEXT =
  "about above across after again against along also among another any are around based because been before being below " +
  "between both build building can could daily each either ensure etc every from have help including into its join just " +
  "like make many more most must need other others our over own part per role same should some such team teams than that " +
  "their them then there these they this those through together under until upon using very want well were what when " +
  "where which while will with within work working would year years your you we who how all and the for not but";

const STOPWORDS = new Set(STOPWORD_TEXT.split(" "));

function stem(word: string): string {
  return word.replace(/(ing|ed|es|s|ment|ments|ly|er|ers|ion|ions)$/, "");
}

function contentTerms(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z+#.]{3,}/g) ?? [];

  return words
    .map((word) => word.replace(/\.+$/, ""))
    .filter((word) => !STOPWORDS.has(word));
}

function topStems(text: string, limit: number): string[] {
  const counts = new Map<string, number>();

  for (const word of contentTerms(text)) {
    const root = stem(word);
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  return sorted.slice(0, limit).map(([root]) => root);
}

function responsibilitiesScore(job: NormalizedJob, candidate: CandidateProfile) {
  const sections = splitSections(job.descriptionText);
  const hasResponsibilitySection = sections.responsibilities.trim() !== "";
  const responsibilityText = sections.responsibilities.trim() || job.descriptionText.slice(0, 4000);

  const keyStems = topStems(responsibilityText, 25);
  const candidateStems = new Set(contentTerms(candidate.experienceText).map(stem));

  let termOverlap = 0;

  if (keyStems.length > 0) {
    const sharedStems = keyStems.filter((root) => candidateStems.has(root));
    termOverlap = sharedStems.length / keyStems.length;
  }

  const responsibilitySkills = extractSkills(responsibilityText);
  const candidateSkills = new Set(candidate.skills);
  let skillOverlap = termOverlap;

  if (responsibilitySkills.length > 0) {
    const sharedSkills = responsibilitySkills.filter((skill) => candidateSkills.has(skill));
    skillOverlap = sharedSkills.length / responsibilitySkills.length;
  }

  // Term overlap between two different documents rarely goes above 60%, so 0.6 counts as full credit.
  const score = clamp01(0.5 * skillOverlap + 0.5 * clamp01(termOverlap / 0.6));
  const lowConfidence = hasResponsibilitySection ? [] : ["responsibilities"];

  const termPercent = Math.round(termOverlap * 100);
  const skillPercent = Math.round(skillOverlap * 100);

  const dim: DimensionScore = {
    score: round2(score),
    weight: WEIGHTS.responsibilities,
    explanation: `${termPercent}% of key responsibility terms and ${skillPercent}% of responsibility tech appear in resume experience`,
  };

  return { dim, lowConfidence };
}

const ROLE_FAMILIES: { family: string; re: RegExp }[] = [
  { family: "full-stack", re: /full[- ]?stack/i },
  {
    family: "frontend",
    re: /front[- ]?end|\bui (engineer|developer)|\bweb (developer|engineer)|react (developer|engineer)/i,
  },
  { family: "backend", re: /back[- ]?end|\bapi (engineer|developer)|server[- ]side/i },
  {
    family: "software",
    re: /software (engineer|developer)|\bswe\b|\bsoftware dev|application developer|\bprogrammer\b|\bdeveloper\b/i,
  },
  { family: "cloud", re: /\bcloud (engineer|developer)|\baws (engineer|developer)/i },
  {
    family: "devops",
    re: /devops|(site|system|systems|production) reliability|reliability engineer|\bsre\b|platform engineer|infrastructure engineer|build (and|&) release/i,
  },
  {
    family: "ai-app",
    re: /\b(ai|llm|genai|gen ai|generative ai|ml|machine learning|applied ai)\b.{0,20}\b(engineer|developer)\b|\bai application/i,
  },
];

const IRRELEVANT_TITLE =
  /\b(sales|account (executive|manager)|marketing|recruit(er|ing)|talent acquisition|product manager|program manager|project manager|data scientist|analyst|customer (success|support)|support specialist|legal|counsel|finance|accountant|payroll|people partner|hr\b|human resources|copywriter|content writer|office manager|executive assistant|business development|partnerships)\b/i;
const ENGINEERING_MANAGEMENT = /\b(engineering manager|manager,? (software|engineering)|director|vp|head of)\b/i;
const ADJACENT_ENGINEERING = /\b(engineer|developer|sdet|qa|automation)\b/i;

export function roleFamilies(title: string): string[] {
  const families: string[] = [];

  for (const { family, re } of ROLE_FAMILIES) {
    if (re.test(title)) {
      families.push(family);
    }
  }

  return families;
}

function roleRelevanceScore(job: NormalizedJob, candidate: CandidateProfile): DimensionScore {
  const title = job.title;
  const weight = WEIGHTS.roleRelevance;

  if (IRRELEVANT_TITLE.test(title) && !/engineer|developer/i.test(title)) {
    return { score: 0, weight, explanation: "Non-engineering role" };
  }

  if (ENGINEERING_MANAGEMENT.test(title)) {
    return { score: 0.1, weight, explanation: "People-management role" };
  }

  const targetFamilies = new Set<string>();

  for (const targetRole of candidate.targetRoles) {
    for (const family of roleFamilies(targetRole)) {
      targetFamilies.add(family);
    }
  }

  const matchingFamilies = roleFamilies(title).filter((family) => targetFamilies.has(family));

  if (matchingFamilies.length > 0) {
    return {
      score: 1,
      weight,
      explanation: `Title matches target role family: ${matchingFamilies.join(", ")}`,
    };
  }

  if (ADJACENT_ENGINEERING.test(title)) {
    return { score: 0.35, weight, explanation: "Adjacent engineering role outside target families" };
  }

  return { score: 0, weight, explanation: "Title does not match any target role" };
}

function isOntarioCommuteCity(location: string): boolean {
  const lower = location.toLowerCase();
  return ONTARIO_COMMUTE_CITIES.some((city) => lower.includes(city));
}

function isRemoteCanadaLocation(location: string): boolean {
  return /remote/i.test(location) && /canada|\bCA\b|ontario/i.test(location);
}

function locationScore(job: NormalizedJob): DimensionScore {
  const weight = WEIGHTS.location;

  if (!isCanadaJob(job.locations, job.country)) {
    return { score: 0, weight, explanation: "No Canadian location listed" };
  }

  const locations = job.locations.length > 0 ? job.locations : [job.location];
  const isRemoteCanada = job.workArrangement === "remote" || locations.some(isRemoteCanadaLocation);

  if (isRemoteCanada) {
    return { score: 1, weight, explanation: "Remote role open to Canada" };
  }

  if (locations.some(isGta)) {
    if (job.workArrangement === "unknown") {
      return { score: 0.9, weight, explanation: "Arrangement unstated in the GTA" };
    }

    return { score: 1, weight, explanation: `${job.workArrangement} in the GTA` };
  }

  if (locations.some(isOntarioCommuteCity)) {
    const score = job.workArrangement === "hybrid" ? 0.7 : 0.5;
    return { score, weight, explanation: "Ontario location within commuting range of Brampton" };
  }

  if (locations.some(isOntario)) {
    return { score: 0.35, weight, explanation: "Ontario location outside the GTA" };
  }

  return { score: 0.1, weight, explanation: "Canadian location outside Ontario, not remote" };
}

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
  const sentences = text.split(/(?<=[.!?\n])\s+/);

  for (const sentence of sentences) {
    const mentionsWorkAuth = WORK_AUTH_PATTERNS.some((pattern) => pattern.test(sentence));

    if (mentionsWorkAuth) {
      const flag = sentence.trim().slice(0, 220);

      if (flag && !flags.includes(flag)) {
        flags.push(flag);
      }
    }

    if (flags.length >= 4) break;
  }

  return flags;
}

export function scoreJob(job: NormalizedJob, candidate: CandidateProfile): ScoreBreakdown {
  const { required, preferred } = extractRequirementSkills(job.descriptionText);
  const candidateSkills = expandImpliedSkills(candidate.skills);
  const requiredYears = extractRequiredYears(job.descriptionText);

  const technical = technicalScore(required, preferred, candidateSkills);
  const experience = experienceScore(job, candidate.experienceMonths / 12, requiredYears);
  const responsibilities = responsibilitiesScore(job, candidate);
  const roleRelevance = roleRelevanceScore(job, candidate);
  const location = locationScore(job);

  const dimensions = {
    technicalSkills: technical.dim,
    experience: experience.dim,
    responsibilities: responsibilities.dim,
    roleRelevance,
    location,
  };

  let weightedSum = 0;

  for (const dimension of Object.values(dimensions)) {
    weightedSum += dimension.score * dimension.weight;
  }

  const total = Math.round(weightedSum * 100);

  return {
    total,
    dimensions,
    requiredSkills: required,
    preferredSkills: preferred,
    matchedSkills: technical.matched,
    missingRequiredSkills: technical.missingReq,
    missingPreferredSkills: technical.missingPref,
    requiredYears,
    workAuthorizationFlags: extractWorkAuthFlags(job.descriptionText),
    lowConfidence: [
      ...technical.lowConfidence,
      ...experience.lowConfidence,
      ...responsibilities.lowConfidence,
    ],
  };
}
