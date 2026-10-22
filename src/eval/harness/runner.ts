import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { SkillCatalog } from "../../skills/catalog.js"
import { evaluateRun } from "./evaluate.js"
import { buildAgentPrompt } from "./prompt.js"
import { ProviderConfigError } from "./provider.js"
import { collectSecrets, redactText, redactValue } from "./redact.js"
import { HARNESS_TOOLS, dispatchTool, resolveInside } from "./tools.js"
import type { AgentTurn, ModelProvider, RunRecord, Scenario, TranscriptEvent } from "./types.js"

export interface RunScenarioOptions {
  scenario: Scenario
  provider: ModelProvider
  catalog: SkillCatalog
  timeoutMs?: number
  extraSecrets?: readonly string[]
}

const withTimeout = async (
  start: (signal: AbortSignal) => Promise<AgentTurn>,
  timeoutMs: number,
): Promise<AgentTurn> => {
  const controller = new AbortController()
  let timer: NodeJS.Timeout
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      const error = new Error("timeout")
      error.name = "TimeoutError"
      reject(error)
    }, timeoutMs)
  })
  const work = start(controller.signal).catch((error: unknown) => {
    if (controller.signal.aborted) return new Promise<AgentTurn>(() => undefined)
    throw error
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

const emptyRecord = (
  scenario: Scenario,
  provider: ModelProvider,
  workspacePath: string,
  started: number,
  patch: Partial<RunRecord>,
): RunRecord => ({
  scenarioId: scenario.id,
  skillId: scenario.skillId,
  title: scenario.title,
  kind: provider.kind,
  providerId: provider.id,
  status: "fail",
  operationallyValidated: false,
  reasons: [],
  loadedSkillIds: [],
  toolNames: [],
  finalText: "",
  transcript: [],
  artifacts: {},
  durationMs: Date.now() - started,
  promptTokens: null,
  completionTokens: null,
  estimatedCostUsd: null,
  usageSource: "unavailable",
  workspacePath,
  workspaceRemoved: false,
  ...patch,
})

export const runScenario = async (options: RunScenarioOptions): Promise<RunRecord> => {
  const started = Date.now()
  const { scenario, provider, catalog } = options
  const secrets = collectSecrets(options.extraSecrets)
  const timeoutMs = options.timeoutMs ?? 15_000
  const workspace = await mkdtemp(path.join(os.tmpdir(), "jdi-eval-"))
  let record: RunRecord | undefined

  try {
    for (const [relativePath, content] of Object.entries(scenario.fixtureFiles)) {
      const target = resolveInside(workspace, relativePath)
      if (!target) {
        record = emptyRecord(scenario, provider, workspace, started, {
          reasons: [`fixture path escapes workspace: ${relativePath}`],
        })
        return record
      }
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, content, "utf8")
    }

    const tools = HARNESS_TOOLS.filter((tool) => scenario.allowedTools.includes(tool.name))
    const system = buildAgentPrompt(scenario, tools)
    const transcript: TranscriptEvent[] = []
    const toolOutputs: Array<{ name: string; content: string }> = []
    const artifacts: Record<string, string> = {}
    const loadedSkillIds: string[] = []
    let finalText = ""
    let stopReason = ""
    let promptTokens: number | null = null
    let completionTokens: number | null = null

    for (let turn = 0; turn < scenario.maxTurns; turn += 1) {
      let agentTurn: AgentTurn
      try {
        agentTurn = await withTimeout(
          (signal) =>
            provider.complete(
              { system, task: scenario.task, contextNote: scenario.contextNote, tools, transcript },
              signal,
            ),
          timeoutMs,
        )
      } catch (error) {
        if (error instanceof ProviderConfigError) {
          record = emptyRecord(scenario, provider, workspace, started, {
            status: "blocked",
            reasons: [error.message],
          })
          return record
        }
        stopReason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : error instanceof Error ? error.message : "provider failed"
        break
      }

      if (typeof agentTurn.promptTokens === "number") promptTokens = (promptTokens ?? 0) + agentTurn.promptTokens
      if (typeof agentTurn.completionTokens === "number") {
        completionTokens = (completionTokens ?? 0) + agentTurn.completionTokens
      }

      if (agentTurn.malformed || !Array.isArray(agentTurn.toolCalls)) {
        stopReason = "malformed model output"
        break
      }

      const badCall = agentTurn.toolCalls.find((call) => !call.name || !call.args || typeof call.args !== "object" || Array.isArray(call.args))
      if (badCall) {
        stopReason = "malformed model output"
        break
      }

      if (agentTurn.toolCalls.length === 0) {
        finalText = redactText(agentTurn.content, secrets)
        transcript.push({ kind: "final", content: finalText })
        break
      }

      transcript.push({
        kind: "model",
        content: redactText(agentTurn.content, secrets),
        toolCalls: agentTurn.toolCalls.map((call) => ({
          id: call.id,
          name: call.name,
          argsRedacted: redactValue(call.args, secrets),
        })),
      })

      for (const call of agentTurn.toolCalls) {
        const result = await dispatchTool(call.name, call.args, { scenario, catalog, workspace })
        const outputRedacted = redactText(result.content, secrets)
        transcript.push({
          kind: "tool",
          name: call.name,
          toolCallId: call.id,
          argsRedacted: redactValue(call.args, secrets),
          outputRedacted,
          ...(result.ok ? {} : { error: outputRedacted }),
          ...(result.blocked ? { blocked: true } : {}),
        })
        if (result.ok) toolOutputs.push({ name: call.name, content: result.content })
        if (call.name === "get_skill" && typeof call.args.skillName === "string" && result.ok) {
          loadedSkillIds.push(call.args.skillName)
        }
        if (call.name === "write_artifact" && result.ok && typeof call.args.path === "string" && typeof call.args.content === "string") {
          artifacts[call.args.path] = call.args.content
        }
      }
    }

    if (!finalText && !stopReason) stopReason = "max turns exceeded"

    const reasons = [
      ...(stopReason ? [stopReason] : []),
      ...evaluateRun({ scenario, transcript, finalText, artifacts, toolOutputs, loadedSkillIds }),
    ]
    const toolNames = transcript.filter((event) => event.kind === "tool").map((event) => event.name ?? "")

    record = emptyRecord(scenario, provider, workspace, started, {
      status: reasons.length === 0 ? "pass" : "fail",
      reasons,
      loadedSkillIds,
      toolNames,
      finalText,
      transcript,
      artifacts,
      promptTokens,
      completionTokens,
      usageSource: promptTokens === null && completionTokens === null ? "unavailable" : "provider",
    })
    return record
  } finally {
    await rm(workspace, { recursive: true, force: true })
    if (record) record.workspaceRemoved = true
  }
}
