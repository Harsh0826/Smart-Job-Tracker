import { apiClient } from "./client";
import type { Application } from "../types/application";

export interface ResumeJobMatchAnalysis {
  matchScore: number;
  requiredSkills: string[];
  missingSkills: string[];
  suggestions: string[];
}

export interface AnalyzeResumeJobMatchResponse {
  application: Application;
  analysis: ResumeJobMatchAnalysis;
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