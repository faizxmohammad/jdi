# Skill execution harness

The catalog server does not run an agent. `src/eval/harness/` is a separate loop:

1. Load a scenario from `eval/scenarios/*.json`.
2. Copy fixture files into a temporary directory.
3. Ask a provider for the next turn. The prompt contains the task, a context note, and tool names. It does not contain acceptance criteria or fixture bodies.
4. Dispatch tool calls through the real `SkillCatalog`, external-capability registry, and workspace files.
5. Grade the transcript with `evaluateRun`.
6. Delete the temporary directory.

`run_command` never spawns a process. External calls stay off unless a scenario sets `allowLiveExternal: true`. No scenario in the default batch does that.

## Commands

```bash
npm run eval:skills
npm run eval:skills -- --live
```

The default command is simulated. Scripts in the scenario files supply the turns. The tools they call are real. A pass means the script reached the real catalog and the grader accepted the citations. `operationallyValidated` stays `false`.

`--live` uses `JUST_DO_IT_EVAL_API_KEY`, `JUST_DO_IT_EVAL_BASE_URL`, and `JUST_DO_IT_EVAL_MODEL`. If any of those is missing, the run is `blocked`, not `pass`, and the command exits non-zero. The harness does not invent a model price. `estimatedCostUsd` stays null. Token counts are recorded only when the provider returns them.

Results are written to `eval/skill-execution-results.json`.

## What the grader checks

- The scenario skill was loaded with `get_skill`.
- Required tools returned success.
- `recommend_skills` output contains the ids listed in `recommendIncludes`.
- Every `mustCite` string appears in the named tool output and in the final answer.
- Quoted `status: "..."` values in the final answer also appear in that tool evidence. Two different readings of the same rows can pass. A status that was never returned fails.
- Prohibited phrases and unsupported claims (`tests passed` without `run_command`) fail the run.
- Artifact snippets are taken from files the agent wrote in the workspace.

The partial-cancellation fixture does not grade one root-cause sentence. It grades whether the answer cites the booking id, room id, trace id, and statuses that the file actually contains.
