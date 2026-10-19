import type { SkillSummary, ValidationStatus } from "../catalog/schema.js"

/** Equal-weight token presence — keyword-only baseline for eval. */
export const BASELINE_RANKING = "keyword_token_equal" as const
/** Field-weighted tokens + synonyms + validated boost — Phase 2 recommend. */
export const RECOMMEND_RANKING = "metadata_weighted_v1" as const

export type RankingMode = typeof BASELINE_RANKING | typeof RECOMMEND_RANKING

export type EvidenceKind = "verified" | "inferred"

export interface RecommendationEvidence {
  kind: EvidenceKind
  factor: string
  detail: string
}

export interface RecommendationPrerequisite {
  name: string
  status: "verified_missing" | "unknown" | "not_applicable"
  detail: string
}

export interface SkillRecommendation {
  skill: SkillSummary
  score: number
  explanation: string
  evidence: RecommendationEvidence[]
  prerequisites: RecommendationPrerequisite[]
  availability: {
    catalogAuthorized: true
    validationStatus: ValidationStatus
    /** Never claims local install; only that the skill is in the authorized catalog. */
    claim: "available_in_catalog"
  }
}

export type RecommendStatus = "ok" | "insufficient_evidence" | "needs_clarification"

export interface RecommendResult {
  status: RecommendStatus
  recommendations: SkillRecommendation[]
  clarificationPrompt?: string
  rankingMode: RankingMode
  rankingNotes: string[]
}

export interface RecommendOptions {
  task: string
  projectContext?: string | undefined
  limit?: number | undefined
  /** For eval only — default is recommend ranking. */
  rankingMode?: RankingMode | undefined
  minScore?: number | undefined
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "on",
  "with",
  "by",
  "at",
  "from",
  "is",
  "are",
  "be",
  "do",
  "how",
  "what",
  "when",
  "where",
  "why",
  "can",
  "could",
  "should",
  "would",
  "i",
  "we",
  "my",
  "our",
  "this",
  "that",
  "it",
  "into",
  "about",
  "please",
  "help",
  "me",
  "need",
  "want",
  "add",
  "make",
  "use",
  "using",
  "write",
  "create",
  "build",
  "fix",
  "update",
  "change",
])

/**
 * Inspectable synonym → skill-id or token boosts tied to the seed catalog.
 * Keep small; expand only when eval cases demand it.
 */
const SYNONYM_TO_TOKENS: Readonly<Record<string, readonly string[]>> = {
  spring: ["java", "spring-boot", "java-spring-boot"],
  springboot: ["java", "spring-boot", "java-spring-boot"],
  flyway: ["database", "migrations", "sql", "database-migrations"],
  liquibase: ["database", "migrations", "sql", "database-migrations"],
  schema: ["database", "migrations", "sql"],
  migration: ["database", "migrations", "sql", "database-migrations"],
  migrations: ["database", "migrations", "sql", "database-migrations"],
  node: ["nodejs", "typescript", "nodejs-architecture"],
  nodejs: ["nodejs", "typescript", "nodejs-architecture"],
  typescript: ["nodejs", "typescript", "nodejs-architecture"],
  express: ["nodejs", "typescript", "architecture"],
  flaky: ["testing", "regression", "qa", "regression-testing"],
  regression: ["testing", "regression", "qa", "regression-testing"],
  // Intentionally omit generic "test"/"tests" — too broad (false positives on unrelated tooling requests).
  qa: ["testing", "regression", "qa"],
  hotel: ["debugging", "booking", "hospitality", "hotel-booking-debugger"],
  booking: ["debugging", "booking", "hospitality", "hotel-booking-debugger"],
  hospitality: ["debugging", "booking", "hospitality", "hotel-booking-debugger"],
  checkout: ["debugging", "booking", "payment", "hotel-booking-debugger"],
  payment: ["debugging", "booking", "payment"],
  java: ["java", "spring-boot", "backend"],
  sql: ["database", "migrations", "sql"],
}

const DEFAULT_LIMIT = 5
const DEFAULT_MIN_SCORE = 8
const MAX_LIMIT = 10
const VAGUE_TOKEN_THRESHOLD = 2

export const tokenize = (text: string): string[] => {
  const raw = text
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))

  const out: string[] = []
  const seen = new Set<string>()
  for (const token of raw) {
    if (seen.has(token)) continue
    seen.add(token)
    out.push(token)
  }
  return out
}

export const expandTokens = (tokens: readonly string[]): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (token: string): void => {
    if (seen.has(token)) return
    seen.add(token)
    out.push(token)
  }
  for (const token of tokens) {
    push(token)
    const aliases = SYNONYM_TO_TOKENS[token]
    if (!aliases) continue
    for (const alias of aliases) push(alias)
  }
  return out
}

const skillHaystackTokens = (skill: SkillSummary): Set<string> => {
  const text = [
    skill.id,
    skill.name,
    skill.description,
    skill.category ?? "",
    skill.tags.join(" "),
    skill.entryType,
  ].join(" ")
  return new Set(tokenize(text))
}

interface ScoreBreakdown {
  score: number
  evidence: RecommendationEvidence[]
}

const scoreBaseline = (skill: SkillSummary, queryTokens: readonly string[]): ScoreBreakdown => {
  const haystack = skillHaystackTokens(skill)
  let score = 0
  const matched: string[] = []
  for (const token of queryTokens) {
    if (!haystack.has(token)) continue
    score += 1
    matched.push(token)
  }
  const evidence: RecommendationEvidence[] =
    matched.length > 0
      ? [
          {
            kind: "inferred",
            factor: "token_overlap",
            detail: `Equal-weight token matches: ${matched.join(", ")}`,
          },
        ]
      : []
  return { score, evidence }
}

const scoreWeighted = (
  skill: SkillSummary,
  queryTokens: readonly string[],
  expandedTokens: readonly string[],
): ScoreBreakdown => {
  const evidence: RecommendationEvidence[] = []
  let score = 0

  const idTokens = new Set(tokenize(`${skill.id} ${skill.name}`))
  const tagSet = new Set(skill.tags.map((tag) => tag.toLocaleLowerCase("en-US")))
  const category = skill.category?.toLocaleLowerCase("en-US") ?? ""
  const descriptionTokens = new Set(tokenize(skill.description))

  for (const token of expandedTokens) {
    if (idTokens.has(token) || skill.id.toLocaleLowerCase("en-US") === token) {
      score += 10
      evidence.push({
        kind: "inferred",
        factor: "id_or_name_match",
        detail: `Matched skill id/name token "${token}"`,
      })
    }
    if (tagSet.has(token)) {
      score += 8
      evidence.push({
        kind: "inferred",
        factor: "tag_match",
        detail: `Matched tag "${token}"`,
      })
    }
    if (category && (category === token || category.includes(token))) {
      score += 5
      evidence.push({
        kind: "inferred",
        factor: "category_match",
        detail: `Matched category "${skill.category}"`,
      })
    }
    if (descriptionTokens.has(token)) {
      score += 2
      evidence.push({
        kind: "inferred",
        factor: "description_token",
        detail: `Matched description token "${token}"`,
      })
    }
  }

  // Prefer original query tokens slightly when they appear without synonym expansion alone
  for (const token of queryTokens) {
    if (tagSet.has(token) || idTokens.has(token) || descriptionTokens.has(token)) {
      score += 1
    }
  }

  if (skill.validationStatus === "validated") {
    score += 1
    evidence.push({
      kind: "verified",
      factor: "validation_status",
      detail: "Skill marked validationStatus=validated in catalog metadata",
    })
  }

  if (skill.provenance.sourceId) {
    evidence.push({
      kind: "verified",
      factor: "provenance",
      detail: `Authorized catalog entry sourceId=${skill.provenance.sourceId}, version=${skill.version}`,
    })
  }

  // Deduplicate evidence by factor+detail
  const seen = new Set<string>()
  const unique = evidence.filter((item) => {
    const key = `${item.factor}:${item.detail}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { score, evidence: unique }
}

const prerequisitesFor = (skill: SkillSummary): RecommendationPrerequisite[] => {
  switch (skill.entryType) {
    case "instruction_skill":
    case "reference_collection":
    case "composite_workflow":
      return [
        {
          name: "agent_consumable_instructions",
          status: "not_applicable",
          detail: "Instruction/reference content; no local CLI or MCP install claimed",
        },
      ]
    case "cli_integration":
      return [
        {
          name: "local_cli",
          status: "unknown",
          detail: "CLI must be installed in the user environment; Just Do It does not verify install state",
        },
      ]
    case "plugin_integration":
      return [
        {
          name: "client_plugin",
          status: "unknown",
          detail: "Client-specific plugin/hooks required; install state not verified",
        },
      ]
    case "external_mcp":
      return [
        {
          name: "external_mcp_server",
          status: "unknown",
          detail: "Separate MCP server required; Just Do It does not claim it is running",
        },
      ]
    default:
      return [
        {
          name: "unknown_entry_type",
          status: "unknown",
          detail: "Unrecognized entry type; prerequisites unknown",
        },
      ]
  }
}

const buildExplanation = (skill: SkillSummary, evidence: RecommendationEvidence[]): string => {
  const inferred = evidence.filter((item) => item.kind === "inferred").map((item) => item.detail)
  const verified = evidence.filter((item) => item.kind === "verified").map((item) => item.detail)
  const parts: string[] = [`Recommend ${skill.id} (${skill.name}) because:`]
  if (inferred.length > 0) parts.push(`Inferred relevance — ${inferred.slice(0, 3).join("; ")}.`)
  if (verified.length > 0) parts.push(`Verified catalog facts — ${verified.slice(0, 2).join("; ")}.`)
  if (inferred.length === 0 && verified.length === 0) {
    parts.push("Matched ranking factors above the minimum score threshold.")
  }
  return parts.join(" ")
}

const isVagueTask = (taskTokens: readonly string[]): boolean => taskTokens.length < VAGUE_TOKEN_THRESHOLD

/**
 * Rank authorized skill summaries for a task. Callers must pass only import-gate-allowed skills.
 */
export const recommendSkills = (
  candidates: readonly SkillSummary[],
  options: RecommendOptions,
): RecommendResult => {
  const rankingMode = options.rankingMode ?? RECOMMEND_RANKING
  const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? DEFAULT_LIMIT), MAX_LIMIT))
  const minScore = options.minScore ?? (rankingMode === BASELINE_RANKING ? 1 : DEFAULT_MIN_SCORE)

  const task = options.task.trim()
  const context = options.projectContext?.trim() ?? ""
  const combined = context ? `${task}\n${context}` : task
  const queryTokens = tokenize(combined)
  const expandedTokens = rankingMode === RECOMMEND_RANKING ? expandTokens(queryTokens) : [...queryTokens]

  const rankingNotes = [
    `rankingMode=${rankingMode}`,
    `queryTokens=${queryTokens.join("|") || "(none)"}`,
    rankingMode === RECOMMEND_RANKING
      ? `expandedTokens=${expandedTokens.join("|") || "(none)"}`
      : "no synonym expansion",
    `minScore=${minScore}`,
    `candidateCount=${candidates.length}`,
    context ? "projectContext=provided_as_text_hint" : "projectContext=absent",
  ]

  if (!task) {
    return {
      status: "needs_clarification",
      recommendations: [],
      clarificationPrompt:
        "Provide a short task description (what you want the agent to do) so skills can be matched.",
      rankingMode,
      rankingNotes,
    }
  }

  // Vague gate uses task+projectContext tokens so a short task with a rich context hint can still rank.
  if (rankingMode === RECOMMEND_RANKING && isVagueTask(queryTokens)) {
    return {
      status: "needs_clarification",
      recommendations: [],
      clarificationPrompt:
        "Task is too vague for a reliable recommendation. Name the stack, domain, or failure (for example: Spring Boot API, DB migration, flaky test, hotel booking payment).",
      rankingMode,
      rankingNotes,
    }
  }

  const allowed = candidates.filter((skill) => skill.validationStatus !== "rejected")

  const scored: SkillRecommendation[] = []
  for (const skill of allowed) {
    const breakdown =
      rankingMode === BASELINE_RANKING
        ? scoreBaseline(skill, queryTokens)
        : scoreWeighted(skill, queryTokens, expandedTokens)

    if (breakdown.score < minScore) continue

    scored.push({
      skill,
      score: breakdown.score,
      explanation: buildExplanation(skill, breakdown.evidence),
      evidence: breakdown.evidence,
      prerequisites: prerequisitesFor(skill),
      availability: {
        catalogAuthorized: true,
        validationStatus: skill.validationStatus,
        claim: "available_in_catalog",
      },
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.skill.id.localeCompare(b.skill.id)
  })

  const top = scored.slice(0, limit)

  if (top.length === 0) {
    return {
      status: "insufficient_evidence",
      recommendations: [],
      clarificationPrompt:
        "No authorized catalog skill scored above the relevance threshold for this task. Clarify the stack/domain, or confirm no matching skill is expected.",
      rankingMode,
      rankingNotes,
    }
  }

  // Ambiguous: two different skills nearly tied at the top under recommend mode
  if (
    rankingMode === RECOMMEND_RANKING &&
    top.length >= 2 &&
    top[0] &&
    top[1] &&
    top[0].skill.id !== top[1].skill.id &&
    top[0].score - top[1].score <= 2 &&
    top[0].score < minScore + 6
  ) {
    return {
      status: "needs_clarification",
      recommendations: top.slice(0, 2),
      clarificationPrompt: `Close match between ${top[0].skill.id} and ${top[1].skill.id}. Which area matters more: ${top[0].skill.category ?? top[0].skill.tags[0] ?? top[0].skill.id} vs ${top[1].skill.category ?? top[1].skill.tags[0] ?? top[1].skill.id}?`,
      rankingMode,
      rankingNotes,
    }
  }

  return {
    status: "ok",
    recommendations: top,
    rankingMode,
    rankingNotes,
  }
}
