## Summary

<!-- 1–3 sentences describing what this PR does and why. -->

## Type of change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactoring (no functional change)
- [ ] Test-only change
- [ ] CI / build / repo metadata

## Related issues

<!-- e.g., Closes #42, Refs #17 -->

## Checklist

- [ ] `npm run build` runs cleanly (no new warnings; the two pre-existing duplicate-key warnings on `btnCancel` are tracked separately).
- [ ] `npm run build:check` passes.
- [ ] `npm test` passes (unit + golden).
- [ ] `manifest.json` round-trips through `JSON.parse` (if touched).
- [ ] If the version was bumped, all four points were updated synchronously: `manifest.json:version`, `package.json:version`, `widgets/main/src/core.js:APP_VERSION`, `APP_VERSION` literal in `backend-core.js`. The zip filename in `package.json:scripts.zip` was bumped too (`npm run release-check` verifies sync).
- [ ] `Documentation/CHANGELOG.md` (and `Documentation/CHANGELOG.ru.md`) updated under `[Unreleased]` or the next planned version.
- [ ] If user-facing strings were added, all 15 locale files under `widgets/main/i18n/` were updated, and the strings are referenced via `T('key')` or a `data-i18n` attribute.
- [ ] If a new flow was added or an existing one was altered, golden/unit tests cover it.
- [ ] DCO sign-off is present on every commit (`git commit -s ...`).

### If snapshot schema changed (v1.6.0+ soft-deprecation policy)

> Skip if no whitelist or snapshot shape was changed.

- [ ] `schema/whitelists.json` edited (NOT the AUTOGEN block in `backend-project.js` — overwritten by `npm run build`).
- [ ] `git diff --exit-code backend-project.js` clean after a second `npm run build:whitelists` run.
- [ ] If new keys break snapshot shape: `SCHEMA_MIGRATIONS` entry added with `to === CURRENT_PLUGIN_VERSION`.
- [ ] `VERSION=<new-version> npm run fixtures:generate` run; new fixture directory committed.
- [ ] `tests/unit/compat-prev-release.test.js` green — all previous fixture versions migrate cleanly.
- [ ] Any new nested-object field validated with its own deep whitelist (not just top-level `typeof === 'object'`).

## Testing

<!-- How did you verify this change? Manual steps, automated tests, edge cases checked. -->

## Screenshots / recordings

<!-- For UI changes, attach before/after screenshots or a short screen recording. -->

## Notes for reviewers

<!-- Anything specific reviewers should focus on, known limitations, follow-up items. -->
