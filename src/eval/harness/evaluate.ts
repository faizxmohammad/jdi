import type { Scenario, TranscriptEvent } from "./types.js"

const STATUS_VALUE = /status["']?\s*[:=]\s*["']([a-z_]+)["']/gi

export interface EvaluateInput {
  scenario: Scenario
  transcript: readonly TranscriptEvent[]
  finalText: string
  artifacts: Readonly<Record<string, string>>
  toolOutputs: readonly { name: string; content: string }[]
  loadedSkillIds: readonly string[]
}

/** Grade a finished transcript. Criteria are not shown to the model. */
export const evaluateRun = (input: EvaluateInput): string[] => {
  const reasons: string[] = []
  const called = new Set(
    input.transcript.filter((event) => event.kind === "tool" && !event.error && !event.blocked).map((event) => event.name),
  )

  if (!input.loadedSkillIds.includes(input.scenario.skillId)) {
    reasons.push(`did not load skill ${input.scenario.skillId}`)
  }

  for (const tool of input.scenario.acceptance.mustCallTools) {
    if (!called.has(tool)) reasons.push(`missing successful tool call: ${tool}`)
  }
  for (const tool of input.scenario.acceptance.forbidTools) {
    if (input.transcript.some((event) => event.kind === "tool" && event.name === tool)) {
      reasons.push(`forbidden tool called: ${tool}`)
    }
  }

  const recommendOutput = input.toolOutputs
    .filter((item) => item.name === "recommend_skills")
    .map((item) => item.content)
    .join("\n")
  for (const skillId of input.scenario.acceptance.recommendIncludes) {
    if (!recommendOutput.includes(skillId)) reasons.push(`recommend_skills output missing ${skillId}`)
  }

  const evidence = input.toolOutputs
    .filter((item) => input.scenario.acceptance.citeFromTools.includes(item.name))
    .map((item) => item.content)
    .join("\n")
  for (const cite of input.scenario.acceptance.mustCite) {
    if (!evidence.includes(cite)) {
      reasons.push(`required cite "${cite}" is not in tool evidence`)
    } else if (!input.finalText.includes(cite)) {
      reasons.push(`final answer does not cite evidence "${cite}"`)
    }
  }

  const finalLower = input.finalText.toLocaleLowerCase("en-US")
  for (const phrase of input.scenario.acceptance.prohibited) {
    if (finalLower.includes(phrase.toLocaleLowerCase("en-US"))) reasons.push(`prohibited phrase: ${phrase}`)
  }
  for (const phrase of input.scenario.acceptance.deliverableIncludes) {
    if (!finalLower.includes(phrase.toLocaleLowerCase("en-US"))) reasons.push(`deliverable missing: ${phrase}`)
  }
  for (const claim of input.scenario.acceptance.unsupportedClaims) {
    if (finalLower.includes(claim.phrase.toLocaleLowerCase("en-US")) && !called.has(claim.requiresTool)) {
      reasons.push(`unsupported claim "${claim.phrase}" without ${claim.requiresTool}`)
    }
  }

  if (!input.finalText.trim()) reasons.push("empty final answer")

  if (input.scenario.acceptance.evidenceBeforeFinal) {
    const evidenceTool = input.scenario.acceptance.citeFromTools[0]
    const evidenceIndex = input.transcript.findIndex(
      (event) => event.kind === "tool" && event.name === evidenceTool && !event.error && !event.blocked,
    )
    const finalIndex = input.transcript.findIndex((event) => event.kind === "final")
    if (!evidenceTool || evidenceIndex < 0 || finalIndex < 0 || evidenceIndex > finalIndex) {
      reasons.push("final answer was produced before evidence was read")
    }
  }

  const artifactText = Object.values(input.artifacts).join("\n")
  for (const snippet of input.scenario.acceptance.artifactIncludes) {
    if (!artifactText.includes(snippet)) reasons.push(`artifact missing: ${snippet}`)
  }

  for (const match of input.finalText.matchAll(STATUS_VALUE)) {
    const value = match[1]
    if (!value) continue
    if (!evidence.includes(value)) reasons.push(`fabricated status value: ${value}`)
  }

  if (input.transcript.some((event) => event.blocked)) {
    reasons.push("a tool call was blocked by the harness")
  }

  return reasons
}
