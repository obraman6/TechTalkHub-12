import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const buckets = new Map<string, Bucket>();

  // Periodically prune expired buckets
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets.entries()) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, Math.max(30_000, options.windowMs)).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();

    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      res.status(429).json({
        error: options.message || 'Too many requests. Please wait a moment and try again.',
      });
      return;
    }

    current.count += 1;
    next();
  };
}
