import { useCallback, useEffect, useState } from "react";
import {
  getAnalyticsOverview,
  getStatusDistribution,
  type AnalyticsOverview,
  type StatusDistributionItem,
} from "../api/analytics";

interface UseAnalyticsReturn {
  overview: AnalyticsOverview | null;
  statusDistribution: StatusDistributionItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAnalytics(): UseAnalyticsReturn {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [statusDistribution, setStatusDistribution] = useState<
    StatusDistributionItem[]
  >([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [overviewData, statusData] = await Promise.all([
        getAnalyticsOverview(),
        getStatusDistribution(),
      ]);

      setOverview(overviewData);
      setStatusDistribution(statusData);
    } catch (err) {
      console.error(err);
      setError("Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    overview,
    statusDistribution,
    loading,
    error,
    refetch,
  };
}