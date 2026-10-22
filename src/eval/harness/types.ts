export type RunKind = "simulated" | "live"

export type RunStatus = "pass" | "fail" | "blocked"

export interface ToolDefinition {
  name: string
  description: string
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface AgentTurn {
  content: string
  toolCalls: ToolCall[]
  malformed?: boolean
  promptTokens?: number
  completionTokens?: number
}

export interface TranscriptEvent {
  kind: "model" | "tool" | "final"
  content?: string
  name?: string
  toolCallId?: string
  argsRedacted?: unknown
  outputRedacted?: string
  error?: string
  blocked?: boolean
  toolCalls?: Array<{ id: string; name: string; argsRedacted: unknown }>
}

export interface ProviderRequest {
  system: string
  task: string
  contextNote: string
  tools: ToolDefinition[]
  transcript: TranscriptEvent[]
}

export interface ModelProvider {
  id: string
  kind: RunKind
  complete(request: ProviderRequest, signal?: AbortSignal): Promise<AgentTurn>
}

export interface UnsupportedClaim {
  phrase: string
  requiresTool: string
}

export interface ScenarioAcceptance {
  mustCallTools: string[]
  mustCite: string[]
  citeFromTools: string[]
  prohibited: string[]
  deliverableIncludes: string[]
  unsupportedClaims: UnsupportedClaim[]
  forbidTools: string[]
  artifactIncludes: string[]
  recommendIncludes: string[]
  evidenceBeforeFinal: boolean
}

export interface ScriptStep {
  content?: string | undefined
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>
}

export interface Scenario {
  id: string
  skillId: string
  title: string
  task: string
  contextNote: string
  fixtureFiles: Record<string, string>
  allowedTools: string[]
  maxTurns: number
  allowLiveExternal: boolean
  acceptance: ScenarioAcceptance
  simulatedScript?: ScriptStep[] | undefined
}

export interface RunRecord {
  scenarioId: string
  skillId: string
  title: string
  kind: RunKind
  providerId: string
  status: RunStatus
  /** Simulated passes exercise the catalog and grader. They are not live-agent proof. */
  operationallyValidated: false
  reasons: string[]
  loadedSkillIds: string[]
  toolNames: string[]
  finalText: string
  transcript: TranscriptEvent[]
  artifacts: Record<string, string>
  durationMs: number
  promptTokens: number | null
  completionTokens: number | null
  estimatedCostUsd: null
  usageSource: "provider" | "unavailable"
  workspacePath: string
  workspaceRemoved: boolean
}
