import { describe, expect, it } from "vitest"
import { evaluateImportGate } from "../src/catalog/importPolicy.js"
import { parseSourceManifest } from "../src/catalog/schema.js"

const entry = (overrides: Record<string, unknown>) =>
  parseSourceManifest({
    version: "0.1.0",
    updatedAt: "2026-10-19",
    sources: [
      {
        id: "demo",
        title: "Demo",
        sourceUrl: "https://example.com/demo",
        entryType: "instruction_skill",
        license: "MIT",
        importStatus: "pending_audit",
        ...overrides,
      },
    ],
  }).sources[0]!

describe("import policy gate", () => {
  it("allows imported sources with a known license and pin", () => {
    const gate = evaluateImportGate(
      entry({ importStatus: "imported", license: "MIT", commitOrRelease: "abc123" }),
    )
    expect(gate.allowed).toBe(true)
    expect(gate.reasons).toEqual([])
  })

  it("allows approved_for_import with license and pin", () => {
    const gate = evaluateImportGate(
      entry({
        importStatus: "approved_for_import",
        license: "Apache-2.0",
        commitOrRelease: "abc123",
      }),
    )
    expect(gate.allowed).toBe(true)
  })

  it("blocks pending_audit even with a license string", () => {
    const gate = evaluateImportGate(entry({ importStatus: "pending_audit", license: "MIT" }))
    expect(gate.allowed).toBe(false)
    expect(gate.reasons.some((r) => r.includes("pending_audit"))).toBe(true)
  })

  it("blocks metadata_only and needs_review", () => {
    expect(evaluateImportGate(entry({ importStatus: "metadata_only", license: "MIT" })).allowed).toBe(
      false,
    )
    expect(evaluateImportGate(entry({ importStatus: "needs_review", license: "MIT" })).allowed).toBe(
      false,
    )
  })

  it("blocks approved_for_import without commitOrRelease", () => {
    const gate = evaluateImportGate(
      entry({ importStatus: "approved_for_import", license: "MIT", commitOrRelease: undefined }),
    )
    expect(gate.allowed).toBe(false)
    expect(gate.reasons.some((r) => r.includes("commitOrRelease"))).toBe(true)
  })

  it("blocks unknown license", () => {
    const gate = evaluateImportGate(entry({ importStatus: "imported", license: "unknown" }))
    expect(gate.allowed).toBe(false)
  })

  it("blocks non-local imported sources without commitOrRelease", () => {
    const gate = evaluateImportGate(
      entry({
        id: "third-party-oops",
        importStatus: "imported",
        license: "MIT",
        commitOrRelease: undefined,
      }),
    )
    expect(gate.allowed).toBe(false)
    expect(gate.reasons.some((r) => r.includes("commitOrRelease"))).toBe(true)
  })

  it("allows just-do-it-local imported without commitOrRelease", () => {
    const gate = evaluateImportGate(
      entry({
        id: "just-do-it-local",
        importStatus: "imported",
        license: "MIT",
        commitOrRelease: undefined,
      }),
    )
    expect(gate.allowed).toBe(true)
  })

  it("blocks missing source", () => {
    expect(evaluateImportGate(undefined).allowed).toBe(false)
  })
})
