import type { SourceImportStatus, SourceManifestEntry } from "./schema.js"

/** Statuses that must never cause content to be copied into the catalog. */
export const BLOCKED_IMPORT_STATUSES: ReadonlySet<SourceImportStatus> = new Set([
  "pending_audit",
  "needs_review",
  "metadata_only",
  "rejected",
])

export interface ImportGateResult {
  allowed: boolean
  reasons: string[]
}

/**
 * Fail-closed gate for copying skill content into the catalog.
 * Local originals (`imported` + known license) and explicitly
 * `approved_for_import` sources with a known license + pin may proceed.
 */
export const evaluateImportGate = (source: SourceManifestEntry | undefined): ImportGateResult => {
  if (!source) {
    return { allowed: false, reasons: ["source not found in manifest"] }
  }

  const reasons: string[] = []

  if (source.license === "unknown" || !source.license.trim()) {
    reasons.push("license is unknown or empty")
  }

  if (source.importStatus === "imported") {
    // Local catalog seed may omit commitOrRelease. Any other imported row must be pinned.
    if (source.id !== "just-do-it-local" && !source.commitOrRelease?.trim()) {
      reasons.push("imported sources other than just-do-it-local require commitOrRelease pin")
    }
  } else if (source.importStatus === "approved_for_import") {
    if (!source.commitOrRelease?.trim()) {
      reasons.push("approved_for_import requires commitOrRelease pin")
    }
  } else {
    reasons.push(`importStatus is ${source.importStatus} (not importable)`)
  }

  return { allowed: reasons.length === 0, reasons }
}

export const findSourceById = (
  sources: SourceManifestEntry[],
  sourceId: string,
): SourceManifestEntry | undefined => sources.find((entry) => entry.id === sourceId)

export const isSourceIdAllowedForCatalogContent = (
  source: SourceManifestEntry | undefined,
): boolean => evaluateImportGate(source).allowed
