# Smart Sprint Planner

> 🇬🇧 English · 🇷🇺 [Читать по-русски](Documentation/README.ru.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.4.0-brightgreen.svg)](Documentation/CHANGELOG.md)
[![YouTrack](https://img.shields.io/badge/YouTrack-2024.3+-purple.svg)](https://www.jetbrains.com/youtrack/)
[![Tests](https://img.shields.io/badge/Playwright-passing-success.svg)](tests/)
[![Support on TON](https://img.shields.io/badge/Support-TON-0088CC?logo=ton)](ton://transfer/UQAeXVOoOQXx0BR9iFOtS0aCux5hLhfZ664e3FNjW3vgJtij)

> 💎 **Like this project?** If it helped your team and you'd like to support
> its development, donations in any amount are welcome on TON:
> `UQAeXVOoOQXx0BR9iFOtS0aCux5hLhfZ664e3FNjW3vgJtij`

Multi-role sprint planning plugin for **YouTrack 2024.3+**. Plan sprint composition across analysis, testing, and seven engineering roles in one widget — with capacity tracking, working drafts, confirmed history snapshots, per-role Gantt timelines, differentiated time accounting and parent ← child cascade aggregation.

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
- **Server-side authorization** on every mutating endpoint via project-scoped `ssp_settings`. Deny-by-default until `settingsManagerGroup` is configured.

## Installation

1. Download `Smart-Sprint-Planner-v1.4.0.zip` from the [Releases](https://github.com/Letsrollamigo/smart-sprint-planner/releases) page.
2. In YouTrack: **Project Settings → Apps → Install from file** → upload the zip.
3. Open any project and add the **Smart Sprint Planner** widget to its settings page.
4. Click **⚙ Plugin settings** in the widget header. The first save requires a member of `settingsManagerGroup` — until configured, all mutations are denied.

For detailed configuration, see [USER-GUIDE.md](Documentation/USER-GUIDE.md). For team-lead / Scrum master perspective on how the plugin maps onto Scrum ceremonies and capacity planning, see [METHODOLOGY-GUIDE.md](Documentation/METHODOLOGY-GUIDE.md).

## Building from source

```bash
git clone https://github.com/Letsrollamigo/smart-sprint-planner.git
cd smart-sprint-planner
npm install
npm run build:check    # syntax-validates bundle + workflow files
npm test               # Playwright suite (31 specs)
node --test tests/unit/*.test.js   # unit suite (44 specs)
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
