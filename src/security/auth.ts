import type { Request, Response, NextFunction } from "express"
import type { AuditLogger } from "./audit.js"
import type { AuthPrincipal, CredentialStore } from "./credentials.js"

export type { AuthPrincipal }

declare module "express-serve-static-core" {
  interface Request {
    authPrincipal?: AuthPrincipal
  }
}

const extractBearerToken = (header: string | undefined): string => {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "")
  return match?.[1] ?? ""
}

export const createRequireBearerAuth = (options: {
  credentials: CredentialStore
  audit?: AuditLogger
  /** When true, emit auth_ok on every successful request (noisy under MCP). Default false. */
  logAuthOk?: boolean
}) => {
  const audit = options.audit
  const logAuthOk = options.logAuthOk ?? false

  return (req: Request, res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req.header("authorization"))
    const remote = req.ip || req.socket.remoteAddress || "unknown"
    const result = options.credentials.authenticate(token)

    if (!result.ok) {
      audit?.({
        event: result.reason === "revoked" ? "auth_revoked" : "auth_fail",
        remote,
      })
      res.status(401).json({ error: "unauthorized" })
      return
    }

    req.authPrincipal = result.principal
    if (logAuthOk) {
      audit?.({
        event: "auth_ok",
        credentialId: result.principal.credentialId,
        ownerId: result.principal.ownerId,
        remote,
      })
    }
    next()
  }
}
