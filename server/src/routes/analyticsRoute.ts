import { Router } from "express";
import {
  getOverviewAnalyticsHandler,
  getStatusDistributionHandler,
} from "../controllers/analytics.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Previously unauthenticated and unscoped: any caller could read every user's status counts.
router.use(authMiddleware);

router.get("/overview", getOverviewAnalyticsHandler);
router.get("/status-distribution", getStatusDistributionHandler);

export default router;
