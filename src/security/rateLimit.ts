import type { Request, Response, NextFunction } from "express"

export interface RateLimitOptions {
  windowMs: number
  max: number
}

type Bucket = {
  count: number
  resetAt: number
}

/**
 * Simple in-memory IP rate limiter for private/self-hosted deployments.
 * Not suitable as the only control for a public internet-facing gateway.
 */
export const createRateLimiter = (options: RateLimitOptions) => {
  const buckets = new Map<string, Bucket>()

  const pruneExpired = (now: number): void => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    if (buckets.size > 10_000) pruneExpired(now)

    const key = req.ip || req.socket.remoteAddress || "unknown"
    const existing = buckets.get(key)

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs })
      res.setHeader("X-RateLimit-Limit", String(options.max))
      res.setHeader("X-RateLimit-Remaining", String(options.max - 1))
      next()
      return
    }

    if (existing.count >= options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
      res.setHeader("Retry-After", String(retryAfterSec))
      res.setHeader("X-RateLimit-Limit", String(options.max))
      res.setHeader("X-RateLimit-Remaining", "0")
      res.status(429).json({ error: "rate_limited" })
      return
    }

    existing.count += 1
    res.setHeader("X-RateLimit-Limit", String(options.max))
    res.setHeader("X-RateLimit-Remaining", String(options.max - existing.count))
    next()
  }
}
