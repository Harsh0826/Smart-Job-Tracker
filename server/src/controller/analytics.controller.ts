import { Request, Response, NextFunction } from "express";
import {
  getOverviewAnalytics,
  getStatusDistribution,
} from "../services/analytics.service";

export async function getOverviewAnalyticsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await getOverviewAnalytics();
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getStatusDistributionHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await getStatusDistribution();
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}