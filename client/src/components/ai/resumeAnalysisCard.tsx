import { useState } from "react";
import { analyzeResumeJobMatch } from "../../api/ai";
import type { Application } from "../../types/application";
import { formatDate } from "../../utils/format";

type Props = {
  application: Application;
  onAnalysisComplete: (updatedApplication: Application) => void;
};

export default function ResumeAnalysisCard({
  application,
  onAnalysisComplete,
}: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAnalyze() {
    try {
      setAnalyzing(true);
      setErrorMessage(null);

      const result = await analyzeResumeJobMatch(application.id);
      onAnalysisComplete(result.application);
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to analyze resume against job description.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <section className="card">
      <div className="card-content">
        <h2 className="card-title">AI Resume Match Analysis</h2>
        <p className="card-subtitle">
          Compare the uploaded resume against this job description and identify missing skills.
        </p>

        {errorMessage ? (
          <div className="alert alert-error">{errorMessage}</div>
        ) : null}

        <div className="analysis-stack">
          <div className="analysis-meta-grid">
            <div className="detail-item">
              <p className="detail-item-label">Match Score</p>
              <p className="detail-item-value">
                {application.match_score != null ? `${application.match_score}%` : "-"}
              </p>
            </div>

            <div className="detail-item">
              <p className="detail-item-label">Last Analysis Run</p>
              <p className="detail-item-value">
                {formatDate(application.analysis_last_run_at)}
              </p>
            </div>
          </div>

          <div className="analysis-section">
            <h3 className="details-section-title">Required Skills</h3>
            {application.required_skills?.length ? (
              <div className="chip-list">
                {application.required_skills.map((skill) => (
                  <span key={skill} className="skill-chip">
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="details-text muted">No analysis yet.</p>
            )}
          </div>

          <div className="analysis-section">
            <h3 className="details-section-title">Missing Skills</h3>
            {application.missing_skills?.length ? (
              <div className="chip-list">
                {application.missing_skills.map((skill) => (
                  <span key={skill} className="skill-chip skill-chip-missing">
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="details-text muted">No missing skills identified yet.</p>
            )}
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
              <p className="details-text muted">No suggestions yet.</p>
            )}
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={analyzing || !application.resume_file_key}
            >
              {analyzing ? "Analyzing..." : "Analyze Resume vs Job"}
            </button>
          </div>

          {!application.resume_file_key ? (
            <p className="details-text muted">
              Upload a resume first before running AI analysis.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}