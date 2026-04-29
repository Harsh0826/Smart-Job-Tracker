import { NextFunction, Response } from "express";
import { analyzeResumeAgainstJob, getLatestAnalysis } from "../services/aiAnalysis.service";
import { AuthRequest } from "../middleware/auth";

export async function analyzeResumeAgainstJobHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { applicationId } = req.body;

    if (!req.user?.id) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    if (!applicationId) {
      return res.status(400).json({
        message: "applicationId is required",
      });
    }

    const result = await analyzeResumeAgainstJob({
      userId: req.user.id,
      applicationId,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
export async function getLatestAnalysisHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const applicationIdParam = req.params.applicationId;
    const applicationId =
      Array.isArray(applicationIdParam) ? applicationIdParam[0] : applicationIdParam;

    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await getLatestAnalysis({
      userId: req.user.id,
      applicationId,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}