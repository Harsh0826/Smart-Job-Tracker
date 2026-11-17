import { isAxiosError } from "axios";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  archiveDiscoveredJob,
  getDiscoveredJob,
  getDiscoverySummary,
  listDiscoveredJobs,
  promoteDiscoveredJob,
  runDiscoveryNow,
  type DiscoveredJob,
  type DiscoveredJobListItem,
  type DiscoverySummary,
  type JobFilters,
} from "../api/discovery";
import AppNavbar from "../components/ui/appNavbar";
import EmptyState from "../components/ui/emptyState";
import PageHeader from "../components/ui/header";

const DIMENSION_LABELS: Record<string, string> = {
  technicalSkills: "Technical skills",
  experience: "Experience & seniority",
  responsibilities: "Responsibilities",
  roleRelevance: "Role relevance",
  location: "Location & arrangement",
};

function errorMessage(err: unknown): string {
  if (isAxiosError(err)) return err.response?.data?.message ?? err.message;
  return err instanceof Error ? err.message : "Something went wrong";
}

function postedAgo(iso: string | null): string {
  if (!iso) return "Unverified";
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function scoreClass(score: number | null) {
  if (score === null) return "score-pill";
  return `score-pill ${score >= 85 ? "score-high" : score >= 70 ? "score-mid" : "score-low"}`;
}

export default function DiscoverPage() {
  const [summary, setSummary] = useState<DiscoverySummary | null>(null);
  const [jobs, setJobs] = useState<DiscoveredJobListItem[]>([]);
  const [filters, setFilters] = useState<JobFilters>({ shortlisted: "true" });
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<DiscoveredJob | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [s, list] = await Promise.all([getDiscoverySummary(), listDiscoveredJobs(filters)]);
      setSummary(s);
      setJobs(list.items);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRun() {
    try {
      setRunning(true);
      setError(null);
      const result = await runDiscoveryNow();
      const failed = result.boardErrors.length ? ` ${result.boardErrors.length} board(s) failed.` : "";
      setNotice(
        `Checked ${result.postingsFetched} postings from ${result.boardsQueried} boards: ${result.shortlisted.length} new match(es) ≥ 70.${failed}`
      );
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  async function handleSelect(id: string) {
    try {
      setSelected(await getDiscoveredJob(id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handlePromote(id: string) {
    try {
      const r = await promoteDiscoveredJob(id);
      setNotice(r.created ? "Added to your tracker as Discovered." : "Already in your tracker — linked.");
      await load();
      if (selected?.id === id) setSelected(await getDiscoveredJob(id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleArchive(id: string) {
    try {
      await archiveDiscoveredJob(id);
      if (selected?.id === id) setSelected(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const setFilter = (patch: Partial<JobFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <main className="app-shell">
      <AppNavbar />
      <div className="app-container">
        <PageHeader
          title="Job Discovery"
          subtitle="Jobs posted in the last 24 hours on employer job boards, scored against your Master Resume. Only scores of 70+ are shortlisted."
        />

        {notice && <div className="alert alert-success">{notice}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <section className="discovery-stats">
          <Stat label="Discovered (stored)" value={summary?.totalDiscovered} />
          <Stat label="Fresh in last 24h" value={summary?.freshLast24h} />
          <Stat label="Shortlisted ≥ 70" value={summary?.shortlistedAbove70} />
          <Stat label="Avg shortlist score" value={summary?.averageShortlistScore ?? "—"} />
          <button className="btn btn-primary discovery-run" onClick={handleRun} disabled={running}>
            {running ? "Searching job boards…" : "Run job search now"}
          </button>
        </section>

        <section className="card discovery-filters">
          <input className="input" placeholder="Job title" onChange={(e) => setFilter({ q: e.target.value })} />
          <input className="input" placeholder="Company" onChange={(e) => setFilter({ company: e.target.value })} />
          <input className="input" placeholder="Location" onChange={(e) => setFilter({ location: e.target.value })} />
          <input className="input" placeholder="Required skill (e.g. React)" onChange={(e) => setFilter({ skill: e.target.value })} />
          <select className="select" onChange={(e) => setFilter({ workArrangement: e.target.value as JobFilters["workArrangement"] })}>
            <option value="">Any arrangement</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
          <select className="select" onChange={(e) => setFilter({ postedWithinHours: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Any posting date</option>
            <option value="24">Last 24 hours</option>
            <option value="72">Last 3 days</option>
            <option value="168">Last 7 days</option>
          </select>
          <select className="select" value={filters.shortlisted} onChange={(e) => setFilter({ shortlisted: e.target.value as JobFilters["shortlisted"] })}>
            <option value="true">Shortlisted only</option>
            <option value="all">All stored postings</option>
          </select>
        </section>

        <section className="discovery-layout">
          <div className="card table-card">
            <div className="table-wrap">
              {jobs.length === 0 && !loading ? (
                <EmptyState
                  title="No matching jobs yet"
                  description="Run a job search, or widen the filters. If nothing qualifies today, nothing is shown — the 24h and 70% rules are never relaxed."
                />
              ) : (
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
                    {jobs.map((j) => (
                      <tr key={j.id} onClick={() => handleSelect(j.id)} className={selected?.id === j.id ? "row-selected" : ""}>
                        <td>{j.company}</td>
                        <td>
                          {j.title}
                          {j.listing_status === "closed" && <span className="tag tag-muted">Closed</span>}
                          {j.work_auth_flags.length > 0 && <span className="tag tag-warn" title={j.work_auth_flags.join("\n")}>Work auth</span>}
                        </td>
                        <td>
                          {j.location ?? "—"}
                          <div className="muted-small">{j.work_arrangement}</div>
                        </td>
                        <td title={j.posted_at ? `${new Date(j.posted_at).toLocaleString()} (${j.posted_at_source})` : "No original posting time from source"}>
                          {postedAgo(j.posted_at)}
                        </td>
                        <td>{j.applicant_count ?? "Unknown"}</td>
                        <td><span className={scoreClass(j.match_score)}>{j.match_score ?? "—"}</span></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {j.application_id ? (
                            <Link to={`/applications/${j.application_id}`}>Open</Link>
                          ) : (
                            <button className="btn btn-secondary btn-small" onClick={() => handlePromote(j.id)}>Add</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {selected && (
            <aside className="card discovery-detail">
              <div className="card-content">
                <h2 className="card-title">{selected.title}</h2>
                <p className="card-subtitle">
                  {selected.company} · {selected.location} · {selected.work_arrangement}
                  {selected.salary_min || selected.salary_max
                    ? ` · ${selected.salary_min ?? "?"}–${selected.salary_max ?? "?"} ${selected.salary_currency ?? ""}`
                    : ""}
                </p>
                <p className="muted-small">
                  Posted {postedAgo(selected.posted_at)}
                  {selected.posted_at_source ? ` (source: ${selected.posted_at_source})` : " — posting date unverified"} · Applicants:{" "}
                  {selected.applicant_count ?? "Unknown"}
                </p>

                <div className="detail-actions">
                  <a className="btn btn-primary" href={selected.apply_url} target="_blank" rel="noopener noreferrer">
                    Open employer application
                  </a>
                  {selected.application_id ? (
                    <Link className="btn btn-secondary" to={`/applications/${selected.application_id}`}>Open in tracker</Link>
                  ) : (
                    <button className="btn btn-secondary" onClick={() => handlePromote(selected.id)}>Add to tracker</button>
                  )}
                  <button className="btn btn-secondary" onClick={() => handleArchive(selected.id)}>Archive</button>
                </div>

                {selected.score_breakdown && (
                  <>
                    <h3 className="detail-heading">Why it scored {selected.score_breakdown.total}</h3>
                    <ul className="score-breakdown">
                      {Object.entries(selected.score_breakdown.dimensions).map(([key, d]) => (
                        <li key={key}>
                          <div className="score-row">
                            <span>{DIMENSION_LABELS[key] ?? key} ({Math.round(d.weight * 100)}%)</span>
                            <strong>{Math.round(d.score * d.weight * 100)} / {Math.round(d.weight * 100)}</strong>
                          </div>
                          <div className="score-bar"><span style={{ width: `${Math.round(d.score * 100)}%` }} /></div>
                          <div className="muted-small">
                            {d.explanation}
                            {selected.score_breakdown!.lowConfidence.includes(key) ? " · low confidence" : ""}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <SkillList title="Matched skills" items={selected.matched_skills} />
                <SkillList title="Missing required skills" items={selected.missing_required_skills} tone="warn" />
                <SkillList title="Missing preferred skills" items={selected.missing_preferred_skills} />

                {selected.work_auth_flags.length > 0 && (
                  <>
                    <h3 className="detail-heading">Check against your work authorization (PGWP)</h3>
                    <ul className="flag-list">
                      {selected.work_auth_flags.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  </>
                )}

                {selected.description && (
                  <details className="jd-details">
                    <summary>Full job description (version that was scored)</summary>
                    <pre className="jd-text">{selected.description}</pre>
                  </details>
                )}
              </div>
            </aside>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <div className="card discovery-stat">
      <div className="discovery-stat-value">{value ?? "—"}</div>
      <div className="discovery-stat-label">{label}</div>
    </div>
  );
}

function SkillList({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  if (!items?.length) return null;
  return (
    <>
      <h3 className="detail-heading">{title}</h3>
      <div className="skill-chips">
        {items.map((s) => (
          <span key={s} className={`tag ${tone === "warn" ? "tag-warn" : ""}`}>{s}</span>
        ))}
      </div>
    </>
  );
}
