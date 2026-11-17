import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "./auth";

/**
 * Fixed-window in-memory rate limiter keyed by user ID (or IP for unauthenticated routes).
 * Good enough for a single server instance; swap for a shared store if the API is scaled out.
 */
export function rateLimit({ windowMs, max, name }: { windowMs: number; max: number; name: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req as AuthRequest).user?.id ?? req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      return next();
    }
    if (entry.count >= max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ message: `Too many ${name} requests. Try again later.` });
    }
    entry.count++;
    next();
  };
}
