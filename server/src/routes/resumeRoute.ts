import { Router } from "express";
import {
  completeResumeUploadHandler,
  presignResumeUploadHandler,
} from "../controller/resume.controller";

const router = Router();

router.post("/presign-upload", presignResumeUploadHandler);
router.post("/complete-upload", completeResumeUploadHandler);

export default router;