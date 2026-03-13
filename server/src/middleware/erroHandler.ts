import { NextFunction, Request, Response } from "express";

export function errorHandler(
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("Server Error:");
  console.error("message:", error?.message);
  console.error("details:", error?.details);
  console.error("hint:", error?.hint);
  console.error("code:", error?.code);
  console.error("full error:", error);

  return res.status(500).json({
    message: error?.message || "Internal server error",
    details: error?.details || null,
    hint: error?.hint || null,
    code: error?.code || null,
  });
}