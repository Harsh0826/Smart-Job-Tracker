import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/apiError";

/**
 * Maps known errors to 4xx and hides database internals (details/hint/code) from clients in
 * production. Full errors are still logged server-side.
 */
export function errorHandler(error: any, req: Request, res: Response, _next: NextFunction) {
  const isProd = process.env.NODE_ENV === "production";

  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Invalid request", issues: error.flatten() });
  }
  if (error instanceof ApiError) {
    return res.status(error.status).json({ message: error.message, details: error.details ?? null });
  }
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Malformed JSON body" });
  }

  // PostgREST: no row for .single(); invalid uuid syntax; RPC "not found" raised by our SQL.
  const code = error?.code as string | undefined;
  if (code === "PGRST116" || code === "P0002") return res.status(404).json({ message: "Not found" });
  if (code === "22P02") return res.status(400).json({ message: "Invalid identifier" });
  if (code === "23505") return res.status(409).json({ message: "Duplicate record" });
  if (/not found|access denied|do not have access/i.test(error?.message ?? "")) {
    return res.status(404).json({ message: error.message });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}:`, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code,
  });

  return res.status(500).json({
    message: isProd ? "Internal server error" : error?.message || "Internal server error",
    ...(isProd ? {} : { details: error?.details ?? null, hint: error?.hint ?? null, code: code ?? null }),
  });
}
