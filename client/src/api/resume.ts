import { apiClient } from "./client";
import type { Application } from "../types/application";

export interface PresignResumeUploadRequest {
  applicationId: string;
  fileName: string;
  contentType: string;
}

export interface PresignResumeUploadResponse {
  uploadUrl: string;
  fileKey: string;
  expiresIn: number;
}

export interface CompleteResumeUploadRequest {
  applicationId: string;
  fileName: string;
  fileKey: string;
}

export interface CompleteResumeUploadResponse {
  message: string;
  application: Application;
}

export async function presignResumeUpload(
  payload: PresignResumeUploadRequest
): Promise<PresignResumeUploadResponse> {
  const response = await apiClient.post<PresignResumeUploadResponse>(
    "/resumes/presign-upload",
    payload
  );
  return response.data;
}

export async function completeResumeUpload(
  payload: CompleteResumeUploadRequest
): Promise<CompleteResumeUploadResponse> {
  const response = await apiClient.post<CompleteResumeUploadResponse>(
    "/resumes/complete-upload",
    payload
  );
  return response.data;
}