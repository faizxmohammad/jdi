import express from "express"
import { describe, expect, it } from "vitest"
import { createRequireBearerAuth } from "../src/security/auth.js"
import { createCredentialStore } from "../src/security/credentials.js"
import { closeServer, listenLoopback } from "./helpers/listen.js"

const withAuth = async (
  headers: Record<string, string>,
  store = createCredentialStore([
    {
      id: "primary",
      token: "test-token-xxxxxxxxxxxxxxxxxxxxxxxx",
      ownerId: "owner-a",
      revoked: false,
    },
    {
      id: "revoked-cred",
      token: "revoked-token-xxxxxxxxxxxxxxxxxxxxxxx",
      ownerId: "owner-z",
      revoked: true,
    },
  ]),
): Promise<{ status: number; body: unknown }> => {
  const app = express()
  app.get(
    "/protected",
    createRequireBearerAuth({ credentials: store }),
    (req, res) => {
      res.status(200).json({ ok: true, ownerId: req.authPrincipal?.ownerId })
    },
  )

  const { server, baseUrl } = await listenLoopback(app)

  try {
    const response = await fetch(`${baseUrl}/protected`, { headers })
    const body = await response.json()
    return { status: response.status, body }
  } finally {
    await closeServer(server)
  }
}

describe("requireBearerAuth", () => {
  it("rejects missing and invalid tokens", async () => {
    expect((await withAuth({})).status).toBe(401)
    expect((await withAuth({ authorization: "Bearer wrong-token-xxxxxxxxxxxxxxxxxx" })).status).toBe(
      401,
    )
  })

  it("rejects revoked tokens", async () => {
    const result = await withAuth({
      authorization: "Bearer revoked-token-xxxxxxxxxxxxxxxxxxxxxxx",
    })
    expect(result.status).toBe(401)
  })

  it("allows a valid bearer token and exposes bound owner", async () => {
    const result = await withAuth({
      authorization: "Bearer test-token-xxxxxxxxxxxxxxxxxxxxxxxx",
    })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, ownerId: "owner-a" })
  })
})
