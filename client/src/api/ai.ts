import { apiClient } from "./client";

export interface ResumeJobMatchAnalysis {
  matchScore: number;
  requiredSkills: string[];
  missingSkills: string[];
  suggestions: string[];
}

export interface AnalyzeResumeJobMatchResponse {
  analysis: ResumeJobMatchAnalysis;
  dbAnalysis: unknown;
  resumeTextPreview: string;
}

export async function analyzeResumeJobMatch(
  applicationId: string
): Promise<AnalyzeResumeJobMatchResponse> {
  const response = await apiClient.post<AnalyzeResumeJobMatchResponse>(
    "/ai/analyze-resume",
    { applicationId }
  );

  return response.data;
}