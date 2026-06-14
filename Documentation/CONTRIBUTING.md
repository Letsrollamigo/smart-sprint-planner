# Contributing to Smart Sprint Planner

> 🇬🇧 English · 🇷🇺 [Читать по-русски](CONTRIBUTING.ru.md)

Thank you for your interest in contributing! This project is released under the MIT license; by submitting code you agree to license your contribution under the same terms.

## Getting started

```bash
git clone https://github.com/Letsrollamigo/smart-sprint-planner.git
cd smart-sprint-planner
npm ci
npm run build:check       # syntax-validate the bundled widget + workflow files
npm test                  # unit + golden (Node test runner, jsdom — no browser, no YouTrack)
```

You will need:
- Node.js 20+ (esbuild + Node's built-in test runner).
- A YouTrack 2024.3+ instance only for **manual** end-to-end verification (optional) — see [Running in a local YouTrack](../docs/LOCAL_YT.md). The automated suite needs no YouTrack.

## Repository layout

```
backend-core.js                   — shared backend: schema/migration, APP_VERSION, common handlers
backend-project.js                — project-scoped handlers, authz, whitelist
backend-global.js                 — global (main-menu) handlers, incl. GET /app-version
manifest.json                     — YouTrack app manifest (version, vendor, widget keys)
settings.json                     — JSON Schema for project-scoped settings
entity-extensions.json            — extension property declarations (ssp_*)
workflow-dta-aggregation.js       — DTA workflow rule (work-item type → role aggregation)
workflow-cascade-aggregation.js   — parent ← child plan/fact roll-up
workflow-forbid-container.js      — container-issue work-item lock
workflow-state-rollup.js          — parent.State ← min(children.State)
widgets/main/index.html           — widget DOM, i18n attributes, default text
widgets/main/main.js              — esbuild bundle (committed)
widgets/main/src/                 — frontend sources, by architecture layer:
    core.js · index.js              — composition root + entry
    domain/ infra/ pure/ data/ i18n/ react/  — modules grouped by layer
widgets/main/i18n/                — 15 language JSON files
tests/unit/                       — unit suite (pure functions, view-models)
tests/golden/                     — jsdom DOM/view-model snapshot suite
tests/arch/                       — architecture fitness checks (+ module-registry.json)
tests/mirror/                     — cross-fork parity (maintainer-only; needs the sibling fork)
```

> **Note:** the public release ships the pre-built `widgets/main/main.js` bundle and the `widgets/main/src/` sources. After editing sources, always rebuild (`npm run build`) and commit the regenerated bundle. For substantial frontend changes, please open an issue first to coordinate.

## Workflow

1. Fork the repository and create a topic branch from `main`.
2. Make changes and add/update golden or unit tests for any new flow.
3. Run `npm run build:check` and confirm both the bundle and the workflow files parse cleanly.
4. Run `npm test` and confirm all tests pass.
5. Update `CHANGELOG.md` (and `CHANGELOG.ru.md`) under an `[Unreleased]` section (or the next planned version).
6. Open a PR against `main`.

## Test model

The widget is tested at deterministic layers on Node's built-in runner — **no browser, no running YouTrack**:

- `npm run test:unit` — pure functions, view-models, parsers, backend helpers.
- `npm run test:golden` — serialized DOM / view-model **snapshots** of every view, rendered in a jsdom host. This grid is your main interface: a snapshot diff is the clearest description of what your change does to the UI.
- `node --test tests/arch/*.test.js` — architecture fitness (module size, star-topology, state localization, registry completeness).
- `npm test` (unit + golden) is the green bar for any clone; `npm run gate` adds arch + cross-fork mirror (the mirror check needs a private sibling fork, so it's maintainer-only).

**Regenerating snapshots — by name, with justification:**

```bash
GOLDEN_UPDATE=1 node --test tests/golden/<the-file-you-changed>.test.js
```

Review every regenerated diff (`git diff tests/golden/snapshots/`) — each changed line must be explainable by your change — and say *why* in the PR (e.g. "added `aria-expanded` to the spoiler header"). Never blanket-update to make the bar green.

**Determinism stubs** (reuse these rather than inventing new ones): recording stubs for I/O (`apiGet`/`apiPost`), a controlled scheduler (`setTimeout`/`clearTimeout`) so debounced paths fire synchronously, frozen time (pass timestamps explicitly), and synthetic DOM events (`dispatchEvent`/`click()` on jsdom nodes).

**Architecture fitness:** `tests/arch/` enforces structural invariants against `module-registry.json`. **If you add, remove, or rename a module under `widgets/main/src/`, update `module-registry.json` in the same change** — otherwise the architecture tests fail.

To see a change in a real YouTrack (integration layer the automated suite doesn't reach), see [Running in a local YouTrack](../docs/LOCAL_YT.md).

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

This adds a `Signed-off-by:` line — a lightweight statement that you authored the change and have the right to license it under the project's terms. No separate CLA paperwork is required.

## Code style

- The frontend is a single IIFE bundle (`widgets/main/main.js`) built from `widgets/main/src/`. New flows go in the appropriate layer module (`domain/`, `infra/`, `pure/`, `data/`, `i18n/`) or in `core.js` (the composition root), wired through `index.js`. Modules communicate via window bridges (`__SSP_*`), not direct cross-imports.
- Multi-language UI: any new user-facing string MUST be added to all 15 JSON files under `widgets/main/i18n/` and referenced via `T('key')` or a `data-i18n` attribute. English is the source of truth and the runtime fallback.
- Version bumps touch, in a single commit: `manifest.json:version`, `package.json:version`, the `APP_VERSION` constant in the frontend bundle, and the `APP_VERSION` literal in `backend-core.js` (serves `GET /app-version`). Run `npm run release-check` — it verifies these are in sync and also checks the zip filenames and the README badge.
- Comments are reserved for non-obvious WHY: hidden constraints, subtle invariants, workarounds with linked references. Do not narrate WHAT the code does.

## Quality gates (pre-merge)

- `npm run build:check` — `node --check` passes for the bundle and the workflow files.
- `npm test` — all unit + golden specs pass.
- `node --test tests/arch/*.test.js` — architecture fitness passes (and `module-registry.json` is in sync).
- `manifest.json` round-trips through `JSON.parse`.
- Version bumped synchronously across the points above (when applicable; `npm run release-check`).
- `CHANGELOG.md` (and `CHANGELOG.ru.md`) updated.

## Reporting bugs / requesting features

Use [GitHub Issues](https://github.com/Letsrollamigo/smart-sprint-planner/issues). Templates are provided for both bug reports and feature requests.

For security issues, please follow the disclosure process in [SECURITY.md](../.github/SECURITY.md).
