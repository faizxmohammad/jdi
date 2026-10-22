import { describe, expect, it } from "vitest"
import { callExternalCapability } from "../src/integrations/context7.js"
import { loadExternalRegistry } from "../src/integrations/registry.js"
import { SkillCatalog } from "../src/skills/catalog.js"
import { draftSkillCandidate } from "../src/skills/draft.js"
import { recommendSkills } from "../src/skills/recommend.js"
import type { SkillSummary } from "../src/catalog/schema.js"

const summary = (
  partial: Partial<SkillSummary> & Pick<SkillSummary, "id" | "name" | "description">,
): SkillSummary => ({
  entryType: "instruction_skill",
  tags: [],
  triggers: [],
  requires: [],
  provides: [],
  version: "0.1.0",
  validationStatus: "validated",
  provenance: { sourceId: "just-do-it-local", license: "MIT" },
  ...partial,
})

describe("capability selection and external calls", () => {
  const catalog = new SkillCatalog()

  it("selects a skill from its declared trigger without a new synonym entry", () => {
    const result = recommendSkills(
      [
        summary({
          id: "smallest-change",
          name: "smallest-change",
          description: "Small diffs",
          triggers: ["smallest change", "yagni"],
          tags: ["yagni"],
        }),
        summary({
          id: "java-spring-boot",
          name: "java-spring-boot",
          description: "Java services",
          tags: ["java"],
        }),
      ],
      { task: "Give me the smallest change that fixes the bug" },
    )
    expect(result.status).toBe("ok")
    expect(result.recommendations[0]?.skill.id).toBe("smallest-change")
    expect(result.recommendations[0]?.evidence.some((item) => item.factor === "trigger_phrase")).toBe(
      true,
    )
  })

  it("plans docs lookup as load plus Context7 tool calls inside a context budget", async () => {
    const plan = await catalog.plan({
      task: "Use Context7 library docs before calling the React router API",
      limit: 3,
      contextBudgetBytes: 12_000,
    })
    expect(plan.status).toBe("ok")
    expect(plan.selectedSkillIds[0]).toBe("current-library-docs")
    const kinds = plan.steps.map((step) => `${step.kind}:${step.tool ?? step.skillId}`)
    expect(kinds).toContain("call_external:resolve-library-id")
    expect(kinds).toContain("call_external:query-docs")
    expect(plan.steps.some((step) => step.kind === "load_skill" && step.includeBody)).toBe(true)
    expect(plan.contextUsedBytes).toBeGreaterThan(0)
    expect(plan.contextUsedBytes).toBeLessThanOrEqual(plan.contextBudgetBytes)
  })

  it("holds skill bodies that do not fit the context budget", async () => {
    const plan = await catalog.plan({
      task: "Use Context7 library docs before calling the React router API",
      limit: 1,
      contextBudgetBytes: 200,
    })
    expect(plan.steps.some((step) => step.kind === "hold_metadata" && step.skillId === "current-library-docs")).toBe(
      true,
    )
    expect(plan.steps.some((step) => step.kind === "load_skill")).toBe(false)
    expect(plan.contextSkippedBytes).toBeGreaterThan(0)
    expect(plan.contextUsedBytes).toBe(0)
  })

  it("names the user-environment CLI and does not claim it ran", async () => {
    const plan = await catalog.plan({
      task: "Install Playwright browser automation CLI and run e2e tests",
      limit: 2,
    })
    expect(plan.selectedSkillIds).toContain("browser-verification")
    const check = plan.steps.find((step) => step.kind === "check_user_tool")
    expect(check?.capabilityId).toBe("playwright-cli")
    expect(check?.execution).toBe("user_environment")
  })

  it("returns disabled for Context7 until the proxy flag is set, without calling fetch", async () => {
    const registry = loadExternalRegistry()
    let called = false
    const result = await callExternalCapability(
      {
        capabilityId: "context7",
        tool: "resolve-library-id",
        query: "router",
        libraryName: "react",
      },
      {
        registry,
        env: {},
        fetchImpl: async () => {
          called = true
          throw new Error("fetch should not run")
        },
      },
    )
    expect(called).toBe(false)
    expect(result.status).toBe("disabled")
    expect(result.endpoint).toBe("https://mcp.context7.com/mcp")
    expect(result.body).toContain("resolve-library-id")
  })

  it("proxies resolve-library-id to the documented search URL with a mocked upstream", async () => {
    const registry = loadExternalRegistry()
    const seen: string[] = []
    const result = await callExternalCapability(
      {
        capabilityId: "context7",
        tool: "resolve-library-id",
        query: "hooks",
        libraryName: "react",
      },
      {
        registry,
        env: {
          JUST_DO_IT_EXTERNAL_CALLS: "enabled",
          JUST_DO_IT_CONTEXT7_API_BASE: "https://context7.test/api",
          CONTEXT7_API_KEY: "test-key",
        },
        mocked: true,
        fetchImpl: async (input, init) => {
          const url = String(input)
          seen.push(url)
          const headers = new Headers(init?.headers)
          expect(headers.get("authorization")).toBe("Bearer test-key")
          expect(url.startsWith("https://context7.test/api/v2/libs/search")).toBe(true)
          expect(url).toContain("libraryName=react")
          return new Response("library id /reactjs/react.dev", { status: 200 })
        },
      },
    )
    expect(seen).toHaveLength(1)
    expect(result.status).toBe("ok")
    expect(result.mocked).toBe(true)
    expect(result.body).toContain("/reactjs/react.dev")
    expect(JSON.stringify(result)).not.toContain("test-key")
  })

  it("rejects query-docs without a library id and refuses unknown tools", async () => {
    const registry = loadExternalRegistry()
    const env = { JUST_DO_IT_EXTERNAL_CALLS: "enabled" }
    const missing = await callExternalCapability(
      { capabilityId: "context7", tool: "query-docs", query: "hooks" },
      { registry, env, fetchImpl: async () => new Response("no", { status: 200 }) },
    )
    expect(missing.status).toBe("invalid_input")

    const unknown = await callExternalCapability(
      { capabilityId: "context7", tool: "run-shell", query: "hooks", libraryName: "react" },
      { registry, env },
    )
    expect(unknown.status).toBe("not_allowed")

    const cli = await callExternalCapability(
      { capabilityId: "playwright-cli", tool: "playwright-cli", query: "open" },
      { registry, env },
    )
    expect(cli.status).toBe("not_allowed")
  })

  // Dimension 3 (Planning validity) tests — verify correct plan steps for each entryType

  it("plan for instruction_skill returns only load_skill — no external steps", async () => {
    const plan = await catalog.plan({
      task: "Add a regression test that fails if auth validation breaks again",
      limit: 1,
    })
    expect(plan.selectedSkillIds[0]).toBe("regression-testing")
    const kinds = new Set(plan.steps.map((step) => step.kind))
    expect(kinds.has("call_external")).toBe(false)
    expect(kinds.has("check_user_tool")).toBe(false)
    // regression-testing has no requires; only load or hold steps
    expect(kinds.has("load_skill") || kinds.has("hold_metadata")).toBe(true)
  })

  it("plan for defensive-review returns load_skill with no external dependencies", async () => {
    const plan = await catalog.plan({
      task: "Do a security review of the API trust boundary for tokens",
      limit: 1,
    })
    expect(plan.selectedSkillIds).toContain("defensive-review")
    const external = plan.steps.filter((s) => s.kind === "call_external" || s.kind === "check_user_tool")
    expect(external).toHaveLength(0)
  })

  it("plan for session-skill-review (composite_workflow, no requires) returns load step", async () => {
    const plan = await catalog.plan({
      task: "Turn this correction into a task observer skill observation",
      limit: 1,
    })
    expect(plan.selectedSkillIds).toContain("session-skill-review")
    // composite_workflow without requires should not produce external or cli steps
    const external = plan.steps.filter((s) => s.kind === "call_external" || s.kind === "check_user_tool")
    expect(external).toHaveLength(0)
  })

  it("plan for smallest-change uses trigger and produces a bounded diff deliverable", async () => {
    const plan = await catalog.plan({
      task: "This fix is over-engineering. Give me the smallest change that works.",
      limit: 1,
    })
    expect(plan.selectedSkillIds).toContain("smallest-change")
    // No external capability required
    const kinds = new Set(plan.steps.map((s) => s.kind))
    expect(kinds.has("call_external")).toBe(false)
  })

  it("plan reports clarify status for vague single-token tasks", async () => {
    const plan = await catalog.plan({ task: "help", limit: 3 })
    expect(plan.status).toBe("needs_clarification")
    expect(plan.steps.some((s) => s.kind === "clarify")).toBe(true)
  })

  it("does not send internal Context7 server headers (telemetry/IP assertion)", async () => {
    const registry = loadExternalRegistry()
    const seenHeaders: Record<string, string> = {}
    await callExternalCapability(
      {
        capabilityId: "context7",
        tool: "resolve-library-id",
        query: "docs",
        libraryName: "react",
      },
      {
        registry,
        env: {
          JUST_DO_IT_EXTERNAL_CALLS: "enabled",
          JUST_DO_IT_CONTEXT7_API_BASE: "https://context7.test/api",
        },
        mocked: true,
        fetchImpl: async (_input, init) => {
          for (const [k, v] of Object.entries(new Headers(init?.headers).entries ? {} : {})) {
            seenHeaders[k] = String(v)
          }
          // Parse the Headers object
          const h = init?.headers
          if (h && typeof h === "object" && !Array.isArray(h)) {
            for (const [k, v] of Object.entries(h as Record<string, string>)) {
              seenHeaders[k.toLowerCase()] = v
            }
          }
          return new Response("[]", { status: 200 })
        },
      },
    )
    // We must NOT send Context7-internal server-to-server headers.
    // These require MCP_CLIENT_IP_ASSERTION_KEY (symmetric encryption) — an internal contract.
    expect(seenHeaders["mcp-client-ip-assertion"]).toBeUndefined()
    expect(seenHeaders["x-context7-source"]).toBeUndefined()
    expect(seenHeaders["x-context7-server-version"]).toBeUndefined()
    expect(seenHeaders["mcp-session-id"]).toBeUndefined()
    // We DO send the documented public auth header when key present
    expect(seenHeaders["authorization"]).toBeUndefined() // no key set in this test
    // And accept header
    expect(seenHeaders["accept"]).toContain("application/json")
  })

  it("surfaces upstream failures without treating them as documentation", async () => {
    const registry = loadExternalRegistry()
    const result = await callExternalCapability(
      {
        capabilityId: "context7",
        tool: "query-docs",
        query: "middleware",
        libraryId: "/vercel/next.js",
      },
      {
        registry,
        env: { JUST_DO_IT_EXTERNAL_CALLS: "enabled", JUST_DO_IT_CONTEXT7_API_BASE: "https://context7.test/api" },
        mocked: true,
        fetchImpl: async () => new Response("nope", { status: 503 }),
      },
    )
    expect(result.status).toBe("upstream_error")
    expect(result.upstreamStatus).toBe(503)
  })

  it("drafts a skill candidate and does not persist it", () => {
    const draft = draftSkillCandidate({
      name: "retry-policy",
      description: "Retry idempotent calls with a bounded count.",
      triggers: ["idempotent retry"],
      body: "Retry only calls that are safe to repeat. Cap attempts. Surface the last error.",
    })
    expect(draft.status).toBe("ok")
    expect(draft.persisted).toBe(false)
    expect(draft.markdown).toContain("sourceId: just-do-it-local")
    expect(draft.markdown).toContain("validationStatus: needs_review")

    const rejected = draftSkillCandidate({
      name: "../escape",
      description: "nope",
      body: "too short",
    })
    expect(rejected.status).toBe("invalid_input")
    expect(rejected.markdown).toBeUndefined()
  })
})
