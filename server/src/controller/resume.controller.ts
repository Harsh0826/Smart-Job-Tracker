import { NextFunction, Request, Response } from "express";
import {
  completeResumeUpload,
  createResumeUploadUrl,
} from "../services/resume.service";

export async function presignResumeUploadHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { applicationId, fileName, contentType } = req.body;

    if (!applicationId || !fileName || !contentType) {
      return res.status(400).json({
        message: "applicationId, fileName, and contentType are required",
      });
    }

    const result = await createResumeUploadUrl({
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
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { applicationId, fileName, fileKey } = req.body;

    if (!applicationId || !fileName || !fileKey) {
      return res.status(400).json({
        message: "applicationId, fileName, and fileKey are required",
      });
    }

    const updatedApplication = await completeResumeUpload({
      applicationId,
      fileName,
      fileKey,
    });

    return res.status(200).json({
      message: "Resume uploaded successfully",
      application: updatedApplication,
    });
  } catch (error) {
    next(error);
  }
}