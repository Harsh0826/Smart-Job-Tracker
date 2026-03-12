import { Router } from "express";
import {
  getOverviewAnalyticsHandler,
  getStatusDistributionHandler,
} from "../controller/analytics.controller";

const router = Router();

router.get("/overview", getOverviewAnalyticsHandler);
router.get("/status-distribution", getStatusDistributionHandler);

export default router;