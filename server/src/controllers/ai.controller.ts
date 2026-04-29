import { NextFunction, Response } from "express";
import { analyzeResumeAgainstJob } from "../services/aiAnalysis.service";
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