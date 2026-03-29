import { useMemo, useState } from "react";
import { analyzeResumeJobMatch } from "../../api/ai";
import type { Application } from "../../types/application";
import { formatDate } from "../../utils/format";

type Props = {
  application: Application;
  onAnalysisComplete: (updatedApplication: Application) => void;
};

function getScoreTone(score: number | null | undefined) {
  if (score == null) return "neutral";
  if (score >= 80) return "strong";
  if (score >= 60) return "moderate";
  return "weak";
}

function getScoreLabel(score: number | null | undefined) {
  if (score == null) return "Not analyzed";
  if (score >= 80) return "Strong match";
  if (score >= 60) return "Moderate match";
  return "Low match";
}

function SkillChips({
  items,
  emptyText,
  missing = false,
}: {
  items?: string[] | null;
  emptyText: string;
  missing?: boolean;
}) {
  if (!items?.length) {
    return <p className="details-text muted">{emptyText}</p>;
  }

  return (
    <div className="chip-list">
      {items.map((item) => (
        <span
          key={item}
          className={`skill-chip ${missing ? "skill-chip-missing" : ""}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export default function ResumeAnalysisCard({
  application,
  onAnalysisComplete,
}: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const hasResume = Boolean(application.resume_file_key);
  const hasAnalysis =
    application.match_score != null ||
    Boolean(application.required_skills?.length) ||
    Boolean(application.missing_skills?.length) ||
    Boolean(application.suggestions?.length);

  const scoreTone = useMemo(
    () => getScoreTone(application.match_score),
    [application.match_score]
  );

  const scoreLabel = useMemo(
    () => getScoreLabel(application.match_score),
    [application.match_score]
  );

  const buttonLabel = analyzing
    ? "Analyzing..."
    : hasAnalysis
    ? "Re-run Analysis"
    : "Analyze Resume vs Job";

  async function handleAnalyze() {
    try {
      setAnalyzing(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const result = await analyzeResumeJobMatch(application.id);
      onAnalysisComplete(result.application);
      setSuccessMessage("Resume analysis completed successfully.");
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to analyze resume against job description.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <section className="card" aria-busy={analyzing}>
      <div className="card-content">
        <div className="analysis-header">
          <div>
            <h2 className="card-title">AI Resume Match Analysis</h2>
            <p className="card-subtitle">
              Compare the uploaded resume against this job description and
              identify missing skills.
            </p>
          </div>
        </div>

        {errorMessage ? (
          <div className="alert alert-error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="alert alert-success" role="status">
            {successMessage}
          </div>
        ) : null}

        <div className="analysis-stack">
          <div className="analysis-meta-grid">
            <div className="detail-item">
              <p className="detail-item-label">Match Score</p>
              <p className={`detail-item-value score-${scoreTone}`}>
                {application.match_score != null
                  ? `${application.match_score}%`
                  : "-"}
              </p>

              <div className="score-progress">
                <div
                  className={`score-progress-bar score-${scoreTone}`}
                  style={{ width: `${application.match_score ?? 0}%` }}
                />
              </div>

              <p className="details-text muted">{scoreLabel}</p>
            </div>

            <div className="detail-item">
              <p className="detail-item-label">Last Analysis Run</p>
              <p className="detail-item-value">
                {formatDate(application.analysis_last_run_at)}
              </p>
            </div>
          </div>

          {!hasAnalysis && !analyzing ? (
            <div className="analysis-empty-state">
              <p className="details-text muted">
                No analysis has been run yet. Start the AI analysis to extract
                required skills, detect missing skills, and get resume
                improvement suggestions.
              </p>
            </div>
          ) : null}

          {analyzing ? (
            <div className="analysis-loading" role="status" aria-live="polite">
              <p className="details-text">Analyzing resume against job description...</p>
              <p className="details-text muted">
                This may take a few seconds.
              </p>
            </div>
          ) : null}

          <div className="analysis-section">
            <h3 className="details-section-title">Required Skills</h3>
            <SkillChips
              items={application.required_skills}
              emptyText="No required skills extracted yet."
            />
          </div>

          <div className="analysis-section">
            <h3 className="details-section-title">Missing Skills</h3>
            <SkillChips
              items={application.missing_skills}
              emptyText="No missing skills identified yet."
              missing
            />
          </div>

          <div className="analysis-section">
            <h3 className="details-section-title">Suggestions</h3>
            {application.suggestions?.length ? (
              <ul className="suggestion-list">
                {application.suggestions.map((item, index) => (
                  <li key={`${item}-${index}`} className="details-text">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="details-text muted">
                No suggestions available yet.
              </p>
            )}
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={analyzing || !hasResume}
              title={!hasResume ? "Upload a resume before running analysis." : ""}
            >
              {buttonLabel}
            </button>
          </div>

          {!hasResume ? (
            <p className="details-text muted">
              Upload a resume first before running AI analysis.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}