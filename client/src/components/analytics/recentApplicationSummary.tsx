import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Application } from "../../types/application";
import { formatDate } from "../../utils/format";
import StatusBadge from "../application/statusBadge";

type Props = {
  applications: Application[];
};

export default function RecentApplicationsList({ applications }: Props) {
  const navigate = useNavigate();

  const recentApplications = useMemo(() => {
    return [...applications]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 5);
  }, [applications]);

  return (
    <section className="card">
      <div className="card-content">
        <h2 className="card-title">Recent Applications</h2>
        <p className="card-subtitle">
          Your latest tracked job applications.
        </p>

        {recentApplications.length === 0 ? (
          <p className="muted">No applications available yet.</p>
        ) : (
          <div className="recent-list">
            {recentApplications.map((application) => (
              <button
                key={application.id}
                type="button"
                className="recent-item"
                onClick={() => navigate(`/applications/${application.id}`)}
              >
                <div className="recent-item-main">
                  <div className="recent-item-company">{application.company}</div>
                  <div className="recent-item-role">{application.role}</div>
                </div>

                <div className="recent-item-side">
                  <StatusBadge status={application.status} />
                  <span className="recent-item-date">
                    {formatDate(application.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}