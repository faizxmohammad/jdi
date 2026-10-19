#!/usr/bin/env node
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { SkillCatalog } from "../skills/catalog.js"
import {
  BASELINE_RANKING,
  RECOMMEND_RANKING,
  type RankingMode,
  type RecommendResult,
} from "../skills/recommend.js"

interface EvalCase {
  id: string
  task: string
  projectContext?: string
  expectedSkillIds: string[]
  expectStatus: "ok" | "insufficient_evidence" | "needs_clarification"
}

interface EvalFile {
  version: string
  cases: EvalCase[]
}

interface ModeMetrics {
  mode: RankingMode
  hitAt3: number
  hitAt3Denom: number
  precisionAt3Sum: number
  precisionAt3Denom: number
  abstainAccuracy: number
  abstainDenom: number
  fabricationCount: number
  cases: Array<{
    id: string
    status: string
    topIds: string[]
    hitAt3: boolean
    precisionAt3: number | null
    abstainOk: boolean | null
  }>
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const loadEval = async (): Promise<EvalFile> => {
  const raw = await fs.readFile(path.join(rootDir, "eval/recommend-eval.json"), "utf8")
  return JSON.parse(raw) as EvalFile
}

const runMode = async (
  catalog: SkillCatalog,
  cases: EvalCase[],
  mode: RankingMode,
  catalogIds: Set<string>,
): Promise<ModeMetrics> => {
  let hitAt3 = 0
  let hitAt3Denom = 0
  let precisionAt3Sum = 0
  let precisionAt3Denom = 0
  let abstainAccuracy = 0
  let abstainDenom = 0
  let fabricationCount = 0
  const caseRows: ModeMetrics["cases"] = []

  for (const evalCase of cases) {
    const result: RecommendResult = await catalog.recommend({
      task: evalCase.task,
      projectContext: evalCase.projectContext,
      limit: 3,
      rankingMode: mode,
      minScore: mode === BASELINE_RANKING ? 1 : undefined,
    })

    const topIds = result.recommendations.map((r) => r.skill.id)
    for (const id of topIds) {
      if (!catalogIds.has(id)) fabricationCount += 1
    }

    const expected = new Set(evalCase.expectedSkillIds)
    const wantsHit = expected.size > 0
    let hit = false
    let precision: number | null = null
    let abstainOk: boolean | null = null

    if (wantsHit) {
      hitAt3Denom += 1
      hit = [...expected].some((id) => topIds.includes(id))
      if (hit) hitAt3 += 1
    }

    if (topIds.length > 0) {
      precisionAt3Denom += 1
      const overlap = topIds.filter((id) => expected.has(id)).length
      precision = overlap / topIds.length
      precisionAt3Sum += precision
    }

    if (
      evalCase.expectStatus === "insufficient_evidence" ||
      evalCase.expectStatus === "needs_clarification"
    ) {
      abstainDenom += 1
      abstainOk =
        mode === BASELINE_RANKING
          ? topIds.length === 0 || result.status !== "ok"
          : result.status === evalCase.expectStatus ||
            (evalCase.expectStatus === "insufficient_evidence" && topIds.length === 0)
      if (abstainOk) abstainAccuracy += 1
    }

    caseRows.push({
      id: evalCase.id,
      status: result.status,
      topIds,
      hitAt3: hit,
      precisionAt3: precision,
      abstainOk,
    })
  }

  return {
    mode,
    hitAt3,
    hitAt3Denom,
    precisionAt3Sum,
    precisionAt3Denom,
    abstainAccuracy,
    abstainDenom,
    fabricationCount,
    cases: caseRows,
  }
}

const rate = (num: number, denom: number): string => {
  if (denom === 0) return "n/a"
  return `${(num / denom).toFixed(3)} (${num}/${denom})`
}

const main = async (): Promise<void> => {
  const evalFile = await loadEval()
  const catalog = new SkillCatalog({
    catalogPath: path.join(rootDir, "skills"),
  })
  const summaries = await catalog.search({ query: "", limit: 50 })
  const catalogIds = new Set(summaries.map((s) => s.id))

  const baseline = await runMode(catalog, evalFile.cases, BASELINE_RANKING, catalogIds)
  const recommend = await runMode(catalog, evalFile.cases, RECOMMEND_RANKING, catalogIds)

  const baselineHit = baseline.hitAt3Denom === 0 ? 0 : baseline.hitAt3 / baseline.hitAt3Denom
  const recommendHit = recommend.hitAt3Denom === 0 ? 0 : recommend.hitAt3 / recommend.hitAt3Denom
  const baselineP = baseline.precisionAt3Denom === 0 ? 0 : baseline.precisionAt3Sum / baseline.precisionAt3Denom
  const recommendP =
    recommend.precisionAt3Denom === 0 ? 0 : recommend.precisionAt3Sum / recommend.precisionAt3Denom
  const baselineAbstain =
    baseline.abstainDenom === 0 ? 0 : baseline.abstainAccuracy / baseline.abstainDenom
  const recommendAbstain =
    recommend.abstainDenom === 0 ? 0 : recommend.abstainAccuracy / recommend.abstainDenom

  // Improve = better Hit@3, or Hit@3 tied/better with strictly better Precision@3,
  // or Hit@3 tied/better with strictly better abstain accuracy.
  const hitAt3Improved = recommendHit > baselineHit
  const precisionAt3Improved = recommendP > baselineP
  const abstainImproved = recommendAbstain > baselineAbstain
  const improvedOverBaseline =
    hitAt3Improved ||
    (recommendHit >= baselineHit && precisionAt3Improved) ||
    (recommendHit >= baselineHit && abstainImproved)
  const noFabrication = recommend.fabricationCount === 0 && baseline.fabricationCount === 0

  const report = {
    catalogSkillIds: [...catalogIds].sort(),
    measurement:
      "Compare equal-weight token baseline vs metadata_weighted_v1 on the same cases. Primary: Hit@3. Secondary: Precision@3 and abstain accuracy. Gate: improve Hit@3, or hold Hit@3 while improving Precision@3 or abstain accuracy; fabricationCount must be 0.",
    baseline: {
      mode: baseline.mode,
      hitAt3: rate(baseline.hitAt3, baseline.hitAt3Denom),
      precisionAt3: rate(baseline.precisionAt3Sum, baseline.precisionAt3Denom),
      abstainAccuracy: rate(baseline.abstainAccuracy, baseline.abstainDenom),
      fabricationCount: baseline.fabricationCount,
      cases: baseline.cases,
    },
    recommend: {
      mode: recommend.mode,
      hitAt3: rate(recommend.hitAt3, recommend.hitAt3Denom),
      precisionAt3: rate(recommend.precisionAt3Sum, recommend.precisionAt3Denom),
      abstainAccuracy: rate(recommend.abstainAccuracy, recommend.abstainDenom),
      fabricationCount: recommend.fabricationCount,
      cases: recommend.cases,
    },
    exitGate: {
      hitAt3Improved,
      precisionAt3Improved,
      abstainImproved,
      improvedOverBaseline,
      noFabrication,
      passSelfCheck: improvedOverBaseline && noFabrication,
      baselineHitAt3: baselineHit,
      recommendHitAt3: recommendHit,
      baselinePrecisionAt3: baselineP,
      recommendPrecisionAt3: recommendP,
      baselineAbstainAccuracy: baselineAbstain,
      recommendAbstainAccuracy: recommendAbstain,
    },
  }

  const outPath = path.join(rootDir, "eval/recommend-eval-results.json")
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify(report.exitGate, null, 2))
  console.log(`Wrote ${outPath}`)

  if (!report.exitGate.passSelfCheck) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
