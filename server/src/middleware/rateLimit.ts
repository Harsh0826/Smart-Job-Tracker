import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "./auth";

const MAX_TRACKED_KEYS = 10_000;

type RateLimitOptions = {
  windowMs: number;
  max: number;
  name: string;
};

// Counts are kept in memory, so each server instance enforces its own limit.
export function rateLimit({ windowMs, max, name }: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  function removeExpired(now: number) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) {
        hits.delete(key);
      }
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req as AuthRequest).user?.id ?? req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });

      if (hits.size > MAX_TRACKED_KEYS) {
        removeExpired(now);
      }

      return next();
    }

    if (entry.count >= max) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);

      res.setHeader("Retry-After", retryAfterSeconds);
      return res.status(429).json({ message: `Too many ${name} requests. Try again later.` });
    }

    entry.count++;
    next();
  };
}
