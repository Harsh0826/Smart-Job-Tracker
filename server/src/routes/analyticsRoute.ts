import { Router } from "express";
import {
  getOverviewAnalyticsHandler,
  getStatusDistributionHandler,
} from "../controllers/analytics.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/overview", getOverviewAnalyticsHandler);
router.get("/status-distribution", getStatusDistributionHandler);

export default router;
