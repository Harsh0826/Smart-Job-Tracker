import { Router } from "express";
import { analyzeResumeAgainstJobHandler } from "../controllers/ai.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.post("/analyze-resume", authMiddleware,analyzeResumeAgainstJobHandler);

export default router;