import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { createOrgStore } from "../src/org/store.js"
import { createCredentialStore } from "../src/security/credentials.js"
import { SkillCatalog } from "../src/skills/catalog.js"
import { MemoryService } from "../src/memory/service.js"
import { MemoryStore } from "../src/memory/store.js"

const readerToken = "reader-token-xxxxxxxxxxxxxxxxxxxxxx"
const memberToken = "member-token-xxxxxxxxxxxxxxxxxxxxxx"
const teamCatalogToken = "team-catalog-token-xxxxxxxxxxxxxxxx"

describe("MCP scope enforcement via HTTP", () => {
  let baseUrl = ""
  let closeServer: (() => Promise<void>) | undefined

  beforeAll(async () => {
    const orgStore = createOrgStore([
      {
        id: "acme",
        name: "Acme",
        members: [
          { ownerId: "alice", role: "member" },
          { ownerId: "viewer", role: "viewer" },
        ],
        approvedChannels: ["stable", "beta"],
      },
    ])
    const credentials = createCredentialStore(
      [
        {
          id: "reader",
          token: readerToken,
          ownerId: "viewer",
          orgId: "acme",
          scopes: ["catalog:read"],
          revoked: false,
        },
        {
          id: "member",
          token: memberToken,
          ownerId: "alice",
          orgId: "acme",
          scopes: ["catalog:read", "memory:read", "memory:write"],
          revoked: false,
        },
      ],
      { orgStore },
    )

    const app = createApp({
      catalog: new SkillCatalog(),
      memory: new MemoryService({
        store: new MemoryStore({ dbPath: ":memory:" }),
        defaultRetentionDays: 0,
      }),
      credentials,
      orgStore,
    })
    const server = createServer(app)
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
    closeServer = () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
  })

  afterAll(async () => {
    await closeServer?.()
  })

  const mcpCall = async (token: string, name: string, args: Record<string, unknown>) => {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    }

    await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "scope-test", version: "0.0.1" },
        },
      }),
    })

    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    })
    expect(response.status).toBe(200)
    return (await response.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> }
    }
  }

  it("allows catalog:read search and denies memory:write for reader token", async () => {
    const search = await mcpCall(readerToken, "search_skills", { query: "", limit: 5 })
    expect(search.result?.isError).toBeFalsy()

    const save = await mcpCall(readerToken, "save_project_context", {
      ownerId: "viewer",
      projectId: "proj-1",
      recordType: "decision",
      content: "should fail",
    })
    expect(save.result?.isError).toBe(true)
    expect(save.result?.content?.[0]?.text).toMatch(/Missing required scope: memory:write/)
  })

  it("exposes team metadata on just_do_it_version", async () => {
    const version = await mcpCall(memberToken, "just_do_it_version", {})
    expect(version.result?.isError).toBeFalsy()
    const text = version.result?.content?.[0]?.text
    expect(text).toBeTruthy()
    const payload = JSON.parse(text!) as {
      capabilities: string[]
      auth: {
        orgId: string
        scopes: string[]
        team: { name: string; approvedChannels: string[] }
      }
    }
    expect(payload.capabilities).toContain("token_scopes")
    expect(payload.capabilities).toContain("team_org_foundation")
    expect(payload.auth.orgId).toBe("acme")
    expect(payload.auth.team.name).toBe("Acme")
    expect(payload.auth.team.approvedChannels).toEqual(["stable", "beta"])
  })
})

describe("MCP per-org private catalog path via HTTP", () => {
  let baseUrl = ""
  let closeServer: (() => Promise<void>) | undefined
  let tmpRoot = ""

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-org-catalog-"))
    const defaultRoot = path.join(tmpRoot, "default-skills")
    const teamRoot = path.join(tmpRoot, "team-skills")
    await fs.mkdir(path.join(defaultRoot, "default-only"), { recursive: true })
    await fs.mkdir(path.join(teamRoot, "team-only"), { recursive: true })
    await fs.writeFile(
      path.join(defaultRoot, "default-only", "SKILL.md"),
      "---\nname: default-only\ndescription: Default catalog skill\nsourceId: just-do-it-local\n---\n\n# Default\n",
      "utf8",
    )
    await fs.writeFile(
      path.join(teamRoot, "team-only", "SKILL.md"),
      "---\nname: team-only\ndescription: Private team catalog skill\nsourceId: just-do-it-local\n---\n\n# Team\n",
      "utf8",
    )
    await fs.writeFile(path.join(defaultRoot, "VERSION"), "1.0.0-default\n", "utf8")
    await fs.writeFile(path.join(teamRoot, "VERSION"), "1.0.0-team\n", "utf8")

    const orgStore = createOrgStore([
      {
        id: "acme-private",
        name: "Acme Private Catalog",
        catalogPath: teamRoot,
        members: [{ ownerId: "alice", role: "owner" }],
      },
    ])
    const credentials = createCredentialStore(
      [
        {
          id: "team-catalog",
          token: teamCatalogToken,
          ownerId: "alice",
          orgId: "acme-private",
          scopes: ["catalog:read"],
          revoked: false,
        },
      ],
      { orgStore },
    )

    const app = createApp({
      catalog: new SkillCatalog({ catalogPath: defaultRoot }),
      memory: new MemoryService({
        store: new MemoryStore({ dbPath: ":memory:" }),
        defaultRetentionDays: 0,
      }),
      credentials,
      orgStore,
    })
    const server = createServer(app)
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
    closeServer = () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
  })

  afterAll(async () => {
    await closeServer?.()
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  const mcpCall = async (name: string, args: Record<string, unknown>) => {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${teamCatalogToken}`,
    }

    await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "org-catalog-test", version: "0.0.1" },
        },
      }),
    })

    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    })
    expect(response.status).toBe(200)
    return (await response.json()) as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> }
    }
  }

  it("serves the org catalogPath skills, not the default catalog", async () => {
    const search = await mcpCall("search_skills", { query: "", limit: 20 })
    expect(search.result?.isError).toBeFalsy()
    const skills = JSON.parse(search.result?.content?.[0]?.text ?? "[]") as Array<{ id: string }>
    const ids = skills.map((s) => s.id)
    expect(ids).toContain("team-only")
    expect(ids).not.toContain("default-only")

    const version = await mcpCall("just_do_it_version", {})
    expect(version.result?.isError).toBeFalsy()
    const payload = JSON.parse(version.result?.content?.[0]?.text ?? "{}") as {
      catalogVersion?: string
      auth?: { team?: { privateCatalog?: boolean } }
    }
    expect(payload.catalogVersion).toBe("1.0.0-team")
    expect(payload.auth?.team?.privateCatalog).toBe(true)
  })
})
