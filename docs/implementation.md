# Just-do-it — Product, Engineering & Operations Process

**Document version:** 1.0  
**Status:** Working draft  
**Product:** Just-do-it  
**Product vision:** Make AI-agent skills portable, discoverable, versioned, context-aware, and trustworthy.  
**Initial audience:** Individual developers using AI coding agents  
**Expansion audience:** Engineering teams and enterprises  
**Operating model:** Open-source first; built initially by a solo founder alongside full-time employment  
**Implementation direction:** TypeScript / Node.js, MCP, local CLI, containerized deployment

---

## 1. Purpose

This document is the working source of truth for building Just-do-it from an initial prototype into a reliable open-source product and, if user demand supports it, a sustainable venture-scale business.

It defines:

- The product thesis and target users.
- The initial skills and integrations to support.
- The complete phased roadmap.
- Architecture and data-model principles.
- Skill discovery and ranking.
- Persistent user and project context.
- Security, authentication, privacy, and trust.
- Development, testing, release, and operations processes.
- Validation and product metrics.
- Acceptance criteria and decision gates.

The document is intentionally phased. Do not implement every future capability in the first release. Each phase should deliver a working increment and be justified by evidence from the previous phase.

## 2. Product vision and positioning

### 2.1 Vision

Just-do-it helps AI coding agents find and use the right skills and project context at the right time, while keeping skill sources, versions, permissions, and decisions understandable and under user control.

### 2.2 Product thesis

Developers increasingly use agent instructions, reusable skills, design references, command-line tools, and MCP servers. These capabilities can be scattered across repositories, local folders, and different clients.

Just-do-it aims to provide a consistent layer for:

1. Discovering relevant skills.
2. Retrieving exact, traceable skill versions.
3. Reusing project context and prior decisions.
4. Guiding agents toward evidence-backed workflows.
5. Managing local and self-hosted integrations.
6. Eventually sharing trusted capabilities across teams.

This is a hypothesis to validate, not an assumption that the market gap has already been proven.

### 2.3 Positioning

**Working positioning:** A self-hostable skill registry and context layer for AI coding agents.

Just-do-it should not be merely another public directory or an MCP endpoint that returns `SKILL.md` files. Its long-term differentiation should come from reproducible skill distribution, project-aware recommendations, reliable context retrieval, provenance, and team governance.

### 2.4 Product principles

- Validate problems before expanding scope.
- Keep the open-source core useful independently.
- Prefer deterministic, source-backed behavior over unsupported claims.
- Preserve skill provenance and immutable versions.
- Treat skills and their scripts as untrusted content.
- Store only useful context and give users control over it.
- Keep user and project data isolated from the beginning.
- Prefer simple architecture until measured demand justifies complexity.
- Build incrementally and maintain the product sustainably alongside a full-time job.

## 3. Users and primary workflows

### 3.1 Initial user: individual developer

Needs:

- Find a relevant skill without searching many repositories manually.
- Understand what a skill does and what it requires.
- Retrieve and use a specific version.
- Carry useful project decisions into later sessions.
- Keep instructions consistent across supported coding agents.
- Inspect changes before updating skills.

### 3.2 Later user: engineering team

Needs:

- Share an approved set of skills privately.
- Pin versions for reproducible team workflows.
- Control who can publish, edit, or install skills.
- Review changes and maintain an audit trail.
- Apply engineering standards consistently across projects.
- Understand integration requirements and security risks.

### 3.3 Core workflow

1. A user configures Just-do-it in a supported agent.
2. The user asks the agent to perform a task.
3. The agent sends the task description and, where available, project identifiers or context to Just-do-it.
4. Just-do-it searches the authorized catalog and project memory.
5. Just-do-it returns relevant skills, reasons, versions, dependencies, and source references.
6. The agent uses its existing file, terminal, browser, and coding capabilities to carry out the work.
7. When appropriate, the agent explicitly submits a useful summary, decision, or outcome to project memory.
8. The user can inspect, correct, export, or delete stored context.

Just-do-it provides discovery and context. It does not replace the connected agent, and it cannot automatically observe every conversation, edit, or operation unless a supported client integration explicitly supplies that information.

## 4. Skill catalog

The product catalog is the first-party `skills/` tree in this repository (plus optional private org catalogs). Each skill is a directory containing `SKILL.md` with validated frontmatter (`sourceId`, name, description, tags, version).

### 4.1 Catalog entry types

Supported kinds include:

- `instruction_skill`: instructions consumed by an agent.
- `reference_collection`: design systems, guidelines, or reference material.
- `composite_workflow`: a documented workflow that uses capabilities available in the user’s environment.

The MCP server serves catalog content. It does not execute skill scripts.

## 5. Product development lifecycle

All significant features follow this lifecycle:

**Discover → Validate → Specify → Design → Implement → Verify → Release → Measure → Improve**

### 5.1 Discover

**Objective:** Identify a specific problem for a defined user.

Process:

1. Record the problem and affected user.
2. Document the current workaround.
3. Interview users or observe real workflows.
4. Review competing solutions.
5. Estimate frequency, severity, and consequences.
6. Separate observed facts from assumptions.

Deliverable: A problem brief.

Exit condition: The problem is specific enough to test.

### 5.2 Validate

**Objective:** Test whether solving the problem changes behavior.

Process:

1. Write a falsifiable hypothesis.
2. Select the smallest experiment that tests it.
3. Define the target users and success criteria.
4. Run interviews, prototypes, or hands-on trials.
5. Record observations and failures.
6. Decide to proceed, iterate, or stop.

Initial validation target: Interview 10–15 developers, recruit at least five prototype users, and look for repeat usage. These are proposed targets, not industry benchmarks.

Exit condition: There is sufficient evidence to justify implementation.

### 5.3 Specify

For every meaningful feature, record:

- Problem and intended users.
- Goals and non-goals.
- Functional requirements.
- Non-functional requirements.
- API/MCP contracts.
- Data and migration changes.
- Security and privacy implications.
- Failure modes and recovery.
- Acceptance criteria.
- Dependencies and compatibility constraints.

Exit condition: Requirements are testable and scope is bounded.

### 5.4 Design

Process:

1. Review existing architecture and conventions.
2. Choose the simplest design that meets requirements.
3. Define module and API boundaries.
4. Identify trust boundaries and permissions.
5. Plan persistence, consistency, and recovery.
6. Review migration and backward-compatibility implications.
7. Record significant decisions as architecture decision records (ADRs).

Exit condition: The design is maintainable and its risks are understood.

### 5.5 Implement

Process:

1. Create an isolated branch or change set.
2. Implement the smallest complete vertical slice.
3. Add tests alongside code.
4. Update documentation and examples.
5. Run formatting, linting, type checking, tests, and builds.
6. Inspect the diff for secrets, unsafe operations, and unrelated changes.
7. Commit with a clear message.

Exit condition: The change is ready for verification.

### 5.6 Verify

Run appropriate unit, integration, end-to-end, security, compatibility, and recovery tests.

Verify important workflows in actual supported clients. A successful server startup or green unit suite alone does not prove client compatibility.

Exit condition: Acceptance criteria are met and limitations are documented.

### 5.7 Release

1. Confirm CI is green.
2. Review security and dependency findings.
3. Update version and changelog.
4. Prepare migration and recovery instructions.
5. Build distribution artifacts.
6. Publish release notes and installation guidance.
7. Verify a clean installation.
8. Monitor issues and prepare mitigations.

Use semantic versioning where practical. Document breaking changes explicitly.

### 5.8 Measure and improve

Compare results with the original hypothesis. Review onboarding failures, support requests, repeat usage, and user feedback. Decide whether to improve, expand, maintain, or retire the feature.

## 6. Phased implementation roadmap

Phases should be completed in order, with a working deliverable and exit gate for each. Timing is indicative and depends on validation results and available founder time.

### Phase 0 — Audit and foundation

**Objective:** Establish a safe, reproducible baseline before adding more skills.

Scope:

- Inspect the existing TypeScript starter.
- Verify the MCP SDK API and HTTP transport behavior.
- Establish a clean install, build, typecheck, and test workflow.
- Review repository structure and dependencies.
- Define the catalog schema and first-party source manifest (see `docs/source-policy.md`).
- Do not treat early brainstorm inventories as mandatory imports.
- Define supported client versions and test procedures.
- Add repository license, contribution guidance, and security reporting instructions as appropriate.

Deliverables:

- Working local baseline.
- Source manifest with licensing and import status.
- Catalog schema.
- Initial automated test suite.
- Documented development setup.

Exit gate:

- A clean checkout installs and builds reproducibly.
- Known security and compatibility gaps are documented.
- No source is imported without a recorded license/redistribution decision.

### Phase 1 — Working skill registry MVP

**Objective:** Let an agent search for and retrieve approved skills.

Scope:

- Load approved skill content from local or Git-backed sources.
- Validate skill metadata and paths.
- Index name, description, tags, category, source, and version.
- Implement search and exact retrieval.
- Return source URLs, immutable version identifiers, and content digests.
- Add duplicate detection and import diagnostics.
- Provide a simple CLI or documented import command.
- Keep content read-only from the MCP interface.

Initial MCP tools (canonical names — see `docs/mcp-tool-contract.md`):

- `search_skills`
- `get_skill`
- `just_do_it_version`

Deliverables:

- Searchable catalog of approved skills.
- Verified Claude Code and Cursor connection instructions.
- Tests for search, retrieval, malformed metadata, and source errors.

Exit gate:

- A clean client setup can discover and retrieve the expected skill.
- The result includes provenance and a version identifier.
- Search does not require loading the entire catalog into the agent's context.

### Phase 2 — Context-aware skill recommendation

**Objective:** Recommend relevant skills for the user's current task.

Scope:

- Add `recommend_skills`.
- Accept a task description and optional project context reference.
- Start with metadata and keyword retrieval.
- Apply compatibility and availability filters.
- Rank a bounded candidate set.
- Return explanations, source references, versions, and prerequisites.
- Return no recommendation or ask for clarification when evidence is insufficient.
- Add a representative evaluation set of tasks and expected relevant skills.

Initial ranking approach:

1. Filter by authorization and project scope.
2. Retrieve candidates using metadata and keyword matching.
3. Optionally add semantic search after establishing a baseline.
4. Score task/skill relevance, explicit tags, compatibility, and verified availability.
5. Rerank a small candidate set.
6. Return a short list with explanations and evidence.

Do not use an opaque model score as the sole decision. Keep ranking factors inspectable and tune them against a test set.

Deliverables:

- Recommendation API/MCP tool.
- Evaluation dataset.
- Precision and relevance review.
- Tests for irrelevant requests and missing context.

Exit gate:

- Recommendations improve over a keyword-only baseline on the evaluation set.
- Each recommendation has a defensible explanation.
- Unsupported skills and dependencies are not fabricated.

### Phase 3 — Persistent user and project memory

**Objective:** Preserve useful context across sessions without collecting everything indiscriminately.

Scope:

- Add user and project ownership models.
- Add explicit context capture from the connected agent.
- Store preferences, constraints, decisions, open questions, task summaries, and outcomes.
- Add context search and relevant retrieval.
- Record provenance, timestamps, scope, and verification status.
- Detect contradictory or superseded decisions.
- Support user inspection, correction, export, and deletion.
- Add retention policies and privacy-conscious logging.
- Test access isolation before enabling multi-user storage.

Initial MCP tools:

- `get_project_context`
- `save_project_context`
- `search_project_memory`

Memory design:

- **MVP (accepted):** SQLite + FTS5 via `node:sqlite` for local/private self-host — see `docs/decisions/ADR-003-sqlite-memory.md`.
- PostgreSQL is deferred until multi-node / multi-writer need (not required for solo MVP).
- Add embeddings and hybrid retrieval only after evaluating exact FTS retrieval quality.
- Filter by owner/project authorization before ranking.
- Use exact keyword retrieval for technical identifiers and errors.
- Prefer explicit, verified, recent decisions when appropriate.
- Surface conflicts instead of silently merging contradictory records.
- Return provenance so the agent can distinguish facts, assumptions, and summaries.

Important limitation:

Just-do-it cannot independently observe all prompts, choices, edits, or operations in every client. The agent or an authorized integration must submit relevant context. Do not claim complete conversation capture unless a client integration actually provides it.

Exit gate:

- A later session can retrieve relevant saved project decisions.
- Private records are isolated by user and project.
- Users can inspect and delete memory.
- Retrieval quality and contradiction handling are tested.

### Phase 4 — Skill synchronization and external integrations

**Objective:** Help users go from discovery to a usable local workflow.

Scope:

- Add a local CLI for listing, installing, pinning, updating, and removing skills.
- Support target-client adapters rather than assuming all clients share the same filesystem layout.
- Preview file changes before applying them.
- Preserve user-owned files and reject unsafe paths.
- Make updates recoverable and provide rollback.
- Check external dependencies and installation prerequisites.
- Keep client-specific hooks separate from portable skill instructions.
- Track compatibility status and validation date.

Deliverables:

- CLI and client adapter interfaces.
- Installation and update workflows.
- Diff preview and rollback.
- Integration registry with prerequisite checks.

Exit gate:

- Installation, update, and rollback work on clean test environments.
- External dependencies are clearly distinguished from installed capabilities.
- No skill script is executed implicitly by the registry.

### Phase 5 — Authentication, public hosting, and operational security

**Objective:** Safely expose a multi-user hosted service.

**Design authentication and data isolation from Phase 0; complete public-facing controls in this phase.**

Scope:

- Support configurable credentials for self-hosted deployments.
- Add per-user or per-client API credentials.
- Support credential rotation and revocation.
- Enforce user and project authorization on every private operation.
- Add rate limits, quotas, request-size limits, and abuse protection.
- Add audit events for relevant administrative and access operations.
- Use HTTPS for remote access.
- Store secrets securely and redact them from logs.
- Add service health checks, metrics, backups, restore tests, and incident procedures.
- Perform a security review before opening public access.

Deployment options:

- Local process for single-user development.
- Docker Compose for self-hosted deployments.
- Managed container for an always-on hosted service.
- AWS Lambda or another serverless platform only after validating MCP transport compatibility, persistent storage, execution limits, and total cost.

Cost policy:

- Estimate compute, database, storage, logging, networking, and egress costs.
- Set spending alerts and service limits.
- Do not assume a serverless free tier means the complete service is free.
- Never rely on ephemeral function storage for durable memory or skill content.

Exit gate:

- Unauthorized access tests pass.
- Cross-user and cross-project access tests pass.
- Credentials can be revoked.
- Rate limits and resource limits are verified.
- Backup restoration and incident procedures are tested.
- Public beta has a documented privacy policy and security reporting process.

### Phase 6 — Open-source release and adoption

**Objective:** Make the product easy to evaluate, install, and contribute to.

Scope:

- Publish a public repository with a clear license.
- Add quick-start instructions for local and self-hosted modes.
- Provide client configuration examples.
- Publish a demo of search, recommendation, context retrieval, and skill pinning.
- Add contribution guidelines and issue/PR templates.
- Publish supported-client and integration matrices.
- Document data handling, telemetry, and security limitations.
- Recruit external testers and respond to feedback.
- Maintain versioned releases and a changelog.

Exit gate:

- External developers can install and use the product without direct founder assistance.
- The project has a documented support and contribution process.
- Feedback is collected and triaged consistently.

### Phase 7 — Team features (optional self-host)

**Objective:** Optional multi-member private self-host (orgs, scoped tokens, private catalog path) without changing the open-source core.

Potential scope:

- Private team catalogs.
- Membership and scoped credentials.
- Light governance hooks and audit events.
- Operator documentation (`docs/team-model.md`).

Exit gate:

- Operators can configure multi-member private access with bound tokens.
- Solo catalog search/get remains useful without team features.

### Phase 8 — Scale and hardened operations (optional)

**Objective:** Expand operational maturity only when self-host adoption justifies it.

Potential scope:

- Stronger identity options for private fleets.
- Advanced policy enforcement and audit exports.
- Provenance and supply-chain verification.
- Additional agent ecosystems.
- Reliability, security, and support process hardening.

Exit gate:

- Operational complexity is justified by real usage.
- Reliability and security practices remain sustainable for maintainers.

---

## 7. Architecture principles

### 7.1 Logical components

1. **MCP gateway:** Validates requests and exposes the supported tool interface.
2. **Skill catalog:** Stores metadata, sources, versions, and retrieval information.
3. **Import/validation pipeline:** Fetches approved sources, validates metadata, checks paths, and records provenance.
4. **Recommendation service:** Retrieves and ranks candidate skills.
5. **Context service:** Stores and retrieves authorized user/project memory.
6. **Integration registry:** Describes CLIs, plugins, external MCPs, and prerequisites.
7. **Persistence layer:** Stores metadata, context, ownership, and audit events.
8. **Local CLI:** Installs, pins, updates, and removes skills in supported client environments.
9. **Observability layer:** Provides structured logs, health checks, metrics, and diagnostics.

Keep these as logical modules initially. Do not split them into microservices until scale or operational requirements justify it.

### 7.2 Technology direction

- TypeScript with strict type checking.
- Node.js LTS.
- Official MCP SDK with verified API and transport behavior.
- SQLite + FTS5 for local/private memory MVP (ADR-003); PostgreSQL when multi-writer / multi-node requires it.
- Optional vector retrieval only after FTS quality evaluation.
- Git-backed sources and immutable source references.
- Object storage only when artifact size or scale warrants it.
- Docker Compose for the initial self-hosted deployment.
- Automated CI for formatting, linting, type checking, tests, security checks, and builds.

### 7.3 Storage principles

- Treat published skill versions as immutable.
- Keep source and content digests.
- Separate public catalog metadata from private user/project context.
- Enforce access control at the data access layer.
- Keep secrets out of the database where a dedicated secret manager is appropriate.
- Back up durable data and test restoration.
- Avoid storing full conversation transcripts by default.

---

## 8. MCP interface and contracts

Initial tools:

### `search_skills`

Input: query, optional category, bounded result limit.

Output: ranked summaries, tags, source references, version identifiers, and compatibility metadata.

### `get_skill`

Input: skill identifier and optional immutable version.

Output: exact content, provenance, digest, dependencies, and validation status.

### `recommend_skills`

Input: task description and optional project context reference.

Output: a bounded set of recommendations with reasons, prerequisites, and evidence. Distinguish verified facts from inferred relevance.

### `get_project_context`

Input: project identifier and current task description.

Output: relevant authorized memories with source, timestamp, and verification status.

### `save_project_context`

Input: project identifier, record type, content, source, and optional retention metadata.

Output: stored record identifier and confirmation of what was saved.

Saving context must be explicit and subject to the applicable privacy policy.

### `search_project_memory`

Input: project identifier, query, and bounded result limit.

Output: relevant authorized records, source references, timestamps, and conflict indicators.

### `just_do_it_version`

Output: server version, catalog version, and supported protocol capabilities.

Every tool must validate input, apply authorization, enforce limits, and return structured errors without leaking private information.

---

## 9. Context and memory policy

### 9.1 Memory categories

- User preference.
- Project fact or constraint.
- Architecture decision.
- Open question.
- Task summary.
- Implementation outcome.
- Rejected approach and reason.
- Explicitly requested reminder or durable note, where supported.

### 9.2 Memory record fields

Each record should contain:

- Record identifier.
- Owner identifier.
- Project identifier, when applicable.
- Record type.
- Content or summary.
- Source and provenance.
- Created and updated timestamps.
- Verification or confidence status.
- Superseded-by reference, when applicable.
- Retention or deletion metadata.

### 9.3 Retrieval rules

1. Authorize the user and project before searching.
2. Retrieve exact matches for identifiers and technical terms.
3. Search semantically when useful and supported.
4. Rank by relevance, source quality, verification, and recency as appropriate.
5. Prefer explicit decisions over inferred preferences.
6. Detect contradictory records.
7. Return source references and clearly label uncertainty.
8. Ask for clarification or abstain when the evidence is inadequate.

### 9.4 Privacy and user control

- Tell users what is stored and why.
- Do not capture everything by default.
- Allow inspection, correction, export, and deletion.
- Define retention periods.
- Keep sensitive data out of routine logs.
- Do not reuse private project context across users or projects.
- Document backup retention and deletion behavior.
- Do not use customer context for unrelated model training or analytics without an appropriate, explicit policy and consent.

---

## 10. Skill selection and hallucination reduction

Just-do-it cannot guarantee that a connected model will never hallucinate. It can reduce unsupported recommendations by making evidence and uncertainty explicit.

### Required behavior

- Recommend only skills present in the authorized catalog.
- Return the actual source and version used.
- Explain why a skill matches the request.
- Report missing prerequisites and unsupported integrations.
- Do not claim a local CLI or MCP is installed unless verified.
- Do not invent API behavior, test results, or repository contents.
- Separate retrieved facts, user-provided facts, and model inferences.
- Surface contradictory project decisions.
- Ask for clarification when a critical detail is missing.
- Abstain when there is insufficient evidence for a reliable recommendation.

### Evaluation

Maintain a small, version-controlled evaluation set containing:

- Representative user tasks.
- Expected relevant skills.
- Irrelevant or ambiguous tasks.
- Missing-dependency scenarios.
- Contradictory memory scenarios.
- Unsupported-skill requests.
- Authorization-boundary cases.

Measure recommendation relevance, unsupported claims, retrieval failures, and latency. Improve the system based on observed failures rather than adding complexity without evidence.

---

## 11. Security and trust requirements

### Required controls

- Runtime validation for all external input.
- Request and response size limits.
- Path traversal and symlink protections.
- Authentication and authorization for private operations.
- Per-user and per-project data isolation.
- HTTPS for remote deployments.
- Credential rotation and revocation.
- Rate limits and abuse controls for hosted deployments.
- Secure secret management and log redaction.
- Immutable content references and integrity checks.
- Dependency and license review.
- Backup and restore procedures.
- Security vulnerability reporting and incident response.

### Explicit prohibition

The catalog and MCP service must not execute arbitrary scripts, shell commands, or instructions contained in imported skills.

If execution is ever introduced, it requires a separate threat model, explicit consent, isolation, permissions, resource limits, and a dedicated security review.

### Public-hosting rule

Do not expose a public endpoint with private context storage until authentication, authorization, quotas, user isolation, logging controls, and deletion behavior have been tested.

---

## 12. Authentication strategy

Authentication is intentionally designed from the start, even though advanced account features can be implemented later.

### Local mode

- Bind to loopback by default.
- Document the risks of exposing a local server to the network.
- Avoid requiring cloud accounts for basic single-user development.

### Self-hosted private mode

- Support a configurable token or API credential.
- Require HTTPS or a private network for remote access.
- Support rotation and revocation.
- Keep secrets out of source control and logs.

### Hosted public mode

- Require authenticated access to private or personalized operations.
- Use per-user or per-client credentials.
- Enforce scopes and ownership on every private request.
- Add rate limits, quotas, and abuse controls.
- Consider OAuth/OIDC and organization identity only when product needs justify them.

Do not use one permanent, shared, non-revocable token as the production multi-user model.

---

## 13. Testing and engineering standards

### Required test layers

- Unit tests for parsing, validation, ranking, and core business logic.
- Integration tests for persistence, MCP tools, and source import.
- End-to-end tests for search, retrieval, recommendations, and context workflows.
- Security tests for unauthorized access, data isolation, path traversal, malformed inputs, and resource limits.
- Compatibility tests for supported clients and transport behavior.
- Recovery tests for failed updates, rollback, and database restoration.

### CI checks

- Formatting.
- Linting.
- Type checking.
- Unit and integration tests.
- Production build.
- Dependency and secret scanning.
- Container build and security checks where configured.

### Change review checklist

- The change solves a documented problem.
- Acceptance criteria are satisfied.
- Tests cover success and failure paths.
- Security and privacy implications are addressed.
- Documentation is updated.
- No credentials or proprietary employer content are included.
- Dependencies and licenses are appropriate.
- Rollback or mitigation is understood for risky changes.

---

## 14. Release and operations process

### Release checklist

- CI is green.
- Release-blocking defects are resolved.
- Security-sensitive changes have been reviewed.
- Version and changelog are updated.
- Migration and recovery instructions are ready.
- Distribution artifacts build successfully.
- Clean installation is verified.
- Health checks and error reporting work.
- Known limitations are documented.
- Release notes explain behavior and compatibility changes.

### Incident response

1. Record impact and affected versions.
2. Determine whether the issue is security-related.
3. Contain the issue or disable the affected capability.
4. Restore service or provide a safe workaround.
5. Communicate known impact and mitigation.
6. Reproduce and fix the root cause.
7. Add regression coverage.
8. Publish a corrective release when appropriate.
9. Document preventive actions.

### Hosting decision

Start with local execution and Docker Compose. Compare managed containers and serverless hosting only after measuring traffic and state requirements.

For AWS Lambda, evaluate MCP transport compatibility, streaming behavior, execution duration, cold starts, request limits, persistent storage, and the total cost of API gateway, database, logs, networking, and egress. Never rely on ephemeral function storage for durable memory or catalog content.

---

## 15. Product validation and business process

### Initial validation

Interview 10–15 developers who use AI coding agents regularly. Ask them to demonstrate how they currently install, update, share, and maintain skills and project instructions.

Test whether they experience recurring pain around:

- Cross-agent portability.
- Reproducible versions.
- Relevant skill discovery.
- Project context continuity.
- Trust and safe updates.

Use behavior and actual prototype usage as stronger evidence than stated enthusiasm.

### Proposed early targets

These are decision thresholds for the experiment, not market benchmarks:

- 10–15 interviews.
- At least five people demonstrating a similar recurring problem.
- At least five external prototype users.
- At least three users returning within seven days.
- At least two teams using the private multi-member setup successfully.

If the targets are missed, inspect the evidence and revise the hypothesis rather than automatically expanding scope.

### Metrics

**Activation**
- Successful first installation.
- Time to first successful retrieval.
- Completion of the primary workflow.

**Retention**
- Weekly active developers.
- Seven-day and thirty-day retention.
- Repeat skill search, update, and context retrieval.

**Reliability**
- Request success and error rates.
- Installation/update failure rates.
- Recovery and restore success.

**Team / ops**
- Successful multi-member private deployments.
- Support time per active operator.

Use privacy-conscious telemetry with clear disclosure. Do not collect private skill contents or source code merely to measure engagement.

---

## 16. Founder operating cadence

The product must be maintainable alongside a full-time job.

### Weekly

- Review user feedback and support requests.
- Choose one primary outcome.
- Complete one small feature or experiment.
- Run tests and verify the user workflow.
- Update the backlog and record decisions.
- Identify the highest-risk unresolved assumption.

### Monthly

- Review activation, retention, and reliability.
- Reassess product hypotheses.
- Review ecosystem and competitor changes.
- Check hosting costs and operational burden.
- Decide what to build, defer, or remove.

### Quarterly

- Revisit audience and positioning.
- Review architecture and security posture.
- Set the next milestone based on observed demand.
- Reassess founder time and sustainability.

---

## 17. Decision gates

**Gate A — Problem validation:** A meaningful group of developers demonstrates the same recurring problem.

**Gate B — Registry MVP:** Clean installation, skill search, exact retrieval, provenance, and baseline security tests work.

**Gate C — Recommendation quality:** Recommendations outperform a simple baseline on the evaluation set and explain their reasoning.

**Gate D — Memory value:** Users can retrieve useful context across sessions with verified access isolation and deletion controls.

**Gate E — Public beta readiness:** Authentication, authorization, rate limits, observability, recovery, privacy, and security processes are tested.

**Gate F — Retention:** External developers return without constant prompting.

**Team self-host readiness:** Multi-member private configuration works without breaking the solo open-source core.

**Scaling:** Demand justifies additional infrastructure, support, and operational complexity.

A missed gate is a reason to investigate and adapt, not to continue building blindly.

---

## 18. Immediate action plan

### First week

- Inspect and test the existing TypeScript starter.
- Establish first-party source policy and catalog schema (`docs/source-policy.md`).
- Record license decisions before any non-local import.
- Interview five developers.
- Identify the most painful workflow to validate.

### Second week

- Implement the first catalog import and validation path.
- Implement skill search and exact retrieval.
- Add source/version metadata and tests.
- Verify the MCP connection with the initial target clients.

### Third week

- Add recommendation behavior and a small evaluation dataset.
- Recruit external testers.
- Observe onboarding and relevance failures.
- Fix the highest-impact issues.

### Fourth week

- Review user behavior and validation results.
- Decide whether to continue, narrow, or revise the product thesis.
- Prepare the first release only if the release gate is satisfied.
- Plan persistent context and synchronization based on evidence and architecture readiness.

This schedule is an initial plan, not a promise to ship every feature in four weeks. Security, licensing, and validation take precedence over a fixed release date.

---

## 19. Open decisions

- Final product name and trademark/domain availability.
- Open-source license and contribution governance.
- Exact client compatibility guarantees.
- Git-backed versus database-backed catalog details.
- Hosted service versus self-hosted priorities.
- Memory retention and telemetry policy.
- Enterprise deployment and support commitments (if ever needed).

Record major decisions in ADRs with context, alternatives, rationale, and conditions that would justify revisiting them.

## 20. Definition of success

Just Do It succeeds when developers can install the server, authenticate with their own token, discover and retrieve useful skills, and return because the workflow saves them effort.

Optimize for user outcomes, trust, and maintainability—not catalog size. Recommend the smallest relevant set of high-quality skills for a task, explain why they were selected, and fall back gracefully when none fit.