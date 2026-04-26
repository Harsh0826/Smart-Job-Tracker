import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
} from "../../types/application";
import { formatDate } from "../../utils/format";
import EmptyState from "../ui/emptyState";
import StatusBadge from "./statusBadge";

type Props = {
  applications: Application[];
  loading?: boolean;
  onEdit: (application: Application) => void;
  onStatusChange: (id: string, status: ApplicationStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

type SortOption =
  | "created_desc"
  | "created_asc"
  | "company_asc"
  | "company_desc"
  | "applied_desc"
  | "applied_asc";

export default function ApplicationTable({
  applications,
  loading = false,
  onEdit,
  onStatusChange,
  onDelete,
}: Props) {
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "ALL">(
    "ALL"
  );
  const [sortBy, setSortBy] = useState<SortOption>("created_desc");

  const filteredApplications = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const filtered = applications.filter((app) => {
      const matchesSearch =
        !query ||
        app.company.toLowerCase().includes(query) ||
        app.role.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "ALL" || app.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    const sorted = [...filtered];

    sorted.sort((a, b) => {
      switch (sortBy) {
        case "created_asc":
          return (
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
          );

        case "created_desc":
          return (
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
          );

        case "company_asc":
          return a.company.localeCompare(b.company);

        case "company_desc":
          return b.company.localeCompare(a.company);

        case "applied_asc":
          return (
            new Date(a.applied_date ?? 0).getTime() -
            new Date(b.applied_date ?? 0).getTime()
          );

        case "applied_desc":
          return (
            new Date(b.applied_date ?? 0).getTime() -
            new Date(a.applied_date ?? 0).getTime()
          );

        default:
          return 0;
      }
    });

    return sorted;
  }, [applications, searchTerm, statusFilter, sortBy]);

  return (
    <section className="card table-card">
      <div className="table-header">
        <h2 className="table-title">Applications</h2>
        <p className="table-subtitle">
          View, update, and manage all job applications in one place.
        </p>
      </div>

      <div className="toolbar">
        <div className="toolbar-item">
          <label className="label" htmlFor="application-search">
            Search
          </label>

          <input
            id="application-search"
            className="input"
            placeholder="Search by company or role"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="toolbar-item toolbar-item--small">
          <label className="label" htmlFor="status-filter">
            Filter by Status
          </label>

          <select
            id="status-filter"
            className="select"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ApplicationStatus | "ALL")
            }
          >
            <option value="ALL">All Statuses</option>

            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="toolbar-row">
        <div className="toolbar-meta">
          Showing {filteredApplications.length} of {applications.length}{" "}
          applications
        </div>

        <div>
          <label className="label" htmlFor="sort-by">
            Sort By
          </label>

          <select
            id="sort-by"
            className="select sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <option value="created_desc">Newest Created</option>
            <option value="created_asc">Oldest Created</option>
            <option value="company_asc">Company A-Z</option>
            <option value="company_desc">Company Z-A</option>
            <option value="applied_desc">Latest Applied Date</option>
            <option value="applied_asc">Earliest Applied Date</option>
          </select>
        </div>
      </div>

      {loading ? (
        <EmptyState
          title="Loading applications..."
          description="Please wait while your job applications are being loaded."
        />
      ) : filteredApplications.length === 0 ? (
        <EmptyState
          title={
            applications.length === 0
              ? "No applications found yet"
              : "No applications match your filters"
          }
          description={
            applications.length === 0
              ? "Add your first application from the form on the left to get started."
              : "Try changing the search term or status filter."
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
                <th>Applied</th>
                <th>Follow-up</th>
                <th>Resume</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredApplications.map((app) => (
                <tr
                  key={app.id}
                  onClick={() => navigate(`/applications/${app.id}`)}
                >
                  <td>
                    <div className="table-company">{app.company}</div>
                  </td>

                  <td>
                    <div className="table-role">{app.role}</div>
                  </td>

                  <td>
                    <StatusBadge status={app.status} />
                  </td>

                  <td>{formatDate(app.applied_date)}</td>

                  <td>{formatDate(app.follow_up_date)}</td>

                  <td>{app.resume_id ? `#${app.resume_id}` : "-"}</td>

                  <td>
                    <div
                      className="table-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        className="select table-status-select"
                        value={app.status}
                        onChange={(e) =>
                          void onStatusChange(
                            app.id,
                            e.target.value as ApplicationStatus
                          )
                        }
                      >
                        {APPLICATION_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => onEdit(app)}
                      >
                        Edit
                      </button>

                      <button
                        className="btn btn-danger"
                        type="button"
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Delete application for ${app.company}?`
                          );

                          if (confirmed) {
                            void onDelete(app.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}