import { NextFunction, Request, Response } from "express";
import { analyzeResumeAgainstJob } from "../services/aiAnalysis.service";

export async function analyzeResumeAgainstJobHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        message: "applicationId is required",
      });
    }

    const result = await analyzeResumeAgainstJob({ applicationId });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}