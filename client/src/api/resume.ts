import { apiClient } from "./client";
import type { Application } from "../types/application";

export interface resumeUploadRequest {
  applicationId: string;
  fileName: string;
  contentType: string;
}

export interface resumeUploadResponse {
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

export interface PresignResumeDownloadRequest {
  applicationId: string;
}

export interface resumeDownloadResponse {
  downloadUrl: string;
  expiresIn: number;
  fileName: string | null;
}

export async function resumeDownload(
  payload: PresignResumeDownloadRequest
): Promise<resumeDownloadResponse> {
  const response = await apiClient.post<resumeDownloadResponse>(
    "/resumes/download",
    payload
  );
  return response.data;
}

    export async function resumeUpload(
    payload: resumeUploadRequest
    ): Promise<resumeUploadResponse> {
  const response = await apiClient.post<resumeUploadResponse>(
    "/resumes/upload",
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