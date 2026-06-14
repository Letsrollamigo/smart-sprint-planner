# Contributing to Smart Sprint Planner

Thanks for your interest in improving Smart Sprint Planner. This document explains
how the project is built and, in particular, how it is **tested** — the test model
is the contract a contribution has to satisfy before it can be merged.

## Quick start

```bash
npm ci            # install dependencies (uses package-lock.json)
npm run build     # bundle widget → widgets/main/main.js (+ vendored React, Ring CSS, icons)
npm test          # run the full clone-safe test suite (see below)
```

No browser, no running YouTrack instance, and no credentials are required to build
or to run `npm test`. Everything a contributor needs runs offline in Node.

## Test model

The widget is a single bundled front-end (`widgets/main/src/*` → `widgets/main/main.js`)
plus YouTrack workflow/back-end scripts. It is tested at three deterministic layers,
all on Node's built-in test runner (`node --test`) — there is **no Playwright / headless
browser** in the contributor flow.

| Suite | Command | What it covers | Needs |
|-------|---------|----------------|-------|
| **Unit** | `npm run test:unit` | pure functions, view-models, parsers, back-end helpers | nothing |
| **Golden** | `npm run test:golden` | rendered DOM snapshots of every view, in a jsdom host | nothing |
| **Architecture** | `node --test tests/arch/*.test.js` | structural invariants (module size, topology, state-localization, registry completeness) | nothing |
| **Fork parity** | `npm run test:arch` *(incl. `tests/mirror`)* | namespace-identical modules stay in sync with the private corporate sibling | **maintainer-only** (needs the sibling checkout) |

```bash
npm test          # = node --test tests/unit + tests/golden  (the green bar for any clone & for CI)
npm run gate      # = arch + mirror + unit + golden  (maintainer; mirror needs the sibling fork)
```

CI (GitHub Actions, `.github/workflows/build.yml`) runs `npm run build` + `npm test`
on every push and pull request. **Your PR must keep that green.** The `tests/mirror`
parity check compares this repo against a private corporate fork and is only runnable
by maintainers — do not worry about it; a maintainer reconciles parity at merge time.

### The golden grid is your entry point

Most UI behaviour is locked by **golden snapshots** in `tests/golden/snapshots/*.snap`.
Each snapshot is the serialized DOM (or a structured view-model) produced by rendering a
component against fixed input in a jsdom host. A snapshot diff is the clearest possible
description of what your change does to the UI.

When you change rendering and a golden test fails, that failure is **the signal** — read
the diff first, before assuming the test is wrong.

### Regenerating snapshots — by name, with justification

```bash
GOLDEN_UPDATE=1 node --test tests/golden/<the-one-file-you-changed>.test.js
# or, project-wide (use sparingly):
npm run test:golden:update
```

Rules:

1. **Regenerate only the snapshots your change legitimately affects.** Prefer running
   `GOLDEN_UPDATE=1` on the single test file you touched, not the whole grid.
2. **Review every regenerated diff** (`git diff tests/golden/snapshots/`). Each changed
   line must be explainable by your change. If a snapshot moved that you did not expect to
   move, stop — you probably found a real regression.
3. **Justify the regeneration in your PR description.** "Regenerated N snapshots: added
   `aria-expanded` to the spoiler header (B16)" — not just "updated snapshots".
4. **Never blanket-update to make the bar green.** A snapshot update with no explanation
   is treated as a red flag in review.

### Stub techniques catalog

Golden and unit tests keep behaviour deterministic with a small set of stubbing
techniques — reuse these rather than inventing new ones:

- **Recording stubs** for I/O (`apiGet` / `apiPost` / `_backendCall`): capture calls into
  an array and assert on the recorded payloads instead of hitting a network.
- **Controlled scheduler**: stub `setTimeout` / `clearTimeout` so debounced/throttled
  paths (drafts, validation) fire synchronously and deterministically.
- **Frozen time**: pass timestamps in explicitly (or stub `Date`) — never let a test
  depend on the wall clock.
- **Synthetic DOM events**: drive interaction with real `dispatchEvent` / `click()` on the
  jsdom node, asserting on the resulting DOM, rather than reaching into private state.

## Architecture fitness

The widget was decomposed from a monolith into ~45 modules. To keep it from regrowing,
`tests/arch/` enforces structural invariants against `module-registry.json` (the contract
list of modules): per-module size ceilings, the star-topology of the composition root,
state localization, and registry completeness.

**If you add, remove, or rename a module under `widgets/main/src/`, update
`module-registry.json` in the same change** — otherwise the architecture tests fail.
Git `pre-commit` / `pre-push` hooks run these checks locally for maintainers; CI and
reviewers backstop them.

## Pull request checklist

- [ ] `npm run build` succeeds and the rebuilt `widgets/main/main.js` is committed.
- [ ] `npm test` is green.
- [ ] Golden snapshot diffs are intentional, reviewed, and explained in the PR.
- [ ] `module-registry.json` updated if modules were added/removed/renamed.
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
      (`fix:`, `feat:`, `refactor:`, `docs:`, …).
- [ ] i18n: new user-facing strings are added to **all** locales under `widgets/main/i18n/`.

## Reporting bugs

Open a GitHub issue with: YouTrack version, steps to reproduce, what you expected, and
what happened. A screenshot or the browser console output helps a lot.
