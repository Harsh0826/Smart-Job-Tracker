import { NextFunction, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import {
  getOverviewAnalytics,
  getStatusDistribution,
} from "../services/analytics.service";

export async function getOverviewAnalyticsHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await getOverviewAnalytics(req.user.id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getStatusDistributionHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await getStatusDistribution(req.user.id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
