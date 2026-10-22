import { access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { evaluateRun } from "../src/eval/harness/evaluate.js"
import { loadScenarios, parseScenario } from "../src/eval/harness/loadScenario.js"
import { liveProviderFromEnv, OpenAICompatibleProvider, ScriptedProvider } from "../src/eval/harness/provider.js"
import { buildAgentPrompt } from "../src/eval/harness/prompt.js"
import { runScenario } from "../src/eval/harness/runner.js"
import type { AgentTurn, ModelProvider, Scenario, TranscriptEvent } from "../src/eval/harness/types.js"
import { SkillCatalog } from "../src/skills/catalog.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const catalog = new SkillCatalog({ catalogPath: path.join(root, "skills") })

const provider = (turns: AgentTurn[], id = "test", kind: "simulated" | "live" = "simulated"): ModelProvider => ({
  id,
  kind,
  async complete() {
    const next = turns.shift()
    if (!next) return { content: "", toolCalls: [], malformed: true }
    return next
  },
})

const baseScenario = (patch: Partial<Scenario>): Scenario => ({
  id: "unit",
  skillId: "smallest-change",
  title: "unit",
  task: "smallest change",
  contextNote: "Read the fixture.",
  fixtureFiles: { "fixtures/note.txt": "formatCurrency status: \"confirmed\"" },
  allowedTools: ["recommend_skills", "get_skill", "read_fixture", "run_command", "write_artifact"],
  maxTurns: 4,
  allowLiveExternal: false,
  acceptance: {
    mustCallTools: ["read_fixture"],
    mustCite: ["formatCurrency"],
    citeFromTools: ["read_fixture"],
    prohibited: [],
    deliverableIncludes: [],
    unsupportedClaims: [{ phrase: "tests passed", requiresTool: "run_command" }],
    forbidTools: [],
    artifactIncludes: [],
    recommendIncludes: [],
    evidenceBeforeFinal: true,
  },
  ...patch,
})

describe("skill execution harness", () => {
  it("blocks a live run when the model provider is not configured", async () => {
    const scenario = baseScenario({})
    const record = await runScenario({
      scenario,
      catalog,
      provider: liveProviderFromEnv({}),
      timeoutMs: 1000,
    })
    expect(record.status).toBe("blocked")
    expect(record.kind).toBe("live")
    expect(record.operationallyValidated).toBe(false)
    expect(record.reasons.join(" ")).toContain("JUST_DO_IT_EVAL_API_KEY")
    await expect(access(record.workspacePath)).rejects.toThrow()
  })

  it("fails closed on malformed model output and still removes the workspace", async () => {
    const record = await runScenario({
      scenario: baseScenario({}),
      catalog,
      provider: provider([{ content: "nope", toolCalls: [], malformed: true }]),
    })
    expect(record.status).toBe("fail")
    expect(record.reasons).toContain("malformed model output")
    expect(record.workspaceRemoved).toBe(true)
    await expect(access(record.workspacePath)).rejects.toThrow()
  })

  it("records a timeout instead of a pass", async () => {
    const slow: ModelProvider = {
      id: "slow",
      kind: "simulated",
      complete: () => new Promise(() => undefined),
    }
    const record = await runScenario({
      scenario: baseScenario({}),
      catalog,
      provider: slow,
      timeoutMs: 30,
    })
    expect(record.status).toBe("fail")
    expect(record.reasons).toContain("timeout")
    await expect(access(record.workspacePath)).rejects.toThrow()
  })

  it("blocks process execution and path escape", async () => {
    const record = await runScenario({
      scenario: baseScenario({
        acceptance: {
          ...baseScenario({}).acceptance,
          mustCallTools: [],
          mustCite: [],
          evidenceBeforeFinal: false,
        },
      }),
      catalog,
      provider: provider([
        {
          content: "",
          toolCalls: [
            { id: "1", name: "run_command", args: { command: "rm -rf /" } },
            { id: "2", name: "read_fixture", args: { path: "../package.json" } },
          ],
        },
        { content: "stopped", toolCalls: [] },
      ]),
    })
    expect(record.status).toBe("fail")
    expect(record.reasons.some((reason) => reason.includes("blocked"))).toBe(true)
    expect(JSON.stringify(record.transcript)).not.toContain("package.json scripts")
  })

  it("redacts secrets from tool arguments and the final answer", async () => {
    const secret = "super-secret-token-value"
    const record = await runScenario({
      scenario: baseScenario({
        fixtureFiles: { "fixtures/note.txt": "formatCurrency" },
        acceptance: {
          ...baseScenario({}).acceptance,
          mustCite: ["formatCurrency"],
          unsupportedClaims: [],
        },
      }),
      catalog,
      extraSecrets: [secret],
      provider: provider([
        {
          content: "",
          toolCalls: [{ id: "1", name: "read_fixture", args: { path: "fixtures/note.txt", note: secret } }],
        },
        { content: `done ${secret}`, toolCalls: [] },
      ]),
    })
    expect(JSON.stringify(record)).not.toContain(secret)
    expect(JSON.stringify(record)).toContain("[REDACTED]")
  })

  it("rejects an unsupported completion claim and a fabricated status", () => {
    const scenario = baseScenario({})
    const transcript: TranscriptEvent[] = [
      { kind: "tool", name: "read_fixture", outputRedacted: "formatCurrency status: \"confirmed\"" },
      { kind: "final", content: "x" },
    ]
    const reasons = evaluateRun({
      scenario,
      transcript,
      finalText: 'tests passed. status: "paid". formatCurrency',
      artifacts: {},
      toolOutputs: [{ name: "read_fixture", content: 'formatCurrency status: "confirmed"' }],
      loadedSkillIds: ["smallest-change"],
    })
    expect(reasons.some((reason) => reason.includes("unsupported claim"))).toBe(true)
    expect(reasons.some((reason) => reason.includes("fabricated status value: paid"))).toBe(true)
  })

  it("accepts two different diagnoses when both cite the same evidence", () => {
    const scenario = baseScenario({
      skillId: "hotel-booking-debugger",
      acceptance: {
        ...baseScenario({}).acceptance,
        mustCite: ["bk-100", "confirmed", "cancelled"],
        unsupportedClaims: [],
        mustCallTools: ["read_fixture"],
      },
    })
    const evidence = 'booking bk-100 status: "confirmed" room status: "cancelled"'
    const shared = {
      scenario,
      transcript: [
        { kind: "tool" as const, name: "read_fixture", outputRedacted: evidence },
        { kind: "final" as const, content: "x" },
      ],
      artifacts: {},
      toolOutputs: [{ name: "read_fixture", content: evidence }],
      loadedSkillIds: ["hotel-booking-debugger"],
    }
    const first = evaluateRun({
      ...shared,
      finalText: 'booking bk-100 status: "confirmed" and status: "cancelled" disagree because the room write won',
    })
    const second = evaluateRun({
      ...shared,
      finalText: 'booking bk-100 status: "confirmed" and status: "cancelled" disagree because a later writer restored the booking',
    })
    expect(first).toEqual([])
    expect(second).toEqual([])
  })

  it("does not put fixture evidence or acceptance text in the agent prompt", async () => {
    const scenarios = await loadScenarios(path.join(root, "eval/scenarios"))
    const partial = scenarios.find((item) => item.id === "hbd-partial-cancel")
    expect(partial).toBeDefined()
    const seen: string[] = []
    const wrapping: ModelProvider = {
      id: "inspect",
      kind: "simulated",
      async complete(request) {
        seen.push(request.system)
        return new ScriptedProvider(partial!.simulatedScript ?? []).complete()
      },
    }
    await runScenario({ scenario: partial!, provider: wrapping, catalog })
    expect(seen[0]).not.toContain("bk-100")
    expect(seen[0]).not.toContain("trace-hbd-1")
    expect(seen[0]).not.toContain("mustCite")
    expect(buildAgentPrompt(partial!, [])).not.toContain("rm-9")
  })

  it("runs the simulated batch through the real catalog", async () => {
    const scenarios = await loadScenarios(path.join(root, "eval/scenarios"))
    expect(scenarios).toHaveLength(13)
    const failures: string[] = []
    for (const scenario of scenarios) {
      const first = await runScenario({
        scenario,
        catalog,
        provider: new ScriptedProvider(scenario.simulatedScript ?? [], scenario.id),
      })
      const second = await runScenario({
        scenario,
        catalog,
        provider: new ScriptedProvider(scenario.simulatedScript ?? [], scenario.id),
      })
      if (first.status !== "pass") failures.push(`${scenario.id}: ${first.reasons.join(" | ")}`)
      expect(second.status).toBe(first.status)
      expect(second.finalText).toBe(first.finalText)
      expect(first.kind).toBe("simulated")
      expect(first.operationallyValidated).toBe(false)
    }
    expect(failures).toEqual([])
  })

  it("records a tool error without turning it into a pass", async () => {
    const record = await runScenario({
      scenario: baseScenario({
        allowedTools: ["get_skill", "read_fixture"],
        acceptance: {
          ...baseScenario({}).acceptance,
          mustCallTools: ["get_skill", "read_fixture"],
          mustCite: [],
          evidenceBeforeFinal: false,
        },
      }),
      catalog,
      provider: provider([
        { content: "", toolCalls: [{ id: "1", name: "missing_tool", args: {} }] },
        { content: "", toolCalls: [{ id: "2", name: "get_skill", args: { skillName: "not-a-real-skill" } }] },
        { content: "I could not read the skill.", toolCalls: [] },
      ]),
    })
    expect(record.status).toBe("fail")
    expect(record.transcript.some((event) => event.kind === "tool" && event.error)).toBe(true)
    expect(record.finalText).not.toContain("tests passed")
  })

  it("rejects a scenario file that is not an object", () => {
    expect(() => parseScenario({ id: "x" })).toThrow()
  })

  it("calls a configured live provider with a mock fetch and redacts the key", async () => {
    const key = "eval-live-key-0123456789"
    let sawAuth = ""
    const fetchImpl: typeof fetch = async (input, init) => {
      sawAuth = new Headers(init?.headers).get("authorization") ?? ""
      const body = JSON.parse(String(init?.body)) as { messages: unknown[] }
      expect(body.messages.length).toBeGreaterThan(0)
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: `token ${key}`, tool_calls: [] } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
        { status: 200 },
      )
    }
    const live = new OpenAICompatibleProvider({
      apiKey: key,
      baseUrl: "https://example.test/v1",
      model: "test-model",
      fetchImpl,
    })
    const scenario = baseScenario({
      fixtureFiles: { "fixtures/note.txt": "formatCurrency" },
      acceptance: { ...baseScenario({}).acceptance, unsupportedClaims: [] },
    })
    const record = await runScenario({
      scenario,
      catalog,
      provider: {
        id: live.id,
        kind: "live",
        complete: (request, signal) => live.complete(request, signal),
      },
      extraSecrets: [key],
    })
    expect(sawAuth).toBe(`Bearer ${key}`)
    expect(record.kind).toBe("live")
    expect(record.promptTokens).toBe(3)
    expect(record.usageSource).toBe("provider")
    expect(record.estimatedCostUsd).toBeNull()
    expect(JSON.stringify(record)).not.toContain(key)
    expect(record.operationallyValidated).toBe(false)
  })
})
