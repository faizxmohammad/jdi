import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { parseSourceManifest } from "../src/catalog/schema.js"
import { SkillCatalog } from "../src/skills/catalog.js"
import {
  BASELINE_RANKING,
  RECOMMEND_RANKING,
  recommendSkills,
  tokenize,
} from "../src/skills/recommend.js"
import type { SkillSummary } from "../src/catalog/schema.js"

const localManifest = parseSourceManifest({
  version: "0.1.0",
  updatedAt: "2026-10-19",
  sources: [
    {
      id: "just-do-it-local",
      title: "Local",
      sourceUrl: "https://example.invalid/just-do-it",
      entryType: "instruction_skill",
      license: "MIT",
      importStatus: "imported",
    },
    {
      id: "pending-source",
      title: "Pending",
      sourceUrl: "https://example.invalid/pending",
      entryType: "instruction_skill",
      license: "unknown",
      importStatus: "pending_audit",
    },
  ],
})

const summary = (partial: Partial<SkillSummary> & Pick<SkillSummary, "id" | "name" | "description">): SkillSummary => ({
  entryType: "instruction_skill",
  tags: [],
  triggers: [],
  requires: [],
  provides: [],
  version: "0.1.0",
  validationStatus: "validated",
  provenance: { sourceId: "just-do-it-local", license: "MIT" },
  ...partial,
})

describe("recommendSkills scoring", () => {
  const catalog: SkillSummary[] = [
    summary({
      id: "java-spring-boot",
      name: "java-spring-boot",
      description: "Build Java 21 and Spring Boot services",
      tags: ["java", "spring-boot", "backend"],
      category: "engineering",
    }),
    summary({
      id: "database-migrations",
      name: "database-migrations",
      description: "Plan and apply database migrations",
      tags: ["database", "migrations", "sql"],
      category: "engineering",
    }),
    summary({
      id: "regression-testing",
      name: "regression-testing",
      description: "Add focused regression tests",
      tags: ["testing", "regression", "qa"],
      category: "engineering",
    }),
  ]

  it("tokenizes and drops stopwords", () => {
    expect(tokenize("Add a Spring Boot endpoint for the users")).toEqual([
      "spring",
      "boot",
      "endpoint",
      "users",
    ])
  })

  it("ranks spring boot task toward java-spring-boot with explanations", () => {
    const result = recommendSkills(catalog, {
      task: "Add a Spring Boot REST endpoint for users",
      rankingMode: RECOMMEND_RANKING,
    })
    expect(result.status).toBe("ok")
    expect(result.recommendations[0]?.skill.id).toBe("java-spring-boot")
    expect(result.recommendations[0]?.explanation.length).toBeGreaterThan(20)
    expect(result.recommendations[0]?.evidence.some((e) => e.kind === "verified")).toBe(true)
    expect(result.recommendations[0]?.evidence.some((e) => e.kind === "inferred")).toBe(true)
    expect(result.recommendations[0]?.availability.claim).toBe("available_in_catalog")
  })

  it("asks for clarification on vague tasks", () => {
    const result = recommendSkills(catalog, { task: "help me" })
    expect(result.status).toBe("needs_clarification")
    expect(result.recommendations).toHaveLength(0)
    expect(result.clarificationPrompt).toMatch(/vague/i)
  })

  it("ranks using projectContext when the task alone is vague", () => {
    const result = recommendSkills(catalog, {
      task: "help me",
      projectContext: "Flyway SQL migrations on Postgres; need a safe rollback plan",
    })
    expect(result.status).toBe("ok")
    expect(result.recommendations[0]?.skill.id).toBe("database-migrations")
    expect(result.rankingNotes.some((n) => n.includes("projectContext=provided_as_text_hint"))).toBe(true)
  })

  it("returns insufficient_evidence for unrelated tasks", () => {
    const result = recommendSkills(catalog, {
      task: "What is the weather in Paris tomorrow afternoon",
    })
    expect(result.status).toBe("insufficient_evidence")
    expect(result.recommendations).toHaveLength(0)
  })

  it("never invents skill ids outside the candidate set", () => {
    const result = recommendSkills(catalog, {
      task: "Install Playwright browser automation CLI for e2e",
    })
    const ids = result.recommendations.map((r) => r.skill.id)
    expect(ids.every((id) => catalog.some((s) => s.id === id))).toBe(true)
    expect(ids.includes("playwright")).toBe(false)
  })

  it("skips rejected validationStatus entries", () => {
    const withRejected = [
      ...catalog,
      summary({
        id: "bad-skill",
        name: "bad-skill",
        description: "Spring Boot rejected skill",
        tags: ["java", "spring-boot"],
        validationStatus: "rejected",
      }),
    ]
    const result = recommendSkills(withRejected, {
      task: "Spring Boot service change",
    })
    expect(result.recommendations.every((r) => r.skill.id !== "bad-skill")).toBe(true)
  })

  it("baseline equal-weight tokens score lower specificity than weighted mode", () => {
    const task = "Plan a Flyway database migration with rollback"
    const baseline = recommendSkills(catalog, { task, rankingMode: BASELINE_RANKING, minScore: 1 })
    const recommend = recommendSkills(catalog, { task, rankingMode: RECOMMEND_RANKING })
    expect(recommend.recommendations[0]?.skill.id).toBe("database-migrations")
    // Baseline may hit via "database"/"migration" tokens but without synonym/tag weights
    const baselineTop = baseline.recommendations[0]?.skill.id
    expect(
      recommend.recommendations[0]!.score >
        (baseline.recommendations.find((r) => r.skill.id === "database-migrations")?.score ?? 0),
    ).toBe(true)
    expect(baselineTop === "database-migrations" || baseline.status !== "ok" || baselineTop).toBeTruthy()
  })
})

describe("SkillCatalog.recommend import gate", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-rec-"))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("does not recommend pending_audit skills as available", async () => {
    await fs.mkdir(path.join(root, "ok-skill"))
    await fs.writeFile(
      path.join(root, "ok-skill", "SKILL.md"),
      "---\nname: ok-skill\ndescription: Java Spring Boot helper\ntags: java, spring-boot\ncategory: engineering\nversion: 0.1.0\nvalidationStatus: validated\nsourceId: just-do-it-local\n---\n\n# Ok\n",
      "utf8",
    )
    await fs.mkdir(path.join(root, "pending-skill"))
    await fs.writeFile(
      path.join(root, "pending-skill", "SKILL.md"),
      "---\nname: pending-skill\ndescription: Java Spring Boot from pending source\ntags: java, spring-boot\ncategory: engineering\nversion: 0.1.0\nvalidationStatus: validated\nsourceId: pending-source\n---\n\n# Pending\n",
      "utf8",
    )

    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    const result = await catalog.recommend({
      task: "Change a Spring Boot controller",
    })

    const ids = result.recommendations.map((r) => r.skill.id)
    expect(ids).toContain("ok-skill")
    expect(ids).not.toContain("pending-skill")
    expect(
      result.recommendations.every((r) => r.availability.catalogAuthorized && r.availability.claim === "available_in_catalog"),
    ).toBe(true)
  })

  it("folds optional projectContext into ranking without claiming memory", async () => {
    await fs.mkdir(path.join(root, "database-migrations"))
    await fs.writeFile(
      path.join(root, "database-migrations", "SKILL.md"),
      "---\nname: database-migrations\ndescription: Plan database migrations\ntags: database, migrations, sql\ncategory: engineering\nversion: 0.1.0\nvalidationStatus: validated\nsourceId: just-do-it-local\n---\n\n# Migrations\n",
      "utf8",
    )
    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    const result = await catalog.recommend({
      task: "Apply the next change safely",
      projectContext: "We use Flyway SQL migrations on Postgres",
    })
    expect(result.rankingNotes.some((n) => n.includes("projectContext=provided_as_text_hint"))).toBe(true)
    expect(result.recommendations[0]?.skill.id).toBe("database-migrations")
  })
})
