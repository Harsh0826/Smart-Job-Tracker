import RecentApplicationsList from "../components/analytics/recentApplicationSummary";
import StatsCard from "../components/analytics/statusCard";
import StatusChart from "../components/analytics/statusChart";
import EmptyState from "../components/ui/emptyState";
import PageHeader from "../components/ui/header";
import { useApplications } from "../hooks/useApplication";
import { useAnalytics } from "../hooks/useAnalytics";
import AppNavbar from "../components/ui/appNavbar";

export default function AnalyticsPage() {
  const { applications } = useApplications();
  const { overview, statusDistribution, loading, error } = useAnalytics();

  return (
    <main className="app-shell">
        <AppNavbar/>
      <div className="app-container">
        <PageHeader
          title="Analytics Dashboard"
          subtitle="Track job search performance, outcomes, and progress across all applications."
        />

        {error && <div className="alert alert-error">{error}</div>}

        {loading || !overview ? (
          <section className="card">
            <div className="card-content">
              <EmptyState
                title="Loading analytics..."
                description="Please wait while dashboard insights are being prepared."
              />
            </div>
          </section>
        ) : (
          <div className="analytics-stack">
            <section className="stats-grid">
              <StatsCard
                title="Total Applications"
                value={overview.total}
                subtitle="All tracked submissions"
              />
              <StatsCard
                title="Active Applications"
                value={overview.active}
                subtitle="Applied, screening, interview"
              />
              <StatsCard
                title="Offers"
                value={overview.OFFER}
                subtitle={`${overview.successRate}% success rate`}
              />
              <StatsCard
                title="Response Rate"
                value={`${overview.responseRate}%`}
                subtitle="Screening, interview, offer"
              />
              <StatsCard
                title="Rejected"
                value={overview.REJECTED}
                subtitle={`${overview.rejectionRate}% rejection rate`}
              />
              <StatsCard
                title="Closed Applications"
                value={overview.closed}
                subtitle="Offer, rejected, ghosted, withdrawn"
              />
            </section>

            <section className="analytics-grid">
              <StatusChart data={statusDistribution} />
              <RecentApplicationsList applications={applications} />
            </section>
          </div>
        )}
      </div>
    </main>
  );
}