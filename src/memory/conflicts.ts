import type { MemoryConflict, MemoryRecord } from "./types.js"

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "our",
  "use",
  "using",
  "must",
  "should",
  "will",
  "not",
  "avoid",
  "prefer",
  "instead",
  "rather",
  "than",
  "only",
  "all",
  "any",
  "are",
  "is",
  "be",
  "to",
  "of",
  "in",
  "on",
  "a",
  "an",
  "we",
  "or",
])

const NEGATION = /\b(not|never|no|avoid|disallow|forbid|don't|do not|must not|shouldn't|should not)\b/i
const PREFER = /\b(prefer|use|choose|adopt|require|mandate)\b/i

export const tokenizeContent = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9_./+-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t))

const overlapCount = (a: Set<string>, b: Set<string>): number => {
  let n = 0
  for (const t of a) {
    if (b.has(t)) n += 1
  }
  return n
}

const polarity = (text: string): "neg" | "pos" | "unknown" => {
  const hasNeg = NEGATION.test(text)
  const hasPrefer = PREFER.test(text)
  if (hasNeg && hasPrefer) return "neg"
  if (hasNeg) return "neg"
  if (hasPrefer) return "pos"
  return "unknown"
}

/**
 * Detect contradictory active decision/constraint pairs.
 * Surfaces conflicts; does not merge or drop either side.
 */
export const detectConflicts = (records: MemoryRecord[]): MemoryConflict[] => {
  const candidates = records.filter(
    (r) =>
      (r.recordType === "decision" || r.recordType === "constraint") &&
      r.supersededBy === null,
  )

  const conflicts: MemoryConflict[] = []
  const seen = new Set<string>()

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const left = candidates[i]!
      const right = candidates[j]!
      const leftTokens = new Set(tokenizeContent(left.content))
      const rightTokens = new Set(tokenizeContent(right.content))
      const shared = overlapCount(leftTokens, rightTokens)

      if (shared < 2) continue

      const leftPol = polarity(left.content)
      const rightPol = polarity(right.content)
      const opposing =
        (leftPol === "neg" && rightPol === "pos") ||
        (leftPol === "pos" && rightPol === "neg")

      // Same topic tokens + opposing polarity, or near-duplicate topic with "instead"/"rather"
      const explicitFlip =
        /\b(instead of|rather than|no longer|replaces?)\b/i.test(left.content) ||
        /\b(instead of|rather than|no longer|replaces?)\b/i.test(right.content)

      if (!opposing && !explicitFlip) continue

      const key = [left.id, right.id].sort().join(":")
      if (seen.has(key)) continue
      seen.add(key)

      conflicts.push({
        leftId: left.id,
        rightId: right.id,
        reason: opposing
          ? `Active ${left.recordType} records share topic tokens but opposing polarity`
          : `Active ${left.recordType} records may supersede each other (explicit flip language)`,
      })
    }
  }

  return conflicts
}

/** Attach conflict ids relevant to a hit set. */
export const conflictsForHits = (
  hits: MemoryRecord[],
  allActive: MemoryRecord[],
): MemoryConflict[] => {
  const hitIds = new Set(hits.map((h) => h.id))
  return detectConflicts(allActive).filter(
    (c) => hitIds.has(c.leftId) || hitIds.has(c.rightId),
  )
}
