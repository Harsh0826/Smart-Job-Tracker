import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PDFParse } from "pdf-parse";
import { s3Client } from "../config/aws";
import { env } from "../config/env";
import { supabase } from "../config/supabase";
import { streamToBuffer } from "../utils/stream";

const SIGNED_URL_TTL_SECONDS = 300;
const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB

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
  const sanitized = fileName
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  if (!sanitized) {
    throw new Error("File name is invalid.");
  }

  return sanitized;
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
    .select("id, resume_id")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("Application not found or access denied.");
  }

  return data;
}

async function getApplicationResume(applicationId: string, userId: string) {
  const application = await getOwnedApplication(applicationId, userId);

  if (!application.resume_id) {
    throw new Error("No resume uploaded for this application.");
  }

  const { data: resume, error } = await supabase
    .from("resumes")
    .select("id, file_name, file_key, label, is_active, created_at")
    .eq("id", application.resume_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!resume) {
    throw new Error("Resume not found or access denied.");
  }

  return {
    application,
    resume,
  };
}

async function deleteS3Object(fileKey: string) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: env.awsS3ResumeBucket,
      Key: fileKey,
    })
  );
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
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });

  return {
    uploadUrl,
    fileKey,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  };
}

export async function completeResumeUpload({
  userId,
  applicationId,
  fileName,
  fileKey,
  label,
}: CompleteUploadInput) {
  const application = await getOwnedApplication(applicationId, userId);

  const expectedPrefix = `resumes/${userId}/${applicationId}/`;

  if (!fileKey.startsWith(expectedPrefix)) {
    throw new Error("Invalid file key.");
  }

  let head;

  try {
    head = await s3Client.send(
      new HeadObjectCommand({
        Bucket: env.awsS3ResumeBucket,
        Key: fileKey,
      })
    );
  } catch {
    throw new Error("File not found in storage. Upload may have failed.");
  }

  if (head.ContentType !== "application/pdf") {
    await deleteS3Object(fileKey);
    throw new Error("Uploaded file is not a valid PDF.");
  }

  if ((head.ContentLength ?? 0) > MAX_RESUME_BYTES) {
    await deleteS3Object(fileKey);

    throw new Error(
      `Resume exceeds the maximum allowed size of ${
        MAX_RESUME_BYTES / (1024 * 1024)
      } MB.`
    );
  }

  let oldResumeFileKey: string | null = null;

  if (application.resume_id) {
    const { data: oldResume } = await supabase
      .from("resumes")
      .select("file_key")
      .eq("id", application.resume_id)
      .eq("user_id", userId)
      .maybeSingle();

    oldResumeFileKey = oldResume?.file_key ?? null;
  }

  await supabase
    .from("resumes")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);

  const { data: resume, error: resumeError } = await supabase
    .from("resumes")
    .insert({
      user_id: userId,
      file_name: fileName,
      file_key: fileKey,
      label: label || fileName,
      is_active: true,
    })
    .select("id, user_id, file_name, file_key, label, is_active, created_at")
    .single();

  if (resumeError) throw resumeError;

  const { data: updatedApplication, error: appError } = await supabase
    .from("applications")
    .update({
      resume_id: resume.id,
    })
    .eq("id", applicationId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (appError) {
    await supabase.from("resumes").delete().eq("id", resume.id);
    throw appError;
  }

  if (oldResumeFileKey && oldResumeFileKey !== fileKey) {
    try {
      await deleteS3Object(oldResumeFileKey);
    } catch (error) {
      console.warn("Failed to delete old resume from S3:", error);
    }
  }

  return {
    resume,
    application: updatedApplication,
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
    ResponseContentDisposition: `inline; filename="${
      resume.file_name ?? "resume.pdf"
    }"`,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });

  return {
    downloadUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    fileName: resume.file_name,
    resumeId: resume.id,
  };
}

export async function extractResumeText({
  userId,
  applicationId,
}: ApplicationResumeInput) {
  const { resume } = await getApplicationResume(applicationId, userId);

  const s3Response = await s3Client.send(
    new GetObjectCommand({
      Bucket: env.awsS3ResumeBucket,
      Key: resume.file_key,
    })
  );

  // ✅ YOU MISSED THIS LINE
  const pdfBuffer = await streamToBuffer(s3Response.Body);

  const parser = new PDFParse({
    data: pdfBuffer,
  });

  const parsed = await parser.getText();

  await parser.destroy();

  const extractedText = cleanExtractedText(parsed.text ?? "");

  if (!extractedText || extractedText.length < 50) {
    throw new Error("Resume appears empty or unreadable.");
  }

  return {
    resumeId: resume.id,
    fileName: resume.file_name,
    fileKey: resume.file_key,
    text: extractedText,
    pageCount: parsed.total ?? null,
  };
}