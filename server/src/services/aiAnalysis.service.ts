import { openai } from "../config/openAI";
import { supabase } from "../config/supabase";
import { extractResumeText } from "./resume.service";

type AnalyzeResumeAgainstJobInput = {
  userId: string;
  applicationId: string;
};

type ParsedAnalysis = {
  matchScore: number;
  requiredSkills: string[];
  missingSkills: string[];
  suggestions: string[];
};

const MODEL_USED = "gpt-oss-120b";
const PROMPT_VERSION = "v2";

function isValidJobDescription(text: string): boolean {
  const clean = text.trim();

  if (clean.length < 250) return false;

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 50) return false;

  return /responsibilities|requirements|qualifications|experience|skills|you will|must have|nice to have|preferred|about the role|what you.?ll do|minimum qualifications/i.test(
    clean
  );
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeAnalysis(data: any): ParsedAnalysis {
  const rawScore = Number(data?.matchScore);

  return {
    matchScore: Number.isFinite(rawScore)
      ? Math.round(Math.max(0, Math.min(100, rawScore)))
      : 0,
    requiredSkills: safeStringArray(data?.requiredSkills),
    missingSkills: safeStringArray(data?.missingSkills).slice(0, 8),
    suggestions: safeStringArray(data?.suggestions).slice(0, 6),
  };
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI returned invalid JSON.");
  }

  return text.slice(start, end + 1);
}

function buildPrompt(params: {
  role: string;
  company: string;
  jobDescription: string;
  resumeText: string;
}) {
  return `
You are a senior technical recruiter and resume analyst.

Analyze the resume against the job description.

Rules:
- Use ONLY the job description and resume.
- Do NOT infer requirements from company name, role title, or general industry knowledge.
- Required skills must come directly from the job description.
- Missing skills must be required by the job description and weak/absent in the resume.
- Suggestions must be specific resume edits.
- Return ONLY valid JSON.

Output:
{
  "matchScore": <integer 0-100>,
  "requiredSkills": [<string>],
  "missingSkills": [<string>],
  "suggestions": [<string>]
}

Job Title:
${params.role}

Company:
${params.company}

Job Description:
${params.jobDescription.slice(0, 7000)}

Resume:
${params.resumeText.slice(0, 7000)}
`;
}

export async function analyzeResumeAgainstJob({
  userId,
  applicationId,
}: AnalyzeResumeAgainstJobInput) {
  const { data: application, error } = await supabase
    .from("applications")
    .select("id, role, company, job_description, resume_id")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;

  if (!application) {
    throw new Error("Application not found or you do not have access.");
  }

  const jobDescription = application.job_description?.trim() ?? "";

  if (!isValidJobDescription(jobDescription)) {
    throw new Error(
      "Job description is too short or invalid. Please paste the full job description with responsibilities, qualifications, and required skills before running resume analysis."
    );
  }

  if (!application.resume_id) {
    throw new Error("No resume linked to this application.");
  }

  const { data: resume, error: resumeError } = await supabase
    .from("resumes")
    .select("id, file_key")
    .eq("id", application.resume_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (resumeError) throw resumeError;

  if (!resume) {
    throw new Error("Resume not found or you do not have access.");
  }

  const resumeResult = await extractResumeText({
    userId,
    applicationId,
  });

  const resumeText = resumeResult.text?.trim() ?? "";

  if (resumeText.length < 100) {
    throw new Error("Resume text is too short for reliable analysis.");
  }

  const prompt = buildPrompt({
    role: application.role,
    company: application.company,
    jobDescription,
    resumeText,
  });

  const response = await openai.responses.create({
    model: "openai/gpt-oss-120b:free",
    input: prompt,
  });

  const rawText = response.output_text?.trim();

  if (!rawText) {
    throw new Error("No analysis response received.");
  }

  let parsed: ParsedAnalysis;

  try {
    parsed = normalizeAnalysis(JSON.parse(extractJsonObject(rawText)));
  } catch {
    console.error("Invalid AI JSON:", rawText);
    throw new Error("AI returned invalid JSON.");
  }

  const { data: dbAnalysis, error: insertError } = await supabase
    .from("application_analyses")
    .insert({
      application_id: applicationId,
      resume_id: resume.id,
      model_used: MODEL_USED,
      prompt_version: PROMPT_VERSION,
      match_score: parsed.matchScore,
      required_skills: parsed.requiredSkills,
      missing_skills: parsed.missingSkills,
      suggestions: parsed.suggestions,
    })
    .select()
    .single();

  if (insertError) throw insertError;

  return {
    analysis: parsed,
    dbAnalysis,
    resumeTextPreview: resumeText.slice(0, 1200),
  };
}