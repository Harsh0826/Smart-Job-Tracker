import { useEffect, useState } from "react";
import ApplicationForm from "../components/application/applicationForm";
import ApplicationTable from "../components/application/applicationTable";
import PageHeader from "../components/ui/header";
import { useApplications } from "../hooks/useApplication";
import type {
  Application,
  ApplicationStatus,
  CreateApplicationPayload,
} from "../types/application";
import AppNavbar from "../components/ui/appNavbar";

export default function ApplicationsPage() {
  const {
    applications,
    loading,
    error,
    createApplication,
    updateApplication,
    deleteApplication,
  } = useApplications();

  const [editingApplication, setEditingApplication] = useState<Application | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  async function handleFormSubmit(payload: CreateApplicationPayload) {
    if (editingApplication) {
      await updateApplication(editingApplication.id, payload);
      setEditingApplication(null);
      setSuccessMessage("Application updated successfully.");
      return;
    }

    await createApplication(payload);
    setSuccessMessage("Application created successfully.");
  }

  async function handleStatusChange(id: string, status: ApplicationStatus) {
    await updateApplication(id, { status });

    if (editingApplication?.id === id) {
      setEditingApplication((prev) => (prev ? { ...prev, status } : prev));
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

        {successMessage && <div className="alert alert-success">{successMessage}</div>}
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