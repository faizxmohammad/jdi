import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  clampScopesToRole,
  hasScope,
  requireScope,
  ScopeDeniedError,
  scopesForRole,
  scopesWithinRole,
} from "../src/org/scopes.js"
import { createOrgStore, loadOrgsFromFile, resolveOrgCatalogPath } from "../src/org/store.js"
import { createCredentialStore } from "../src/security/credentials.js"

describe("token scopes", () => {
  it("grants write implies read", () => {
    expect(hasScope(["catalog:write"], "catalog:read")).toBe(true)
    expect(hasScope(["memory:write"], "memory:read")).toBe(true)
    expect(hasScope(["catalog:read"], "catalog:write")).toBe(false)
  })

  it("admin implies all", () => {
    expect(hasScope(["admin"], "memory:write")).toBe(true)
    expect(hasScope(["admin"], "catalog:read")).toBe(true)
  })

  it("requireScope throws ScopeDeniedError", () => {
    expect(() => requireScope(["catalog:read"], "memory:write")).toThrow(ScopeDeniedError)
  })

  it("scopesForRole returns role ceilings", () => {
    expect(scopesForRole("viewer")).toEqual(["catalog:read", "memory:read"])
    expect(scopesForRole("member")).toContain("memory:write")
    expect(scopesForRole("member")).not.toContain("admin")
    expect(scopesForRole("admin")).toContain("admin")
  })

  it("viewer ceiling rejects admin/write scopes", () => {
    expect(scopesWithinRole(["catalog:read", "admin"], "viewer")).toBe(false)
    expect(clampScopesToRole(["catalog:read", "admin", "memory:write"], "viewer")).toEqual([
      "catalog:read",
    ])
  })
})

describe("org store", () => {
  it("loads membership and rejects duplicates", () => {
    const store = createOrgStore([
      {
        id: "acme",
        name: "Acme Eng",
        members: [
          { ownerId: "alice", role: "owner" },
          { ownerId: "bob", role: "member" },
        ],
        approvedChannels: ["stable"],
        requireApprovedVersions: true,
      },
    ])

    expect(store.resolveMembership("acme", "alice")?.role).toBe("owner")
    expect(store.listOrgsForOwner("bob")).toHaveLength(1)
    expect(store.getOrg("missing")).toBeUndefined()

    expect(() =>
      createOrgStore([
        {
          id: "dup",
          name: "Dup",
          members: [
            { ownerId: "a", role: "owner" },
            { ownerId: "a", role: "member" },
          ],
        },
      ]),
    ).toThrow(/Duplicate member/)
  })

  it("loads from file and resolves catalog path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "just-do-it-orgs-"))
    const file = path.join(dir, "orgs.json")
    writeFileSync(
      file,
      JSON.stringify({
        orgs: [
          {
            id: "team-a",
            name: "Team A",
            catalogPath: "./team-skills",
            members: [{ ownerId: "alice", role: "owner" }],
          },
        ],
      }),
    )

    const records = loadOrgsFromFile(file)
    expect(records).toHaveLength(1)
    const resolved = resolveOrgCatalogPath(records[0]!, dir)
    expect(resolved).toBe(path.resolve(dir, "./team-skills"))
  })
})

describe("credentials with org and scopes", () => {
  const orgStore = createOrgStore([
    {
      id: "acme",
      name: "Acme",
      members: [
        { ownerId: "alice", role: "owner" },
        { ownerId: "bob", role: "viewer" },
      ],
    },
  ])

  it("omitted scopes grant full access", () => {
    const store = createCredentialStore(
      [
        {
          id: "solo",
          token: "solo-token-xxxxxxxxxxxxxxxxxxxxxxx",
          ownerId: "alice",
          revoked: false,
        },
      ],
      { orgStore },
    )
    const result = store.authenticate("solo-token-xxxxxxxxxxxxxxxxxxxxxxx")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.principal.scopes).toContain("admin")
      expect(result.principal.orgId).toBeUndefined()
    }
  })

  it("binds orgId and role when member", () => {
    const store = createCredentialStore(
      [
        {
          id: "alice-team",
          token: "alice-team-token-xxxxxxxxxxxxxxxxxx",
          ownerId: "alice",
          orgId: "acme",
          scopes: ["catalog:read", "memory:write"],
          revoked: false,
        },
      ],
      { orgStore },
    )
    const result = store.authenticate("alice-team-token-xxxxxxxxxxxxxxxxxx")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.principal.orgId).toBe("acme")
      expect(result.principal.orgRole).toBe("owner")
      expect(result.principal.scopes).toEqual(["catalog:read", "memory:write"])
    }
  })

  it("fails closed when orgId set without orgs file", () => {
    expect(() =>
      createCredentialStore([
        {
          id: "bad",
          token: "bad-token-xxxxxxxxxxxxxxxxxxxxxxxx",
          ownerId: "alice",
          orgId: "acme",
          revoked: false,
        },
      ]),
    ).toThrow(/no orgs file/)
  })

  it("fails closed when owner is not an org member", () => {
    expect(() =>
      createCredentialStore(
        [
          {
            id: "intruder",
            token: "intruder-token-xxxxxxxxxxxxxxxxxxx",
            ownerId: "eve",
            orgId: "acme",
            revoked: false,
          },
        ],
        { orgStore },
      ),
    ).toThrow(/not a member/)
  })

  it("fails closed on unknown orgId", () => {
    expect(() =>
      createCredentialStore(
        [
          {
            id: "ghost",
            token: "ghost-token-xxxxxxxxxxxxxxxxxxxxxxx",
            ownerId: "alice",
            orgId: "unknown-org",
            revoked: false,
          },
        ],
        { orgStore },
      ),
    ).toThrow(/unknown orgId/)
  })

  it("fails closed when viewer credential requests admin scopes", () => {
    expect(() =>
      createCredentialStore(
        [
          {
            id: "viewer-escalation",
            token: "viewer-escalation-token-xxxxxxxxxxxxx",
            ownerId: "bob",
            orgId: "acme",
            scopes: ["catalog:read", "admin"],
            revoked: false,
          },
        ],
        { orgStore },
      ),
    ).toThrow(/scopes exceed org role/)
  })

  it("org-bound omitted scopes default to role ceiling not admin", () => {
    const store = createCredentialStore(
      [
        {
          id: "bob-default",
          token: "bob-default-token-xxxxxxxxxxxxxxxxxx",
          ownerId: "bob",
          orgId: "acme",
          revoked: false,
        },
      ],
      { orgStore },
    )
    const result = store.authenticate("bob-default-token-xxxxxxxxxxxxxxxxxx")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.principal.orgRole).toBe("viewer")
      expect(result.principal.scopes).toEqual(["catalog:read", "memory:read"])
      expect(result.principal.scopes).not.toContain("admin")
    }
  })
})
