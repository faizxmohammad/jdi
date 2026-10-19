import express, { type Express } from "express"
import helmet from "helmet"
import { config } from "./config.js"
import { defaultMemoryLogger } from "./memory/logging.js"
import { MemoryService } from "./memory/service.js"
import { MemoryStore } from "./memory/store.js"
import { buildOrgStore, resolveOrgCatalogPath, type OrgStore } from "./org/store.js"
import { defaultAuditLogger, silentAuditLogger, type AuditLogger } from "./security/audit.js"
import { createRequireBearerAuth } from "./security/auth.js"
import {
  buildCredentialStore,
  type CredentialStore,
} from "./security/credentials.js"
import { createRateLimiter } from "./security/rateLimit.js"
import { SkillCatalog } from "./skills/catalog.js"
import { connectMcp, createMcpServer, createTransport } from "./mcp/server.js"

export interface AppOptions {
  catalog?: SkillCatalog
  memory?: MemoryService
  credentials?: CredentialStore
  orgStore?: OrgStore
  audit?: AuditLogger
  rateLimitWindowMs?: number
  rateLimitMax?: number
  jsonBodyLimit?: string
  /** Test override; defaults to JUST_DO_IT_DEPLOYMENT_MODE. */
  deploymentMode?: "local" | "private" | "public"
}

export const createDefaultMemoryService = (): MemoryService => {
  const store = new MemoryStore({ dbPath: config.memoryPath })
  const options: ConstructorParameters<typeof MemoryService>[0] = {
    store,
    defaultRetentionDays: config.JUST_DO_IT_MEMORY_DEFAULT_RETENTION_DAYS,
  }
  if (config.NODE_ENV !== "test") {
    options.logger = defaultMemoryLogger
  }
  return new MemoryService(options)
}

export const createDefaultOrgStore = (): OrgStore => {
  return buildOrgStore({
    ...(config.orgsPath ? { orgsFilePath: config.orgsPath } : {}),
  })
}

export const createDefaultCredentialStore = (
  orgStore: OrgStore = createDefaultOrgStore(),
): CredentialStore => {
  return buildCredentialStore({
    primaryToken: config.JUST_DO_IT_TOKEN,
    primaryOwnerId: config.JUST_DO_IT_OWNER_ID,
    ...(config.apiTokensPath ? { tokensFilePath: config.apiTokensPath } : {}),
    orgStore,
  })
}

export const createApp = (options: AppOptions = {}): Express => {
  const deploymentMode = options.deploymentMode ?? config.JUST_DO_IT_DEPLOYMENT_MODE
  if (deploymentMode === "public") {
    throw new Error(
      "JUST_DO_IT_DEPLOYMENT_MODE=public is not enabled; see docs/deployment-modes.md",
    )
  }

  const app = express()
  const defaultCatalog = options.catalog ?? new SkillCatalog()
  const memory = options.memory ?? createDefaultMemoryService()
  const orgStore = options.orgStore ?? createDefaultOrgStore()
  const credentials = options.credentials ?? createDefaultCredentialStore(orgStore)
  const audit: AuditLogger =
    options.audit ?? (config.NODE_ENV === "test" ? silentAuditLogger : defaultAuditLogger)
  const rateLimit = createRateLimiter({
    windowMs: options.rateLimitWindowMs ?? config.JUST_DO_IT_RATE_LIMIT_WINDOW_MS,
    max: options.rateLimitMax ?? config.JUST_DO_IT_RATE_LIMIT_MAX,
  })
  const requireAuth = createRequireBearerAuth({
    credentials,
    audit,
    logAuthOk: config.JUST_DO_IT_AUDIT_AUTH_OK,
  })

  /** Cache org-private catalogs by absolute path for the process lifetime. */
  const orgCatalogs = new Map<string, SkillCatalog>()

  const resolveCatalog = (orgId: string | undefined): SkillCatalog => {
    if (!orgId) return defaultCatalog
    const org = orgStore.getOrg(orgId)
    if (!org) return defaultCatalog
    const catalogPath = resolveOrgCatalogPath(org)
    if (!catalogPath) return defaultCatalog
    const cached = orgCatalogs.get(catalogPath)
    if (cached) return cached
    const created = new SkillCatalog({ catalogPath })
    orgCatalogs.set(catalogPath, created)
    return created
  }

  app.disable("x-powered-by")
  app.set("trust proxy", false)
  app.use(helmet())
  app.use(express.json({ limit: options.jsonBodyLimit ?? config.JUST_DO_IT_JSON_BODY_LIMIT }))

  app.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "UP" })
  })

  app.get("/health/ready", async (_req, res) => {
    try {
      await defaultCatalog.search("", 1)
      res.status(200).json({ status: "UP" })
    } catch {
      res.status(503).json({ status: "DOWN" })
    }
  })

  // MCP endpoint: every request, including initialization, is authenticated and rate-limited.
  app.all("/mcp", rateLimit, requireAuth, async (req, res) => {
    const principal = req.authPrincipal
    if (!principal) {
      res.status(401).json({ error: "unauthorized" })
      return
    }

    const catalog = resolveCatalog(principal.orgId)
    const server = createMcpServer({ catalog, memory, principal, audit, orgStore })
    const transport = createTransport()

    res.on("close", () => {
      void transport.close()
      void server.close()
    })

    try {
      await connectMcp(server, transport)
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      console.error("MCP request failed", {
        method: req.method,
        message: error instanceof Error ? error.message : "unknown error",
      })
      if (!res.headersSent) res.status(500).json({ error: "internal_server_error" })
    }
  })

  // After routes: oversized JSON bodies → JSON error (no HTML stack pages).
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ): void => {
      const type =
        err && typeof err === "object" && "type" in err
          ? String((err as { type?: unknown }).type)
          : ""
      const status =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status?: unknown }).status)
          : undefined
      if (type === "entity.too.large" || status === 413) {
        res.status(413).json({ error: "payload_too_large" })
        return
      }
      next(err)
    },
  )

  return app
}
