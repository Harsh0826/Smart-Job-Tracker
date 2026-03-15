import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApplicationById } from "../api/application";
import StatusBadge from "../components/application/statusBadge";
import EmptyState from "../components/ui/emptyState";
import PageHeader from "../components/ui/header";
import type { Application } from "../types/application";
import { formatCurrency, formatDate } from "../utils/format";
import { analyzeJobDescription, type SkillGapAnalysis } from "../api/ai";
import AppNavbar from "../components/ui/appNavbar";

function formatSalaryRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "-";
  if (min != null && max != null) return `${formatCurrency(min)} - ${formatCurrency(max)}`;
  if (min != null) return `From ${formatCurrency(min)}`;
  return `Up to ${formatCurrency(max)}`;
}

type DetailCardProps = {
  label: string;
  value?: string | null;
};

function DetailCard({ label, value }: DetailCardProps) {
  return (
    <div className="detail-item">
      <p className="detail-item-label">{label}</p>
      <p className="detail-item-value">{value || "-"}</p>
    </div>
  );
}

export default function ApplicationDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<SkillGapAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    async function loadApplication() {
      if (!id) {
        setError("Application id is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await getApplicationById(id);
        setApplication(data);
      } catch (err) {
        console.error(err);
        setError("Failed to load application details.");
      } finally {
        setLoading(false);
      }
    }

    void loadApplication();
  }, [id]);

  async function handleAnalyze() {
    if (!application?.job_description?.trim()) {
      setAnalysisError("Job description is required for AI analysis.");
      return;
    }

    try {
      setAnalysisLoading(true);
      setAnalysisError(null);

      const result = await analyzeJobDescription({
        jobDescription: application.job_description,
        userSkills: [],
      });

      setAnalysis(result);
    } catch (err) {
      console.error(err);
      setAnalysisError("Failed to analyze job description.");
    } finally {
      setAnalysisLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <AppNavbar />

      <div className="app-container">
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/applications")}
          >
            Back to Applications
          </button>
        </div>

        <PageHeader
          title="Application Details"
          subtitle="Review the full application information and job context."
        />

        {error && <div className="alert alert-error">{error}</div>}
        {analysisError && <div className="alert alert-error">{analysisError}</div>}

        {loading ? (
          <section className="card">
            <div className="card-content">
              <EmptyState
                title="Loading application..."
                description="Please wait while the application details are being loaded."
              />
            </div>
          </section>
        ) : !application ? (
          <section className="card">
            <div className="card-content">
              <EmptyState
                title="Application not found"
                description="The requested application could not be found."
              />
            </div>
          </section>
        ) : (
          <div className="details-page-stack">
            <section className="card">
              <div className="card-content">
                <div className="details-panel">
                  <div className="details-panel-header">
                    <div>
                      <h2 className="details-title">{application.company}</h2>
                      <p className="details-subtitle">{application.role}</p>
                    </div>

                    <StatusBadge status={application.status} />
                  </div>

                  <div className="details-grid">
                    <DetailCard label="Applied Date" value={formatDate(application.applied_date)} />
                    <DetailCard label="Follow-up Date" value={formatDate(application.follow_up_date)} />
                    <DetailCard label="Source" value={application.source} />
                    <DetailCard label="Salary Range" value={formatSalaryRange(application.salary_min, application.salary_max)} />
                    <DetailCard label="Contact Name" value={application.contact_name} />
                    <DetailCard label="Contact Email" value={application.contact_email} />
                    <DetailCard label="Resume Version" value={application.resume_version} />
                    <DetailCard label="Created At" value={formatDate(application.created_at)} />
                  </div>

                  <div className="details-section">
                    <h3 className="details-section-title">Job URL</h3>
                    {application.job_url ? (
                      <a
                        className="details-link"
                        href={application.job_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {application.job_url}
                      </a>
                    ) : (
                      <p className="details-text muted">No job URL added.</p>
                    )}
                  </div>

                  <div className="details-section">
                    <h3 className="details-section-title">Job Description</h3>
                    <p className="details-text">
                      {application.job_description || "No job description available."}
                    </p>
                  </div>

                  <div className="details-section">
                    <h3 className="details-section-title">Notes</h3>
                    <p className="details-text">
                      {application.notes || "No notes added yet."}
                    </p>
                  </div>

                  {/* <div className="details-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAnalyze}
                      disabled={analysisLoading}
                    >
                      {analysisLoading ? "Analyzing..." : "Analyze Job Description"}
                    </button>
                  </div> */}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}