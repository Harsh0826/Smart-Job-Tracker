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

// The client renders a SCREENING bucket, which also counts PHONE_SCREEN and ASSESSMENT.
const BUCKET: Record<string, keyof StatusCounts> = {
  APPLIED: "APPLIED",
  PHONE_SCREEN: "SCREENING",
  SCREENING: "SCREENING",
  ASSESSMENT: "SCREENING",
  INTERVIEW: "INTERVIEW",
  TECHNICAL: "INTERVIEW",
  FINAL_INTERVIEW: "INTERVIEW",
  OFFER: "OFFER",
  ACCEPTED: "OFFER",
  REJECTED: "REJECTED",
  GHOSTED: "GHOSTED",
  WITHDRAWN: "WITHDRAWN",
};

// Not submitted yet, so these are left out of the funnel rates.
const PRE_APPLICATION = new Set(["SAVED", "DISCOVERED", "UNDER_REVIEW", "READY_TO_APPLY", "EXPIRED"]);

async function countStatuses(userId: string) {
  const { data, error } = await supabase
    .from("applications")
    .select("status")
    .eq("user_id", userId)
    .is("deleted_at", null);

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

  let preApplication = 0;

  for (const item of data ?? []) {
    const status = String(item.status);

    if (PRE_APPLICATION.has(status)) {
      preApplication++;
      continue;
    }

    const bucket = BUCKET[status];

    if (bucket) {
      counts[bucket]++;
    }
  }

  return { counts, preApplication };
}

function percentOf(count: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Number(((count / total) * 100).toFixed(1));
}

export async function getOverviewAnalytics(userId: string) {
  const { counts, preApplication } = await countStatuses(userId);

  let total = 0;

  for (const count of Object.values(counts)) {
    total += count;
  }

  const active = counts.APPLIED + counts.SCREENING + counts.INTERVIEW;
  const closed = counts.OFFER + counts.REJECTED + counts.GHOSTED + counts.WITHDRAWN;
  const responded = counts.SCREENING + counts.INTERVIEW + counts.OFFER;

  return {
    total,
    active,
    closed,
    preApplication,
    successRate: percentOf(counts.OFFER, total),
    rejectionRate: percentOf(counts.REJECTED, total),
    responseRate: percentOf(responded, total),
    ...counts,
  };
}

export async function getStatusDistribution(userId: string) {
  const { counts } = await countStatuses(userId);

  return Object.entries(counts).map(([status, count]) => ({
    status,
    count,
  }));
}
