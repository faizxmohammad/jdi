import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { evaluateImportGate } from "./importPolicy.js"
import { parseSourceManifest, type SourceManifest } from "./schema.js"

const defaultManifestPath = (): string => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, "../../catalog/sources.manifest.json")
}

export const loadSourceManifest = async (manifestPath = defaultManifestPath()): Promise<SourceManifest> => {
  const raw = await fs.readFile(manifestPath, "utf8")
  return parseSourceManifest(JSON.parse(raw) as unknown)
}

export const assertNoUnauthorizedImports = (manifest: SourceManifest): string[] => {
  const problems: string[] = []
  for (const source of manifest.sources) {
    if (source.importStatus === "imported" && source.license === "unknown") {
      problems.push(`${source.id}: marked imported but license is unknown`)
    }
    if (source.importStatus === "approved_for_import") {
      const gate = evaluateImportGate(source)
      if (!gate.allowed) {
        problems.push(`${source.id}: ${gate.reasons.join("; ")}`)
      }
    }
  }
  return problems
}
