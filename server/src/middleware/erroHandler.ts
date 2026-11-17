import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/apiError";

export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const isProd = process.env.NODE_ENV === "production";

  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Invalid request", issues: error.flatten() });
  }

  if (error instanceof ApiError) {
    return res.status(error.status).json({
      message: error.message,
      details: error.details ?? null,
    });
  }

  if (error?.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }

  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Malformed JSON body" });
  }

  const code = error?.code as string | undefined;

  // PGRST116 is .single() finding no row; P0002 is the "not found" raised by our SQL functions.
  if (code === "PGRST116" || code === "P0002") {
    return res.status(404).json({ message: "Not found" });
  }

  // Invalid uuid syntax.
  if (code === "22P02") {
    return res.status(400).json({ message: "Invalid identifier" });
  }

  // Unique constraint violation.
  if (code === "23505") {
    return res.status(409).json({ message: "Duplicate record" });
  }

  if (/not found|access denied|do not have access/i.test(error?.message ?? "")) {
    return res.status(404).json({ message: error.message });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}:`, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code,
  });

  // Database details stay in the server log in production.
  if (isProd) {
    return res.status(500).json({ message: "Internal server error" });
  }

  return res.status(500).json({
    message: error?.message || "Internal server error",
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    code: code ?? null,
  });
}
