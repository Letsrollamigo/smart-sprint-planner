# Contributing to Smart Sprint Planner

> 🇬🇧 English · 🇷🇺 [Читать по-русски](CONTRIBUTING.ru.md)

Thank you for your interest in contributing! This project is released under the MIT license; by submitting code you agree to license your contribution under the same terms.

## Getting started

```bash
git clone https://github.com/Letsrollamigo/smart-sprint-planner.git
cd smart-sprint-planner
npm install
npm run build:check       # syntax-validate the bundled widget + workflow files
npm test                  # Playwright suite (mock backend, no YouTrack required)
node --test tests/unit/*.test.js   # unit suite
```

You will need:
- Node.js 18+ (esbuild and Playwright requirement).
- A YouTrack 2024.3+ instance for end-to-end manual verification (optional; the Playwright suite uses a mock backend).

## Repository layout

```
backend-project.js                — server-side handlers, authz, whitelist (single file)
manifest.json                     — YouTrack app manifest (version, vendor, widget key)
settings.json                     — JSON Schema for project-scoped settings
entity-extensions.json            — extension property declarations (ssp_*)
workflow-dta-aggregation.js       — DTA workflow rule (work-item type → role aggregation)
workflow-cascade-aggregation.js   — parent ← child plan/fact roll-up
workflow-forbid-container.js      — container-issue work-item lock
widgets/main/index.html           — widget DOM, i18n attributes, default text
widgets/main/main.js              — esbuild bundle (committed)
widgets/main/i18n/                — 15 language JSON files
tests/playwright/                 — end-to-end tests against the bundled widget
tests/unit/                       — Node test runner unit suite
```

> **Note:** the public release ships the pre-built `widgets/main/main.js` bundle but not the `widgets/main/src/` sources. PRs that touch the bundle directly are accepted; for substantial frontend changes, please open an issue first to coordinate.

## Workflow

1. Fork the repository and create a topic branch from `main`.
2. Make changes and add/update Playwright or unit tests for any new flow.
3. Run `npm run build:check` and confirm both the bundle and the workflow files parse cleanly.
4. Run `npm test` and `node --test tests/unit/*.test.js` and confirm all tests pass.
5. Update `CHANGELOG.md` under an `[Unreleased]` section (or the next planned version).
6. Open a PR against `main`.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: <scope>: <summary>` — user-visible feature
- `fix: <scope>: <summary>` — bug fix
- `docs: <summary>` — docs-only change
- `refactor: <summary>` — non-behavior-changing code reshape
- `test: <summary>` — test-only change
- `chore: <summary>` — build, CI, dependency, or repo-meta change

Breaking changes go in the commit body with a `BREAKING CHANGE:` footer.

We require [Developer Certificate of Origin](https://developercertificate.org/) sign-off on every commit:

```bash
git commit -s -m "feat: ..."
```

This adds a `Signed-off-by:` line. It is a lightweight statement that you authored the change and have the right to license it under the project's terms — no separate CLA paperwork is required.

## Code style

- The frontend is a single IIFE bundle (`widgets/main/main.js`). When sources are available locally, new flows go in `legacy-monolith.js` or in a sibling module imported from `index.js`; when only the bundle is available, edits are made against the built file.
- Multi-language UI: any new user-facing string MUST be added to all 15 JSON files under `widgets/main/i18n/` and referenced via `T('key')` or a `data-i18n` attribute. English is the source of truth and the runtime fallback.
- Version bumps touch FOUR points in a single commit: `manifest.json:version`, `package.json:version`, the `APP_VERSION` constant in the frontend bundle, and the `'app-version'` literal in `backend-project.js`.
- Comments are reserved for non-obvious WHY: hidden constraints, subtle invariants, workarounds with linked references. Do not narrate WHAT the code does.

## Quality gates (pre-merge)

- `npm run build:check` — `node --check` passes for the bundle and the workflow files.
- `npm test` — all Playwright specs pass.
- `node --test tests/unit/*.test.js` — all unit specs pass.
- `manifest.json` round-trips through `JSON.parse`.
- Version bumped synchronously across the four points above (when applicable).
- `CHANGELOG.md` updated.

## Reporting bugs / requesting features

Use [GitHub Issues](https://github.com/Letsrollamigo/smart-sprint-planner/issues). Templates are provided for both bug reports and feature requests.

For security issues, please follow the disclosure process in [SECURITY.md](../.github/SECURITY.md).
