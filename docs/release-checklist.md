# Release checklist

Aligned with `docs/implementation.md` §14. Use before tagging a version (e.g. `v0.1.0`).

## Pre-release

- [ ] CI is green on the release commit (`.github/workflows/ci.yml`: typecheck, test, build, production `npm audit`)
- [ ] Release-blocking defects are resolved or explicitly deferred in `docs/known-gaps.md`
- [ ] Security-sensitive changes have been reviewed
- [ ] `package.json` `version` and `src/version.ts` `SERVER_VERSION` match
- [ ] `CHANGELOG.md` updated with behavior and compatibility notes
- [ ] `skills/VERSION` / catalog notes updated if catalog compatibility changed
- [ ] Migration and recovery instructions current (`docs/operations.md`)
- [ ] Distribution artifacts build: `npm run build`; optional `docker compose build`
- [ ] Clean installation verified from `docs/quick-start.md` (fresh clone path)
- [ ] Health checks work: `GET /health/live`
- [ ] Known limitations documented (`CHANGELOG`, `docs/known-gaps.md`, client matrix)
- [ ] Release notes (changelog entry) explain behavior and compatibility changes
- [ ] No claim that public mode or unverified clients are production-ready

## Tag and publish (manual)

```bash
# After checklist is satisfied on main:
git tag -a v0.1.0 -m "v0.1.0"
git push origin main --tags
# Create a GitHub Release from the tag; paste the CHANGELOG section.
```

npm registry publish is **optional** and not required for self-hosted use from Git.

## Post-release

- [ ] Confirm CI still green on the tag if workflows run on tags (optional)
- [ ] Triage early feedback per `docs/support.md`
- [ ] File follow-ups for residuals (client verification, Vitest audit, public URL placeholder)

## Incident pointer

If a released version is affected by a severe defect or vulnerability, follow `docs/operations.md` and `SECURITY.md`, then cut a corrective release with changelog notes.
