import { NextFunction, Response } from "express";
import {
  completeResumeUpload,
  createResumeUploadUrl,
  extractResumeText,
  getResumeDownloadUrl,
} from "../services/resume.service";
import { AuthRequest } from "../middleware/auth";

export async function resumeUploadHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { applicationId, fileName, contentType } = req.body;

    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!applicationId || !fileName || !contentType) {
      return res.status(400).json({
        message: "applicationId, fileName, and contentType are required",
      });
    }

    const result = await createResumeUploadUrl({
      userId: req.user.id,
      applicationId,
      fileName,
      contentType,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function completeResumeUploadHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { applicationId, fileName, fileKey, label } = req.body;

    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!applicationId || !fileName || !fileKey) {
      return res.status(400).json({
        message: "applicationId, fileName, and fileKey are required",
      });
    }

    const result = await completeResumeUpload({
      userId: req.user.id,
      applicationId,
      fileName,
      fileKey,
      label,
    });

    return res.status(200).json({
      message: "Resume uploaded successfully",
      resume: result.resume,
      application: result.application,
    });
  } catch (error) {
    next(error);
  }
}

export async function resumeDownloadHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { applicationId } = req.body;

    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!applicationId) {
      return res.status(400).json({
        message: "applicationId is required",
      });
    }

    const result = await getResumeDownloadUrl({
      userId: req.user.id,
      applicationId,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function extractResumeTextHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { applicationId } = req.body;

    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!applicationId) {
      return res.status(400).json({
        message: "applicationId is required",
      });
    }

    const result = await extractResumeText({
      userId: req.user.id,
      applicationId,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}