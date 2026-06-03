# Smart Sprint Planner

> 🇬🇧 English · 🇷🇺 [Читать по-русски](Documentation/README.ru.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/badge/GitHub-v2.2.0-brightgreen.svg)](https://github.com/Letsrollamigo/smart-sprint-planner/releases/latest)
[![JetBrains Marketplace](https://img.shields.io/badge/Marketplace-v2.1.46-orange.svg)](https://plugins.jetbrains.com/search?search=smart%20sprint%20planner)
[![YouTrack](https://img.shields.io/badge/YouTrack-2024.3+-purple.svg)](https://www.jetbrains.com/youtrack/)
[![Tests](https://img.shields.io/badge/Playwright-passing-success.svg)](tests/)
[![Support on TON](https://img.shields.io/badge/Support-TON-0088CC?logo=ton)](ton://transfer/UQAeXVOoOQXx0BR9iFOtS0aCux5hLhfZ664e3FNjW3vgJtij)

> 🎉 **Smart Sprint Planner is on the [JetBrains Marketplace](https://plugins.jetbrains.com/search?search=smart%20sprint%20planner).** Version **2.1.46** is the latest approved release. The marketplace listing is the canonical install path for teams who want vetted, stable releases.

> 💎 **Like this project?** If it helped your team and you'd like to support
> its development, donations in any amount are welcome on TON:
> `UQAeXVOoOQXx0BR9iFOtS0aCux5hLhfZ664e3FNjW3vgJtij`

Multi-role sprint planning plugin for **YouTrack 2024.3+**. Plan sprint composition across analysis, testing, and seven engineering roles in one widget — with capacity tracking, working drafts, confirmed history snapshots, per-role Gantt timelines, differentiated time accounting, parent ← child cascade aggregation, and parent.State ← min(children) state rollup.

## Release channels

The plugin ships through two parallel channels — pick the one that matches your team's tolerance for change:

| Channel | Current | Cadence | Who it's for |
|---|---|---|---|
| **[JetBrains Marketplace](https://plugins.jetbrains.com/search?search=smart%20sprint%20planner)** | **v2.1.46** | Stable, JB-reviewed | Teams who want vetted releases and YouTrack's built-in auto-update. New uploads pass JetBrains marketplace review (1–3 working days) before going live. |
| **[GitHub Releases](https://github.com/Letsrollamigo/smart-sprint-planner/releases)** | **v2.2.0** | Bleeding-edge | Teams who want the latest features immediately and don't mind installing a `.zip` manually. Every release here is fully tested (466 unit tests + Playwright) but ships ahead of marketplace review. |

GitHub Releases is the authoritative source — every marketplace upload is built from a tagged GitHub release. If you spot a feature on this README that isn't in the marketplace version yet, that simply means the next marketplace cycle hasn't finished review.

## Features

- **9 functional roles** — analysis, testing, platform development, backend, frontend, iOS, Android, fullstack, database. Roles can be selectively enabled per project; a generic `devPlatform` role lets teams map any platform stack (1C, SAP, Salesforce, low-code, etc.) to a custom field.
- **Per-role composition tables** — assignees with capacity vs. load tracking, overlimit guards, and direct editing of YouTrack fields from the sprint table.
- **Per-assignee task distribution** with a «System» column (read-only, sortable) and an optional «Allocations by project» column — per-system hours and percentage of the assignee's capacity.
- **Manual per-assignee resource** — opt-in `manualPersonalResource` mode for teams whose capacity is set top-down by the team lead (fixed weekly hours per person) instead of derived from KPE coefficients.
- **Sprint history** — confirmed snapshots, shared working drafts, per-user personal drafts, and one-click restore.
- **Gantt timeline per role** with sprint-aware filtering.
- **Excel export** for both planning and history tabs.
- **15-language UI** — Czech, German, English, Spanish, French, Hungarian, Italian, Japanese, Korean, Dutch, Polish, Portuguese, Russian, Turkish, Chinese (Simplified). Auto-detected from browser, manually switchable, fallback to English.
- **Differentiated Time Accounting (DTA)** — work-item type → role mapping, per-role fact aggregation back into custom fields, mandatory work-type validation, optional plan/fact ratio warnings.
- **Cascade aggregation parent ← child** — plan and fact fields on a container issue are computed as the sum of its direct children, so estimates and actuals roll up automatically. Container issues can be locked from receiving direct work-item logs.
- **State rollup parent ← min(children)** — container issue State automatically follows the least-progressed child State (min strategy). Configurable state order, resolved-states guard against re-opening closed containers, optional floor state. Disabled by default; reuses cascade hierarchy config.
- **Sprint Goals** — structured goals attached to each sprint with title, description, success metric, and owner. Shown on the stand-up overlay so goals remain visible during the daily meeting.
- **Stand-up assistant** — full-screen daily stand-up overlay with per-role task lists (Done Yesterday / Doing Today / Blocked), live timer, and blocker-highlight mode. Operates on the current sprint's data with no separate data source.
- **Server-side authorization** on every mutating endpoint via project-scoped `ssp_settings`. Deny-by-default until `settingsManagerGroup` is configured.

## Installation

Pick one of the two channels (see **Release channels** above):

### Option A — JetBrains Marketplace (recommended, stable)

1. In YouTrack: **Administration → Apps → Marketplace** → search for **«Smart Sprint Planner»** → **Install**.
2. Open any project and add the **Smart Sprint Planner** widget to its settings page.
3. Click **⚙ Plugin settings** in the widget header. The first save requires a member of `settingsManagerGroup` — until configured, all mutations are denied.

YouTrack will auto-update the plugin as new marketplace versions are approved.

### Option B — GitHub Release (bleeding-edge)

1. Download the latest `Smart-Sprint-Planner-vX.Y.Z.zip` from the [Releases](https://github.com/Letsrollamigo/smart-sprint-planner/releases) page.
2. In YouTrack: **Project Settings → Apps → Install from file** → upload the zip.
3. Same widget + settings steps as above.

For detailed configuration, see [USER-GUIDE.md](Documentation/USER-GUIDE.md). For team-lead / Scrum master perspective on how the plugin maps onto Scrum ceremonies and capacity planning, see [METHODOLOGY-GUIDE.md](Documentation/METHODOLOGY-GUIDE.md).

## Building from source

```bash
git clone https://github.com/Letsrollamigo/smart-sprint-planner.git
cd smart-sprint-planner
npm install
npm run build:check    # syntax-validates bundle + workflow files
npm test               # Playwright suite (36 specs)
node --test tests/unit/*.test.js   # unit suite (415 specs)
```

Requirements: Node.js 18+. A YouTrack 2024.3+ instance is needed for end-to-end manual verification; the Playwright suite uses a mock backend.

## Documentation

- [USER-GUIDE.md](Documentation/USER-GUIDE.md) — full usage guide with screenshots and configuration examples.
- [METHODOLOGY-GUIDE.md](Documentation/METHODOLOGY-GUIDE.md) — team-lead / Scrum master / PM perspective: ceremony mapping, capacity planning, time-tracking discipline, anti-patterns.
- [SECURITY.md](.github/SECURITY.md) — security model, threat surface, and disclosure process.
- [CHANGELOG.md](Documentation/CHANGELOG.md) — release history.
- [CONTRIBUTING.md](Documentation/CONTRIBUTING.md) — how to contribute (DCO sign-off required).
- [CODE_OF_CONDUCT.md](Documentation/CODE_OF_CONDUCT.md) — community guidelines.

## Compatibility

- **YouTrack**: 2024.3 and later (uses the modern app-widget API and `extensionPoint: PROJECT_SETTINGS`).
- **Browsers**: any evergreen browser supported by YouTrack itself.
- **Storage**: extension properties under the `ssp_*` namespace; cross-tab synchronization via `localStorage` signal `ssp:wc-touched:*`.

## License

[MIT License](LICENSE) — Copyright © 2026 Letsrollamigo.

Contributions are welcome under the same license. By submitting code you agree to the [Developer Certificate of Origin](https://developercertificate.org/) — see [CONTRIBUTING.md](Documentation/CONTRIBUTING.md) for details.
