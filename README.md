# Smart Sprint Planner

> 🇬🇧 English · 🇷🇺 [Читать по-русски](Documentation/README.ru.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/badge/GitHub-v2.17.0-brightgreen.svg)](https://github.com/Letsrollamigo/smart-sprint-planner/releases/latest)
[![JetBrains Marketplace](https://img.shields.io/badge/Marketplace-v2.16.3-orange.svg)](https://plugins.jetbrains.com/search?search=smart%20sprint%20planner)
[![YouTrack](https://img.shields.io/badge/YouTrack-2024.3+-purple.svg)](https://www.jetbrains.com/youtrack/)
[![CI](https://github.com/Letsrollamigo/smart-sprint-planner/actions/workflows/build.yml/badge.svg)](https://github.com/Letsrollamigo/smart-sprint-planner/actions/workflows/build.yml)
[![Support on TON](https://img.shields.io/badge/Support-TON-0088CC?logo=ton)](ton://transfer/UQAeXVOoOQXx0BR9iFOtS0aCux5hLhfZ664e3FNjW3vgJtij)

> 🎉 **Smart Sprint Planner is on the [JetBrains Marketplace](https://plugins.jetbrains.com/search?search=smart%20sprint%20planner).** Version **2.16.3** is the latest approved release. The marketplace listing is the canonical install path for teams who want vetted, stable releases.

> 💎 **Like this project?** If it helped your team and you'd like to support
> its development, donations in any amount are welcome on TON:
> `UQAeXVOoOQXx0BR9iFOtS0aCux5hLhfZ664e3FNjW3vgJtij`

Multi-role sprint planning plugin for **YouTrack 2024.3+**. Plan sprint composition across analysis, testing, and seven engineering roles from the YouTrack main menu — with capacity tracking, working drafts, confirmed history snapshots, per-role Gantt timelines, release management with readiness traffic-lights, differentiated time accounting, parent ← child cascade aggregation, and parent.State ← min(children) state rollup.

## Architecture

Two widgets over a shared logic core (`backend-core.js`) and shared storage (`Project.extensionProperties`):

- **`ssp-main-global` (MAIN_MENU_ITEM)** — the full planner in the YouTrack main menu: a «rail + pane» dashboard (on a wide screen — a ~210px navigation panel on the left plus the work area; on a narrow screen — a stack), project picker in the rail header, navigation tree (Sprint parameters / Planning / Working with the backlog / Gantt / History). All planning happens here. Planning has two levels — **Shared resource allocation** (accordion role cards with editable composition and capacity entry, manual or calculated) and **Per-assignee distribution** (per-role selector, assignees and dates). The second level is shown **only under the «Light» planning model**; under «Simple» assignees are set on the Gantt chart instead.
- **`ssp-main` (PROJECT_SETTINGS)** — the project settings page: roles, fields, modes, and the **settings manager group** (setting the group = "connecting" the project, after which it becomes visible in the main-menu planner). No planning happens here.

To **connect a project** to the planner, a member of the project settings team sets the **settings manager group** (`settingsManagerGroup`, mirrored into `ssp_acl`) on the project widget. Once the group is set, the project appears in the main-menu planner for everyone with access to the project in YouTrack. Until then the project does not show up in the menu, and its settings stay read-only.

## Release channels

The plugin ships through two parallel channels — pick the one that matches your team's tolerance for change:

| Channel | Current | Cadence | Who it's for |
|---|---|---|---|
| **[JetBrains Marketplace](https://plugins.jetbrains.com/search?search=smart%20sprint%20planner)** | **v2.16.3** | Stable, JB-reviewed | Teams who want vetted releases and YouTrack's built-in auto-update. New uploads pass JetBrains marketplace review (1–3 working days) before going live. |
| **[GitHub Releases](https://github.com/Letsrollamigo/smart-sprint-planner/releases)** | **v2.17.0** | Bleeding-edge | Teams who want the latest features immediately and don't mind installing a `.zip` manually. Every release here is fully tested in CI (node --test: unit + golden) but ships ahead of marketplace review. |

GitHub Releases is the authoritative source — every marketplace upload is built from a tagged GitHub release. If you spot a feature on this README that isn't in the marketplace version yet, that simply means the next marketplace cycle hasn't finished review.

## Features

- **9 functional roles** — analysis, testing, platform development, backend, frontend, iOS, Android, fullstack, database. Roles can be selectively enabled per project; a generic `devPlatform` role lets teams map any platform stack (1C, SAP, Salesforce, low-code, etc.) to a custom field.
- **Per-role composition tables** — assignees with capacity vs. load tracking, overlimit guards, and direct editing of YouTrack fields from the sprint table.
- **Backlog workspace** — a pre-planning phase before sprint planning: a pool of customer tasks shown **By zones** (state → role) or as an **Epic ▸ Story ▸ Task** tree, query-assist filter, Carryover / Continuation / Needs-estimate / Paused labels, and one-click **«lay into sprint»** that distributes a pooled task into role compositions (auto-suggested roles by zone). Tasks in unmapped states land in an «Other» bucket with a fail-loud warning.
- **Release management** — group project tasks into **releases** (kind Release / Hotfix × source Internal / Vendor) and walk them through six statuses, with a previewed, mapping-driven sync of native task States. Readiness traffic-light, an **Epic ▸ Story ▸ Task** composition tree, composition freeze, patch notes, .txt export, an irreversible snapshot on close, and auto-archiving of the oldest closed releases. Release-manager / release-engineer permissions are enforced server-side. Off by default — enable in project settings.
- **Per-assignee task distribution** with a «System» column (read-only, sortable) and an optional «Allocations by project» column — per-system hours and percentage of the assignee's capacity. Under the **«Simple»** planning model the **Per-assignee distribution** nav item is hidden, role capacity is entered manually on the allocation tab, and assignees are set directly on the Gantt chart — no per-person capacity accounting; the **«Light»** model enables per-assignee capacity.
- **Capacity management settings** — calculation norms (hour quotas / rate / participation / grade coefficients) and the **«Planning model»** selector (Simple / Light / Full; Light offers auto-by-formula or manual per-assignee resource, Full adds a «Capacity» tab and consumes the approved per-sprint business capacity per role and assignee) are consolidated into an admin-tier section editable only by the settings manager.
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
2. Open the project you want to plan and add the **Smart Sprint Planner** widget to its settings page. In **Access and roles**, set the **settings manager group** — this connects the project to the planner and makes it visible in the main menu.
3. Open **Smart Sprint Planner** from the YouTrack main menu, pick the project in the header, and start planning. The first settings save requires a member of `settingsManagerGroup` — until configured, all mutations are denied.

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
npm ci
npm run build:check    # syntax-validates bundle + workflow files
npm test               # unit + golden (Node test runner, jsdom — no browser, no YouTrack)
```

Requirements: Node.js 20+. A YouTrack 2024.3+ instance is needed only for **manual** end-to-end verification — see [docs/LOCAL_YT.md](docs/LOCAL_YT.md); the automated suite needs no YouTrack. Contributor guide: [Documentation/CONTRIBUTING.md](Documentation/CONTRIBUTING.md).

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
