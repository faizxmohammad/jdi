import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Server } from "node:http"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { config } from "../src/config.js"
import { createApp } from "../src/app.js"
import { MemoryService } from "../src/memory/service.js"
import { MemoryStore } from "../src/memory/store.js"
import { createCredentialStore } from "../src/security/credentials.js"
import { SkillCatalog } from "../src/skills/catalog.js"
import { closeServer, listenLoopback } from "./helpers/listen.js"

describe("HTTP app", () => {
  let root: string
  let server: Server
  let baseUrl: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-app-"))
    await fs.mkdir(path.join(root, "demo"))
    await fs.writeFile(
      path.join(root, "demo", "SKILL.md"),
      "---\nname: demo\ndescription: Demo skill\nsourceId: just-do-it-local\n---\n\n# Demo\n",
      "utf8",
    )
    await fs.writeFile(path.join(root, "VERSION"), "9.9.9\n", "utf8")

    const memoryStore = new MemoryStore({ dbPath: ":memory:" })
    const app = createApp({
      catalog: new SkillCatalog({ catalogPath: root }),
      memory: new MemoryService({ store: memoryStore }),
      rateLimitWindowMs: 60_000,
      rateLimitMax: 100,
    })
    // Wait for listening — avoids /health/* races before the socket is ready.
    const bound = await listenLoopback(app)
    server = bound.server
    baseUrl = bound.baseUrl
  })

  afterEach(async () => {
    await closeServer(server)
    await fs.rm(root, { recursive: true, force: true })
  })

  it("serves live and ready health checks without auth", async () => {
    expect((await fetch(`${baseUrl}/health/live`)).status).toBe(200)
    expect((await fetch(`${baseUrl}/health/ready`)).status).toBe(200)
  })

  it("refuses to construct an app in public deployment mode", () => {
    expect(() =>
      createApp({
        catalog: new SkillCatalog({ catalogPath: root }),
        memory: new MemoryService({ store: new MemoryStore({ dbPath: ":memory:" }) }),
        deploymentMode: "public",
      }),
    ).toThrow(/public is not enabled/)
  })

  it("rejects oversized JSON bodies with a JSON error", async () => {
    const memoryStore = new MemoryStore({ dbPath: ":memory:" })
    const app = createApp({
      catalog: new SkillCatalog({ catalogPath: root }),
      memory: new MemoryService({ store: memoryStore }),
      jsonBodyLimit: "200b",
      rateLimitWindowMs: 60_000,
      rateLimitMax: 100,
    })
    const { server: limitedServer, baseUrl: limitedUrl } = await listenLoopback(app)

    try {
      const pad = "x".repeat(400)
      const response = await fetch(`${limitedUrl}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${config.JUST_DO_IT_TOKEN}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "0.0.1" },
            pad,
          },
        }),
      })
      expect(response.status).toBe(413)
      expect(await response.json()).toEqual({ error: "payload_too_large" })
    } finally {
      await closeServer(limitedServer)
    }
  })

  it("rejects unauthenticated MCP requests", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.1" },
        },
      }),
    })
    expect(response.status).toBe(401)
  })

  it("initializes MCP and lists tools with a valid token", async () => {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${config.JUST_DO_IT_TOKEN}`,
    }

    const init = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.1" },
        },
      }),
    })
    expect(init.status).toBe(200)
    const initBody = (await init.json()) as { result?: { serverInfo?: { name?: string } } }
    expect(initBody.result?.serverInfo?.name).toBe("just-do-it")

    const tools = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      }),
    })
    expect(tools.status).toBe(200)
    const toolsBody = (await tools.json()) as {
      result?: { tools?: Array<{ name: string }> }
    }
    const names = (toolsBody.result?.tools ?? []).map((tool) => tool.name).sort()
    expect(names).toEqual([
      "delete_project_memory",
      "export_project_memory",
      "get_project_context",
      "get_skill",
      "just_do_it_version",
      "list_project_memory",
      "recommend_skills",
      "save_project_context",
      "search_project_memory",
      "search_skills",
    ])
  })

  it("saves and retrieves project memory via MCP tools/call with bound owner", async () => {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${config.JUST_DO_IT_TOKEN}`,
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
          clientInfo: { name: "test", version: "0.0.1" },
        },
      }),
    })

    const save = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "save_project_context",
          arguments: {
            ownerId: "owner-a",
            projectId: "proj-1",
            recordType: "decision",
            content: "Use Flyway for all database schema migrations",
            verificationStatus: "verified",
          },
        },
      }),
    })
    expect(save.status).toBe(200)
    const saveBody = (await save.json()) as {
      result?: { content?: Array<{ text?: string }>; isError?: boolean }
    }
    expect(saveBody.result?.isError).toBeFalsy()
    const saved = JSON.parse(saveBody.result?.content?.[0]?.text ?? "{}") as {
      saved: { id: string }
    }
    expect(saved.saved.id).toBeTruthy()

    const get = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_project_context",
          arguments: {
            ownerId: "owner-a",
            projectId: "proj-1",
            task: "How do we handle database migrations?",
          },
        },
      }),
    })
    const getBody = (await get.json()) as {
      result?: { content?: Array<{ text?: string }> }
    }
    const ctx = JSON.parse(getBody.result?.content?.[0]?.text ?? "{}") as {
      records: Array<{ content: string }>
      note: string
    }
    expect(ctx.records.some((r) => r.content.includes("Flyway"))).toBe(true)
    expect(ctx.note).toMatch(/does not scrape/i)

    // Spoofing another ownerId under the same token must fail closed (Phase 5).
    const spoof = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "search_project_memory",
          arguments: {
            ownerId: "owner-b",
            projectId: "proj-1",
            query: "Flyway",
          },
        },
      }),
    })
    const spoofBody = (await spoof.json()) as {
      result?: { content?: Array<{ text?: string }>; isError?: boolean }
    }
    expect(spoofBody.result?.isError).toBe(true)
    expect(spoofBody.result?.content?.[0]?.text).toMatch(/does not match authenticated principal/)
  })

  it("isolates memory across per-token owners and blocks revoked tokens", async () => {
    const aliceToken = "alice-token-xxxxxxxxxxxxxxxxxxxxxxx"
    const bobToken = "bob-token-xxxxxxxxxxxxxxxxxxxxxxxxx"
    const revokedToken = "revoked-token-xxxxxxxxxxxxxxxxxxxxxxx"
    const memoryStore = new MemoryStore({ dbPath: ":memory:" })
    const app = createApp({
      catalog: new SkillCatalog({ catalogPath: root }),
      memory: new MemoryService({ store: memoryStore }),
      credentials: createCredentialStore([
        { id: "alice", token: aliceToken, ownerId: "alice", revoked: false },
        { id: "bob", token: bobToken, ownerId: "bob", revoked: false },
        { id: "old", token: revokedToken, ownerId: "alice", revoked: true },
      ]),
      rateLimitWindowMs: 60_000,
      rateLimitMax: 100,
    })
    const { server: multiServer, baseUrl: multiUrl } = await listenLoopback(app)

    const mcpCall = async (token: string, id: number, name: string, args: Record<string, unknown>) => {
      const headers = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
      }
      await fetch(`${multiUrl}/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: id * 10,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "0.0.1" },
          },
        }),
      })
      return fetch(`${multiUrl}/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      })
    }

    try {
      const save = await mcpCall(aliceToken, 1, "save_project_context", {
        ownerId: "alice",
        projectId: "shared-name",
        recordType: "decision",
        content: "Alice-only secret decision about Flyway",
        verificationStatus: "verified",
      })
      expect(save.status).toBe(200)

      const bobSearch = await mcpCall(bobToken, 2, "search_project_memory", {
        ownerId: "bob",
        projectId: "shared-name",
        query: "Flyway",
      })
      const bobBody = (await bobSearch.json()) as {
        result?: { content?: Array<{ text?: string }>; isError?: boolean }
      }
      expect(bobBody.result?.isError).toBeFalsy()
      const bobPayload = JSON.parse(bobBody.result?.content?.[0]?.text ?? "{}") as {
        records: unknown[]
      }
      expect(bobPayload.records).toHaveLength(0)

      const revoked = await fetch(`${multiUrl}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${revokedToken}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 99,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "0.0.1" },
          },
        }),
      })
      expect(revoked.status).toBe(401)
    } finally {
      await closeServer(multiServer)
    }
  })

  it("returns skill content with digest and provenance via tools/call", async () => {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${config.JUST_DO_IT_TOKEN}`,
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
          clientInfo: { name: "test", version: "0.0.1" },
        },
      }),
    })

    const call = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_skill",
          arguments: { skillName: "demo" },
        },
      }),
    })
    expect(call.status).toBe(200)
    const body = (await call.json()) as {
      result?: { content?: Array<{ text?: string }>; isError?: boolean }
    }
    expect(body.result?.isError).toBeFalsy()
    const payload = JSON.parse(body.result?.content?.[0]?.text ?? "{}") as {
      id: string
      name: string
      sha256: string
      content: string
      provenance: { sourceId?: string }
    }
    expect(payload.id).toBe("demo")
    expect(payload.name).toBe("demo")
    expect(payload.provenance.sourceId).toBe("just-do-it-local")
    expect(payload.sha256).toBe(
      createHash("sha256").update(payload.content, "utf8").digest("hex"),
    )
  })
})
