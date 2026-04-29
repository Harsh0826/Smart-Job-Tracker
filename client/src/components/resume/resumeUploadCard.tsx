import { useMemo, useRef, useState } from "react";
import {
  completeResumeUpload,
  resumeDownload,
  resumeUpload,
} from "../../api/resume";
import type { Application } from "../../types/application";

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
  const [openingResume, setOpeningResume] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const existingResumeText = useMemo(() => {
    if (!application.resume_id) {
      return "No resume uploaded yet.";
    }

    return `Resume linked: #${application.resume_id}`;
  }, [application.resume_id]);

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

      const presigned = await resumeUpload({
        applicationId: application.id,
        fileName: selectedFile.name,
        contentType: selectedFile.type || "application/pdf",
      });

      const uploadResponse = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": selectedFile.type || "application/pdf",
        },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload PDF to storage.");
      }

      const completed = await completeResumeUpload({
        applicationId: application.id,
        fileName: selectedFile.name,
        fileKey: presigned.fileKey,
        label: selectedFile.name,
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

  async function handleViewResume() {
    try {
      setOpeningResume(true);
      resetMessages();

      const response = await resumeDownload({
        applicationId: application.id,
      });

      window.open(response.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error(error);
      setErrorMessage("Unable to open resume. Please try again.");
    } finally {
      setOpeningResume(false);
    }
  }

  return (
    <section className="card">
      <div className="card-content">
        <h2 className="card-title">Resume Upload</h2>

        <p className="card-subtitle">
          Upload or replace the PDF resume linked to this application.
        </p>

        {successMessage ? (
          <div className="alert alert-success">{successMessage}</div>
        ) : null}

        {errorMessage ? (
          <div className="alert alert-error">{errorMessage}</div>
        ) : null}

        <div className="resume-upload-stack">
          <div className="resume-meta-card">
            <div className="resume-meta-top">
              <div>
                <p className="resume-upload-label">Current Resume</p>
                <p className="resume-upload-value">{existingResumeText}</p>
              </div>

              {application.resume_id ? (
                <span className="resume-badge">Uploaded</span>
              ) : (
                <span className="resume-badge resume-badge--empty">
                  Not Uploaded
                </span>
              )}
            </div>
          </div>

          <div className="resume-upload-panel">
            <label className="file-upload-box">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="file-upload-input"
              />

              <div className="file-upload-content">
                <div className="file-upload-icon">📄</div>

                <div>
                  <p className="file-upload-title">Choose your resume PDF</p>
                  <p className="file-upload-subtitle">
                    Upload a clean, up-to-date resume.
                  </p>
                </div>
              </div>
            </label>

            {selectedFile && (
              <div className="resume-file-selected">
                <span className="resume-file-label">Selected file</span>
                <span className="resume-file-name">{selectedFile.name}</span>
              </div>
            )}

            <div className="resume-actions">
              {application.resume_id ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleViewResume}
                  disabled={openingResume}
                >
                  {openingResume ? "Opening..." : "View Resume"}
                </button>
              ) : null}

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
              >
                {uploading ? "Uploading Resume..." : "Upload Resume"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}