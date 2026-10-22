import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { SkillCatalog } from "../../skills/catalog.js"
import { callExternalCapability } from "../../integrations/context7.js"
import { describeCapabilities, loadExternalRegistry } from "../../integrations/registry.js"
import { draftSkillCandidate } from "../../skills/draft.js"
import type { Scenario, ToolDefinition } from "./types.js"

export interface ToolDispatchResult {
  ok: boolean
  content: string
  blocked?: boolean
}

export const HARNESS_TOOLS: readonly ToolDefinition[] = [
  { name: "recommend_skills", description: "Rank catalog skills for a task. Returns explanations, not skill bodies." },
  { name: "search_skills", description: "Search catalog summaries by text." },
  { name: "plan_capabilities", description: "Plan skill loads and external prerequisites. Does not execute them." },
  { name: "get_skill", description: "Read one skill body by id." },
  { name: "list_external_capabilities", description: "List external capabilities without returning secrets." },
  { name: "call_external_capability", description: "Call an allowlisted external capability. Proxy stays off unless the scenario allows it." },
  { name: "draft_skill_candidate", description: "Return a skill draft. Does not write the catalog." },
  { name: "read_fixture", description: "Read one file inside the scenario workspace." },
  { name: "write_artifact", description: "Write one file inside the scenario workspace." },
  { name: "run_command", description: "Not executed. The harness records and blocks process execution." },
]

const MAX_TOOL_CHARS = 20_000

export const resolveInside = (root: string, relativePath: string): string | undefined => {
  if (!relativePath || path.isAbsolute(relativePath)) return undefined
  const resolved = path.resolve(root, relativePath)
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  if (resolved !== root && !resolved.startsWith(prefix)) return undefined
  return resolved
}

const clip = (text: string): string => (text.length <= MAX_TOOL_CHARS ? text : `${text.slice(0, MAX_TOOL_CHARS)}\n…[truncated]`)

export const dispatchTool = async (
  name: string,
  args: Record<string, unknown>,
  options: { scenario: Scenario; catalog: SkillCatalog; workspace: string },
): Promise<ToolDispatchResult> => {
  if (!options.scenario.allowedTools.includes(name)) {
    return { ok: false, content: `Tool ${name} is not available in this scenario.` }
  }

  try {
    switch (name) {
      case "recommend_skills": {
        const task = typeof args.task === "string" ? args.task : ""
        if (!task) return { ok: false, content: "recommend_skills requires task" }
        const projectContext = typeof args.projectContext === "string" ? args.projectContext : undefined
        const limit = typeof args.limit === "number" ? args.limit : 5
        const result = await options.catalog.recommend({
          task,
          limit,
          ...(projectContext ? { projectContext } : {}),
        })
        return { ok: true, content: clip(JSON.stringify(result)) }
      }
      case "search_skills": {
        const query = typeof args.query === "string" ? args.query : ""
        const result = await options.catalog.search({ query, limit: 20 })
        return { ok: true, content: clip(JSON.stringify(result)) }
      }
      case "plan_capabilities": {
        const task = typeof args.task === "string" ? args.task : ""
        if (!task) return { ok: false, content: "plan_capabilities requires task" }
        const result = await options.catalog.plan({ task, limit: 3 })
        return { ok: true, content: clip(JSON.stringify(result)) }
      }
      case "get_skill": {
        const skillName = typeof args.skillName === "string" ? args.skillName : ""
        if (!skillName) return { ok: false, content: "get_skill requires skillName" }
        const result = await options.catalog.read(skillName)
        return { ok: true, content: clip(JSON.stringify(result)) }
      }
      case "list_external_capabilities": {
        const registry = loadExternalRegistry()
        const env = { ...process.env }
        if (!options.scenario.allowLiveExternal) delete env.JUST_DO_IT_EXTERNAL_CALLS
        return {
          ok: true,
          content: clip(JSON.stringify({ capabilities: describeCapabilities(registry, env) })),
        }
      }
      case "call_external_capability": {
        const capabilityId = typeof args.capabilityId === "string" ? args.capabilityId : ""
        const tool = typeof args.tool === "string" ? args.tool : ""
        if (!capabilityId || !tool) return { ok: false, content: "call_external_capability requires capabilityId and tool" }
        const registry = loadExternalRegistry()
        const env = { ...process.env }
        if (!options.scenario.allowLiveExternal) delete env.JUST_DO_IT_EXTERNAL_CALLS
        const result = await callExternalCapability(
          {
            capabilityId,
            tool,
            ...(typeof args.query === "string" ? { query: args.query } : {}),
            ...(typeof args.libraryName === "string" ? { libraryName: args.libraryName } : {}),
            ...(typeof args.libraryId === "string" ? { libraryId: args.libraryId } : {}),
          },
          { registry, env },
        )
        return { ok: true, content: clip(JSON.stringify(result)) }
      }
      case "draft_skill_candidate": {
        const draftName = typeof args.name === "string" ? args.name : ""
        const description = typeof args.description === "string" ? args.description : ""
        const body = typeof args.body === "string" ? args.body : ""
        const draft = draftSkillCandidate({ name: draftName, description, body })
        return { ok: draft.status === "ok", content: clip(JSON.stringify(draft)) }
      }
      case "read_fixture": {
        const relative = typeof args.path === "string" ? args.path : ""
        const target = resolveInside(options.workspace, relative)
        if (!target) return { ok: false, blocked: true, content: "read_fixture path is outside the workspace" }
        const text = await readFile(target, "utf8")
        return { ok: true, content: clip(text) }
      }
      case "write_artifact": {
        const relative = typeof args.path === "string" ? args.path : ""
        const content = typeof args.content === "string" ? args.content : ""
        const target = resolveInside(options.workspace, relative)
        if (!target) return { ok: false, blocked: true, content: "write_artifact path is outside the workspace" }
        if (content.length > 64_000) return { ok: false, content: "artifact exceeds 64000 characters" }
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, content, "utf8")
        return { ok: true, content: `wrote ${relative}` }
      }
      case "run_command":
        return {
          ok: false,
          blocked: true,
          content: "run_command is blocked. This harness does not spawn processes.",
        }
      default:
        return { ok: false, content: `Unknown tool ${name}` }
    }
  } catch (error) {
    return {
      ok: false,
      content: error instanceof Error ? error.message : "tool failed",
    }
  }
}
