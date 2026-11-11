// Mirrors backend/app/schemas. Keep in sync (or generate from /openapi.json later).

export interface ContactInfo {
  name: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  links: string[];
}

export interface ProfileBullet {
  id: string;
  text: string;
  source: "resume_upload" | "user_stated" | "linkedin_export";
}

export interface Experience<B> {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  start: string;
  end?: string | null;
  bullets: B[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field?: string | null;
  end?: string | null;
}

export interface CareerProfile {
  version: number;
  contact: ContactInfo;
  summary?: string | null;
  experiences: Experience<ProfileBullet>[];
  education: Education[];
  skills: string[];
  certifications: string[];
  attestations: Record<string, boolean>;
}

export interface ResumeBullet {
  text: string;
  source_ids: string[];
  user_edited?: boolean;
}

export interface Resume {
  contact: ContactInfo;
  summary?: string | null;
  experiences: Experience<ResumeBullet>[];
  education: Education[];
  skills: string[];
  certifications: string[];
}

export type KeywordCategory = "must_have" | "nice_to_have" | "tool" | "certification" | "soft_skill";

export interface Keyword {
  term: string;
  category: KeywordCategory;
  weight: number;
}

export interface JDAnalysis {
  title: string;
  seniority?: string | null;
  years_required?: number | null;
  keywords: Keyword[];
  knockout_criteria: string[];
}

export interface Issue {
  rule: string;
  severity: "error" | "warning";
  message: string;
  location?: string | null;
}

export interface ATSScore {
  total: number;
  band: "strong" | "tailor_further" | "weak_fit";
  components: Record<string, number>;
  missing_keywords: Keyword[];
  stuffed_terms: string[];
  knockouts_to_confirm: string[];
  label: string;
}

export interface BulletFeedback {
  experience_id: string;
  index: number;
  text: string;
  score: number;
  strengths: string[];
  issues: string[];
  tip?: string | null;
}

export interface CoachReport {
  overall: number;
  bullets: BulletFeedback[];
  top_actions: string[];
}

export interface TailorResponse {
  status: "ready" | "needs_user_review";
  attempts: number;
  jd: JDAnalysis;
  profile: CareerProfile;
  resume: Resume;
  verification: { issues: Issue[]; passed: boolean };
  lint: { violations: Issue[]; parse_fidelity: number; passed: boolean } | null;
  score: ATSScore;
  coach: CoachReport;
  readiness: number;
  exportable: boolean;
  log: string[];
}

export interface GapQuestion {
  id: string;
  kind: "skill_gap" | "quantify" | "confirm";
  prompt: string;
  why: string;
  keyword?: string | null;
  experience_id?: string | null;
  bullet_id?: string | null;
  prefill?: string | null;
}

export interface StarStory {
  situation: string;
  task: string;
  action: string;
  result: string;
  source_ids: string[];
  missing: string[];
}

export interface PrepQuestion {
  id: string;
  category: "role_fit" | "technical" | "behavioral" | "gap";
  question: string;
  why_they_ask: string;
  story?: StarStory | null;
  talking_points: string[];
  keyword?: string | null;
}

export interface InterviewPrep {
  role: string;
  elevator_pitch: string;
  pitch_source_ids: string[];
  questions: PrepQuestion[];
  questions_to_ask: string[];
}

export interface AnswerFeedback {
  score: number;
  star: Record<"situation" | "task" | "action" | "result", boolean>;
  strengths: string[];
  improvements: string[];
  keywords_used: string[];
  word_count: number;
  est_seconds: number;
}

export interface CoverLetterResult {
  letter: {
    greeting: string;
    paragraphs: { text: string; source_ids: string[] }[];
    closing: string;
  };
  text: string;
  issues: Issue[];
  word_count: number;
}
