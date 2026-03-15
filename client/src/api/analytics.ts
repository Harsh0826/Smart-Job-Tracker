import { apiClient } from "./client";

export interface AnalyticsOverview {
  total: number;
  active: number;
  closed: number;
  successRate: number;
  rejectionRate: number;
  responseRate: number;
  APPLIED: number;
  SCREENING: number;
  INTERVIEW: number;
  OFFER: number;
  REJECTED: number;
  GHOSTED: number;
  WITHDRAWN: number;
}

export interface StatusDistributionItem {
  status: string;
  count: number;
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const response = await apiClient.get<AnalyticsOverview>("/analytics/overview");
  return response.data;
}

export async function getStatusDistribution(): Promise<StatusDistributionItem[]> {
  const response = await apiClient.get<StatusDistributionItem[]>(
    "/analytics/status-distribution"
  );
  return response.data;
}