import type { SkillSummary } from "../catalog/schema.js"
import type { ExternalCapability } from "../integrations/registry.js"
import type { RecommendResult, SkillRecommendation } from "./recommend.js"

export const DEFAULT_CONTEXT_BUDGET_BYTES = 12_000

export type PlanStepKind = "load_skill" | "call_external" | "check_user_tool" | "hold_metadata" | "clarify"

export interface PlanStep {
  order: number
  kind: PlanStepKind
  reason: string
  includeBody: boolean
  estimatedBytes: number
  skillId?: string
  capabilityId?: string
  tool?: string
  /** server_proxy calls Context7 from this process. client_mcp means the agent calls the documented endpoint. user_environment means a local CLI the server does not run. */
  execution?: "server_proxy" | "client_mcp" | "user_environment"
  missing: string[]
}

export interface CapabilityPlan {
  status: RecommendResult["status"]
  contextBudgetBytes: number
  contextUsedBytes: number
  contextSkippedBytes: number
  steps: PlanStep[]
  clarificationPrompt?: string
  rankingNotes: string[]
  selectedSkillIds: string[]
}

export interface PlanSkillBody {
  id: string
  bytes: number
}

export interface BuildPlanInput {
  recommendation: RecommendResult
  bodies: readonly PlanSkillBody[]
  capabilities: readonly ExternalCapability[]
  contextBudgetBytes?: number
  proxyEnabled: boolean
}

const capabilityById = (
  capabilities: readonly ExternalCapability[],
  id: string,
): ExternalCapability | undefined => capabilities.find((item) => item.id === id)

const pushExternalSteps = (
  steps: PlanStep[],
  skill: SkillSummary,
  capabilities: readonly ExternalCapability[],
  proxyEnabled: boolean,
): string[] => {
  const missing: string[] = []
  for (const required of skill.requires) {
    const capability = capabilityById(capabilities, required)
    if (!capability) {
      missing.push(required)
      continue
    }
    if (capability.kind === "external_mcp") {
      const execution = proxyEnabled ? "server_proxy" : "client_mcp"
      for (const tool of capability.tools) {
        steps.push({
          order: 0,
          kind: "call_external",
          reason: `${skill.id} requires ${capability.id}. Call ${tool.name} before treating library or API behavior as known.`,
          includeBody: false,
          estimatedBytes: 0,
          skillId: skill.id,
          capabilityId: capability.id,
          tool: tool.name,
          execution,
          missing: [],
        })
      }
      continue
    }
    steps.push({
      order: 0,
      kind: "check_user_tool",
      reason: `${skill.id} requires ${capability.id} in the user environment. This server does not install or run it.`,
      includeBody: false,
      estimatedBytes: 0,
      skillId: skill.id,
      capabilityId: capability.id,
      execution: "user_environment",
      missing: [],
    })
  }
  return missing
}

const renumber = (steps: PlanStep[]): PlanStep[] =>
  steps.map((step, index) => ({ ...step, order: index + 1 }))

/**
 * Turn a recommendation into an ordered workflow.
 * Skill bodies are loaded until the context budget is spent. Later matches stay metadata-only.
 * External tools are named, not executed here.
 */
export const buildCapabilityPlan = (input: BuildPlanInput): CapabilityPlan => {
  const budget = input.contextBudgetBytes ?? DEFAULT_CONTEXT_BUDGET_BYTES
  const bytesById = new Map(input.bodies.map((body) => [body.id, body.bytes]))
  const steps: PlanStep[] = []
  let used = 0
  let skipped = 0

  if (input.recommendation.clarificationPrompt && input.recommendation.recommendations.length === 0) {
    steps.push({
      order: 1,
      kind: "clarify",
      reason: input.recommendation.clarificationPrompt,
      includeBody: false,
      estimatedBytes: 0,
      missing: [],
    })
    return {
      status: input.recommendation.status,
      contextBudgetBytes: budget,
      contextUsedBytes: 0,
      contextSkippedBytes: 0,
      steps,
      clarificationPrompt: input.recommendation.clarificationPrompt,
      rankingNotes: input.recommendation.rankingNotes,
      selectedSkillIds: [],
    }
  }

  const selected: SkillRecommendation[] = input.recommendation.recommendations
  for (const item of selected) {
    const bytes = bytesById.get(item.skill.id) ?? 0
    const deferred: PlanStep[] = []
    const missing = pushExternalSteps(deferred, item.skill, input.capabilities, input.proxyEnabled)
    const fits = used + bytes <= budget
    if (fits && bytes > 0) {
      used += bytes
      steps.push({
        order: 0,
        kind: "load_skill",
        reason: item.explanation,
        includeBody: true,
        estimatedBytes: bytes,
        skillId: item.skill.id,
        missing,
      })
    } else {
      skipped += bytes
      steps.push({
        order: 0,
        kind: "hold_metadata",
        reason: `Metadata only. Loading ${item.skill.id} (${bytes} bytes) would pass the context budget of ${budget} bytes.`,
        includeBody: false,
        estimatedBytes: bytes,
        skillId: item.skill.id,
        missing,
      })
    }
    steps.push(...deferred)
  }

  if (input.recommendation.clarificationPrompt) {
    steps.push({
      order: 0,
      kind: "clarify",
      reason: input.recommendation.clarificationPrompt,
      includeBody: false,
      estimatedBytes: 0,
      missing: [],
    })
  }

  const plan: CapabilityPlan = {
    status: input.recommendation.status,
    contextBudgetBytes: budget,
    contextUsedBytes: used,
    contextSkippedBytes: skipped,
    steps: renumber(steps),
    rankingNotes: input.recommendation.rankingNotes,
    selectedSkillIds: selected.map((item) => item.skill.id),
  }
  if (input.recommendation.clarificationPrompt) {
    plan.clarificationPrompt = input.recommendation.clarificationPrompt
  }
  return plan
}
