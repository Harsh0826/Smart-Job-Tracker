import { useEffect, useState } from "react";
import { analyzeResumeJobMatch } from "../../api/ai";
import type { ResumeJobMatchAnalysis } from "../../api/ai";
import type { Application } from "../../types/application";
import { formatDate } from "../../utils/format";

type Props = {
  application: Application;
  initialAnalysis?: ResumeJobMatchAnalysis | null;
};

export default function ResumeAnalysisCard({
  application,
  initialAnalysis = null,
}: Props) {
  const [analysis, setAnalysis] = useState<ResumeJobMatchAnalysis | null>(
    initialAnalysis
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasResume = Boolean(application.resume_id);

  useEffect(() => {
    setAnalysis(initialAnalysis);
  }, [initialAnalysis]);

  async function handleAnalyze() {
    try {
      setAnalyzing(true);
      setErrorMessage(null);
      setAnalysis(null);

      const result = await analyzeResumeJobMatch(application.id);
      setAnalysis(result.analysis);
    } catch (error: any) {
      console.error(error);

      setAnalysis(null);
      setErrorMessage(
        error?.response?.data?.message ||
          "Failed to analyze resume. Please check the job description and try again."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <section className="card" aria-busy={analyzing}>
      <div className="card-content">
        <h2 className="card-title">AI Resume Match Analysis</h2>

        <p className="card-subtitle">
          Compare the uploaded resume against the full job description.
        </p>

        {errorMessage && (
          <div className="alert alert-error" role="alert">
            {errorMessage}
          </div>
        )}

        {!analysis && !analyzing && (
          <p className="details-text muted">
            No analysis is currently displayed.
          </p>
        )}

        {analyzing && (
          <p className="details-text">Analyzing resume against job...</p>
        )}

        {analysis && (
          <div className="analysis-stack">
            <div className="analysis-meta-grid">
              <div className="detail-item">
                <p className="detail-item-label">Match Score</p>
                <p className="detail-item-value">{analysis.matchScore}%</p>
              </div>

              <div className="detail-item">
                <p className="detail-item-label">Last Analysis Run</p>
                <p className="detail-item-value">
                  {analysis.ranAt ? formatDate(analysis.ranAt) : "-"}
                </p>
              </div>
            </div>

            <div className="analysis-section">
              <h3 className="details-section-title">Required Skills</h3>

              {analysis.requiredSkills.length ? (
                <div className="chip-list">
                  {analysis.requiredSkills.map((skill) => (
                    <span key={skill} className="skill-chip">
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="details-text muted">
                  No required skills extracted.
                </p>
              )}
            </div>

            <div className="analysis-section">
              <h3 className="details-section-title">Missing Skills</h3>

              {analysis.missingSkills.length ? (
                <div className="chip-list">
                  {analysis.missingSkills.map((skill) => (
                    <span key={skill} className="skill-chip skill-chip-missing">
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="details-text muted">
                  No missing skills identified.
                </p>
              )}
            </div>

            <div className="analysis-section">
              <h3 className="details-section-title">Suggestions</h3>

              {analysis.suggestions.length ? (
                <ul className="suggestion-list">
                  {analysis.suggestions.map((item, index) => (
                    <li key={`${item}-${index}`} className="details-text">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="details-text muted">
                  No suggestions available.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAnalyze}
            disabled={analyzing || !hasResume}
          >
            {analyzing
              ? "Analyzing..."
              : analysis
              ? "Re-run Analysis"
              : "Analyze Resume"}
          </button>
        </div>

        {!hasResume && (
          <p className="details-text muted">
            Upload a resume before running analysis.
          </p>
        )}
      </div>
    </section>
  );
}