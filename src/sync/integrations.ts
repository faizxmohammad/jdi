/**
 * Optional operator notes for local tooling checks.
 * Empty by default — extend only when you intentionally document a local prerequisite.
 */

export type PrerequisiteKind = "command" | "manual"

export interface IntegrationPrerequisite {
  id: string
  description: string
  kind: PrerequisiteKind
  command?: string
}

export interface IntegrationEntry {
  id: string
  title: string
  sourceUrl: string
  entryType: "cli_integration" | "external_mcp" | "composite_workflow"
  importStatus: "metadata_only" | "rejected"
  capabilityKind: "external_dependency"
  installedCapability: false
  guidanceOnly: true
  validatedAt: string
  setupGuidance: string[]
  knownLimitations: string[]
  prerequisites: IntegrationPrerequisite[]
}

export const INTEGRATIONS: IntegrationEntry[] = []

export const listIntegrations = (): IntegrationEntry[] => [...INTEGRATIONS]

export const getIntegration = (id: string): IntegrationEntry | undefined =>
  INTEGRATIONS.find((entry) => entry.id === id)

export interface PrerequisiteCheckResult {
  id: string
  ok: boolean
  detail: string
}

export interface IntegrationCheckReport {
  id: string
  title: string
  capabilityKind: "external_dependency"
  installedCapability: false
  guidanceOnly: true
  prerequisites: PrerequisiteCheckResult[]
}

export const checkIntegration = async (id: string): Promise<IntegrationCheckReport | undefined> => {
  const entry = getIntegration(id)
  if (!entry) return undefined
  return {
    id: entry.id,
    title: entry.title,
    capabilityKind: "external_dependency",
    installedCapability: false,
    guidanceOnly: true,
    prerequisites: entry.prerequisites.map((p) => ({
      id: p.id,
      ok: false,
      detail: "No automated probe configured",
    })),
  }
}

export const checkAllIntegrations = async (): Promise<IntegrationCheckReport[]> => {
  const reports: IntegrationCheckReport[] = []
  for (const entry of INTEGRATIONS) {
    const report = await checkIntegration(entry.id)
    if (report) reports.push(report)
  }
  return reports
}
