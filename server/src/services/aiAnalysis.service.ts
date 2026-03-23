import { openai } from "../config/openAI";
import { supabase } from "../config/supabase";
import { extractResumeText } from "./resume.service";

type AnalyzeResumeAgainstJobInput = {
  applicationId: string;
};

type ParsedAnalysis = {
  matchScore: number;
  requiredSkills: string[];
  missingSkills: string[];
  suggestions: string[];
};

function normalizeAnalysis(data: any): ParsedAnalysis {
  const rawScore = Number(data?.matchScore ?? 0);

  return {
    matchScore: Number.isFinite(rawScore)
      ? Math.max(0, Math.min(100, rawScore))
      : 0,
    requiredSkills: Array.isArray(data?.requiredSkills)
      ? data.requiredSkills.map(String)
      : [],
    missingSkills: Array.isArray(data?.missingSkills)
      ? data.missingSkills.map(String)
      : [],
    suggestions: Array.isArray(data?.suggestions)
      ? data.suggestions.map(String)
      : [],
  };
}

export async function analyzeResumeAgainstJob({
  applicationId,
}: AnalyzeResumeAgainstJobInput) {
  const { data: application, error } = await supabase
    .from("applications")
    .select("id, role, company, job_description, resume_file_key")
    .eq("id", applicationId)
    .single();

  if (error) throw error;

  if (!application) {
    throw new Error("Application not found.");
  }

  if (!application.job_description?.trim()) {
    throw new Error("Job description is missing for this application.");
  }

  if (!application.resume_file_key) {
    throw new Error("No resume uploaded for this application.");
  }

  const resumeResult = await extractResumeText({ applicationId });

  const prompt = `
You are a senior technical recruiter and resume analyst with 15+ years of experience evaluating candidates for software engineering and technical roles.

Your task: Perform a precise, evidence-based analysis of the resume against the job description below.

---

## SCORING RUBRIC — matchScore (0–100)

Score based on cumulative weighted factors:

| Factor                              | Weight |
|-------------------------------------|--------|
| Required technical skills coverage  | 40%    |
| Years / depth of relevant experience| 20%    |
| Domain / industry alignment         | 15%    |
| Education & certifications match    | 10%    |
| Soft skills & leadership signals    | 10%    |
| Recency of relevant experience      | 5%     |

Score anchors:
- 90–100: Exceptional match. Meets nearly all requirements with strong evidence.
- 75–89:  Strong match. Meets most requirements; minor gaps.
- 60–74:  Moderate match. Meets core requirements; notable gaps exist.
- 40–59:  Weak match. Meets some requirements; significant gaps.
- 0–39:   Poor match. Fundamental misalignment with role requirements.

---

## ANALYSIS RULES

**requiredSkills:**
- Extract only the top 6–12 explicitly stated or strongly implied technical skills from the job description
- Include: languages, frameworks, platforms, tools, cloud services, databases, methodologies
- Order by importance to the role (most critical first)
- Use the exact terminology from the job description

**missingSkills:**
- List only skills that are:
  (a) present in requiredSkills AND
  (b) absent, vague, or insufficiently demonstrated in the resume
- Do NOT list a skill as missing if the resume shows equivalent/adjacent proficiency
- Cap at 8 items maximum

**suggestions:**
- Provide 3–6 specific, actionable suggestions
- Each suggestion must reference a concrete resume change (not generic advice)
- Format: Start with an action verb (Add, Quantify, Rename, Highlight, Reframe, Include)
- Bad example: "Improve your AWS section."
- Good example: "Add a bullet under your backend projects describing how you used AWS S3 and EC2 for deployment, including scale or cost impact if available."

---

## OUTPUT FORMAT

Return ONLY a valid JSON object. No markdown. No explanation. No trailing commas.

{
  "matchScore": <integer 0–100>,
  "requiredSkills": [<string>, ...],
  "missingSkills": [<string>, ...],
  "suggestions": [<string>, ...]
}

---

## INPUT

**Job Title:** ${application.role}
**Company:** ${application.company}

**Job Description:**
${application.job_description.slice(0, 6000)}

**Resume:**
${resumeResult.text.slice(0, 6000)}
`;

  const response = await openai.responses.create({
    model: "openai/gpt-oss-120b:free",
    input: prompt,
  });

  const rawText = response.output_text?.trim();

  if (!rawText) {
    throw new Error("No analysis response received from OpenAI.");
  }

  let parsed: ParsedAnalysis;

  try {
    parsed = normalizeAnalysis(JSON.parse(rawText));
  } catch (error) {
    console.error("Failed to parse model output:", rawText);
    throw new Error("AI returned invalid JSON.");
  }

  const { data: updatedApplication, error: updateError } = await supabase
    .from("applications")
    .update({
      match_score: parsed.matchScore,
      required_skills: parsed.requiredSkills,
      missing_skills: parsed.missingSkills,
      suggestions: parsed.suggestions,
      analysis_last_run_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .select()
    .single();

  if (updateError) throw updateError;

  return {
    application: updatedApplication,
    analysis: parsed,
    resumeTextPreview: resumeResult.text.slice(0, 1200),
  };
}