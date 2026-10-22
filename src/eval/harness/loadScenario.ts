import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

const scriptStepSchema = z.object({
  content: z.string().optional(),
  toolCalls: z
    .array(
      z.object({
        name: z.string().min(1),
        args: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .default([]),
})

const scenarioSchema = z.object({
  id: z.string().min(1),
  skillId: z.string().min(1),
  title: z.string().min(1),
  task: z.string().min(1),
  contextNote: z.string().min(1),
  fixtureFiles: z.record(z.string(), z.string()).default({}),
  allowedTools: z.array(z.string().min(1)).min(1),
  maxTurns: z.number().int().min(1).max(12),
  allowLiveExternal: z.boolean().default(false),
  acceptance: z.object({
    mustCallTools: z.array(z.string()).default([]),
    mustCite: z.array(z.string()).default([]),
    citeFromTools: z.array(z.string()).default(["read_fixture"]),
    prohibited: z.array(z.string()).default([]),
    deliverableIncludes: z.array(z.string()).default([]),
    unsupportedClaims: z
      .array(z.object({ phrase: z.string().min(1), requiresTool: z.string().min(1) }))
      .default([]),
    forbidTools: z.array(z.string()).default([]),
    artifactIncludes: z.array(z.string()).default([]),
    recommendIncludes: z.array(z.string()).default([]),
    evidenceBeforeFinal: z.boolean().default(true),
  }),
  simulatedScript: z.array(scriptStepSchema).optional(),
})

export type ScenarioFile = z.infer<typeof scenarioSchema>

const bindTask = (scenario: ScenarioFile): ScenarioFile => {
  const script = scenario.simulatedScript?.map((step) => ({
    ...step,
    toolCalls: step.toolCalls.map((call) => ({
      ...call,
      args: Object.fromEntries(
        Object.entries(call.args).map(([key, value]) => [key, value === "$task" ? scenario.task : value]),
      ),
    })),
  }))
  return script ? { ...scenario, simulatedScript: script } : scenario
}

export const parseScenario = (input: unknown): ScenarioFile => bindTask(scenarioSchema.parse(input))

export const loadScenarios = async (directory: string): Promise<ScenarioFile[]> => {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
  const scenarios: ScenarioFile[] = []
  for (const name of names) {
    const raw = await readFile(path.join(directory, name), "utf8")
    scenarios.push(parseScenario(JSON.parse(raw)))
  }
  return scenarios
}
