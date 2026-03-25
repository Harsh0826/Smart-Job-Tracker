import { Router } from "express";
import { analyzeResumeAgainstJobHandler } from "../controller/ai.controller";

const router = Router();

router.post("/analyze-resume", analyzeResumeAgainstJobHandler);

export default router;