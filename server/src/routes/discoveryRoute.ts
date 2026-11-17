import { Router } from "express";
import {
  archiveJobHandler,
  discoverySummaryHandler,
  getJobHandler,
  getMasterProfileHandler,
  listJobsHandler,
  listRunsHandler,
  promoteJobHandler,
  putMasterProfileHandler,
  runDiscoveryHandler,
} from "../controllers/discovery.controller";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";

export const discoveryRouter = Router();
discoveryRouter.use(authMiddleware);
discoveryRouter.post("/run", rateLimit({ windowMs: 10 * 60_000, max: 2, name: "discovery run" }), runDiscoveryHandler);
discoveryRouter.get("/runs", listRunsHandler);
discoveryRouter.get("/summary", discoverySummaryHandler);
discoveryRouter.get("/jobs", listJobsHandler);
discoveryRouter.get("/jobs/:id", getJobHandler);
discoveryRouter.post("/jobs/:id/promote", promoteJobHandler);
discoveryRouter.post("/jobs/:id/archive", archiveJobHandler);

export const profileRouter = Router();
profileRouter.use(authMiddleware);
profileRouter.get("/master", getMasterProfileHandler);
profileRouter.put("/master", putMasterProfileHandler);
