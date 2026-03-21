import { useMemo, useRef, useState } from "react";
import {
  completeResumeUpload,
  presignResumeUpload,
} from "../../api/resume";
import type { Application } from "../../types/application";
import { formatDate } from "../../utils/format";

type Props = {
  application: Application;
  onUploadComplete: (updatedApplication: Application) => void;
};

export default function ResumeUploadCard({
  application,
  onUploadComplete,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const existingResumeText = useMemo(() => {
    if (!application.resume_file_name) {
      return "No resume uploaded yet.";
    }

    if (application.resume_uploaded_at) {
      return `${application.resume_file_name} · uploaded ${formatDate(
        application.resume_uploaded_at
      )}`;
    }

    return application.resume_file_name;
  }, [application.resume_file_name, application.resume_uploaded_at]);

  function resetMessages() {
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    resetMessages();

    const file = e.target.files?.[0] ?? null;

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.type !== "application/pdf") {
      setSelectedFile(null);
      setErrorMessage("Only PDF files are allowed.");
      return;
    }

    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setErrorMessage("Please choose a PDF file first.");
      return;
    }

    try {
      setUploading(true);
      resetMessages();

      const presigned = await presignResumeUpload({
        applicationId: application.id,
        fileName: selectedFile.name,
        contentType: selectedFile.type,
      });

      const uploadResponse = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": selectedFile.type,
        },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload PDF to S3.");
      }

      const completed = await completeResumeUpload({
        applicationId: application.id,
        fileName: selectedFile.name,
        fileKey: presigned.fileKey,
      });

      onUploadComplete(completed.application);
      setSuccessMessage("Resume uploaded successfully.");
      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Resume upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="card">
      <div className="card-content">
        <h2 className="card-title">Resume Upload</h2>
        <p className="card-subtitle">
          Upload or replace the PDF resume for this application.
        </p>

        {successMessage ? (
          <div className="alert alert-success">{successMessage}</div>
        ) : null}

        {errorMessage ? (
          <div className="alert alert-error">{errorMessage}</div>
        ) : null}

        <div className="resume-upload-stack">
          <div className="resume-upload-meta">
            <p className="resume-upload-label">Current Resume</p>
            <p className="resume-upload-value">{existingResumeText}</p>
          </div>

          <div className="resume-upload-controls">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="input"
            />

            {selectedFile ? (
              <p className="resume-selected-file">
                Selected: {selectedFile.name}
              </p>
            ) : null}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
              >
                {uploading ? "Uploading..." : "Replace / Upload Resume"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}