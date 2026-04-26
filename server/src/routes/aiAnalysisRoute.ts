import { Router } from "express";
import { analyzeResumeAgainstJobHandler } from "../controllers/ai.controller";

const router = Router();

router.post("/analyze-resume", analyzeResumeAgainstJobHandler);

export default router;