import { supabase } from "../config/supabase";

/**
 * Status buckets used by the analytics page. SCREENING is kept as the bucket name the client
 * already renders; it counts PHONE_SCREEN (the real status) plus legacy SCREENING rows.
 */
type StatusCounts = {
  APPLIED: number;
  SCREENING: number;
  INTERVIEW: number;
  OFFER: number;
  REJECTED: number;
  GHOSTED: number;
  WITHDRAWN: number;
};

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

/** Statuses before an application is actually submitted; excluded from funnel rates. */
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
    if (bucket) counts[bucket]++;
  }
  return { counts, preApplication };
}

export async function getOverviewAnalytics(userId: string) {
  const { counts, preApplication } = await countStatuses(userId);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const active = counts.APPLIED + counts.SCREENING + counts.INTERVIEW;
  const closed = counts.OFFER + counts.REJECTED + counts.GHOSTED + counts.WITHDRAWN;
  const pct = (n: number) => (total === 0 ? 0 : Number(((n / total) * 100).toFixed(1)));

  return {
    total,
    active,
    closed,
    preApplication,
    successRate: pct(counts.OFFER),
    rejectionRate: pct(counts.REJECTED),
    responseRate: pct(counts.SCREENING + counts.INTERVIEW + counts.OFFER),
    ...counts,
  };
}

export async function getStatusDistribution(userId: string) {
  const { counts } = await countStatuses(userId);
  return Object.entries(counts).map(([status, count]) => ({ status, count }));
}
