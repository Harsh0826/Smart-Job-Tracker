import { apiClient } from "./client";

export interface AnalyzeJobDescriptionPayload {
  jobDescription: string;
  userSkills?: string[];
}

export interface SkillGapAnalysis {
  requiredSkills: string[];
  missingSkills: string[];
  suggestions: string[];
}

export async function analyzeJobDescription(
  payload: AnalyzeJobDescriptionPayload
): Promise<SkillGapAnalysis> {
  const response = await apiClient.post<SkillGapAnalysis>(
    "/ai/analyze",
    payload
  );

  return response.data;
}