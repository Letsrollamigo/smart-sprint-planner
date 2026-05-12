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
- [ ] `npm test` passes (Playwright suite green).
- [ ] `manifest.json` round-trips through `JSON.parse` (if touched).
- [ ] If the version was bumped, all four points were updated synchronously: `manifest.json:version`, `package.json:version`, `widgets/main/src/legacy-monolith.js:APP_VERSION`, `'app-version'` literal in `backend-project.js`. The zip filename in `package.json:scripts.zip` was bumped too.
- [ ] `Documentation/CHANGELOG.md` (and `Documentation/CHANGELOG.ru.md`) updated under `[Unreleased]` or the next planned version.
- [ ] If user-facing strings were added, both `ru` and `en` dictionaries in `widgets/main/src/legacy-monolith.js` were updated, and the strings are referenced via `T('key')` or a `data-i18n` attribute.
- [ ] If a new flow was added or an existing one was altered, Playwright tests cover it.
- [ ] DCO sign-off is present on every commit (`git commit -s ...`).

## Testing

<!-- How did you verify this change? Manual steps, automated tests, edge cases checked. -->

## Screenshots / recordings

<!-- For UI changes, attach before/after screenshots or a short screen recording. -->

## Notes for reviewers

<!-- Anything specific reviewers should focus on, known limitations, follow-up items. -->
