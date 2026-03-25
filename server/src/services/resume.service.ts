import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../config/aws";

import { env } from "../config/env";
import { supabase } from "../config/supabase";
import { streamToBuffer } from "../utils/stream";
import { PDFParse } from "pdf-parse";

type uploadInput = {
  applicationId: string;
  fileName: string;
  contentType: string;
};

type CompleteUploadInput = {
  applicationId: string;
  fileName: string;
  fileKey: string;
};

type downloadInput = {
  applicationId: string;
};
type extractResumeTextInput = {
  applicationId: string;
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
function cleanExtractedText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export async function createResumeUploadUrl({
  applicationId,
  fileName,
  contentType,
}: uploadInput) {
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

export async function getResumeDownloadUrl({ applicationId }: downloadInput) {
  const { data, error } = await supabase
    .from("applications")
    .select("resume_file_name, resume_file_key")
    .eq("id", applicationId)
    .single();

  if (error) throw error;

  if (!data?.resume_file_key) {
    throw new Error("No resume uploaded for this application.");
  }

  const command = new GetObjectCommand({
    Bucket: env.awsS3ResumeBucket,
    Key: data.resume_file_key,
    ResponseContentType: "application/pdf",
    ResponseContentDisposition: data.resume_file_name
      ? `inline; filename="${data.resume_file_name}"`
      : 'inline; filename="resume.pdf"',
  });

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 300,
  });

  return {
    downloadUrl,
    expiresIn: 300,
    fileName: data.resume_file_name,
  };
}
export async function extractResumeText({
  applicationId,
}: extractResumeTextInput) {
  const { data, error } = await supabase
    .from("applications")
    .select("resume_file_key")
    .eq("id", applicationId)
    .single();
  if (error) throw error;
  if (!data?.resume_file_key) {
    throw new Error("No resume uploaded for this application.");
  }
  const command = new GetObjectCommand({
    Bucket: env.awsS3ResumeBucket,
    Key: data.resume_file_key,
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
    fileName: data.resume_file_key,
    text: extractedText,
    pageCount: parsed.total ?? null,
  };
}
