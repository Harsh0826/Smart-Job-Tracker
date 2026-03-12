import { NextFunction, Request, Response } from "express";

export function errorHandler(
  error: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("Server Error:", error);

  return res.status(500).json({
    message: error?.message || "Internal server error",
    details: error?.details || null,
  });
}