import { Link } from "react-router-dom";
import type { DiscoveredJobListItem } from "../../api/discovery";
import {
  formatPostedAgo,
  getScoreClassName,
} from "../../utils/discoveryFormat";
import EmptyState from "../ui/emptyState";

type Props = {
  jobs: DiscoveredJobListItem[];
  loading: boolean;
  selectedId?: string;
  onSelect: (id: string) => Promise<void>;
  onPromote: (id: string) => Promise<void>;
};

function getPostedTitle(job: DiscoveredJobListItem): string {
  if (!job.posted_at) {
    return "No original posting time from source";
  }

  const postedAt = new Date(job.posted_at).toLocaleString();
  return `${postedAt} (${job.posted_at_source})`;
}

export default function DiscoveredJobTable({
  jobs,
  loading,
  selectedId,
  onSelect,
  onPromote,
}: Props) {
  if (jobs.length === 0 && !loading) {
    return (
      <div className="card table-card">
        <div className="table-wrap">
          <EmptyState
            title="No matching jobs yet"
            description="Run a job search or widen the filters. If nothing qualifies today, the list stays empty because the 24 hour and 70% rules are not relaxed."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="card table-card">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>Location</th>
              <th>Posted</th>
              <th>Applicants</th>
              <th>Match</th>
              <th>Tracker</th>
            </tr>
          </thead>

          <tbody>
            {jobs.map((job) => (
              <tr
                key={job.id}
                className={selectedId === job.id ? "row-selected" : ""}
                onClick={() => void onSelect(job.id)}
              >
                <td>{job.company}</td>

                <td>
                  {job.title}

                  {job.listing_status === "closed" && (
                    <span className="tag tag-muted">Closed</span>
                  )}

                  {job.work_auth_flags.length > 0 && (
                    <span
                      className="tag tag-warn"
                      title={job.work_auth_flags.join("\n")}
                    >
                      Work auth
                    </span>
                  )}
                </td>

                <td>
                  {job.location ?? "-"}
                  <div className="muted-small">{job.work_arrangement}</div>
                </td>

                <td title={getPostedTitle(job)}>
                  {formatPostedAgo(job.posted_at)}
                </td>

                <td>{job.applicant_count ?? "Unknown"}</td>

                <td>
                  <span className={getScoreClassName(job.match_score)}>
                    {job.match_score ?? "-"}
                  </span>
                </td>

                <td onClick={(e) => e.stopPropagation()}>
                  {job.application_id ? (
                    <Link to={`/applications/${job.application_id}`}>Open</Link>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => void onPromote(job.id)}
                    >
                      Add
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
