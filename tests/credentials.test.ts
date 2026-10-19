import { describe, expect, it } from "vitest"
import { bindOwnerId, MemoryAuthzError } from "../src/memory/authorize.js"
import { ALL_SCOPES } from "../src/org/scopes.js"
import { defaultAuditLogger } from "../src/security/audit.js"
import { createCredentialStore } from "../src/security/credentials.js"

describe("credential store", () => {
  it("authenticates active tokens and binds ownerId", () => {
    const store = createCredentialStore([
      {
        id: "alice",
        token: "alice-token-xxxxxxxxxxxxxxxxxxxxxxx",
        ownerId: "alice",
        revoked: false,
      },
      {
        id: "bob",
        token: "bob-token-xxxxxxxxxxxxxxxxxxxxxxxxx",
        ownerId: "bob",
        revoked: false,
      },
    ])

    const alice = store.authenticate("alice-token-xxxxxxxxxxxxxxxxxxxxxxx")
    expect(alice.ok).toBe(true)
    if (alice.ok) {
      expect(alice.principal.credentialId).toBe("alice")
      expect(alice.principal.ownerId).toBe("alice")
      expect(alice.principal.scopes).toEqual([...ALL_SCOPES])
    }

    const bob = store.authenticate("bob-token-xxxxxxxxxxxxxxxxxxxxxxxxx")
    expect(bob.ok).toBe(true)
    if (bob.ok) expect(bob.principal.ownerId).toBe("bob")
  })

  it("treats revoked credentials as unauthorized", () => {
    const store = createCredentialStore([
      {
        id: "old",
        token: "old-token-xxxxxxxxxxxxxxxxxxxxxxxxx",
        ownerId: "alice",
        revoked: true,
      },
    ])
    expect(store.authenticate("old-token-xxxxxxxxxxxxxxxxxxxxxxxxx")).toEqual({
      ok: false,
      reason: "revoked",
    })
  })

  it("rejects duplicate token or id at construction", () => {
    expect(() =>
      createCredentialStore([
        {
          id: "a",
          token: "same-token-xxxxxxxxxxxxxxxxxxxxxxx",
          ownerId: "alice",
          revoked: false,
        },
        {
          id: "b",
          token: "same-token-xxxxxxxxxxxxxxxxxxxxxxx",
          ownerId: "bob",
          revoked: false,
        },
      ]),
    ).toThrow(/Duplicate credential token/)
  })
})

describe("bindOwnerId", () => {
  const principal = {
    credentialId: "primary",
    ownerId: "alice",
    scopes: [...ALL_SCOPES],
  }

  it("allows matching ownerId", () => {
    expect(bindOwnerId(principal, "alice")).toBe("alice")
  })

  it("denies spoofed ownerId", () => {
    expect(() => bindOwnerId(principal, "bob")).toThrow(MemoryAuthzError)
    expect(() => bindOwnerId(principal, "bob")).toThrow(
      /does not match authenticated principal/,
    )
  })
})

describe("audit logger", () => {
  it("serializes auth events without tokens or memory content keys", () => {
    const lines: unknown[] = []
    const original = console.info
    console.info = (...args: unknown[]) => {
      lines.push(args)
    }
    try {
      defaultAuditLogger({
        event: "auth_fail",
        remote: "127.0.0.1",
      })
      defaultAuditLogger({
        event: "owner_mismatch",
        credentialId: "primary",
        ownerId: "alice",
        clientOwnerId: "bob",
      })
    } finally {
      console.info = original
    }

    const serialized = JSON.stringify(lines)
    expect(serialized).toContain("auth_fail")
    expect(serialized).toContain("owner_mismatch")
    expect(serialized).not.toMatch(/Bearer\s+/i)
    expect(serialized).not.toContain("token")
    expect(serialized).not.toContain("content")
  })
})
