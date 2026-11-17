import { isAxiosError } from "axios";
import { useCallback, useEffect, useState } from "react";
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
import DiscoveredJobDetail from "../components/discovery/discoveredJobDetail";
import DiscoveredJobTable from "../components/discovery/discoveredJobTable";
import DiscoveryFilters from "../components/discovery/discoveryFilters";
import DiscoveryStatCard from "../components/discovery/discoveryStatCard";
import AppNavbar from "../components/ui/appNavbar";
import PageHeader from "../components/ui/header";

function getErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    return err.response?.data?.message ?? err.message;
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "Something went wrong";
}

export default function DiscoverPage() {
  const [summary, setSummary] = useState<DiscoverySummary | null>(null);
  const [jobs, setJobs] = useState<DiscoveredJobListItem[]>([]);
  const [filters, setFilters] = useState<JobFilters>({ shortlisted: "true" });
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<DiscoveredJob | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryData, jobList] = await Promise.all([
        getDiscoverySummary(),
        listDiscoveredJobs(filters),
      ]);

      setSummary(summaryData);
      setJobs(jobList.items);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  async function handleRun() {
    try {
      setRunning(true);
      setError(null);

      const result = await runDiscoveryNow();

      let failedText = "";

      if (result.boardErrors.length > 0) {
        failedText = ` ${result.boardErrors.length} board(s) failed.`;
      }

      setNotice(
        `Checked ${result.postingsFetched} postings from ${result.boardsQueried} boards: ${result.shortlisted.length} new match(es) scoring 70+.${failedText}`
      );

      await loadJobs();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  async function handleSelect(id: string) {
    try {
      const job = await getDiscoveredJob(id);
      setSelectedJob(job);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handlePromote(id: string) {
    try {
      const result = await promoteDiscoveredJob(id);

      if (result.created) {
        setNotice("Added to your tracker as Discovered.");
      } else {
        setNotice("This job is already in your tracker and has been linked.");
      }

      await loadJobs();

      if (selectedJob?.id === id) {
        const job = await getDiscoveredJob(id);
        setSelectedJob(job);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleArchive(id: string) {
    try {
      await archiveDiscoveredJob(id);

      if (selectedJob?.id === id) {
        setSelectedJob(null);
      }

      await loadJobs();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function handleFilterChange(patch: Partial<JobFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  return (
    <main className="app-shell">
      <AppNavbar />

      <div className="app-container">
        <PageHeader
          title="Job Discovery"
          subtitle="Jobs posted in the last 24 hours on employer job boards, scored against your Master Resume. Jobs scoring 70 or higher are shortlisted."
        />

        {notice && <div className="alert alert-success">{notice}</div>}

        {error && <div className="alert alert-error">{error}</div>}

        <section className="discovery-stats">
          <DiscoveryStatCard
            label="Discovered (stored)"
            value={summary?.totalDiscovered}
          />

          <DiscoveryStatCard
            label="Fresh in last 24h"
            value={summary?.freshLast24h}
          />

          <DiscoveryStatCard
            label="Shortlisted (70+)"
            value={summary?.shortlistedAbove70}
          />

          <DiscoveryStatCard
            label="Avg shortlist score"
            value={summary?.averageShortlistScore}
          />

          <button
            type="button"
            className="btn btn-primary discovery-run"
            onClick={handleRun}
            disabled={running}
          >
            {running ? "Searching job boards..." : "Run job search now"}
          </button>
        </section>

        <DiscoveryFilters filters={filters} onChange={handleFilterChange} />

        <section className="discovery-layout">
          <DiscoveredJobTable
            jobs={jobs}
            loading={loading}
            selectedId={selectedJob?.id}
            onSelect={handleSelect}
            onPromote={handlePromote}
          />

          {selectedJob && (
            <DiscoveredJobDetail
              job={selectedJob}
              onPromote={handlePromote}
              onArchive={handleArchive}
            />
          )}
        </section>
      </div>
    </main>
  );
}
