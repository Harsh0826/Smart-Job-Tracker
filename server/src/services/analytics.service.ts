import { supabase } from "../config/supabase";

type StatusCounts = {
  APPLIED: number;
  SCREENING: number;
  INTERVIEW: number;
  OFFER: number;
  REJECTED: number;
  GHOSTED: number;
  WITHDRAWN: number;
};

export async function getOverviewAnalytics() {
  const { data, error } = await supabase
    .from("applications")
    .select("status");

  if (error) throw error;

  const counts: StatusCounts = {
    APPLIED: 0,
    SCREENING: 0,
    INTERVIEW: 0,
    OFFER: 0,
    REJECTED: 0,
    GHOSTED: 0,
    WITHDRAWN: 0,
  };

  for (const item of data ?? []) {
    const status = item.status as keyof StatusCounts;
    if (status in counts) {
      counts[status]++;
    }
  }

  const total = (data ?? []).length;
  const active =
    counts.APPLIED + counts.SCREENING + counts.INTERVIEW;
  const closed =
    counts.OFFER + counts.REJECTED + counts.GHOSTED + counts.WITHDRAWN;

  const successRate =
    total === 0 ? 0 : Number(((counts.OFFER / total) * 100).toFixed(1));

  const rejectionRate =
    total === 0 ? 0 : Number(((counts.REJECTED / total) * 100).toFixed(1));

  const responseRate =
    total === 0
      ? 0
      : Number(
          (
            ((counts.SCREENING + counts.INTERVIEW + counts.OFFER) / total) *
            100
          ).toFixed(1)
        );

  return {
    total,
    active,
    closed,
    successRate,
    rejectionRate,
    responseRate,
    ...counts,
  };
}

export async function getStatusDistribution() {
  const { data, error } = await supabase
    .from("applications")
    .select("status");

  if (error) throw error;

  const counts: StatusCounts = {
    APPLIED: 0,
    SCREENING: 0,
    INTERVIEW: 0,
    OFFER: 0,
    REJECTED: 0,
    GHOSTED: 0,
    WITHDRAWN: 0,
  };

  for (const item of data ?? []) {
    const status = item.status as keyof StatusCounts;
    if (status in counts) {
      counts[status]++;
    }
  }

  return Object.entries(counts).map(([status, count]) => ({
    status,
    count,
  }));
}