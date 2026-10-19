#!/usr/bin/env node
import path from "node:path"
import { diagnoseCatalog, runImportSkill } from "../catalog/importCommand.js"

const defaultCatalogPath = (): string =>
  path.resolve(process.env.JUST_DO_IT_CATALOG_PATH ?? "./skills")

const maxSkillBytes = (): number => {
  const raw = process.env.JUST_DO_IT_MAX_SKILL_BYTES
  const parsed = raw ? Number.parseInt(raw, 10) : 256 * 1024
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 256 * 1024
}

interface CliArgs {
  sourceId?: string
  from?: string
  catalog: string
  check: boolean
  diagnose: boolean
  help: boolean
}

const printUsage = (): void => {
  console.log(`Usage:
  npm run import-skill -- --diagnose [--catalog <path>]
  npm run import-skill -- --source <sourceId> --from <skillDir> [--catalog <path>] [--check]

Options:
  --diagnose          Scan catalog + manifest; print diagnostics JSON (no copy)
  --source <id>       Manifest source id (must pass import gate)
  --from <dir>        Candidate skill directory containing SKILL.md
  --catalog <path>    Target catalog root (default: JUST_DO_IT_CATALOG_PATH or ./skills)
  --check             Validate and report only; do not write files
  --help              Show this help

Import gate (fail-closed):
  - source importStatus must be "imported" or "approved_for_import"
  - license must not be "unknown"
  - approved_for_import requires commitOrRelease
  - imported sources other than just-do-it-local also require commitOrRelease
  - candidate SKILL.md must declare sourceId matching --source (no silent default)

Third-party sources that are pending_audit / metadata_only / needs_review are BLOCKED.
`)
}

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {
    catalog: defaultCatalogPath(),
    check: false,
    diagnose: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      args.help = true
      continue
    }
    if (arg === "--diagnose") {
      args.diagnose = true
      continue
    }
    if (arg === "--check") {
      args.check = true
      continue
    }
    if (arg === "--source") {
      const value = argv[++i]
      if (!value) throw new Error("--source requires a value")
      args.sourceId = value
      continue
    }
    if (arg === "--from") {
      const value = argv[++i]
      if (!value) throw new Error("--from requires a value")
      args.from = value
      continue
    }
    if (arg === "--catalog") {
      const value = argv[++i]
      if (value) args.catalog = path.resolve(value)
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

const main = async (): Promise<number> => {
  let args: CliArgs
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid arguments")
    printUsage()
    return 2
  }

  if (args.help) {
    printUsage()
    return 0
  }

  if (args.diagnose) {
    const report = await diagnoseCatalog({
      catalog: args.catalog,
      maxSkillBytes: maxSkillBytes(),
    })
    console.log(JSON.stringify(report, null, 2))
    return report.ok ? 0 : 1
  }

  if (!args.sourceId || !args.from) {
    console.error("error: --source and --from are required unless --diagnose")
    printUsage()
    return 2
  }

  const result = await runImportSkill({
    sourceId: args.sourceId,
    from: args.from,
    catalog: args.catalog,
    check: args.check,
    maxSkillBytes: maxSkillBytes(),
  })

  const stream = result.ok ? console.log : console.error
  stream(JSON.stringify(result, null, 2))
  return result.ok ? 0 : 1
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
