import type { AgentTurn, ModelProvider, ProviderRequest, ScriptStep } from "./types.js"

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProviderConfigError"
  }
}

export class ScriptedProvider implements ModelProvider {
  readonly kind = "simulated" as const
  private index = 0

  constructor(
    private readonly steps: readonly ScriptStep[],
    readonly id = "scripted",
  ) {}

  async complete(): Promise<AgentTurn> {
    const step = this.steps[this.index]
    this.index += 1
    if (!step) return { content: "", toolCalls: [], malformed: true }
    return {
      content: step.content ?? "",
      toolCalls: step.toolCalls.map((call, offset) => ({
        id: `${this.id}-${this.index}-${offset}`,
        name: call.name,
        args: call.args,
      })),
    }
  }
}

export class BlockedLiveProvider implements ModelProvider {
  readonly kind = "live" as const
  readonly id = "unconfigured"

  constructor(private readonly reason: string) {}

  async complete(): Promise<AgentTurn> {
    throw new ProviderConfigError(this.reason)
  }
}

export interface LiveProviderOptions {
  apiKey: string
  baseUrl: string
  model: string
  fetchImpl?: typeof fetch
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly kind = "live" as const
  readonly id = "openai-compatible"

  constructor(private readonly options: LiveProviderOptions) {}

  async complete(request: ProviderRequest, signal?: AbortSignal): Promise<AgentTurn> {
    const fetchImpl = this.options.fetchImpl ?? fetch
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: request.system },
      { role: "user", content: `${request.task}\n\n${request.contextNote}` },
    ]
    for (const event of request.transcript) {
      if (event.kind === "model" && event.toolCalls && event.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: event.content ?? "",
          tool_calls: event.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.argsRedacted ?? {}) },
          })),
        })
      } else if (event.kind === "tool" && event.toolCallId) {
        messages.push({
          role: "tool",
          tool_call_id: event.toolCallId,
          content: event.outputRedacted ?? event.error ?? "",
        })
      }
    }

    const init: RequestInit = {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        messages,
        tools: request.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: { type: "object", additionalProperties: true },
          },
        })),
      }),
    }
    if (signal) init.signal = signal
    const response = await fetchImpl(
      new URL("chat/completions", this.options.baseUrl.endsWith("/") ? this.options.baseUrl : `${this.options.baseUrl}/`),
      init,
    )

    const raw = await response.text()
    if (!response.ok) {
      return { content: "", toolCalls: [], malformed: true }
    }
    let parsed: ChatResponse
    try {
      parsed = JSON.parse(raw) as ChatResponse
    } catch {
      return { content: "", toolCalls: [], malformed: true }
    }
    const message = parsed.choices?.[0]?.message
    if (!message) return { content: "", toolCalls: [], malformed: true }
    const toolCalls = []
    for (const call of message.tool_calls ?? []) {
      if (!call.function?.name || !call.id) return { content: "", toolCalls: [], malformed: true }
      try {
        const args = call.function.arguments ? (JSON.parse(call.function.arguments) as unknown) : {}
        if (!args || typeof args !== "object" || Array.isArray(args)) {
          return { content: "", toolCalls: [], malformed: true }
        }
        toolCalls.push({ id: call.id, name: call.function.name, args: args as Record<string, unknown> })
      } catch {
        return { content: "", toolCalls: [], malformed: true }
      }
    }
    const turn: AgentTurn = {
      content: message.content ?? "",
      toolCalls,
    }
    if (typeof parsed.usage?.prompt_tokens === "number") turn.promptTokens = parsed.usage.prompt_tokens
    if (typeof parsed.usage?.completion_tokens === "number") turn.completionTokens = parsed.usage.completion_tokens
    return turn
  }
}

export const liveProviderFromEnv = (env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): ModelProvider => {
  const apiKey = env.JUST_DO_IT_EVAL_API_KEY?.trim()
  const baseUrl = env.JUST_DO_IT_EVAL_BASE_URL?.trim()
  const model = env.JUST_DO_IT_EVAL_MODEL?.trim()
  if (!apiKey || !baseUrl || !model) {
    return new BlockedLiveProvider(
      "Live model is not configured. Set JUST_DO_IT_EVAL_API_KEY, JUST_DO_IT_EVAL_BASE_URL, and JUST_DO_IT_EVAL_MODEL.",
    )
  }
  return new OpenAICompatibleProvider({ apiKey, baseUrl, model, ...(fetchImpl ? { fetchImpl } : {}) })
}
