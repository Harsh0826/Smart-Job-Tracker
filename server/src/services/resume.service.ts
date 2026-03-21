import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../config/aws";
import { env } from "../config/env";
import { supabase } from "../config/supabase";

type PresignUploadInput = {
  applicationId: string;
  fileName: string;
  contentType: string;
};

type CompleteUploadInput = {
  applicationId: string;
  fileName: string;
  fileKey: string;
};

function sanitizeFileName(fileName: string): string {
  return fileName
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

function buildResumeObjectKey(applicationId: string, fileName: string): string {
  const safeFileName = sanitizeFileName(fileName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `resumes/${applicationId}/${timestamp}-${safeFileName}`;
}

export async function createResumeUploadUrl({
  applicationId,
  fileName,
  contentType,
}: PresignUploadInput) {
  if (!fileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF resumes are allowed.");
  }

  if (contentType !== "application/pdf") {
    throw new Error("Invalid content type. Only application/pdf is allowed.");
  }

  const fileKey = buildResumeObjectKey(applicationId, fileName);

  const command = new PutObjectCommand({
    Bucket: env.awsS3ResumeBucket,
    Key: fileKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 300,
  });

  return {
    uploadUrl,
    fileKey,
    expiresIn: 300,
  };
}

export async function completeResumeUpload({
  applicationId,
  fileName,
  fileKey,
}: CompleteUploadInput) {
  const { data, error } = await supabase
    .from("applications")
    .update({
      resume_file_name: fileName,
      resume_file_key: fileKey,
      resume_uploaded_at: new Date().toISOString(),
      resume_version: fileName,
    })
    .eq("id", applicationId)
    .select()
    .single();

  if (error) throw error;

  return data;
}