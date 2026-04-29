import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  completeResumeUpload,
  resumeUpload,
} from "../api/resume";
import ApplicationForm from "../components/application/applicationForm";
import ApplicationTable from "../components/application/applicationTable";
import AppNavbar from "../components/ui/appNavbar";
import PageHeader from "../components/ui/header";
import { useApplications } from "../hooks/useApplication";
import type {
  Application,
  ApplicationStatus,
  CreateApplicationPayload,
} from "../types/application";

export default function ApplicationsPage() {
  const navigate = useNavigate();

  const {
    applications,
    loading,
    error,
    createApplication,
    updateApplication,
    deleteApplication,
  } = useApplications();

  const [editingApplication, setEditingApplication] =
    useState<Application | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  async function uploadResumeForApplication(
    applicationId: string,
    resumeFile: File
  ): Promise<Application> {
    const presigned = await resumeUpload({
      applicationId,
      fileName: resumeFile.name,
      contentType: resumeFile.type || "application/pdf",
    });

    const uploadResponse = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": resumeFile.type || "application/pdf",
      },
      body: resumeFile,
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload resume.");
    }

    const completed = await completeResumeUpload({
      applicationId,
      fileName: resumeFile.name,
      fileKey: presigned.fileKey,
      label: resumeFile.name,
    });

    return completed.application;
  }

  async function handleFormSubmit(
    payload: CreateApplicationPayload,
    resumeFile?: File | null
  ) {
    if (editingApplication) {
      let updatedApplication = await updateApplication(
        editingApplication.id,
        payload
      );

      if (resumeFile) {
        updatedApplication = await uploadResumeForApplication(
          editingApplication.id,
          resumeFile
        );
      }

      setEditingApplication(updatedApplication);

      setSuccessMessage(
        resumeFile
          ? "Application and resume updated successfully."
          : "Application updated successfully."
      );

      return;
    }

    const createdApplication = await createApplication(payload);

    if (resumeFile) {
      const updatedApplication = await uploadResumeForApplication(
        createdApplication.id,
        resumeFile
      );

      setSuccessMessage("Application and resume created successfully.");
      navigate(`/applications/${updatedApplication.id}`);
      return;
    }

    setSuccessMessage("Application created successfully.");
  }

  async function handleStatusChange(id: string, status: ApplicationStatus) {
    const updated = await updateApplication(id, { status });

    if (editingApplication?.id === id) {
      setEditingApplication(updated);
    }

    setSuccessMessage("Application status updated.");
  }

  function handleEdit(application: Application) {
    setEditingApplication(application);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingApplication(null);
  }

  async function handleDelete(id: string) {
    await deleteApplication(id);

    if (editingApplication?.id === id) {
      setEditingApplication(null);
    }

    setSuccessMessage("Application deleted successfully.");
  }

  return (
    <main className="app-shell">
      <AppNavbar />

      <div className="app-container">
        <PageHeader
          title="Smart Job Tracker"
          subtitle="Track applications, manage follow-ups, and keep your job search organized."
        />

        {successMessage && (
          <div className="alert alert-success">{successMessage}</div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <section className="page-grid">
          <ApplicationForm
            onSubmit={handleFormSubmit}
            editingApplication={editingApplication}
            onCancelEdit={handleCancelEdit}
          />

          <ApplicationTable
            applications={applications}
            loading={loading}
            onEdit={handleEdit}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        </section>
      </div>
    </main>
  );
}