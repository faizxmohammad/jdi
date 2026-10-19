const FRONTMATTER = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

const parseScalar = (raw: string): string => raw.trim().replace(/^['"]|['"]$/g, "")

const parseList = (raw: string): string[] => {
  const value = parseScalar(raw)
  if (!value) return []
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((part) => parseScalar(part))
      .filter(Boolean)
  }
  return value.split(",").map((part) => parseScalar(part)).filter(Boolean)
}

export type FrontmatterMap = Record<string, string>

export const parseFrontmatter = (markdown: string): { data: FrontmatterMap; body: string } => {
  const match = FRONTMATTER.exec(markdown)
  if (!match?.[1]) return { data: {}, body: markdown }

  const data: FrontmatterMap = {}
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf(":")
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (key) data[key] = value
  }

  return { data, body: markdown.slice(match[0].length) }
}

export const frontmatterString = (data: FrontmatterMap, key: string): string | undefined => {
  const value = data[key]
  if (value === undefined) return undefined
  const parsed = parseScalar(value)
  return parsed || undefined
}

export const frontmatterList = (data: FrontmatterMap, key: string): string[] => {
  const value = data[key]
  if (value === undefined) return []
  return parseList(value)
}
