import { Link } from "react-router-dom";
import type { DiscoveredJob } from "../../api/discovery";
import { formatPostedAgo } from "../../utils/discoveryFormat";
import ScoreBreakdownList from "./scoreBreakdownList";
import SkillList from "./skillList";

type Props = {
  job: DiscoveredJob;
  onPromote: (id: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
};

function getSalaryText(job: DiscoveredJob): string {
  if (!job.salary_min && !job.salary_max) return "";

  const min = job.salary_min ?? "?";
  const max = job.salary_max ?? "?";
  const currency = job.salary_currency ?? "";

  return ` · ${min} - ${max} ${currency}`;
}

function getPostedSourceText(job: DiscoveredJob): string {
  if (job.posted_at_source) {
    return ` (source: ${job.posted_at_source})`;
  }

  return " (posting date unverified)";
}

export default function DiscoveredJobDetail({
  job,
  onPromote,
  onArchive,
}: Props) {
  return (
    <aside className="card discovery-detail">
      <div className="card-content">
        <h2 className="card-title">{job.title}</h2>

        <p className="card-subtitle">
          {job.company} · {job.location} · {job.work_arrangement}
          {getSalaryText(job)}
        </p>

        <p className="muted-small">
          Posted {formatPostedAgo(job.posted_at)}
          {getPostedSourceText(job)} · Applicants:{" "}
          {job.applicant_count ?? "Unknown"}
        </p>

        <div className="detail-actions">
          <a
            className="btn btn-primary"
            href={job.apply_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open employer application
          </a>

          {job.application_id ? (
            <Link
              className="btn btn-secondary"
              to={`/applications/${job.application_id}`}
            >
              Open in tracker
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void onPromote(job.id)}
            >
              Add to tracker
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void onArchive(job.id)}
          >
            Archive
          </button>
        </div>

        {job.score_breakdown && (
          <ScoreBreakdownList breakdown={job.score_breakdown} />
        )}

        <SkillList title="Matched skills" items={job.matched_skills} />

        <SkillList
          title="Missing required skills"
          items={job.missing_required_skills}
          tone="warn"
        />

        <SkillList
          title="Missing preferred skills"
          items={job.missing_preferred_skills}
        />

        {job.work_auth_flags.length > 0 && (
          <>
            <h3 className="detail-heading">
              Check against your work authorization (PGWP)
            </h3>

            <ul className="flag-list">
              {job.work_auth_flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </>
        )}

        {job.description && (
          <details className="jd-details">
            <summary>Full job description (version that was scored)</summary>
            <pre className="jd-text">{job.description}</pre>
          </details>
        )}
      </div>
    </aside>
  );
}
