import { readFileSync } from "node:fs"
import path from "node:path"
import { z } from "zod"

const toolSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  input: z.record(z.string().max(80), z.string().max(200)),
})

const capabilitySchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["external_mcp", "cli_integration"]),
  title: z.string().min(1).max(200),
  sourceUrl: z.string().url(),
  license: z.string().min(1).max(80),
  integration: z.enum(["documented_http_interface", "user_environment"]),
  redistribution: z.literal("do_not_vendor"),
  endpoint: z.string().url().optional(),
  defaultApiBase: z.string().url().optional(),
  apiBaseEnv: z.string().max(80).optional(),
  authEnv: z.string().max(80).optional(),
  authRequired: z.boolean().default(false),
  installHint: z.string().max(300).optional(),
  triggers: z.array(z.string().min(1).max(80)).max(20).default([]),
  tools: z.array(toolSchema).max(10).default([]),
})

const registrySchema = z.object({
  version: z.string().min(1),
  capabilities: z.array(capabilitySchema),
})

export type ExternalCapability = z.infer<typeof capabilitySchema>
export type ExternalRegistry = z.infer<typeof registrySchema>

export const defaultRegistryPath = (): string =>
  path.resolve(process.cwd(), "catalog/external-capabilities.json")

export const loadExternalRegistry = (filePath = defaultRegistryPath()): ExternalRegistry => {
  const raw = readFileSync(filePath, "utf8")
  return registrySchema.parse(JSON.parse(raw))
}

export interface ExternalCapabilityView {
  id: string
  kind: ExternalCapability["kind"]
  title: string
  sourceUrl: string
  license: string
  integration: ExternalCapability["integration"]
  redistribution: "do_not_vendor"
  endpoint?: string
  apiBase?: string
  authConfigured: boolean
  authRequired: boolean
  installHint?: string
  proxyEnabled: boolean
  triggers: string[]
  tools: ExternalCapability["tools"]
}

export const isProxyEnabled = (env: NodeJS.ProcessEnv): boolean =>
  env.JUST_DO_IT_EXTERNAL_CALLS === "enabled"

export const describeCapabilities = (
  registry: ExternalRegistry,
  env: NodeJS.ProcessEnv,
): ExternalCapabilityView[] => {
  const proxyEnabled = isProxyEnabled(env)
  return registry.capabilities.map((capability) => {
    const authEnv = capability.authEnv
    const authConfigured = authEnv ? Boolean(env[authEnv]?.trim()) : false
    const apiBase =
      (capability.apiBaseEnv ? env[capability.apiBaseEnv] : undefined) || capability.defaultApiBase
    const view: ExternalCapabilityView = {
      id: capability.id,
      kind: capability.kind,
      title: capability.title,
      sourceUrl: capability.sourceUrl,
      license: capability.license,
      integration: capability.integration,
      redistribution: "do_not_vendor",
      authConfigured,
      authRequired: capability.authRequired,
      proxyEnabled: capability.kind === "external_mcp" ? proxyEnabled : false,
      triggers: capability.triggers,
      tools: capability.tools,
    }
    if (capability.endpoint) view.endpoint = capability.endpoint
    if (apiBase) view.apiBase = apiBase
    if (capability.installHint) view.installHint = capability.installHint
    return view
  })
}
