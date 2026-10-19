#!/usr/bin/env node
import path from "node:path"
import { getAdapter, parseAdapterId, type AdapterId } from "../sync/adapters.js"
import {
  applyInstall,
  applyRemove,
  applyRollback,
  listSyncStatus,
  pinSkill,
  planInstall,
  unpinSkill,
} from "../sync/install.js"
import {
  checkAllIntegrations,
  checkIntegration,
  listIntegrations,
} from "../sync/integrations.js"

const defaultCatalogPath = (): string =>
  path.resolve(process.env.JUST_DO_IT_CATALOG_PATH ?? "./skills")

interface GlobalArgs {
  command?: string
  target: AdapterId
  catalog: string
  preview: boolean
  unpin: boolean
  help: boolean
  skillId?: string
  version?: string
  integrationId?: string
  home?: string
  stateRoot?: string
  rest: string[]
}

const printUsage = (): void => {
  console.log(`Usage:
  npm run just-do-it -- <command> [options]

Commands:
  list [--target <claude-code|cursor>]
  install <skillId> [--target ...] [--preview]
  update <skillId> [--target ...] [--preview] [--unpin]
  remove <skillId> [--target ...] [--preview]
  pin <skillId> [--version <ver>] [--target ...]
  unpin <skillId> [--target ...]
  rollback <skillId> [--target ...] [--preview]
  preview install|update|remove|rollback <skillId> [--target ...]
  integrations
  deps [integrationId]

Options:
  --target <id>     Client adapter (claude-code|cursor). Default: claude-code
  --catalog <path>  Catalog root (default: JUST_DO_IT_CATALOG_PATH or ./skills)
  --preview         Show planned file changes; do not write
  --unpin           Allow update past a pinned version
  --version <ver>   Version to pin
  --home <path>     Override home for default adapter roots / state
  --state-root <p>  Override ~/.just-do-it state directory
  --help            Show this help

Safety:
  - Honors the catalog import gate (blocked statuses cannot install)
  - Refuses to overwrite or remove user-owned (unmanaged) skills
  - Rejects unsafe paths and symlinks
  - Never executes skill scripts

Env:
  JUST_DO_IT_CATALOG_PATH, JUST_DO_IT_CLAUDE_SKILLS, JUST_DO_IT_CURSOR_SKILLS,
  JUST_DO_IT_HOME, JUST_DO_IT_STATE_ROOT
`)
}

const parseArgs = (argv: string[]): GlobalArgs => {
  const args: GlobalArgs = {
    target: "claude-code",
    catalog: defaultCatalogPath(),
    preview: false,
    unpin: false,
    help: false,
    rest: [],
  }

  const positional: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      args.help = true
      continue
    }
    if (arg === "--preview") {
      args.preview = true
      continue
    }
    if (arg === "--unpin") {
      args.unpin = true
      continue
    }
    if (arg === "--target") {
      const value = argv[++i]
      if (!value) throw new Error("--target requires a value")
      const id = parseAdapterId(value)
      if (!id) throw new Error(`Unknown target: ${value}`)
      args.target = id
      continue
    }
    if (arg === "--catalog") {
      const value = argv[++i]
      if (!value) throw new Error("--catalog requires a value")
      args.catalog = path.resolve(value)
      continue
    }
    if (arg === "--version") {
      const value = argv[++i]
      if (!value) throw new Error("--version requires a value")
      args.version = value
      continue
    }
    if (arg === "--home") {
      const value = argv[++i]
      if (!value) throw new Error("--home requires a value")
      args.home = path.resolve(value)
      continue
    }
    if (arg === "--state-root") {
      const value = argv[++i]
      if (!value) throw new Error("--state-root requires a value")
      args.stateRoot = path.resolve(value)
      continue
    }
    if (arg?.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`)
    }
    if (arg) positional.push(arg)
  }

  const command = positional[0]
  if (command) args.command = command
  args.rest = positional.slice(1)

  if (args.command === "preview") {
    args.preview = true
    const nested = positional[1]
    if (nested) args.command = nested
    const skillId = positional[2]
    if (skillId) args.skillId = skillId
    args.rest = positional.slice(3)
  } else if (
    args.command === "install" ||
    args.command === "update" ||
    args.command === "remove" ||
    args.command === "rollback" ||
    args.command === "pin" ||
    args.command === "unpin"
  ) {
    const skillId = positional[1]
    if (skillId) args.skillId = skillId
  } else if (args.command === "deps") {
    const integrationId = positional[1]
    if (integrationId) args.integrationId = integrationId
  }

  return args
}

const syncOptions = (args: GlobalArgs) => {
  const adapterOptions = args.home ? { home: args.home } : {}
  const stateOptions: { home?: string; stateRoot?: string } = {}
  if (args.home) stateOptions.home = args.home
  if (args.stateRoot) stateOptions.stateRoot = args.stateRoot

  return {
    catalogPath: args.catalog,
    adapter: getAdapter(args.target, adapterOptions),
    preview: args.preview,
    unpin: args.unpin,
    state: stateOptions,
  }
}

const main = async (): Promise<number> => {
  let args: GlobalArgs
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid arguments")
    printUsage()
    return 2
  }

  if (args.help || !args.command) {
    printUsage()
    return args.help ? 0 : 2
  }

  const options = syncOptions(args)

  if (args.command === "list") {
    const entries = await listSyncStatus(options)
    console.log(
      JSON.stringify(
        {
          adapter: options.adapter.id,
          adapterRoot: options.adapter.root,
          catalog: options.catalogPath,
          skills: entries,
        },
        null,
        2,
      ),
    )
    return 0
  }

  if (args.command === "integrations") {
    console.log(
      JSON.stringify(
        {
          integrations: listIntegrations().map((entry) => ({
            id: entry.id,
            title: entry.title,
            entryType: entry.entryType,
            capabilityKind: entry.capabilityKind,
            importStatus: entry.importStatus,
            validatedAt: entry.validatedAt,
            sourceUrl: entry.sourceUrl,
          })),
        },
        null,
        2,
      ),
    )
    return 0
  }

  if (args.command === "deps") {
    if (args.integrationId) {
      const report = await checkIntegration(args.integrationId)
      if (!report) {
        console.error(JSON.stringify({ ok: false, error: `unknown integration: ${args.integrationId}` }))
        return 1
      }
      console.log(JSON.stringify(report, null, 2))
      return 0
    }
    const reports = await checkAllIntegrations()
    console.log(JSON.stringify({ reports }, null, 2))
    return 0
  }

  if (
    args.command === "install" ||
    args.command === "update" ||
    args.command === "remove" ||
    args.command === "rollback" ||
    args.command === "pin" ||
    args.command === "unpin"
  ) {
    if (!args.skillId) {
      console.error(`error: ${args.command} requires <skillId>`)
      printUsage()
      return 2
    }
  }

  if (args.command === "install" || args.command === "update") {
    const result = args.preview
      ? await planInstall(args.skillId!, options)
      : await applyInstall(args.skillId!, options)
    console.log(JSON.stringify(result, null, 2))
    return result.ok ? 0 : 1
  }

  if (args.command === "remove") {
    const result = await applyRemove(args.skillId!, options)
    console.log(JSON.stringify(result, null, 2))
    return result.ok ? 0 : 1
  }

  if (args.command === "rollback") {
    const result = await applyRollback(args.skillId!, options)
    console.log(JSON.stringify(result, null, 2))
    return result.ok ? 0 : 1
  }

  if (args.command === "pin") {
    const result = await pinSkill(args.skillId!, args.version, options)
    console.log(JSON.stringify(result, null, 2))
    return result.ok ? 0 : 1
  }

  if (args.command === "unpin") {
    const result = await unpinSkill(args.skillId!, options)
    console.log(JSON.stringify(result, null, 2))
    return result.ok ? 0 : 1
  }

  console.error(`Unknown command: ${args.command}`)
  printUsage()
  return 2
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
