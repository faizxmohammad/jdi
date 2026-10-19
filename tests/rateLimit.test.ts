import express from "express"
import { describe, expect, it } from "vitest"
import { createRateLimiter } from "../src/security/rateLimit.js"
import { closeServer, listenLoopback } from "./helpers/listen.js"

describe("createRateLimiter", () => {
  it("returns 429 after exceeding max requests in the window", async () => {
    const app = express()
    app.get("/limited", createRateLimiter({ windowMs: 60_000, max: 2 }), (_req, res) => {
      res.status(200).json({ ok: true })
    })

    const { server, baseUrl } = await listenLoopback(app)

    try {
      const url = `${baseUrl}/limited`
      expect((await fetch(url)).status).toBe(200)
      expect((await fetch(url)).status).toBe(200)
      const limited = await fetch(url)
      expect(limited.status).toBe(429)
      expect(await limited.json()).toEqual({ error: "rate_limited" })
      expect(limited.headers.get("retry-after")).toBeTruthy()
    } finally {
      await closeServer(server)
    }
  })
})
