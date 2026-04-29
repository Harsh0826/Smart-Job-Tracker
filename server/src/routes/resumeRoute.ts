import { Router } from "express";
import {
  completeResumeUploadHandler,
  resumeUploadHandler,
  resumeDownloadHandler,
  extractResumeTextHandler
} from "../controllers/resume.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.post("/upload", resumeUploadHandler);
router.post("/complete-upload", completeResumeUploadHandler);
router.post("/download", resumeDownloadHandler);
router.post("/extract-text", extractResumeTextHandler);

export default router;