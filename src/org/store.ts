import { readFileSync } from "node:fs"
import path from "node:path"
import { orgsFileSchema, type OrgMember, type OrgRecord } from "./types.js"

export type OrgStore = {
  getOrg: (orgId: string) => OrgRecord | undefined
  resolveMembership: (orgId: string, ownerId: string) => OrgMember | undefined
  listOrgsForOwner: (ownerId: string) => OrgRecord[]
  records: readonly OrgRecord[]
}

export const createOrgStore = (records: OrgRecord[]): OrgStore => {
  const byId = new Map<string, OrgRecord>()
  for (const org of records) {
    if (byId.has(org.id)) {
      throw new Error(`Duplicate org id: ${org.id}`)
    }
    const seenMembers = new Set<string>()
    for (const member of org.members) {
      if (seenMembers.has(member.ownerId)) {
        throw new Error(`Duplicate member ${member.ownerId} in org ${org.id}`)
      }
      seenMembers.add(member.ownerId)
    }
    byId.set(org.id, org)
  }

  const getOrg = (orgId: string): OrgRecord | undefined => byId.get(orgId)

  const resolveMembership = (orgId: string, ownerId: string): OrgMember | undefined => {
    const org = byId.get(orgId)
    if (!org) return undefined
    return org.members.find((m) => m.ownerId === ownerId)
  }

  const listOrgsForOwner = (ownerId: string): OrgRecord[] =>
    records.filter((org) => org.members.some((m) => m.ownerId === ownerId))

  return {
    getOrg,
    resolveMembership,
    listOrgsForOwner,
    records: [...records],
  }
}

export const loadOrgsFromFile = (filePath: string): OrgRecord[] => {
  const raw = readFileSync(filePath, "utf8")
  const parsed = orgsFileSchema.safeParse(JSON.parse(raw) as unknown)
  if (!parsed.success) {
    throw new Error(`Invalid orgs file: ${parsed.error.message}`)
  }
  return parsed.data.orgs
}

export const buildOrgStore = (options: {
  orgsFilePath?: string
}): OrgStore => {
  if (!options.orgsFilePath) {
    return createOrgStore([])
  }
  const records = loadOrgsFromFile(options.orgsFilePath)
  return createOrgStore(records)
}

/** Resolve absolute catalog path for an org, if configured. */
export const resolveOrgCatalogPath = (
  org: OrgRecord,
  cwd: string = process.cwd(),
): string | undefined => {
  if (!org.catalogPath) return undefined
  return path.isAbsolute(org.catalogPath)
    ? org.catalogPath
    : path.resolve(cwd, org.catalogPath)
}
