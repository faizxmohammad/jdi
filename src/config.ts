import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { z } from "zod"

/** Load `.env` from cwd when vars are not already set (Node does not load it automatically). */
const loadDotEnv = (filePath: string): void => {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, "utf8")
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadDotEnv(path.resolve(process.cwd(), ".env"))

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default("127.0.0.1"),
  JUST_DO_IT_TOKEN: z.string().min(32, "JUST_DO_IT_TOKEN must be at least 32 characters"),
  /** Owner id permanently bound to JUST_DO_IT_TOKEN (required). */
  JUST_DO_IT_OWNER_ID: z
    .string()
    .min(1)
    .max(128)
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/,
      "JUST_DO_IT_OWNER_ID must be a valid owner id",
    ),
  /**
   * Deployment posture. `public` is refused at process start until stronger
   * public-internet auth is implemented (see docs/deployment-modes.md).
   */
  JUST_DO_IT_DEPLOYMENT_MODE: z.enum(["local", "private", "public"]).default("local"),
  /** Optional JSON file of additional { id, token, ownerId, revoked?, orgId?, scopes? } credentials. */
  JUST_DO_IT_API_TOKENS_PATH: z.string().optional(),
  /**
   * Optional JSON file of team orgs ({ orgs: [...] }) for multi-owner foundation.
   * Required when any credential sets orgId. See docs/team-model.md.
   */
  JUST_DO_IT_ORGS_PATH: z.string().optional(),
  JUST_DO_IT_CATALOG_PATH: z.string().default("./skills"),
  JUST_DO_IT_MAX_SKILL_BYTES: z.coerce.number().int().positive().max(1024 * 1024).default(256 * 1024),
  JUST_DO_IT_MEMORY_PATH: z.string().default("./data/memory.sqlite"),
  /** 0 = no default expiry; positive = days until retentionExpiresAt on new saves without explicit retentionDays */
  JUST_DO_IT_MEMORY_DEFAULT_RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(0),
  JUST_DO_IT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  JUST_DO_IT_RATE_LIMIT_MAX: z.coerce.number().int().positive().max(100_000).default(120),
  /** express.json limit string, e.g. 1mb */
  JUST_DO_IT_JSON_BODY_LIMIT: z.string().default("1mb"),
  JUST_DO_IT_AUDIT_AUTH_OK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors)
  console.error("Tip: copy .env.example to .env and set JUST_DO_IT_TOKEN + JUST_DO_IT_OWNER_ID.")
  process.exit(1)
}

export const config = {
  ...parsed.data,
  catalogPath: path.resolve(parsed.data.JUST_DO_IT_CATALOG_PATH),
  memoryPath:
    parsed.data.JUST_DO_IT_MEMORY_PATH === ":memory:"
      ? ":memory:"
      : path.resolve(parsed.data.JUST_DO_IT_MEMORY_PATH),
  apiTokensPath: parsed.data.JUST_DO_IT_API_TOKENS_PATH
    ? path.resolve(parsed.data.JUST_DO_IT_API_TOKENS_PATH)
    : undefined,
  orgsPath: parsed.data.JUST_DO_IT_ORGS_PATH
    ? path.resolve(parsed.data.JUST_DO_IT_ORGS_PATH)
    : undefined,
}

/** Fail closed: public internet hosting is not enabled in this release. */
export const assertDeploymentModeAllowed = (): void => {
  if (config.JUST_DO_IT_DEPLOYMENT_MODE === "public") {
    console.error(
      [
        "JUST_DO_IT_DEPLOYMENT_MODE=public is not enabled.",
        "Use local or private (Tailscale/HTTPS self-host) with per-token owner binding.",
        "See docs/deployment-modes.md.",
      ].join(" "),
    )
    process.exit(1)
  }
}
