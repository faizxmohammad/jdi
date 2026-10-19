import { describe, expect, it } from "vitest"
import { assertNoUnauthorizedImports, loadSourceManifest } from "../src/catalog/manifest.js"
import { parseSkillSummary, parseSourceManifest } from "../src/catalog/schema.js"

describe("catalog schema", () => {
  it("parses a valid skill summary", () => {
    const summary = parseSkillSummary({
      id: "demo",
      name: "demo",
      description: "A demo skill",
      tags: ["demo"],
      category: "engineering",
    })
    expect(summary.entryType).toBe("instruction_skill")
    expect(summary.validationStatus).toBe("unvalidated")
  })

  it("rejects invalid skill ids", () => {
    expect(() =>
      parseSkillSummary({
        id: "../escape",
        name: "bad",
        description: "nope",
      }),
    ).toThrow()
  })

  it("loads and validates the repository source manifest", async () => {
    const manifest = await loadSourceManifest()
    expect(manifest.sources.length).toBeGreaterThanOrEqual(1)
    expect(assertNoUnauthorizedImports(manifest)).toEqual([])
    expect(manifest.sources.some((source) => source.id === "just-do-it-local")).toBe(true)
    const imported = manifest.sources.filter((source) => source.importStatus === "imported")
    expect(imported.every((source) => source.license !== "unknown")).toBe(true)
    expect(
      manifest.sources
        .filter((source) => source.id !== "just-do-it-local")
        .every((source) => source.importStatus !== "imported"),
    ).toBe(true)
  })

  it("rejects manifests that import without a license decision", () => {
    expect(() =>
      parseSourceManifest({
        version: "0.1.0",
        updatedAt: "2026-10-19",
        sources: [
          {
            id: "bad",
            title: "Bad",
            sourceUrl: "https://example.com/repo",
            entryType: "instruction_skill",
            license: "unknown",
            importStatus: "imported",
          },
        ],
      }),
    ).not.toThrow()

    const problems = assertNoUnauthorizedImports(
      parseSourceManifest({
        version: "0.1.0",
        updatedAt: "2026-10-19",
        sources: [
          {
            id: "bad",
            title: "Bad",
            sourceUrl: "https://example.com/repo",
            entryType: "instruction_skill",
            license: "unknown",
            importStatus: "imported",
          },
        ],
      }),
    )
    expect(problems).toHaveLength(1)
  })
})
