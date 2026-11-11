import type {
  AnswerFeedback,
  CareerProfile,
  InterviewPrep,
  CoverLetterResult,
  GapQuestion,
  JDAnalysis,
  Resume,
  ResumeBullet,
  TailorResponse,
} from "./types";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === "string" ? detail : res.statusText || "Request failed");
  }
  return res.json();
}

function post<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => handle<T>(r));
}

export const api = {
  health: () => fetch("/api-health").then((r) => handle<{ llm: string }>(r)),

  parseResume(file: File) {
    const form = new FormData();
    form.append("file", file);
    return fetch("/api/profile/parse", { method: "POST", body: form }).then((r) => handle<CareerProfile>(r));
  },

  tailor: (profile: CareerProfile, jd_text?: string, jd?: JDAnalysis) =>
    post<TailorResponse>("/api/tailor", { profile, jd_text, jd }),

  review: (profile: CareerProfile, resume: Resume, jd: JDAnalysis) =>
    post<TailorResponse>("/api/resume/review", { profile, resume, jd }),

  /** Renders the DOCX from what's on screen and saves it; the server stores nothing, so it never expires. */
  async downloadDocx(profile: CareerProfile, resume: Resume, jd: JDAnalysis) {
    const res = await fetch("/api/resume/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, resume, jd }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(typeof body?.detail === "string" ? body.detail : "Export failed");
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Resume.docx";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return name;
  },

  questions: (profile: CareerProfile, jd: JDAnalysis) =>
    post<GapQuestion[]>("/api/interview/questions", { profile, jd }),

  answers: (
    profile: CareerProfile,
    answers: { question: GapQuestion; answer: string; experience_id?: string | null }[],
  ) => post<{ profile: CareerProfile; applied: string[] }>("/api/interview/answers", { profile, answers }),

  rewrite: (profile: CareerProfile, experience_id: string, bullet: ResumeBullet, jd: JDAnalysis) =>
    post<{ available: boolean; suggestions: ResumeBullet[]; message?: string | null }>("/api/coach/rewrite", {
      profile,
      experience_id,
      bullet,
      jd,
    }),

  prep: (profile: CareerProfile, jd: JDAnalysis, company: string) =>
    post<InterviewPrep>("/api/interview-prep", { profile, jd, company }),

  grade: (answer: string, jd: JDAnalysis) => post<AnswerFeedback>("/api/interview-prep/grade", { answer, jd }),

  coverLetter: (profile: CareerProfile, jd: JDAnalysis, company: string, company_notes: string, tone: string) =>
    post<CoverLetterResult>("/api/cover-letter", { profile, jd, company, company_notes, tone }),
};
