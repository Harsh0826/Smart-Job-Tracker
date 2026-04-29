import { apiClient } from "./client";
import type { Application, Resume } from "../types/application";

type ResumeUploadPayload = {
  applicationId: string;
  fileName: string;
  contentType: string;
};

type CompleteResumeUploadPayload = {
  applicationId: string;
  fileName: string;
  fileKey: string;
  label?: string | null;
};

type ResumeByApplicationPayload = {
  applicationId: string;
};

export async function resumeUpload(payload: ResumeUploadPayload) {
  const response = await apiClient.post<{
    uploadUrl: string;
    fileKey: string;
    expiresIn: number;
  }>("/resumes/upload", payload);

  return response.data;
}

export async function completeResumeUpload(
  payload: CompleteResumeUploadPayload
) {
  const response = await apiClient.post<{
    message: string;
    resume: Resume;
    application: Application;
  }>("/resumes/complete-upload", payload);

  return response.data;
}

export async function resumeDownload(payload: ResumeByApplicationPayload) {
  const response = await apiClient.post<{
    downloadUrl: string;
    expiresIn: number;
    fileName: string;
    resumeId: number;
  }>("/resumes/download", payload);

  return response.data;
}