#!/usr/bin/env node
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadScenarios } from "../eval/harness/loadScenario.js"
import { liveProviderFromEnv, ScriptedProvider } from "../eval/harness/provider.js"
import { runScenario } from "../eval/harness/runner.js"
import type { RunRecord } from "../eval/harness/types.js"
import { SkillCatalog } from "../skills/catalog.js"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const main = async (): Promise<void> => {
  const live = process.argv.includes("--live")
  const scenarios = await loadScenarios(path.join(rootDir, "eval/scenarios"))
  const catalog = new SkillCatalog({ catalogPath: path.join(rootDir, "skills") })
  const results: RunRecord[] = []

  for (const scenario of scenarios) {
    const provider = live
      ? liveProviderFromEnv()
      : new ScriptedProvider(scenario.simulatedScript ?? [], `script:${scenario.id}`)
    if (!live && (scenario.simulatedScript ?? []).length === 0) {
      results.push({
        scenarioId: scenario.id,
        skillId: scenario.skillId,
        title: scenario.title,
        kind: "simulated",
        providerId: "scripted",
        status: "fail",
        operationallyValidated: false,
        reasons: ["simulated script missing"],
        loadedSkillIds: [],
        toolNames: [],
        finalText: "",
        transcript: [],
        artifacts: {},
        durationMs: 0,
        promptTokens: null,
        completionTokens: null,
        estimatedCostUsd: null,
        usageSource: "unavailable",
        workspacePath: "",
        workspaceRemoved: true,
      })
      continue
    }
    results.push(await runScenario({ scenario, provider, catalog }))
  }

  const report = {
    generatedAt: new Date().toISOString(),
    batchKind: live ? "live" : "simulated",
    operationallyValidated: false,
    note: live
      ? "Live runs use JUST_DO_IT_EVAL_* . A blocked run means the provider was not configured or the call did not finish. It is not a pass."
      : "Simulated runs use scripted turns against the real catalog and tool dispatcher. A pass shows the loop and grader worked. It does not show that a live model followed the skill.",
    passed: results.filter((item) => item.status === "pass").length,
    failed: results.filter((item) => item.status === "fail").length,
    blocked: results.filter((item) => item.status === "blocked").length,
    results: results.map((item) => ({
      scenarioId: item.scenarioId,
      skillId: item.skillId,
      kind: item.kind,
      status: item.status,
      operationallyValidated: item.operationallyValidated,
      reasons: item.reasons,
      loadedSkillIds: item.loadedSkillIds,
      toolNames: item.toolNames,
      durationMs: item.durationMs,
      usageSource: item.usageSource,
    })),
  }

  const outPath = path.join(rootDir, "eval/skill-execution-results.json")
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  for (const item of results) {
    console.log(`${item.status}\t${item.kind}\t${item.scenarioId}\t${item.reasons.join("; ") || "ok"}`)
  }
  console.log(`Wrote ${outPath}`)
  if (results.some((item) => item.status === "fail") || (live && results.some((item) => item.status === "blocked"))) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
