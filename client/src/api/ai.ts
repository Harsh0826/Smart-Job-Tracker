import { apiClient } from "./client";

export interface ResumeJobMatchAnalysis {
  matchScore: number;
  requiredSkills: string[];
  missingSkills: string[];
  suggestions: string[];
  ranAt?: string | null;
}

export interface AnalyzeResumeJobMatchResponse {
  analysis: ResumeJobMatchAnalysis;
  dbAnalysis: unknown;
  resumeTextPreview: string;
}

export async function analyzeResumeJobMatch(applicationId: string) {
  const response = await apiClient.post<AnalyzeResumeJobMatchResponse>(
    "/ai/analyze-resume",
    { applicationId }
  );

  return response.data;
}

export async function getLatestResumeAnalysis(applicationId: string) {
  const response = await apiClient.get<{
    analysis: ResumeJobMatchAnalysis | null;
  }>(`/ai/applications/${applicationId}/latest-analysis`);

  return response.data.analysis;
}