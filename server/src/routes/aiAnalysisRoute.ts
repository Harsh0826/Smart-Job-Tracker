import { Router } from "express";
import { analyzeResumeAgainstJobHandler, getLatestAnalysisHandler } from "../controllers/ai.controller";
import { authMiddleware } from "../middleware/auth";
import { get } from "node:http";

const router = Router();

router.post("/analyze-resume", authMiddleware,analyzeResumeAgainstJobHandler);
router.get("/applications/:applicationId/latest-analysis", authMiddleware, getLatestAnalysisHandler);

export default router;