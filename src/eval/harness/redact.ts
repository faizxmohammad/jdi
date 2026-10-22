const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]{8,}/g
const SK_KEY = /\bsk-[A-Za-z0-9]{8,}\b/g

export const redactText = (text: string, secrets: readonly string[]): string => {
  let out = text
  for (const secret of secrets) {
    if (secret.length < 8) continue
    out = out.split(secret).join("[REDACTED]")
  }
  return out.replace(BEARER, "Bearer [REDACTED]").replace(SK_KEY, "[REDACTED]")
}

export const redactValue = (value: unknown, secrets: readonly string[]): unknown => {
  if (typeof value === "string") return redactText(value, secrets)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = redactValue(item, secrets)
    }
    return out
  }
  return value
}

export const collectSecrets = (extra: readonly string[] = []): string[] => {
  const fromEnv = [process.env.JUST_DO_IT_TOKEN, process.env.CONTEXT7_API_KEY, process.env.JUST_DO_IT_EVAL_API_KEY]
  return [...fromEnv, ...extra].filter((value): value is string => Boolean(value && value.length >= 8))
}
