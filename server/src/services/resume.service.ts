import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PDFParse } from "pdf-parse";
import { s3Client } from "../config/aws";
import { env } from "../config/env";
import { supabase } from "../config/supabase";
import { streamToBuffer } from "../utils/stream";

type UploadInput = {
  userId: string;
  applicationId: string;
  fileName: string;
  contentType: string;
};

type CompleteUploadInput = {
  userId: string;
  applicationId: string;
  fileName: string;
  fileKey: string;
  label?: string | null;
};

type ApplicationResumeInput = {
  userId: string;
  applicationId: string;
};

function sanitizeFileName(fileName: string): string {
  return fileName
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

function buildResumeObjectKey(
  userId: string,
  applicationId: string,
  fileName: string
): string {
  const safeFileName = sanitizeFileName(fileName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return `resumes/${userId}/${applicationId}/${timestamp}-${safeFileName}`;
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getOwnedApplication(applicationId: string, userId: string) {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  if (error) throw error;

  return data;
}

async function getApplicationResume(applicationId: string, userId: string) {
  const application = await getOwnedApplication(applicationId, userId);

  if (!application.resume_id) {
    throw new Error("No resume uploaded for this application.");
  }

  const { data: resume, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("id", application.resume_id)
    .eq("user_id", userId)
    .single();

  if (error) throw error;

  return {
    application,
    resume,
  };
}

export async function createResumeUploadUrl({
  userId,
  applicationId,
  fileName,
  contentType,
}: UploadInput) {
  await getOwnedApplication(applicationId, userId);

  if (!fileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF resumes are allowed.");
  }

  if (contentType !== "application/pdf") {
    throw new Error("Invalid content type. Only application/pdf is allowed.");
  }

  const fileKey = buildResumeObjectKey(userId, applicationId, fileName);

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
  userId,
  applicationId,
  fileName,
  fileKey,
  label,
}: CompleteUploadInput) {
  await getOwnedApplication(applicationId, userId);

  const { data: resume, error: resumeError } = await supabase
    .from("resumes")
    .insert({
      user_id: userId,
      file_name: fileName,
      file_key: fileKey,
      label: label || fileName,
      is_active: true,
    })
    .select()
    .single();

  if (resumeError) throw resumeError;

  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .update({
      resume_id: resume.id,
    })
    .eq("id", applicationId)
    .eq("user_id", userId)
    .select()
    .single();

  if (applicationError) throw applicationError;

  return {
    resume,
    application,
  };
}

export async function getResumeDownloadUrl({
  userId,
  applicationId,
}: ApplicationResumeInput) {
  const { resume } = await getApplicationResume(applicationId, userId);

  const command = new GetObjectCommand({
    Bucket: env.awsS3ResumeBucket,
    Key: resume.file_key,
    ResponseContentType: "application/pdf",
    ResponseContentDisposition: resume.file_name
      ? `inline; filename="${resume.file_name}"`
      : 'inline; filename="resume.pdf"',
  });

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 300,
  });

  return {
    downloadUrl,
    expiresIn: 300,
    fileName: resume.file_name,
    resumeId: resume.id,
  };
}

export async function extractResumeText({
  userId,
  applicationId,
}: ApplicationResumeInput) {
  const { resume } = await getApplicationResume(applicationId, userId);

  const command = new GetObjectCommand({
    Bucket: env.awsS3ResumeBucket,
    Key: resume.file_key,
  });

  const response = await s3Client.send(command);
  const pdfBuffer = await streamToBuffer(response.Body);

  const parser = new PDFParse({ data: pdfBuffer });
  const parsed = await parser.getText();
  await parser.destroy();

  const extractedText = cleanExtractedText(parsed.text || "");

  if (!extractedText) {
    throw new Error("Failed to extract text from resume.");
  }

  return {
    resumeId: resume.id,
    fileName: resume.file_name,
    fileKey: resume.file_key,
    text: extractedText,
    pageCount: parsed.total ?? null,
  };
}