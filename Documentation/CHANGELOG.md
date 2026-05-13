# Changelog

> 🇬🇧 English · 🇷🇺 [Читать по-русски](CHANGELOG.ru.md)

All notable changes to **Smart Sprint Planner** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.2] — 2026-05-13

### Changed
- **SheetJS is now bundled inside the app zip instead of loaded from `cdn.sheetjs.com`.** The Excel export feature previously loaded `xlsx.full.min.js` at runtime from the SheetJS CDN; the library now ships inside the widget under `widgets/main/lib/xlsx.mini.min.js` (Apache 2.0, version 0.20.3) and is loaded via a relative path. This removes the external network dependency, makes the export work in air-gapped self-hosted YouTrack instances, and removes the CDN as a point of failure. The Apache 2.0 LICENSE notice is shipped alongside the bundled file as `widgets/main/lib/xlsx-LICENSE.txt`.
- **Switched from `xlsx.full.min.js` to `xlsx.mini.min.js`** (~280 KB instead of ~800 KB). The plugin only uses XLSX write APIs (`book_new`, `aoa_to_sheet`, `book_append_sheet`, `writeFile`); the mini build covers these and drops legacy XLS / XLSB / formula / chart / encryption code that the plugin never touches.

### Compatibility
- **No breaking changes.** Behaviour is identical for end users — same export buttons, same XLSX output, same lazy-load on first export. Only the loading source and bundle size change.

---

## [1.4.1] — 2026-05-12

### Fixed
- **Per-assignee grade values are now fully localised.** The four grades used by the personal-planning capacity model were stored *and displayed* as Cyrillic strings (`Стажёр / Джун / Мидл / Синьор`), so the dropdown on the assignee table showed Russian regardless of the active UI language. The storage layer now uses canonical English keys (`Intern / Junior / Middle / Senior`); display in the dropdown goes through new `gradeIntern` / `gradeJunior` / `gradeMiddle` / `gradeSenior` dictionary keys defined per locale. Existing installs are migrated on read: a small helper translates legacy Cyrillic values both in the `kpe` settings object and in `entry.grade` on every load, so the per-grade KPE coefficients and per-assignee grade selections from previous releases continue to resolve correctly.
- **Hour and minute suffixes now follow the active UI language.** The three internal time formatters (`fmtPeriod`, `fmtHours`, `fmtHoursOnly`) used to embed hardcoded `'ч'` and `'м'` literals, so every capacity, plan/fact and allocations cell rendered Russian suffixes regardless of the selected interface language. Suffixes are now read from a pair of dictionary keys, `hourShort` (already present) and a new `minuteShort`, defined across all 15 locales.
- **Project name label in the widget header now re-translates on language switch.** Previously the «Project: …» prefix was written into `projectNameLabel` once at app registration and never refreshed, so changing the UI language at runtime left the prefix stale in the original language. The label is now updated on every full rerender via a small helper that reads from a cached project name and re-applies `T('labelProject')`.
- **Date pickers now have a fully localised popup calendar.** The four sprint and task date inputs were native `<input type="date">` controls whose popup calendar in Chromium is rendered by the browser UI and always uses the OS locale — the `lang` attribute on the input has no effect on it. The inputs are now read-only text fields backed by a small custom popup: month names and weekday headers come from `Intl.DateTimeFormat(activeLanguage, …)` (zero extra translation keys across all 15 locales), and the «Clear» / «Today» buttons use the existing dictionary keys plus a new `btnToday` key added per locale. The value format on the wire stays `YYYY-MM-DD`, so the existing `min` / `max` constraints, draft persistence and backend validators are unchanged.

### Compatibility
- **No breaking changes.** Pure localisation polish on top of v1.4.0; no schema, settings or workflow changes. Existing v1.4.0 installations upgrade in place.

---

## [1.4.0] — 2026-05-12

### Added
- **«System» column in the Distribute Tasks table.** New read-only, sortable column shows `item.system` for every active task, placed between «Allocation» and «Assignee». Multi-key sort gains a `system` primary key (asc, with XPriority tie-breaker), wired through `_sortKeyMemo` and the header click delegate exactly like existing sort columns. The column appears for everyone and renders «—» when the System field is not configured.
- **«Manual per-assignee resource» setting** (`manualPersonalResource`). New child checkbox of `personalPlanningEnabled` in the Planning Modes section. When enabled, the «Resource (h)» cell in «Resources by assignee» becomes a numeric input bound to `entry.manualResource`; both `entry.resource` and the totals follow the manual value. The Grade dropdown remains editable but no longer triggers the `NKC × KPE × rate × participation` autorecalc — it stays informational. Backend whitelist gains the new boolean key, and the parent/child UI dependency (disabled when `personalPlanningEnabled=false`) mirrors the existing `usePersonalForResource` behavior.
- **«Allocations by project» column in «Resources by assignee».** New optional column auto-shown when both `_settings.fieldSystem` is configured **and** `personalPlanningEnabled` is on. Each row renders a compact per-system breakdown — `system · hours · percent` — built from active (`PLANNED`/`UNPLANNED`) items filtered by `taskAssignments[id].assignee === login`, grouped by `item.system`. Items without a system surface under «No project/system» in muted style; rows above 100 % of the assignee's resource get an `--over` class and a ⚠ marker. The table re-renders automatically after assignee reassignment, manual-resource edits, and resource changes.

### Changed
- **«Refresh from YouTrack» button renamed to «Refresh from issues»** — both for the assignee table refresh button and the Gantt refresh button. Localised across all 15 dictionaries with culturally adapted wording (e.g. «Aus Tickets aktualisieren», «課題から更新», «Görevlerden yenile»).
- **«Inline editing of YouTrack fields» mode label rewritten to «Direct editing of YouTrack issue fields».** Affects `lblDynEdit` and `hintSsbInline`; tooltip and description keys keep their existing wording. Localised across all 15 dictionaries.

### Compatibility
- **No breaking changes.** Old snapshots without `manualResource` fall back to the auto-calculated `resource`. The «System» and «Allocations by project» columns are additive only.

### Sync points
- This release is the v7.1.0 ↔ v1.4.0 sync point with the internal partner branch — the feature set is identical; only the identity (vendor, repo, license) differs.

---

## [1.3.0] — Unreleased

### Added
- **Cascade aggregation parent ← child** (`cascadeAggregationEnabled`). New self-contained workflow rule `workflow-cascade-aggregation.js` shipped in the YT-app root. When enabled, the rule sums per-role plan and fact fields (derived from the existing DTA «Fields → Estimate/Fact» mapping via `FIELD_FACT_KEY_BY_ROLE` + `FIELD_EST_KEY_BY_ROLE`) from child issues into their level-2 (story-like) and level-3 (epic-like) parents along the configured parent link. Hierarchy is capped at 2 levels (task → level-2 → level-3); no recursion into level-4+. Idempotent — writes to a parent field only when `cur !== target`, so cascading writes that re-trigger the same rule are safe from infinite loops.
- **Forbid direct work-item logging on container issues** (`forbidContainerWorkItems`). New self-contained workflow rule `workflow-forbid-container.js`. When enabled, `workflow.check(false, …)` rejects any save that adds or edits a work item on an issue whose kind is in `cascadeLevel2Values` or `cascadeLevel3Values`. Both `workItems.added` and `editedWorkItems` are blocked — half-blocking only `added` would create an edit-loophole. No bypass groups in v1.3.0.
- **Settings UI block «Cascade aggregation of work hours»** with 7 controls: cascade toggle, forbid toggle, configurable kind-field name (default `Type`), comma-separated level-2 / level-3 value lists (defaults `Story` / `Epic`), parent-link inward / outward names (defaults match the built-in YouTrack «Subtask» link: `subtask of` / `parent for`). A live UI warning highlights the dangerous combination cascade-on + forbid-off (direct work-items on a container would be overwritten by the next cascade pass) without blocking save — soft pairing per design.
- **Backend whitelist** extended with 7 new keys (`cascadeAggregationEnabled`, `forbidContainerWorkItems`, `cascadeKindField`, `cascadeLevel2Values`, `cascadeLevel3Values`, `cascadeParentLinkInward`, `cascadeParentLinkOutward`); array values capped at 50 entries × 200 chars, string values at 200 chars.
- **All new workflow strings and UI labels localised across all 15 languages.** Workflow keys: `cascadeUpdated`, `cascadeFieldChange`, `errForbidContainer`. UI keys (13): `secCascade`, `cardCascade`, `lblCascadeEnabled`, `hintCascade`, `lblForbidContainer`, `hintForbidContainer`, `warnCascadeWithoutForbid`, `lblCascadeKindField`, `lblCascadeLevel2`, `lblCascadeLevel3`, `lblCascadeLinkInward`, `lblCascadeLinkOutward`, `hintCascadeLinks`. Placeholders (5) — Type/Story/Epic/subtask of/parent for — kept canonical English to match built-in YouTrack defaults.

### Tests
- **19 new unit tests** (cascade: 11, forbid: 8) covering exports.rule shape, guard short-circuits, single-level and two-level aggregation, idempotency, missing-parent no-op, plan + fact aggregation in one pass, container-kind detection across `Story` / `Epic`, and localised workflow.check error messages.
- **3 new Playwright UI tests** for cascade settings: render-with-load (7 controls), live warning toggle, DOM round-trip on text inputs.
- Total project test count: **70/70 green** (28 Playwright + 42 unit).

### Compatibility
- **No breaking changes.** Cascade and forbid are off by default; existing v1.2.4 installations are unaffected until administrators explicitly enable the new toggles in plugin settings.

---

## [1.2.4] — Unreleased

### Added
- **Mandatory work-item type check.** When DTA is enabled, every added or edited work-item without a `type` is rejected via `workflow.check` with a localised error («Specify the work item type!» / «Укажите тип работы!»). Save fails until the user picks a type. Mirrors the same guard from the in-house 1C aggregation rule.
- **Plan/fact ratio progress notifications (`dtaWarningsEnabled`).** A new project setting and corresponding checkbox **«Enable plan/fact ratio control notifications»** in plugin settings. When on, after every work-item logging the workflow emits a per-role progress message comparing aggregated fact against the plan stored in `ssp_settings.fieldFact*` / `ssp_settings.fieldX` (the same field-name selectors users already populate via «Fields → Estimate / Fact»). Three thresholds:
  - `< 90%` — informational ratio: «Logged for X-development: 1h 30m of planned 8h (18.75%)».
  - `90–100%` — warning «⚠️ Less than 10% of plan remaining!» plus role-aware advice.
  - `> 100%` — alert «🚨 OVER LIMIT!» plus role-aware advice.
  Advice differs by role-kind: the `analysis` role gets «Time to break the issue down!», all executor roles get «Please contact the analyst!». Toggling the checkbox off keeps fact-field aggregation but disables the messages — useful for projects that want silent accounting.
- **All new workflow strings localised across all 15 supported languages** (en, ru native; cs, de, es, fr, hu, it, ja, ko, nl, pl, pt, tr, zh — machine-translated, marked the same way as the existing UI dictionaries). New keys: `errMissingType`, `progressNoEstimate / Under90 / NearLimit / OverLimit`, `adviceAnalysis / adviceExecutor`, per-role labels (`roleLabel_analysis`, `roleLabel_devFront`, ...), time units `unitH` / `unitM`. UI checkbox labels (`lblDtaWarnings`, `hintDtaWarnings`) added to all 15 frontend dictionaries.

### Changed
- **Recompute path: full vs delta.** When `editedWorkItems` is non-empty (a user changed the type or duration of an existing work-item) the workflow performs a full recompute over `issue.workItems` — necessary because the previous `type` of the edited item is no longer accessible. Otherwise it computes a delta: starting from the current `fieldFact*` values it adds the durations of `workItems.added` and subtracts `workItems.removed`. Idempotent (cur-vs-target diff still gates writes), matches the 1C aggregation rule pattern.
- **Guard tightened.** Workflow now skips draft issues (`!isReported`), resolved issues (`isResolved`), and runs where no work-items were added, edited, or removed — eliminates no-op runs that previously fired on any unrelated issue update.

---

## [1.2.3] — Unreleased

### Fixed
- **Workflow registered as 'exported script' instead of an on-change rule.** v1.2.1 introduced dual-export `exports.issueRule` / `exports.workItemRule`, but YT scripting only recognises a workflow rule when it is exported under the canonical name `exports.rule` (see VK Workspace Notifier as the in-house reference). With custom-named exports the entry appeared in YT Admin → Workflows without an on-change trigger and never fired on issue/work-item changes. Returned to a single `exports.rule = entities.Issue.onChange(...)`. The dual-trigger speculation is dropped — Issue.onChange catches work-item add/remove as part of the issue-update cascade, the same way VK Notifier handles `comments.added` and `tags.added`. The IssueWorkItem.onChange feature-detect added in v1.2.2 is no longer needed and was removed.

---

## [1.2.2] — Unreleased

### Fixed
- **App failed to import on YT 2024.3 with `TypeError: entities.IssueWorkItem.onChange is not a function`.** The dual-trigger registration introduced in v1.2.1 unconditionally called `entities.IssueWorkItem.onChange(...)`, but on this YT build the `IssueWorkItem` entity does not expose an `onChange` method (the API surface differs across YT 2024.3 builds). The workflow now feature-detects the method at module load — `exports.workItemRule` is registered only when `entities.IssueWorkItem.onChange` is callable; otherwise the workflow continues to operate on `Issue.onChange` only, which catches work-item add/remove as part of the issue-update event (the same cascading-mutation mechanism the in-house VK Workspace Notifier uses for `comments.added` / `tags.added`). Aggregation remains idempotent (current-vs-target diff), so behavior is unchanged when both rules do fire.

---

## [1.2.1] — Unreleased

### Fixed
- **Bug A — workflow.message localised to EN despite a Russian user locale.** In a YT scripting workflow context, `ctx.currentUser.profile.locale.language` is often either `undefined` or in the `ru-RU` form (whereas the dictionary keys are `ru`/`en`/...). The locale picker now uses `ssp_settings.defaultLang` as the primary source (project-level, deterministic, always set once the settings widget has been saved at least once) and only falls back to a normalised `currentUser.profile.locale.language` (prefix before `-` or `_`) when `defaultLang` is absent or unsupported.
- **Bug B — fact-fields did not update on work-item logging.** v1.2.0 wrote to a synthetic identifier such as `factDevFront`, which does not exist in any project. The workflow now reads the real YT custom-field name from `ssp_settings.fieldFact*` (the keys already populated by the settings UI «Fields → Fact») and writes there. If a role is in the work-item-type mapping but the corresponding `fieldFact*` is empty, the workflow emits a localised `errFieldMissing` diagnostic instead of silently skipping. The deprecated/unused `fieldFactByRole` setting key has been removed from the backend whitelist.
- **Bug C — `entities.Issue.onChange` does not always fire on work-item add/remove in YT 2024.3.** The workflow now registers two rules (`exports.issueRule` via `Issue.onChange` and `exports.workItemRule` via `IssueWorkItem.onChange`); the aggregation is idempotent (current-vs-target diff), so dual firing on the same change is safe and the user is guaranteed at least one trigger across YT Server / Cloud builds.

---

## [1.2.0] — Unreleased

### Added
- **Differentiated time tracking (DTA)** — a workflow rule (`workflow-dta-aggregation.js`, bundled inside this YT-app zip and registered automatically on install) aggregates issue work items by type and writes the result into per-role fact-fields according to the project mapping in plugin settings (one type → one role, validated). Generic over the active roles; locale-aware messages (15 languages with EN fallback). See USER-GUIDE §3.5 for the configuration steps.

### Fixed
- **Bug #4 (MEDIUM):** Sort header icons in the composition and people-distribution tables no longer ignore clicks. Per-element `<th>` listeners attached in `_bindSortHeaders` were destroyed on every `thead.innerHTML` rewrite during re-render; in YouTrack iframes where `localStorage` is sandboxed, `getSortKey()` additionally fell back to `'off'` because `setItem` silently failed with `SecurityError`. The fix replaces per-element binds with a single document-level click delegation (resilient to re-render and `pointer-events` quirks on icon spans) and adds an in-memory memo for the sort key so toggling persists within the session even when storage is blocked. Affects both composition tables (Planning → Roles level) and the personal task distribution table (Planning → People level).
- **Bug #5 (LOW, found during v1.2.0 acceptance):** Settings overlay quick-nav now includes a chip for the new DTA section. The original v1.2.0 build accidentally overwrote the existing «Misc» (`secMisc` / `cardMisc`) section with the DTA content and re-added «Misc» as a separate section without an id, breaking the `secMisc` chip target. The DTA configuration is now its own `secDta` section with its own chip; «Misc» is restored to its original anchor.
- **Bug #6 (HIGH, found during v1.2.0 acceptance):** Configured DTA mappings did not update fact-fields on issues when work items were logged. Two root causes: (1) the workflow rule was declared via a non-standard `"workflows": [...]` field in the YT-app manifest, which YT 2024.3 does not recognize, so the rule was never registered; (2) the rule used `entities.IssueWorkItem.onChange`, which is not consistently triggered on add/remove work-item events across YT versions. The fix follows the same pattern as the in-house **VK Workspace Notifier** YT-app: the workflow file (`workflow-dta-aggregation.js`) sits **at the root of the YT-app zip** alongside `manifest.json` and `backend-project.js`, where YT auto-registers it via the implicit `exports.rule` convention — no separate workflow archive, no `Server administration → Workflows → Import` step. The trigger is `entities.Issue.onChange`, which catches work-item add/remove/update as part of the issue update event in every supported YT version. `readSettings` is now defensive against both string and object payloads in `project.extensionProperties`.

### Renamed
- **DTA term:** «Differentiated Time Accounting» / «Дифференцированный учёт времени» → «Differentiated time tracking» / «Дифференцированный учёт трудозатрат» across all UI strings, manifest changeNotes, and documentation. The acronym **DTA** is preserved as the internal identifier.

[1.2.0]: https://github.com/Letsrollamigo/smart-sprint-planner/releases/tag/v1.2.0

---

## [1.1.0] — 2026-05-09

### Added
- **Internationalization (i18n) — 15 languages, full coverage.** UI strings extracted into per-language JSON dictionaries (`widgets/main/i18n/{lang}.json`) and loaded via an async loader. English and Russian remain inlined into the bundle for fast startup; the other 13 languages (cs, de, es, fr, hu, it, ja, ko, nl, pl, pt, tr, zh) load on demand from the bundle assets. **All 459 UI keys are translated in every language** (modals, toasts, service messages, accessibility tooltips). Auto-translated dictionaries are flagged with `_meta.auto_translated: true, review_status: "machine_full"`; native-speaker review via PR is welcomed.
- **KPE term renamed to «Productivity Factor» across non-Russian languages.** The Russian abbreviation КПЕ is expanded inline as «КПЕ (коэффициент полезной эффективности)» in `cardKpe`. Other languages use the localized equivalent (Productivity Factor / Faktor produktivity / Produktivitätsfaktor / Factor de productividad / Facteur de productivité / Termelékenységi tényező / Fattore di produttività / 生産性係数 / 생산성 계수 / Productiviteitsfactor / Współczynnik produktywności / Fator de produtividade / Verimlilik faktörü / 生产力系数), abbreviated as PF / FP / TT / WP / VF in field labels.
- **Button `btnJumpToPeople` rewording.** Renamed from «Open in «People» mode» → «Open in assignee distribution mode» (with locale-appropriate translations) for clarity.
- **Language selector in the widget header** — sorted EN → RU → other ISO codes. Persists choice in `localStorage.ssp_lang`.
- **Project-wide `defaultLang` setting** — settings managers can pick the project default language; users without a personal `ssp_lang` choice inherit it. Validated against the 15-language whitelist on the backend.
- **CLDR-aware plural forms** via `Intl.PluralRules` (correct one/few/many/other handling for Slavic languages).
- Auto-translated dictionaries are flagged with `_meta.auto_translated: true` and `review_status: 'needs_human_review'`; community PRs welcome.

### Fixed
- **Bug #1 (HIGH):** `checkAssignerRightsNow` in the widget now calls `_host.fetchApp` with `{scope: true, method: 'GET'}` instead of `{query: {'$top': 1}}`. Previously the request was routed to the unscoped extensionEndpoints path and returned 404, so the assigner role was effectively unusable in the UI even when the backend was correctly granting it.
- **Bug #2 (MEDIUM, defense-in-depth):** `userInGroups` (backend) now `.trim()`s both sides of the group-name comparison. Previously, a YouTrack group with trailing or leading whitespace in its name would fail the strict-equality check against a trimmed `ssp_settings.*GroupNames` entry, producing false `not_in_group` rejections despite real membership.

### Changed
- **SECURITY.md / SECURITY.ru.md:** clarified the success-flag response pattern — clients MUST check `success` flag, not HTTP status. Replaced inline `403 plugin_not_configured` and `403 not_owner` references with the actual `{success: false, reason: '<machine-readable>'}` shape.

---

## [1.0.0] — 2026-05-08

### Added
- Initial public release of Smart Sprint Planner under the MIT license.
- Multi-role sprint composition planning across 9 functional roles (analysis, testing, platform development, backend, frontend, iOS, Android, fullstack, database).
- Per-role assignee tables with capacity vs. load tracking and overlimit guards.
- Sprint history with confirmed snapshots, working drafts, and per-user personal drafts.
- Gantt timeline view per role with sprint-aware filtering.
- Excel export for both planning and history tabs.
- Settings overlay (composition agreed-by-`settingsManagerGroup` access pattern, deny-by-default until configured).
- Bilingual UI: Russian and English (auto-detected, manually switchable).
- Server-side authorization on every mutating endpoint via project-scoped `ssp_settings`.
- Cross-tab synchronization through the `ssp:wc-touched:*` localStorage signal.

### Changed
- Storage prefix migrated from the predecessor's internal namespace to `ssp_*` (extension properties) and `ssp_*` (localStorage keys).
- The 1C-specific role from the predecessor was replaced by a generic **platform-development** role (`devPlatform`). Teams using 1C, SAP, Salesforce, Oracle, or any low-code platform can map this role to their own custom field via plugin settings.
- Vendor metadata, widget title, and bundle name updated to **Smart Sprint Planner**.

### Security
- `settingsManagerGroup` is mandatory at first install; until set, all mutations are denied.
- Server-side whitelist (`ALLOWED_SETTINGS_KEYS`) on `POST /save-settings` prevents unknown keys from being persisted.
- Resource and remainder field names follow the regex `^(resource|remain)[A-Za-z0-9_]*$`.

[1.1.0]: https://github.com/Letsrollamigo/smart-sprint-planner/releases/tag/v1.1.0
[1.0.0]: https://github.com/Letsrollamigo/smart-sprint-planner/releases/tag/v1.0.0
