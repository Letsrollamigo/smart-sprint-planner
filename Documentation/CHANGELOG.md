# Changelog

> 🇬🇧 English · 🇷🇺 [Читать по-русски](CHANGELOG.ru.md)

All notable changes to **Smart Sprint Planner** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.5.2] — 2026-06-09

### Changed

- **«Share» button gated to YouTrack 2026.1+** (`host.navigation` API introduced there). On older servers the button is hidden; it appears automatically after the server is upgraded — no plugin update needed.

### Fixed

- **Share link reconstructed from state** — the widget runs in an `about:srcdoc` iframe, where `window.location.href` returns the iframe address, not the parent YouTrack URL. The link is now built from `_ytBase` + app path + `app_`-prefixed state parameters.

---

## [2.5.1] — 2026-06-09

> **Hotfix: projects with non-ASCII keys were missing from the planner picker.**

### Fixed

- **Projects with a non-ASCII shortName not appearing in the picker.** A project whose key (shortName) starts with a digit or contains Cyrillic characters or a hyphen — for example «1С ЗУП» (`1c_demo`) — was silently absent from the planner's project picker. The cause: the picker filter validated the key against a strict ASCII regex (`^[A-Za-z][A-Za-z0-9_]…`) and discarded everything else. Key validation is now replaced with a length check + denylist of dangerous characters — any real YouTrack key passes (digit at start, Cyrillic, hyphen, period, underscore). The same regex also affected opening deep-links (#36) to such projects.
- **Project-list caps raised** (fetch and picker batch 1000/500 → 5000) — headroom for installations with a large number of projects.

---

## [2.5.0] — 2026-06-09

> **Shareable sprint links — deep-link navigation and handoff (#36).**

### Added

- **Page address reflects planner state.** In main-menu mode the page URL automatically updates when you pick a project, switch sprints, or navigate to a section (`projectKey`, `sprintId`, `node` params).
- **«Share» button** in the navigation panel copies the current link to the clipboard (a "Link copied" tooltip confirms it). Open the link and a colleague lands directly on the same project, sprint and section.
- **Handoff workflow.** The primary use case: an analysis lead prepares sprint composition and sends the link to the dev lead, who opens it and assigns executors. The link only navigates to the view; what the recipient can do (view or edit) is determined by their access in the project and the working-draft mode — no new permissions are introduced.
- **Optional `focus` param** in the link for jumping to a specific role or assignee — the target block scrolls into view and is briefly highlighted.

### Misc

- The «Share» button is available only in main-menu mode and is active when a sprint is open; without an open sprint it is disabled with a tooltip.

---

## [2.4.45] — 2026-06-08

> **Sprint planner in the YouTrack main menu + wide-screen dashboard (#25, phases 1–2).**

### Added

- **Planner moved to the YouTrack main menu** (`MAIN_MENU_ITEM`). All planning now happens from the left menu, without opening project settings; the project is picked in the planner header. The project widget (`PROJECT_SETTINGS`) is narrowed down to a settings page.
- **Connecting a project to the planner via the settings manager group.** During a project's first-time setup you pick a settings-access group; after that the project becomes visible in the main-menu planner for everyone with access to the project (`ssp_acl` mirror + `sync-acl`).
- **«Rail + pane» dashboard.** On a wide screen (≥1330px of available width) — a navigation panel on the left (project/sprint context + section tree: Sprint parameters / Planning [Allocation / Distribution / Stand-up] / Gantt / History) and a wide work area on the right; on a narrow screen — the familiar stack. The panel collapses.

### Fixed

- **"Sprint parameters" and composition for a historical sprint.** When a finished sprint is selected, the parameters and role composition are read from the history snapshot, not from the active sprint.
- **Restored distribution-table calculations** (resource totals and the "used" column), broken since 2.2.0.

---

## [2.3.2] — 2026-06-05

> **Table micro-redesign: compact typography + row separators (#42).**

### Changed

- **Compact typography across all tables.** Reduced line-height and row vertical padding, plus a smaller, tighter font for the «Title» column — long task names no longer stretch rows into tall blocks, so data reads denser.
- **Thin row-separator lines in the planning tables (Ring UI).** Ring did not separate rows by default — with the compact layout they blurred together; a 1px divider was added under every row.

Visual only (CSS) — no logic or calculation changes.

## [2.3.1] — 2026-06-05

> **Task-picker modal positioning fix (follow-up to #33).**

### Fixed

- **The task-picker modal no longer shifts the page when it opens.** Ring Dialog's default `autoFocusFirst` focused the `QueryAssist` search field on open; on focus QueryAssist sets a caret (Selection API) and the browser scrolled the widget iframe to it — and `preventScroll` does not cross the OOPIF sandbox boundary. `autoFocusFirst` is now disabled on the shared Ring Dialog (our `modal-mount` already sets focus manually with `preventScroll`); for the modal that hosts `QueryAssist` the auto-focus is skipped entirely — the field is focused on user click. Other modals are unaffected (the manual handler already determined the final focus).

---

## [2.3.0] — 2026-06-04

> **Native YouTrack search in the task picker (#33).**

### Added

- **YouTrack-native search in the "+ Pick tasks" dialog.** The search field is now a Ring UI `QueryAssist` backed by the native `POST /api/search/assist` endpoint: type-ahead suggestions for fields/values/IDs, match highlighting, and full YouTrack query syntax. Suggestions are scoped to the current project. The results list is re-fetched when the query is applied (Enter or the search-glass icon) — easy on large projects.
- **Parameterized search scope** (`_buildPickScope`) — foundation for future cross-project sprint composition: the suggestion context (`folders`) and the issue-list filter (`project:` prefix) are extracted into an injectable object, so moving to multiple projects will not require rewriting the search layer.

---

## [2.2.6] — 2026-06-04

> **"Refresh from task" works for an agreed sprint (follow-up to #35).**

### Fixed

- **"Refresh from task" is no longer blocked for the active sprint once its composition is agreed** (or in any other planning status). It previously showed "Refresh is available only for the active sprint" — the guard relied on the internal working `_sprint` object, which is empty for an agreed sprint reconstructed from history. The guard now uses the same criterion as the UI read-only mode (`isHistoricalView`): refresh is unavailable only when viewing historical snapshots or editing working copies.

---

## [2.2.5] — 2026-06-04

> **Stand-up rendering fix (follow-up to v2.2.4).**

### Fixed

- **The Stand-up buckets no longer show orphan title-less rows** (like "DEMO-1 DEMO-1 @login"). Those were tasks removed from the role composition but still carrying an assignee entry in personalPlanning. The v2.2.4 read-fix surfaced them (they were previously hidden by an empty cache); Stand-up now shows only tasks in the current role composition, enriched with their assignee.

---

## [2.2.4] — 2026-06-04

> **Stand-up refresh button fix (alongside #35).**

### Fixed

- **The "Refresh" button on the Stand-up tab now works.** It previously sent a malformed request (the endpoint contract did not match) and silently did nothing (since the full rebuild). It now correctly pulls task state from YouTrack (the basis for the Done / In progress / Not started buckets) for the selected role, and the assignee for the current role.
- **Stand-up reads assignment data from the canonical source** (same as the "Distribution by people" tab and the Gantt) instead of an unreliable cache — assignees no longer disappear from the buckets after saving other roles.

---

## [2.2.3] — 2026-06-04

> **Universal "Refresh from task" button (#35).**

### Added

- **A single "Refresh from task" button** on both planning tabs and the Gantt. One batch request pulls the full task snapshot (estimate, spent, state, priority, system, assignee) and updates both tabs and the Gantt at once.
- **Unsaved edits are protected.** When local data clashes with YouTrack, a summary appears with a choice: "Update all from YouTrack" / "Keep my changes" / "Show differences" (diff over estimate/spent/assignee).
- **Refresh is blocked** while an uncommitted cell editor is open, and is available only for the active sprint.

### Changed

- The three former refresh points (per role, per assignee, Gantt) are unified into a single `refreshFromYouTrack` path. The button label is consolidated into the `btnRefreshFromTask` key.

---

## [2.2.0] — 2026-06-03

> **Clearer period value entry (#34).**

### Changed

- **A plain number in a time field is now read as hours** (previously minutes): typing "16" = 16h. Applies to every period field (resource/capacity, estimate, allocation).
- **Unit suffixes follow the interface language.** The parser understands the active locale's hour/minute markers (plus Latin `h`/`m` and Russian `ч`/`м`), removing the input/display mismatch across all 15 languages (including Turkish, where "d" means minute).
- **Period fields auto-format on blur** to a canonical hours-and-minutes form: "16" → "16h", "90m" → "1h 30m".
- **A single placeholder hint** ("e.g. 16h / 90m") across all period inputs.

### Removed

- **Day/week input retired** in favour of consistent hours and minutes (the display never showed them anyway). Previously accepted "5d"/"2w" are now read as hours.

---

## [2.1.47] — 2026-06-03

> **Maintenance release: build toolchain update.**

### Changed

- **Upgraded esbuild 0.21.5 → 0.28.0.** Closes an `npm audit` advisory (GHSA-67mh-4wv8-2f99 — affected a build-time dev dependency; the shipped product was unaffected). Build re-verified: artifacts reproducible and comparable in size, unit tests and live smoke pass. No widget functionality changes.

---

## [2.1.46] — 2026-06-03

> **Locale-aware Priority/State display (B7) + plan-beyond-limits mode (#38).**

### Fixed

- **Task Priority/State values now display in the widget's UI language (B7).** YouTrack returns enum-field values (Priority, State, Cross Priority) in the server locale, so on English (and other non-Russian) widget languages they were still shown in the server's language. Display now goes through a locale-aware resolver: Russian behaviour is unchanged; on other languages standard values are shown using their canonical English names. Custom values with no canonical translation are shown as-is. Only display is affected (planning table, history, Excel export, Gantt); the underlying logic (per-type hours aggregation, history snapshots, sorting, Gantt state-change detection) uses the original values and is unchanged.

### Added

- **"Allow planning with over-allocation" mode (#38).** A new checkbox in Settings (Planning modes). When enabled: validation is no longer blocked and the over-limit dialog is not shown when a role's total allocation exceeds its resource; negative remainders are still shown in red as an indicator (over-limit detection is preserved — only the reaction changes). A status chip in the widget header reflects the mode. Localized across all 15 languages.

---

## [2.1.44] — 2026-06-02

> **Role over-allocation detector fix (B13).**

### Fixed

- **Over-allocation detector now accounts for the role's aggregate allocation.** Previously over-allocation was checked per task only (a task's allocation vs its own «estimate − spent» delta); with empty estimates the delta was zero and the over-allocation went undetected even though the role's remaining resource was already negative. Added an aggregate check: the sum of active-task allocations against the role resource (the same computation that paints the «Remaining» card red). The «Validate» button is now disabled, and for confirmed/allocated roles the over-allocation dialog appears, even when task estimates are empty.

---

## [2.1.43] — 2026-06-02

> **De-hybridization wrap-up (#32, phase 6, part 2)** — toast notifications now render with real Ring UI (`alertService` + `Alert`), unifying their look with all modals. The #32 de-hybridization is complete.

### Changed

- **Toasts migrated to Ring `alertService`.** The custom toast DOM is replaced by real Ring `Alert` components. The `toast(msg, type)` contract and `toastApi.{info,warn,error,success,dismissAll}` are preserved 1:1: type→Ring mapping (info→message, warn→warning, error→error, success→successMessage), per-type durations kept (info/success 4 s, warn 6 s, error persistent), queue capped at 3 (oldest non-error evicted). `alertService` added to the vendor bundle; Ring alert CSS added to the curated Ring subset.
- **Toast positioning in the auto-grow iframe.** Ring renders its alert container into `document.body` as `position:fixed` (bottom-right), which lands off-screen in YouTrack's auto-grown widget iframe — the same problem the custom toast solved. The container is re-anchored to `position:absolute` with a JS-computed top relative to the last click (visible-region guarantee). The legacy toast DOM stack is retained as a fallback if the vendor bundle is unavailable.

---

## [2.1.42] — 2026-06-02

> **De-hybridization wrap-up (#32, phase 6, part 1)** — the legacy Ring Dialog bridge and the old vanilla settings window are removed; modals and settings now run entirely on real React.

### Removed

- **Legacy Ring Dialog bridge (`__SSP_DIALOG` / `dialog-mount.jsx`).** Dropped the DOM transplantation of vanilla-overlay content into Ring Dialog, the per-overlay `MutationObserver` (which watched for `classList.add('hidden')`), the polling repositioning (`setInterval`), and the bridge itself. After every modal moved to the declarative `openModal()` (phases 1–5) the bridge became unreachable — removed together with its CSS (`.ssp-dialog-host`, `.ssp-dialog-inner`).
- **Old vanilla settings path.** Removed the `#settingsOverlay` DOM (the full-screen vanilla form) and its wiring: `openSettingsOverlay` / `closeSettingsOverlay` / `applySettingsUI` / `collectSettings` / `doSaveSettings` plus the form button/nav-chip bindings. Settings now open exclusively through the React `settingsForm` component (phase 5). Form CSS (`.settings-overlay`, `.settings-card`, `.settings-nav__chip`) removed.

### Other

- Obsolete e2e tests of the vanilla settings form (DTA / cascade / state-rollup UI) removed; the settings smoke test now asserts demolition + no widget crash.

---

## [2.1.41] — 2026-06-02

> **Ring UI modal de-hybridization, phase 5 (#32)** — the settings window now renders real React in a two-pane layout, completing the migration of the last vanilla form.

### Changed

- **Settings window on real Ring UI (two-pane).** The plugin settings form is rewritten as a bespoke React component (`settingsForm`) rendering genuine React content in a Ring Dialog via `openModal(spec)`. A two-pane layout — section list on the left, the active section on the right with its own scroll, footer always visible — replaces the previous accordion, which did not scale to twelve dense sections inside a height-limited modal. All sections (roles, access groups, field mappings, estimate/fact fields, norms, planning modes, differentiated time accounting, cascade aggregation, state rollup, stand-up, misc) render as real React; section-specific data (cascade values, rollup/stand-up states) loads asynchronously through callbacks. An explicit close (×) button was added to the top-right corner.

### Fixed

- **Settings sections are now directly reachable.** The left-hand navigation buttons make every section selectable with a single click (the previous accordion summaries were not exposed as actionable controls). The duplicate-type guard in differentiated time accounting now also marks the offending section in the navigation.

---

## [2.1.20] — 2026-06-01

> **Ring UI modal de-hybridization, phase 4 (#32)** — the "pick tasks into the sprint" dialog now renders real React, fixing the selection-checkbox glitches; plus two modal layout fixes.

### Changed

- **Task-picker dialog on real Ring UI.** The "pick tasks into the sprint" dialog (search, paginated results, per-row selection, "select all across pages") is rewritten as a bespoke React component (`pickPicker`) rendering genuine React content in a Ring Dialog via `openModal(spec)`, removing the last vanilla overlay. Selection checkboxes are plain native inputs on React state, and the "select all" master checkbox is a derived tri-state — no more dataset bridge, MutationObserver, or duplicate click handlers.

### Fixed

- **Selection checkboxes now respond to a single click (B10).** Previously the row checkboxes in the task picker required a double-click.
- **"Select all" master checkbox no longer desyncs from the row checkboxes (B11).** The tri-state master (none/some/all) and the per-row selection stay in sync; the off-by-one and "master appears empty while rows are checked" glitches are gone.
- **Task-picker dialog width restored.** The dialog is back to its comfortable wide sizing (~900px), so all result columns fit without wrapping or horizontal scrolling.
- **Form fields now span the full modal width.** Inputs inside form dialogs (the sprint-goal retrospective note, the task-field period input) no longer render narrower than the rest of the dialog.

---

## [2.1.17] — 2026-06-01

> **Ring UI modal de-hybridization, phase 3 (#32)** — the working-copy diff view, the task-field update dialog, and the sprint-history import dialogs now render real React.

### Changed

- **Working-copy diff, field-update and history-import modals on real Ring UI.** Four modals — the working-copy diff view (added/removed/changed tasks), the "update task field value" dialog (enum dropdown or period input), the sprint-history import dialog (per-sprint checkboxes + skip/overwrite mode), and the "full history restore" confirmation — now render genuine React content in a Ring Dialog via `openModal(spec)` instead of transplanting vanilla DOM. The diff view and field-update dialog are bespoke React components; the import dialog uses plain React state for its sprint checkboxes (not a Ring Table, avoiding the first-click issue) and keeps its `Promise` import contract. The destructive "full restore" confirmation reuses the generic confirm path.

---

## [2.1.16] — 2026-06-01

> **Ring UI modal de-hybridization, phase 2 (#32)** — five more modals moved to real React, plus two pre-existing working-copy bugs fixed (surfaced once the modals could be exercised).

### Changed

- **Working-copy, reassign and sprint-result modals on real Ring UI.** Five modals — version conflict, "open in another tab", discard working-copy edit, task reassignment, and sprint-result confirmation — now render genuine React content in a Ring Dialog via `openModal(spec)` instead of transplanting vanilla DOM. Reassignment (`<select>`) and sprint-result confirmation (outcome radio + retro note) are bespoke React components; the sprint-result dialog keeps its `Promise<{goalOutcome, goalRetroNote}|null>` contract. The blocking "open in another tab" dialog stays non-dismissable (Escape disabled).
- **Modal Escape, hardened.** Escape now closes any non-blocking modal reliably via a foundation-level listener, regardless of which control holds focus (Ring's own handler did not fire when focus sat on a radio/textarea).

### Fixed

- **Working copies no longer auto-commit on open.** Opening a history record for edit created a working copy that was immediately committed and deleted by the passive "auto-snapshot after sprint-data save", so the discard button never appeared. The auto-snapshot now skips while a working copy is active (working-copy edits persist to the draft; committing stays explicit).
- **Working copies and drafts persist again across reloads.** The `ssp_workdrafts` and `ssp_drafts` extension properties were never declared in `entity-extensions.json`, so YouTrack silently dropped writes (POST returned OK, the next GET was empty). Both properties are now declared. This bug had been masked by the auto-commit bug above.

---

## [2.1.15] — 2026-06-01

> **Ring UI modal de-hybridization, phase 1 (#32)** — confirm modals now render through real React instead of a DOM wrapper, plus two interaction fixes.

### Changed

- **Confirm modals on real Ring UI.** Nine confirmation modals (clear draft, clear/delete sprint history, finish sprint, clear role roster, clear/delete assignees, role resource overrun, close working copy) have moved off the DOM wrapper (transplanting vanilla DOM into a Ring Dialog) to genuine React rendering of their content via a declarative `openModal(spec)` API. Consistent appearance, correct dialog width, no divider artifacts.

### Fixed

- **Saving the role roster after a state sync from YouTrack.** After refreshing a task's state from YouTrack (state badge on the Gantt chart / "Refresh" button), saving or validating the sprint on that role could fail with a data-structure error (`invalid_role_items_structure`). The backend validator now accepts the state fields `stateLocalized`, `stateColor`, and `stateFieldId` as part of a task (added to the whitelist — release 2.1.14 #20 wrote them on the frontend, but the whitelist was never extended).
- **First-click response in Ring Table rows.** The delete (trash) buttons for tasks and assignees, along with the quick-edit cells (state/priority/system), now fire on the first click — previously a second click was required. Cause: Ring Table rebuilds the row on `mousedown`, so the browser never emitted a `click` event on the first press; the handlers have been moved to `mousedown`.

---

## [2.1.14] — 2026-05-30

> **Task state on the Gantt chart (#20)** — a badge with the current State in native YouTrack colors, the date of the last transition, and the previous state. No schema changes.

### Added

- **Task state badge.** In the left label cell of each Gantt row (under the assignee name) — a pill with the current State in native YouTrack colors (background/text from the state palette), with the transition date "since {date}" next to it.
- **Previous state.** A separate line "← was «{state}» · N d. ago" with a colored dot of the previous state. History is pulled from the YouTrack Activities API on the widget side (the backend has no access to the activity log); progressive rendering — the badge draws immediately, history loads asynchronously.
- **Localization.** 6 new UI strings translated across all 15 supported locales.

### Changed

- **Gantt bar color** now reflects the task state (native YouTrack palette) instead of the assignee. Fallback is a neutral gray when no state or color is present.
- **"Sync from tasks" button → "Refresh".** The two Gantt buttons are merged into one: it pulls assignee and state from YouTrack, then reloads the transition history. The `refresh-assignees` backend endpoint now also returns State (name + color).

### Removed

- **Manual bar recoloring by double-click.** The bar color is now meaningful (derived from the YT state), making manual marking (`userColorOverride`, frontend-only) redundant — the mechanism has been removed.

---

## [2.1.13] — 2026-05-30

> **Sprint history export/import (#27)** — JSON round-trip backup and restore of sprint history. No schema changes.

### Added

- **Export sprint history to JSON.** The History tab header gains a "Full history (JSON)" button (downloads all snapshots in a self-describing envelope) and a per-sprint JSON icon next to the existing Excel export. Optional anonymization strips rates (`kpe`/`rate`) from the export.
- **Import sprint history from JSON.** "Import from file" opens a preflight dialog: source info (project, instance, export date, plugin version), per-sprint selection, collision markers against current history, and a merge mode — skip duplicates or overwrite duplicates (by `sprintId`).
- **Full restore (replace-all).** A separate confirm dialog wipes current history and replaces it with the file contents; guarded by the `historyManager` role via a new `POST /history?action=import-replace` endpoint.
- **Cross-fork compatibility.** Files exported from a paired/sibling fork import here with an info note; records are always written to `ssp_history` regardless of the file's origin marker.
- **Full localization.** All 38 new UI strings translated across all 15 supported locales.

---

## [2.1.12] — 2026-05-29

> **Calculation chain fixes** — role resource cards now show correct values; manual assignee capacity is preserved after recalculation; overlimit validation accounts for tasks without explicit allocation. No schema changes. 419 tests pass.

### Fixed

- **[F2] Role card for active sprint always showed 0 in the «Resource» field.** `computeRoleQuickStats` read `_sprint.roles[rk].resource` — a path that does not exist in the codebase (0 write sites). Fixed to read from `_sprint[role.resKey]` with minutes-to-hours conversion.
- **[F3] Role card for historical sprint displayed values ×60.** `computeRoleQuickStats` (history branch) passed `resKey` and `Σalloc` (minutes) directly to `_formatHoursLight`, which expects hours. Fixed by dividing by 60 before returning the stat object.
- **[F1] Overlimit warning did not fire for tasks without explicit allocation.** `computeRoleQuickStats` and backend validation (`action=validate`) treated `alloc=null` as `0` instead of the canonical `alloc ?? max(0, est−fact)` from `calcRemForRole`. Both paths aligned to the canonical formula.
- **[F8] «Calculate Resources» and «Pick assignees» overwrote manual assignee capacity.** `doRecalcResource` and `doCurrentRoleCalc` did not check `manualPersonalResource` and reset `entry.resource` using the formula. Added `if (manualPersonalResource) return` guard (matching the existing grade-handler pattern); `doCurrentRoleCalc` now preserves `resource`/`manualResource` when rebuilding the assignee list.

---

## [2.1.11] — 2026-05-28

> **Final B10 fix** — pick-overlay single-click reliability in production with Ring Table + React Checkbox. No schema changes. 419 tests pass.

### Fixed

- **[B10 — final] Pick-overlay checkbox state reset back to «0» right after single-click.** The v2.1.10 capture listener used `host.dispatchEvent(new Event('change'))` to trigger `_selectedIds` delegation. That same change event reached the Ring Checkbox React `handleChange`, which read `e.target.checked` (target = host span, `undefined`), computed `next = false`, and immediately reset `host.dataset.checked` to `'0'`. The race was invisible to programmatic dispatch tests but reproduced on every real mouse click in the browser. **Resolution:** synchronise `host.dataset.checked` + inner `input.checked` in lockstep within the capture handler, then dispatch `change` on the inner input (not the host) so React `handleChange` reads the correct `e.target.checked` value. Smoke PASS in real browser: 0→1→0 toggle on single click; `disabled` guard intact.
- **[release-engineering] `playwright.smoke.config.js` + `playwright/` excluded from app zip.** ESM `import` syntax in `playwright.smoke.config.js` was tripping YouTrack's workflow parser during app install, breaking re-upload via REST. Updated `npm run zip` exclusions.

---

## [2.1.10] — 2026-05-28

> **Two UX bug fixes** (B9: sprint intro data, B10: pick-overlay checkboxes). No schema changes. 419 tests pass.

> ⚠️ **Note:** v2.1.10's B10 fix had a regression discovered in live smoke (single-click reset to «0» due to Ring Checkbox handleChange race) — see [2.1.11] for the final resolution.

### Fixed

- **[B9] Sprint intro fields showed stale data from previous sprint after dropdown switch.** `setCurrentSprintId` refreshed #sprintName / #dateStart / #dateEnd / #sprintGoal from the global `_sprint` — the working sprint, which is NOT updated on dropdown switch. Now reads from `_sprint` when its `sprintId` matches the selected sprint; otherwise falls back to the first matching `_history` record. B8 behavior (refresh on init) is preserved.
- **[B10] Pick-task overlay checkboxes required double-click to toggle.** Ring Table's internal click handling (row focus/hover handlers) consumed the first click before the Ring Checkbox React component could process it. Added a capturing click listener on `#pickResults` that intercepts clicks on `.pick-cb` hosts before Ring Table, stops propagation, and directly toggles state via `setChecked` + dispatches `change` for `_selectedIds` delegation.
- **[community] Marketplace-screenshots excluded from zip artifacts.** `npm run zip` and `npm run zip:marketplace` now exclude `marketplace-screenshots/` directory, restoring release size to ~700 KB (was ~1.7 MB in v2.1.9).

---

## [2.1.9] — 2026-05-27

> **UX fixes — 4 modal and tab bugs** (divider overflow, ESC handling, tab indicator, sprint intro). No schema changes. 419 tests pass.

### Fixed

- **[B5] History modal — divider lines overflow dialog frame.** Pseudo-elements on `.ssp-dialog-inner > .modal__head::after` / `::foot::before` used `left: 0; right: 0`, spanning the full 480px `.modal` width and exceeding the Ring Dialog frame. Inset to `left: 20px; right: 20px` (matching `modal__head` horizontal padding).
- **[B6] ESC did not close «Pick sprint tasks» and «Confirm sprint goal» modals.** The IIFE ESC handler returned early for any non-empty `_modalStack`, even for `pickOverlay` (intentionally excluded from Ring Dialog). Guard now checks `ssp-dialog-host` presence on the topmost modal — legacy-path elements (via `_modalAutoAttach`) never get that class, so IIFE correctly handles their ESC. `openConfirmGoalDialog` also gained a defensive `document` keydown listener that calls `onCancel()` if Ring Dialog does not fire `onCloseAttempt`, ensuring the sprint-goal Promise always resolves.
- **[B7] Active tab indicator did not follow programmatic tab switch.** `resumeWorkingDraft` programmatically clicks the Planning tab button, switching tab-panel content but leaving `sspTabsHost.dataset.selected` stale — Ring Tabs visual indicator is driven by that attribute via MutationObserver. The tab-btn click handler now syncs `sspTabsHost.dataset.selected` immediately after saving the UI-state draft.
- **[B8] Sprint intro fields stale after sprint dropdown change.** `setCurrentSprintId()` called `_renderPlanningLevel()` (role accordions) but never refreshed the «Sprint intro» block (#sprintName, #dateStart, #dateEnd, #sprintGoal). These inputs only updated on role accordion render. Explicit refresh added inside `setCurrentSprintId` when the planning tab is active.

---

## [2.1.8] — 2026-05-26

> **Hotfix — 3 production bugs** (history table layout, assignee sort, sprint snapshot). No schema changes. 419 tests pass.

### Fixed

- **[B] History sprint table — «Title» column collapsed.** Ring Table host had no `min-width` on `.td-title`; the column shrunk to a character strip. History title column now carries class `ssp-col-title` (`min-width: 240px; word-break: break-word; white-space: normal;`).
- **[C] Sort by assignee produced wrong order.** `multiKeySort` and `compareAssignee` read `item.assignee` which is absent on task objects — assignee lives in `taskAssignments`. Both functions gained an optional `taMap` parameter; callers (`renderCurrentRoleTaskTable`, `renderGanttChart`) pass `taskAssignments` as the third argument.
- **[D] Sprint confirm snapshot lost non-active tasks.** `saveRoleHistorySnapshot` applied `ACTIVE_INC` filter (PLANNED/UNPLANNED only) when building `snap.items`, silently dropping tasks in other states (IN_PROGRESS, DONE, CANCELLED, etc.). Snapshot now includes all role tasks. History display totals and Excel export still aggregate ACTIVE_INC only (intentional).

---

## [2.1.7] — 2026-05-25

> **Parity gate.** 8 UX/CSS fixes consolidated into v2.1.7: modal click-anchor jump root cause + Ring Table CSS-module silent-noop selectors + defensive multiline textarea sizing + Ring font-size 13px scoped override. No schema changes. 424 unit tests pass.

### Fixed

- **Modal jumps to click position** (Bug #1). `dialog-mount.jsx` setInterval(reposition, 100ms) continuously re-positions Ring Dialog container to `__SSP_MODAL_ANCHOR.getCenterY()`. `click-anchor.js` document-capture listener was updating `lastY` on **any** click — including clicks inside an open modal — making the modal jump to the click position on next 100ms tick. Symptoms: pagination in pickOverlay scrolled away, textarea in confirmGoal modal collapsed on focus. Fix: new helper `_isClickInsideOpenModal(target)` checks `closest('.ring-dialog-container, .ssp-dialog-host, .ssp-dialog-inner, .overlay:not(.hidden), .settings-overlay:not(.hidden), .dyn-modal-overlay:not(.hidden)')`; both click and keydown listeners early-return when target is inside an open modal. Clicks outside modals continue to update the anchor (so the next modal still opens at the right location).
- **`--surface-hover` CSS token undefined on light theme** (Bug A). `.alloc-input` and `.dyn-period-input` use `var(--surface-hover, #2a2a3a)` with hardcoded dark fallback — on light theme the fallback `#2a2a3a` rendered as a black background in the Inclusion-status column. Token defined explicitly for `:root` (light, white background), `body.theme-dark` / `[data-theme="dark"]` (`#3a3a4d`), and `@media (prefers-color-scheme: dark)` block (`#3a3a4d`).
- **Ring Table cell selectors silent-noop** (Bug C). CSS rules `[data-ssp-table-host] .ring-table-cell.*` never matched because Ring Table renders cells with a CSS-module hashed class (e.g. `table_a3f9__cell`), not literal `.ring-table-cell`. Selectors simplified to `[data-ssp-table-host] .td-*` (own custom classes set via `column.className`) + explicit `width:` declarations alongside `min-width`/`max-width` for stable column layout. `vertical-align: middle` rewritten to target `td, [role="cell"]` directly.
- **Multiline textarea collapses to one line** in confirmGoal modal (Bug D). Defensive `min-height: 72px` + `resize: vertical` for `[data-ssp-input-host][data-multiline="1"] textarea` and `.ring-input-input` — protects against Ring textarea not receiving the `--multiline` modifier from current Ring version.
- **Ring controls font-size 14px instead of 13px baseline** (Bug #3). Ring native `--ring-font-size: 14px` cascaded into widget UI making controls bigger than the surrounding scale. CSS variables `--ring-font-size: 13px`, `--ring-font-size-smaller: 11px`, `--ring-line-height: 18px`, `--ring-line-height-lower: 16px` scoped to widget root (`.page`, `[data-ssp-table-host]`, `[data-ssp-input-host]`, `.ring-select-popup`, `.ring-popup`, `.ring-dialog`, `.ssp-dialog-host`, `.ssp-dialog-inner`). Defensive direct `font-size: 13px !important` for Ring popup option items (portal-rendered, variables may not cascade).
- **Sprint composition table column proportions broken** (Bug #4). 12 columns split width evenly — «Название» / External ID got too narrow. Explicit `min-width` / `max-width` / `width` declarations for `.td-id` (100px), `.td-priority` (90px), `.td-xpriority` (80px), `.td-system` (100px), `.td-num` (80px, right-aligned). Table `min-width: 600px → 1100px` to prevent collapse.
- **Table inputs font-size 14px in Ring Table cells** (polish 3). `.dyn-period-input`, `.dyn-enum-cell`, `.inc-sel`, `.currentRole-task-date`, and any `input`/`select` inside `[data-ssp-table-host]` now use `font-size: 13px !important; line-height: 18px;`. Direct `.dyn-period-input` and `.inc-sel` styling (background, border, radius, color, padding) for visual consistency with `.alloc-input`.
- **Finish/Start date columns stretch in distribution table** (polish 4). `dateStart` and `dateEnd` columns now ship with `className: 'td-date td-start'` and `'td-date td-end'` respectively; matching CSS `[data-ssp-table-host] .td-date { min-width: 130px; max-width: 160px; width: 140px; white-space: nowrap; }` prevents last column from expanding to fill remaining row width.

### Changed

- **Version sync 6 points** per project conventions: `manifest.json:version`, `manifest.json:changeNotes`, `package.json:version`, `package.json:scripts.zip` filename pattern, `widgets/main/src/legacy-monolith.js:APP_VERSION`, `backend-project.js` `/app-version` literal, `backend-project.js:CURRENT_PLUGIN_VERSION` — all bumped `2.1.0 → 2.1.7` in a single commit.

### Notes

- **No schema changes.** `CURRENT_PLUGIN_VERSION` bumped for forward-stamping consistency only; snapshot shape unchanged. Existing v2.1.0 snapshots load through `migrateSnap` cleanly (validated via `compat-prev-release.test.js` against `tests/fixtures/snapshots/2.1.0/`).
- **Parity gate context.** This release back-ports 8 common UX/CSS fixes to keep the UX baseline consistent. No schema changes in this parity release; existing v2.1.0 snapshots load cleanly.
- After parity gate both repositories converge on `v2.1.7` and continue as synchronized parallel branches per `SYNC_PROTOCOL.md`.

---

## [2.1.0] — 2026-05-25

> **Ring UI ярус 3 — полная миграция на React Ring компоненты.** Final tier of the three-tier Ring UI migration started in v1.9.6. All major UI elements via React mount-points (Dialog, LoaderInline, DatePicker, Checkbox, Radio, Tabs, Table). Plus Ring Input mount-points for the most visible text/number/textarea fields. Bundle 1224 KB raw (within ~1.25 MB ceiling, +58 KB vs v1.10.0). 415 unit tests pass.

### Added

- **Ring Table** for all 5 table layouts via `window.__SSP_TABLE.mountAt` hybrid controlled-mode bridge: task assignment, assignee resources, DTA mapping (Settings), pickOverlay task search, role composition. Sortable headers + external pagination + DatePicker / Checkbox / select cells preserved.
- **Ring Input** mount-points (`window.__SSP_INPUT`) for 7 main-view text/number/textarea fields: `sprintName`, `sprintGoal`, `pickQuery`, `goalRetroNote`, `dynFieldInput`, `cascadeLinkInwardInput`, `cascadeLinkOutwardInput`. Uncontrolled mode (defaultValue) preserves legacy `getElementById('X').value = Y` write semantics.
- **Bridge extension**: `wrapHeaderFn` in `table-mount.jsx` allows `column.getHeaderValue` to return `{__html}` / `{__type}` / strings / ReactNode (parity with `getValue`). Enables Ring Checkbox in pickOverlay column header.
- **Form field unified height** (36px min-height) for all `.field` and `.settings-card` inputs / selects / textareas — native fields and Ring Input mount-hosts align consistently.
- **SCHEMA_MIGRATIONS** entry `{ from: '1.10.0', to: '2.1.0', migrate: identity, note: 'Ring UI ярус 3 — full Ring Table migration + Ring Input mount-points + visual unification' }`. Backward-compat fixture snapshot frozen at `tests/fixtures/snapshots/2.1.0/`.

### Changed

- **`buildRolePanel`** host swap — native `<table id="compTable_<rk>">` / `<thead>` / `<tbody>` removed, replaced with `<div id="compHost_<rk>" data-ssp-table-host>`. Pagination (`#planPag_<rk>`) stays external sibling.
- **`updateAllocOverlimitUI`** adapted to Ring Table — overlimit highlight via `host.querySelectorAll('input.alloc-input[data-iid]')` border-color; validate button disabling + overlimit modal preserved via `checkAllocOverlimit(rk)` global check.
- **Bundle limit raised**: `ring-subset.css` HARD_LIMIT 100 → 130 KB to accommodate ring-input / ring-select / ring-popup / ring-list / ring-dropdown / ring-collapse classes. Final `ring-subset.css` 106 KB.
- **`vendored-react.chunk.js`** 650 KB → 697 KB (+47 KB on Ring Input/Select/Collapse imports).

### Fixed

- **Sprint header + buttons + modals regression** (F1 mass-migration): `pickQuery` callsite `document.getElementById('pickQuery').addEventListener(...)` threw null-deref after migration to host-span, aborting the entire init IIFE and leaving sprint-selector + new-sprint button + clear-history button + modal-positioning broken. Fix: `getElementById('pickQuery') || querySelector('[data-input-id="pickQuery"]')` fallback chain.
- **Native `<input>` background dark in Ring Table cells** (E4): native `<input>` in Ring Table cells inherits Ring's cell background. Fix: explicit inline `background:var(--surface) + color:var(--text) + border + padding` for `.alloc-input` and `.dyn-period-input`.

---

## [1.10.0] — 2026-05-22

> **Sort tasks by assignee column (B-23).** Click the «Assignee» column header in the role planning table (Planning → People sub-tab) to sort rows alphabetically by assignee name. Empty/unassigned tasks always sort to the end. Tie-breakers: xpriority → priority → issue ID. Toggle off by clicking the active column. The history-spoiler tasks table intentionally keeps its frozen snapshot order — sorting only applies to the live planning view. No schema changes. 407 unit tests pass (375 → 407, +32).

### Added

- **`assignee` sort key** in the multi-key sort cycle. Joins the existing keys (`xpriority`, `priority`, `id`, `system`, `externalTicketId`) without breaking their behaviour.
- **Clickable sort header** for the Assignee column in `renderCurrentRoleTaskTable` (Planning → People sub-tab). Scope intentionally limited to the live planning view — the history spoiler keeps frozen snapshot order.
- **Empty-assignee policy**: tasks without an assignee always render at the end of the sort, regardless of toggle direction. This keeps the active assignees visually grouped at the top.
- **Pure helpers** in `widgets/main/src/sort-pure.js`: `compareAssignee`, `nextSortKey`, `isValidSortKey`, plus re-exported helpers (`xpRank`, `prRank`, `idCmp`) and the frozen `SORT_KEYS_CYCLE` / `PRIORITY_RANK_MAP` constants. Unit-tested in isolation.
- **24 new unit tests** for sort-pure helpers (alphabetical compare, empty-to-end policy, null/undefined safety, tie-breakers, sort-key cycle navigation).
- **4 fixture round-trip tests** for the v1.10.0 baseline (`tests/fixtures/snapshots/1.10.0/`).
- **4 compat-prev-release tests** against v1.10.0.
- `SCHEMA_MIGRATIONS` no-op entry `1.9.11 → 1.10.0` (frontend-only change, schema unchanged).

### Notes

- No new i18n keys required — the existing universal `thSortClickHint` tooltip applies to the new Assignee column too.
- The Gantt chart already groups tasks by assignee visually; this release does **not** change Gantt grouping logic. Gantt remains a grouping view; the new sort applies only to the tabular task lists.
- Marketplace upload skipped per defer-pivot strategy — consolidated submission planned for v2.0.0 after Ring UI tier 3.

---

## [1.9.11] — 2026-05-22

> **Modal and toast UX overhaul (B-32) plus Ring UI tier 2 polish (B-31).** All 18 modal dialogs gain focus trap, body scroll lock, ARIA roles, and opt-in backdrop dismiss. Toast system rebuilt: bottom-right stack, queue limit 3, per-type auto-dismiss, screen-reader live region. Sprint goal and retro note textareas align with Ring UI input style; modal footer buttons gain equal width; destructive-with-restore operations shift from danger red to warn orange. No schema changes. 375 unit tests pass (315 → 375, +60).

### Changed

#### B-32 — Modal and toast UX

- **Toast system rebuilt.** New `window.__SSP_TOAST.{info,warn,error,success}` API replaces the legacy click-anchored toast (v1.8.5 D131). Bottom-right fixed stack with queue limit 3; per-type auto-dismiss (info/success 4 s, warn 6 s, error persistent); FIFO eviction skips persistent error entries; `aria-live="polite"` on the container, `role="alert"` + `aria-live="assertive"` on error toasts. Path A (parent doc host) preserved for cross-origin-friendly placements. Backward-compat global `toast(msg, type)` remains for 100+ existing call sites.
- **All 18 modal dialogs receive UX baseline.** ARIA `role="dialog"` (or `alertdialog` for destructive confirms), `aria-modal="true"`, `aria-labelledby="<title-id>"`. Focus trap via Tab cycling inside content. Body scroll lock while any modal is open. Backdrop click dismiss opt-in via `data-dismiss-on-backdrop="true"` (currently enabled for `pickOverlay`, `wcDiffOverlay`, `settingsOverlay`). Blocking modals (`wcMultiTabOverlay`) carry `data-no-escape="true"` to prevent accidental Escape dismissal.
- **Escape handler is now stack-aware.** Uses an internal `_modalStack` of open overlays; falls back to DOM-order topmost only when the stack is empty (covers legacy open paths). Skips overlays with `data-no-escape="true"`.
- **MutationObserver on overlay `class` attribute.** Existing `el.classList.add('hidden')` and `classList.remove('hidden')` close/open paths are now wired to the new focus-trap / scroll-lock lifecycle automatically, without rewriting 100+ legacy call sites.

#### B-31 — Ring UI tier 2 polish

- **Textarea consistency.** `sprintGoal` and `goalRetroNote` adopt `ring-input-input ring-input-input--multiline` — Ring UI border/padding/focus styles with `overflow:auto` + `resize:vertical`. Subclass overrides the `ring-subset.css` default `resize:none` (correct for single-line inputs, wrong for multi-line user content).
- **Equal-width action buttons in modal footers.** `.confirm-btns`, `.modal__foot`, `.dyn-modal-btns`: `flex: 1 1 0` + `min-width: 100px`. Planning + Assignee toolbars (`.editor-btn`): unified `min-width: 140px` for visual symmetry without overstretching three-button rows.
- **Button color hierarchy refresh.** `currentRoleClearAssigneesBtn`, `clearAssigneesYes`, `clearYes` (clearOverlay), `delHistYes` switched from `ring-button-danger` (red) to `btn--warn` (orange) because each operation is destructive-with-restore (re-pick assignees, re-compose sprint, re-validate history snapshot). Hard-destructive operations (`clearAllHistYes`, `delAssigneeYes`, `clearDraftYes`) remain danger.

### Added

- `widgets/main/src/toast-pure.js` — pure helpers (`computeToastDuration`, `selectToastToEvict`, `normaliseToastText`); unit-tested in isolation.
- `widgets/main/src/modal-pure.js` — pure helpers (`findCancelButtonId`, `topmostFromStack`, `pushUnique`, `popItem`, `isBackdropClick`, `parseBackdropOptIn`); DOM-free.
- `tests/unit/toast-pure.test.js` — 22 tests.
- `tests/unit/modal-pure.test.js` — 30 tests.
- `tests/fixtures/snapshots/1.9.11/` — baseline storage snapshot frozen for next-release fixture validation.
- `SCHEMA_MIGRATIONS` no-op entry `1.9.10 → 1.9.11` (UX-only changes, no shape change).

### Removed

- Legacy click-anchored single-toast positioning replaced by the new stack. `_lastClickY` tracking retained — repurposed as the **anchor point for the stack itself** so toasts stay in the user's visible region even when the YouTrack widget iframe is stretched to a long content height (where `position: fixed; bottom` pins to the bottom of the iframe document, not the visible viewport).

### Fixed (post-smoke)

- **Toast viewport visibility in long widget pages.** Round 1 / round 2 attempts (`position:fixed; bottom`, then `position:absolute; top = scrollY + innerHeight - h`) both failed in the YouTrack iframe context — the iframe has no own scroll, `window.scrollY` is always 0, `innerHeight` is the content height. Round 3 ships click-anchored positioning: stack top = max(8, lastClickY - stackHeight - 24). Confirmed visible after spoilers are expanded.
- **Body scroll lock removed.** Both `position:fixed` (round 1) and `overflow:hidden` (round 2) variants risked interfering with click handlers in the iframe. In the YouTrack widget context the page scroll lives in the parent document (cross-origin), so any iframe-side lock is a no-op anyway — the reference counter is kept for the API contract, but no DOM mutation happens.
- **Working-draft schema: `gantt` accepted.** The frontend has been serialising `gantt` into the working-draft snapshot since the v5.x baseline (`createWorkingDraft()` line 1847), but the field was missing from `ALLOWED_WORKING_DRAFT_KEYS`. Strict validation rejected every draft flush with `invalid_working_draft:<key>`. Added `gantt` to the whitelist — purely additive (no shape change, no migration step needed).

### Internal

- All snapshots from v1.0.0 baseline through v1.9.10 continue to load without migration steps; the v1.9.11 migration step is a no-op.
- Test count: 315 → 375 (+60 = 52 new toast/modal helper tests + 4 fixture round-trip tests for the v1.9.11 baseline + 4 compat-prev-release tests against 1.9.11).

---

## [1.9.10] — 2026-05-22

> **Hotfix: group search visibility in rights settings.** Newly-created YouTrack groups now appear in the multiselect dropdowns of the plugin rights configuration. No schema changes. 303 unit tests pass.

### Fixed

- **Group search visibility** — `loadProjectGroups()` now requests up to 5 000 YouTrack groups from the REST API (previously 200). In instances with many groups, newly created groups could fall past the 200-item cap and never appear in the dropdown.
- **Stale in-memory group list** — multiselect dropdown now triggers a background refresh of `_projectGroups` every time it is opened. Previously the list was fetched only once at widget init; groups created after that were invisible until the user manually reloaded the plugin page.
- **Aggregate group access (hierarchy)** — `userInGroups()` now walks the parent chain of each user group (up to 10 levels). Users in a child group `X.A` now get access when settings saved the parent group `X`. Gracefully degrades if the YouTrack App SDK does not populate `group.parent`.

### Internal

- `SCHEMA_MIGRATIONS`: no-op entry `1.9.9 → 1.9.10` added (frontend-only change, schema unchanged).
- `userInGroups()` now exported for unit tests; 12 new tests covering direct membership, parent-chain traversal, graceful fallback, and circular reference safety.

---

## [1.9.9] — 2026-05-21

> **Ring UI Tier 2 — CSS classes without React.** Applies Ring UI visual language to buttons, inputs, and selects across the entire widget. Ships `ring-subset.css` (69.5 KB raw / 10.4 KB gzip), a tree-shaken subset of `@jetbrains/ring-ui-built`. No schema changes. 295 unit tests pass.

### Added

- **`widgets/main/ring-subset.css`** — tree-shaken Ring UI CSS subset (69.5 KB raw, 10.4 KB gzip). Extracted by `scripts/extract-ring-subset.js` from `@jetbrains/ring-ui-built@~7.0.108`. Includes only button, input, select, checkbox, icon, form, and CSS-variable rules.
- **`widgets/main/src/ring-class-helpers.js`** — pure JS class-composition utilities (`ringButtonClass`, `ringInputClass`, `ringInputTemplate`, `ringSelectButtonClass`, `ringCheckboxClass`, `ringIconClass`, `escapeHtml`). 38 unit tests.
- **`scripts/extract-ring-subset.js`** — idempotent Node tree-shaker script; `npm run build:ring-css` step added to `npm run build`.
- **`applyRingTheme()`** — detects `body.theme-dark` / `data-theme="dark"` / `prefers-color-scheme: dark` and adds `ring-variables_dark-dark` to `<html>` for Ring's dark-mode CSS variables. Watches for dynamic switches via `MutationObserver`.

### Changed

- **All ~60 action buttons** across `index.html` and `legacy-monolith.js` migrated from custom `.btn*` classes to `.ring-button-button` class composition. Variants: primary, secondary/neutral, danger, ghost, iconOnly; heights S/M. Selector classes (`.editor-btn`, `.planning-role-jumpPeople`, `.dta-del-row`, `.del-item-btn`, `.currentRole-del-assignee`, etc.) preserved for JS compatibility.
- **13 form inputs** (`sprintName`, `pickQuery`, settings number fields `s_nkc_*`, `s_rate`, `s_participation`, `s_kpe_*`, cascade link inputs) gain `ring-input-input` class. CSS exclusion selectors (`:not(.ring-input-input)`) added to `.field input` and `.search-row input` rules so Ring controls border/radius/background.
- **8 single-select dropdowns** (`widgetSprintSel`, `planningRoleSel`, `standupRoleSel`, `ganttRoleSel`, `sprintFieldVal`, `versionFieldVal`, `currentRoleNkcSel`, `reassignSelect`) gain `ring-select-button` class. CSS exclusion `:not(.ring-select-button)` added to `.app-select` and `.widget-header__select` rules.
- **Date inputs** (`dateStart`, `dateEnd`) and **tab/level buttons** (`tab-btn`, `planning-level-btn`) left unchanged — custom logic depends on exact class selectors (SC-2, SC-3 from plan).
- **Checkbox/radio** DOM restructure deferred to tier 3 — Ring requires 5-level nested DOM with sibling selectors, incompatible with current markup without React.

### Internal

- `SCHEMA_MIGRATIONS` entry `1.9.7 → 1.9.9` (no-op; frontend-only). Fixtures `1.9.9/` frozen from `1.9.7/`.
- Version bumped to `1.9.9` in 8 points (manifest, package, APP_VERSION, CURRENT_PLUGIN_VERSION, app-version endpoint, zip filename, SCHEMA_MIGRATIONS, fixtures).
- `snapshot-migration.test.js`: 7 → 8 SCHEMA_MIGRATIONS entries. `external-ticket-id.test.js` version assertion updated.

---

## [1.9.7] — 2026-05-21

> **i18n completeness patch.** Completes native translations for all 17 `aria.*` screen-reader keys across 13 languages, and fixes role names showing in Russian for non-RU/EN locales in the settings UI. No schema changes. 249 unit tests pass.

### Fixed

- **Role names in settings UI** showing in Russian for all non-EN locales (de, cs, fr, etc.) — `roleLabel()` now uses `T('role.<key>')` backed by 9 new `role.*` i18n keys in all 15 locale files. Mixed translation style: Analysis/Testing/Platform localized; Dev Back/Front/iOS/Android/FullStack/DB kept as universal tech terms.

### Changed

- **34 sprint-goal and stand-up keys** (`lblSprintGoal`, `cardStandupSettings`, `standupBucket*`, `optGoal*`, etc.) translated from `[v1.9.0]` placeholder to native strings in 13 locales. These keys were introduced in v1.9.0 but never fully translated.
- **17 `aria.*` i18n keys** translated from `[v1.9.6]` placeholder to native strings in 13 locales: cs, de, es, fr, hu, it, ja, ko, nl, pl, pt, tr, zh. EN and RU were already complete since v1.9.6.
- **`_meta.source`** in 13 locale files — removed AI-tool reference, replaced with neutral baseline attribution.

### Internal

- `SCHEMA_MIGRATIONS` entry `1.9.6 → 1.9.7` (no-op; i18n-only change). Fixtures `1.9.7/` frozen from `1.9.6/`.
- Version bumped to `1.9.7` in 6 points.
- `snapshot-migration.test.js`: 6 → 7 SCHEMA_MIGRATIONS entries. `external-ticket-id.test.js` version assertion updated.

---

## [1.9.6] — 2026-05-21

> **Ring UI tier 1 — UI polish + accessibility.** Replaces all emoji across toolbar/tabs/buttons with JetBrains SVG icons, adds unified focus-ring system, z-index scale, WCAG AA contrast fix, and 17 `aria.*` label keys. No backend or schema changes. 241 unit tests pass.

### Added

- **JetBrains SVG icon system** — 12 icons from `@jetbrains/icons@5.22.0` (Apache-2.0) + custom `loader.svg`. Build-time generation via `scripts/build-icons.js` → `icons.generated.js`. `icon()` helper returns `<span class="ssp-icon">` with inline SVG.
- **`NOTICE.md`** — Apache-2.0 third-party attribution for `@jetbrains/icons`.
- **CSS design tokens**: `--focus-ring`, `--focus-ring-offset`, `--z-sticky/dropdown/popover/dialog/overlay/toast` in `:root`.
- **17 `aria.*` i18n keys** — EN+RU full; 13 other locales get `[v1.9.6]` placeholder (full translations in v1.9.7 patch).
- **Loader spinner** — `loader.svg` + `.ssp-loader` CSS + `withLoader()` async helper; shown on reload/save buttons and initial mount (>500ms).
- **`SCHEMA_MIGRATIONS` entry** `1.9.4 → 1.9.6` (no-op; UI-only change). Fixtures `1.9.4/` and `1.9.6/` frozen.

### Changed

- **All emoji replaced** with JetBrains SVG icons: toolbar (🧹⚙), tabs (📋📈🕑), level-buttons (👥👤🗣), action-buttons (✔🔄➕🗑✕). Save buttons (💾) become text-only per Ring pattern.
- **`--muted` fallback** `#6e7682` → `#4a5260` (WCAG AA contrast improvement on white).
- **All hardcoded `z-index` numbers** replaced with `var(--z-*)` tokens (8 selectors).
- **10 interactive elements** gain `:focus-visible { box-shadow: var(--focus-ring); }` (WCAG 2.4.7).
- **`applyI18N()`** preserves `.ssp-icon` children on language switch.
- **`npm run build`** runs `build:icons` pre-step before esbuild.

### Internal

- Version bumped to `1.9.6` in 6 points (`1.9.5` reserved for marketplace hotfix if needed).
- `snapshot-migration.test.js`: 5 → 6 SCHEMA_MIGRATIONS entries. `external-ticket-id.test.js` version assertion updated.

---

## [1.9.4] — 2026-05-20

> **Visual refresh** — new app icon. Replaces the previous logo with a Gantt-cascade mark in light + dark variants. Pure asset update — no code, schema, or behaviour changes.

### Changed

- **App icon** (`app-logo.svg` + `app-logo-dark.svg`) — redesigned as a Gantt-cascade mark. Light variant uses ivory `#F2F0EA` background with navy `#1B2A4E` bars and an accent orange `#FF6A3D` bar; dark variant uses deep-blue `#0F1320` background with off-white `#E5E7F2` bars and `#FF7A50` accent. SVG-only, 64×64 viewBox, accessible `<title>` element preserved.
- **Widget header logo** — the `SSP` text plate in the main widget header and in the Settings overlay header is replaced with the same inline Gantt-cascade SVG (light + dark variants, switched in sync with `body.theme-dark` / `[data-theme="dark"]` / system `prefers-color-scheme`).

### Internal

- Bumped version in 7 places (manifest.json, package.json `version` + `zip` script, backend-project.js `CURRENT_PLUGIN_VERSION` + `app-version` endpoint literal, widgets/main/src/legacy-monolith.js `APP_VERSION`).
- Added no-op `SCHEMA_MIGRATIONS` entry `1.9.3 → 1.9.4` (icon-only swap, schema unchanged).

---

## [1.9.3] — 2026-05-20

> **Hotfix — two cross-role contamination bugs** carried since v1.6.x. Diagnosed via parallel-session comparison with the proprietary version's v7.3.1/v7.3.2 fix releases. Both bugs were silent in the active widget (per-role badge fix from v1.8.1 masked one of them) but visible downstream — corrupted snapshots reached History view, Excel export, and «Open for editing» workflows.

### Fixed

- **BUG-О.1 — Per-role status contamination in `saveRoleHistorySnapshot`.** Previously every snapshot written by `saveRoleHistorySnapshot(rk)` got `status: _sprint.status || STATUS.PLANNING`. After `doValidateRole(rkA)` set the global `_sprint.status = CONFIRMED`, any subsequent save of another role rkB (refresh, working-copy commit, manual «Save parameters») wrote a CONFIRMED snapshot to history for rkB — although rkB was never validated. The v1.8.1 `renderRoleStatusBadge` fix made this invisible in the active planning view (badge read per-role from `_history` directly), but the underlying snapshot was poisoned and **History spoiler + Excel export still showed the wrong status**. Cherry-picked from proprietary v7.3.1 «Этап О.1»: added a `wasValidated` parameter to `saveRoleHistorySnapshot` (only the `doValidateRole` call site passes `true`); status is now resolved per-role from the existing `_history` snapshot (preserve) or `PLANNING` (new snapshot) for every other call site. No architectural deep-refactor required.

- **BUG-О.2/П.2 — Stale `_roleItems[otherRk]` on «Open for editing» from History.** Previously `resumeWorkingDraft(key, idx)` loaded only `_roleItems[rk]` for the role being edited; for all other roles `_roleItems[otherRk]` remained from the previous context (different sprint or different role). Symptom: when editing sprint A role X from History after working on sprint B, the role accordions for Y and Z in Planning showed compositions from sprint B (not A). Cherry-picked from proprietary v7.3.2 «Этап П.2»: after loading the active role from the working draft, `resumeWorkingDraft` now iterates `ALL_ROLES` and loads each `_roleItems[otherRk]` from its corresponding `_history` snapshot of the same `sprintId` (or empty array if no snapshot exists for that role).

### Backward compatibility

- **No schema changes, no whitelist changes, no migration impact** — both fixes are pure runtime corrections to in-memory state assembly. A no-op `SCHEMA_MIGRATIONS` entry `{from:'1.9.0', to:'1.9.3'}` is added for audit-trail in `migrationLog`.
- **All v1.9.2 storage shapes remain valid** (**225 unit tests pass**, +4 fixture-tests for the new `1.9.3/` baseline).
- **Self-healing for previously contaminated history records**: snapshots that were incorrectly written with CONFIRMED in past sessions will be rewritten with the correct per-role status on the next save of that role (preserve-from-existing branch evaluates `_history` at that moment).

### Other

- New `tests/fixtures/snapshots/1.9.3/` baseline (byte-identical to `1.9.0/` except `pluginVersion: "1.9.3"`).
- `tests/unit/snapshot-migration.test.js` updated: `SCHEMA_MIGRATIONS.length === 4`.
- `tests/unit/external-ticket-id.test.js` updated: `CURRENT_PLUGIN_VERSION is 1.9.3`.
- 6-point version bump (manifest, package.json, APP\_VERSION, CURRENT\_PLUGIN\_VERSION, `app-version` endpoint, zip filename).
- Bundle size: 550.9 KB (+1.1 KB for the per-role logic).

---

## [1.9.2] — 2026-05-19

> **Hotfix — viewport scroll for outcome dialog.** In some YouTrack iframe layouts the outcome confirmation dialog (introduced in v1.9.1) opened correctly in DOM but landed outside the visible parent viewport, so users perceived «nothing happened» when finishing a sprint. The dialog is now opened via the shared `_showOverlay()` helper used by every other modal in the plugin — same iframe-scroll handling, same z-index stacking.

### Fixed
- **`openConfirmGoalDialog()` now scrolls into the parent viewport.** Previously the function called `overlay.classList.remove('hidden')` directly. The shared `_showOverlay(idOrEl)` helper additionally resets inline-positioning leftovers from D102 v6.3.0 and calls `_scrollFrameIntoView()` (twice — once immediately, once after 80 ms to handle smooth-scroll race conditions). Without that scroll the dialog could mount below the iframe fold, indistinguishable from «no dialog appeared at all».
- Wrapped in `try { _showOverlay(overlay); } catch(_) { overlay.classList.remove('hidden'); }` — the catch branch keeps the v1.9.1 behaviour as a safety fallback in case the helper is unavailable for any reason.

### Backward compatibility
- No schema change, no whitelist change, no migration — pure runtime fix.
- All v1.9.1 storage shapes remain valid (217 unit tests pass; `CURRENT_PLUGIN_VERSION` assertion bumped to `1.9.2`).

### Other
- 6-point version bump (manifest, package.json, APP\_VERSION, CURRENT\_PLUGIN\_VERSION, `app-version` endpoint, zip filename).

---

## [1.9.1] — 2026-05-19

> **Bugfix: sprint outcome dialog moved to «Finish sprint».**

### Fixed

- **Sprint outcome dialog timing** — the *Confirm sprint outcome* modal (goal outcome + retro note) was incorrectly triggered at role **validation**, which could fire up to 9 times (once per role). It now appears exactly once, at **«Finish sprint»** in the History view — the semantically correct moment to assess whether the sprint goal was achieved.
- **Cancel behaviour** — cancelling the outcome dialog now leaves the sprint in its pre-finish state (no status change). Previously (in v1.9.0) a cancel during validate would still write a CONFIRMED snapshot without goal fields.
- **Re-finish pre-selection** — if a sprint record already has a `goalOutcome` from a previous finish attempt, the dialog pre-selects it and enables the Confirm button immediately.

### Changed

- `openConfirmGoalDialog` now accepts `(sprintGoalText, existingOutcome)` instead of reading from `_sprint`. Goal text is sourced from the frozen `rec.sprintGoal` on the history record.

### Backward compatibility

- No schema changes. All 217 unit tests pass.

---

## [1.9.0] — 2026-05-19

> **Etap Г — Sprint goals + Stand-up assist.** Two additive features closing Scrum-ceremonies (daily standup + sprint review). No breaking changes; all new fields are optional. 217 unit tests pass.

### Added

- **Sprint goal field (`_sprint.sprintGoal`, ≤500 chars)** — a shared optional text field in the *Sprint Intro* card (Planning tab), below the Sprint / Version optional selects and above the *Save sprint parameters* button. The goal is visible to all roles. On save, soft-warn toast fires 400 ms later if the field is left empty. The `#sprintGoal` textarea is populated automatically when switching between sprints.
- **Sprint goal frozen in history snapshots** — when a role snapshot is saved (validate/confirm), `_sprint.sprintGoal` is copied into `_history[i].sprintGoal` (frozen at that moment, independent of subsequent edits to the live sprint).
- **Outcome + retro dialog at confirm** — before `saveRoleHistorySnapshot` writes the snapshot, a modal dialog (*Confirm sprint outcome*) is shown:
  - Read-only display of the current sprint goal (or a «goal was not set» notice if empty).
  - Radio group: ✅ Achieved / ⚖ Partial / ❌ Missed (required — Confirm button is disabled until one is selected).
  - Optional retrospective note textarea (≤1000 chars).
  - Cancel reverts `_sprint.status` back to PLANNING.
  - `goalOutcome` and `goalRetroNote` are stored on `_history[i]`.
- **History view — goal + outcome in collapsed header** — the spoiler header now shows the outcome badge and a truncated goal (≤80 chars, full text in tooltip) alongside sprint name, role, and period. No need to expand the spoiler to see delivery status.
- **History view — goal card in expanded body** — full goal text + outcome label + retro note rendered in a card above the confirmed-by line.
- **🗣 Stand-up sub-tab** in Planning — new third level next to *Roles* and *Distribution by assignees*. Classifies the active role's sprint tasks into three buckets based on the last refreshed snapshot:
  - ✅ **Done** — state ∈ `settings.standupDoneStates` (or last 2 positions of State Rollup order if not configured).
  - 🔄 **In flight** — not Done, fact > 0 or `inclusionStatus = IN_PROGRESS`.
  - 📋 **Not started** — not Done, fact = 0.
  - Sprint goal banner above buckets (or a soft hint to add one if missing).
  - Role switcher dropdown; 🔄 Refresh button triggers existing `/refresh-assignees` endpoint.
  - Empty states: no sprint selected; role has no tasks.
  - Hint if Done states are not configured.
- **Settings → 🗣 Stand-up assist section** — new settings card with a multi-select `#standupDoneStatesList` populated from the same project state bundle as State Rollup. Selection is saved as `settings.standupDoneStates` (array of state name strings). If empty, the Stand-up view automatically falls back to the last 2 positions of `stateRollupOrder`.
- **Backend: new optional fields accepted** — `validateSprintForWrite/Read` accepts `sprintGoal`; `_validateHistoryRecord` / `diagnoseHistoryWrite` accept `sprintGoal`, `goalOutcome` (enum `achieved|partial|missed`), `goalRetroNote`; `validateSettings` accepts `standupDoneStates` (array ≤50 unique strings).
- **`SCHEMA_MIGRATIONS[2]`** — `{from:'1.8.0', to:'1.9.0', migrate:noop}` covering all additive fields (sprint + history + settings).
- **i18n** — 35 new keys (19 sprint-goals + 16 stand-up) in all 15 locales. EN + RU: full translations. 13 other locales: `[v1.9.0]`-prefixed EN placeholders (full translations in v1.9.1).

### Backward compatibility

- **No breaking changes.** All new fields are optional. Sprint snapshots created in v1.8.x open without errors — `sprintGoal` is `undefined`, goal card is not rendered, outcome dialog shows «goal was not set» notice and still accepts outcome selection.
- All v1.8.5 fixtures pass under v1.9.0 validators (**217 unit tests**, +4 fixture-tests for the 1.9.0 baseline).
- Existing `standupDoneStates = []` (or missing) → Stand-up gracefully falls back to `stateRollupOrder`-based Done classification.

### Other

- New `tests/fixtures/snapshots/1.9.0/` baseline: `sprint-baseline.json` with `sprintGoal` set; `history.json` with `goalOutcome: "achieved"` + `goalRetroNote` on first record.
- `tests/unit/snapshot-migration.test.js` updated: `SCHEMA_MIGRATIONS.length === 3`.
- `tests/unit/external-ticket-id.test.js` updated: `CURRENT_PLUGIN_VERSION is 1.9.0`.
- 6-point version bump (manifest, package.json, APP\_VERSION, CURRENT\_PLUGIN\_VERSION, app-version endpoint, zip filename).
- Bundle size: `widgets/main/main.js` grew from 526.6 KB → 549.6 KB (+23 KB for goal dialog + stand-up view).

---

## [1.8.5] — 2026-05-18

> **UX polish — two changes bundled.** (1) New dedicated *Save sprint parameters* button in the *Sprint intro* card on the Planning tab. (2) Click-anchored toast positioning — toasts now appear ~280px above the last user click, on the opposite X-side from the click, guaranteeing visibility in the parent viewport and preventing overlap with the just-clicked button. Both changes are visible UX surface only, no schema impact.

### Added
- **`#saveSprintIntroBtn` in `card-sprint-intro` (D130)** — new editor-only button rendered directly under the optional Sprint / Version block. The shared fields (sprint name, start/end dates, optional Sprint / Version select) live at the top of the page, but until now the only way to save them was via the per-role *Save parameters* button buried inside an expanded role accordion — a violation of the principle of least surprise. The new button is an additional explicit entry point; per-role buttons continue to work as before (they still save the shared fields together with the role's resource). On click: validates `sprintName` + `dateStart` + `dateEnd` with the same inline-error helpers introduced in v1.8.2 (`_showFieldError` / `_clearFieldErrors` on `#errName` / `#errDate` + duplicate toast as backup signal), then writes `_sprint.name` / `dateStart` / `dateEnd` / `sprintFieldVal` / `versionFieldVal` and POSTs the new sprint via `apiPost('sprint-data', { sprint: _sprint })`. On success: refreshes the widget header (sprint selector label + status badge) and surfaces the standard `toastSprintSaved` notification.
- **New i18n key `btnSaveSprintIntro`** in all 15 supported locales (cs, de, en, es, fr, hu, it, ja, ko, nl, pl, pt, ru, tr, zh).

### Changed
- **Click-anchored toast positioning (D131)** — replaces the previous `position: fixed; bottom: 80px; right: 24px` CSS-only approach (v1.7.1 simplification) with a click-anchored runtime positioning subsystem. The YouTrack widget runs in a sandboxed iframe where `position: fixed` pins to the iframe frame rather than the parent viewport, and `window.parent.document` is cross-origin blocked. The new subsystem captures `mousedown` coordinates via a document-level capture listener (`_lastClickX` / `_lastClickY`); the `toast()` function then positions the toast ~280px above the click, on the opposite X-side, guaranteeing visibility in the parent viewport without overlapping the just-clicked button. Because the iframe has no own scroll (stretched to content), iframe-doc click coordinates equal visible parent-viewport coordinates. A best-effort attempt is made first to attach the toast to `window.top.document` or `window.parent.document` (in case YouTrack ever removes sandboxing); on cross-origin failure the function falls back to local iframe positioning. Message text is normalised: `\n+` → ` · ` for single-line presentation; CSS `white-space: nowrap` + `text-overflow: ellipsis` prevents the «square block» rendering that long messages caused in earlier iterations. `pointer-events: none` remains enforced on `.toast` and `.toast.show` — clicks always pass through to the underlying button. **Origin**: ported from the proprietary fork (sessions 7.2.5 → 7.2.8, fifth and final iteration after four failed approaches: CSS bottom-fixed, frame-element bottom-pin, frame-element top-pin with line-clamp, parent-document host).
- **No change to existing handlers.** `doSaveRoleHeader(rk)` (`#saveHeaderBtn_<rk>` inside per-role accordions) keeps its current behaviour: it still saves both the shared sprint fields and the role-specific resource. The new save button is purely additive. No `toast()` callsite was touched — only the function body was rewritten; all 100+ callsites continue to work transparently.

### Backward compatibility
- **No breaking changes.** No schema fields touched, no whitelist changes, no `SCHEMA_MIGRATIONS` entry.
- All v1.8.4 fixtures still pass under v1.8.5 validators (**209 unit tests**, +4 fixture-tests for the 1.8.5 baseline).
- Toast subsystem is contained in `widgets/main/src/legacy-monolith.js` only; no backend or storage impact.

### Other
- New `tests/fixtures/snapshots/1.8.5/` baseline (byte-identical to `1.8.4/` except `pluginVersion: "1.8.5"`).
- Version bump across the standard 6 points + zip filename.
- Bundle size: `widgets/main/main.js` grew from 522.1 KB → 526.6 KB (+4.5 KB for the toast positioning subsystem).

---

## [1.8.4] — 2026-05-18

> **Marketplace approval hotfix #2.** Response to JB Marketplace reviewer follow-up (Stanislav Dubin, 2026-05-18, 16:46 GMT+2): saving the Group value in Project Settings → Apps → Smart Sprint Planner threw a runtime error «no schema with key or ref `https://json-schema.org/draft-07/schema#`» because the AJV validator used by the YouTrack project app configuration UI does not resolve HTTPS schema references (known AJV limitation — see [Stack Overflow #69133771](https://stackoverflow.com/questions/69133771/ajv-no-schema-with-key-or-ref-https-json-schema-org-draft-07-schema)). HTTP is the documented canonical identifier for JSON Schema Draft 7 anchor and is what AJV expects.

### Fixed
- **`settings.json:$schema`** — URL changed from `https://json-schema.org/draft-07/schema#` to `http://json-schema.org/draft-07/schema#`. One-character change (drop the `s`). Resolves the AJV validation error on Group value save introduced by the v1.8.3 schema migration to `type: "object"` + `x-entity: "UserGroup"`.

### Changed
- **Description text polish in `settings.json`** (accumulated from earlier session, shipped together with the `$schema` fix). No logic change. The top-level `description` plus per-property `description` for `settingsManagerGroup` and `enableDebugLog` are rewritten to drop internal jargon («chicken-and-egg vulnerability») in favour of clearer admin-facing language. Visible to project administrators in Project Settings → Apps → Smart Sprint Planner.

### Backward compatibility
- **No breaking changes.** Schema URL is a parser hint — it never appeared in any persisted data, so existing installations are unaffected.
- **No schema migration** in `SCHEMA_MIGRATIONS` registry (`settings.json` lives in app-settings, not in plugin storage namespace `ssp_*`).
- All v1.8.3 fixtures still pass under v1.8.4 validators (**201 unit tests**, +8 fixture-tests for the 1.8.4 baseline).

### Other
- New `tests/fixtures/snapshots/1.8.4/` baseline (byte-identical to `1.8.3/` except `pluginVersion: "1.8.4"`).
- Version bump across the standard 6 points + zip filename.

---

## [1.8.3] — 2026-05-18

> **Marketplace approval hotfix.** Response to JB Marketplace reviewer feedback (Stanislav Dubin, 2026-05-18): «Plugin settings manager group» should use the native YouTrack UserGroup picker rather than a plain text input. v1.8.3 ships the schema change + a backend resolver that transparently handles both the new picker output (`{id, name}` object) and the legacy text-input value (string with a manually-typed group name).

### Changed
- **`settings.json:settingsManagerGroup`** — `type` changed from `string` to `object` with `x-entity: "UserGroup"`. In Project Settings → Apps → Smart Sprint Planner this setting now opens the standard YouTrack group picker (search-as-you-type, group avatar, validated reference) instead of a free-text input.

### Fixed (compat)
- **`isSettingsManagerConfigured(ctx)`** and **`isSettingsManager(ctx)`** in `backend-project.js` now accept both shapes of the value:
  - **New shape** (post-upgrade picker output): `{ id: "...", name: "..." }` object. Resolver uses `id` and `name` for `userInGroups()` membership check.
  - **Legacy shape** (existing installations where the setting was filled before v1.8.3): plain string with the group name. Resolver continues to treat it as the group name for `userInGroups()`.
- **`GET /check-settings-manager` endpoint** updated to extract `groupName` from either shape so the client-side «who can manage settings» status banner keeps working without re-configuration.

### Backward compatibility
- **No re-configuration required** for existing installations. The legacy string value remains valid until the project administrator opens Project Settings → Apps and saves with the new picker (at which point YouTrack writes the new object shape).
- **No schema migration required** — `settings.json` schema lives in app-settings (`ctx.settings`), not in plugin storage (`ssp_*` namespace). `SCHEMA_MIGRATIONS` registry unchanged.
- All v1.8.2 fixtures still pass under v1.8.3 validators (193 unit tests).

### Other
- New `tests/fixtures/snapshots/1.8.3/` baseline (byte-identical to `1.8.2/` except `pluginVersion: "1.8.3"`).
- Version bump across the standard 6 points + zip filename.

---

## [1.8.2] — 2026-05-17

> **GitHub publication target.** This release consolidates v1.8.0 + v1.8.1 + v1.8.2 — the first two were local-only iterations during the UX polish cycle and never shipped to GitHub. Per project release-notes policy, all changes since the last published release (v1.7.1) are merged into the v1.8.2 release notes. Intermediate `## [1.8.0]` and `## [1.8.1]` sections below are preserved for development audit but are not user-visible in the GitHub Release UI.

### Added — External ticket ID (originally v1.8.0)
- **Settings UI — new optional «External ticket ID» dropdown** in «Other fields» section. Selects a YouTrack `string`-type custom field that stores ticket IDs in an external system (Service Desk, Jira, 1C, SAP, …).
- **Read-only «External ID» column** in three task tables: role composition, assignee view («People»), and history snapshots. **Column position: 2nd, right after the issue ID link** (UX-feedback applied in v1.8.1).
- **URL detection:** values matching `https?://…` render as clickable `<a>` (opens in new tab); plain strings render truncated to `12em` with the full value in a hover tooltip.
- **Auto-populate** at pick / refresh — value is read from YouTrack when adding tasks or refreshing estimates. Frozen in confirmed history snapshots (historical accuracy preserved).
- **Sort by External ID** — added to the sort cycle (`off → xpriority → priority → id → system → externalTicketId`), lexicographic; empty values sort last.
- **First live item-level schema migration** — `ALLOWED_ITEM_KEYS` extended with `externalTicketId` (optional, ≤ 1000 chars, length increased from initial 200 after real-world URLs exceeded the limit). `SCHEMA_MIGRATIONS` registry contains v1.7.0 → v1.8.0 step (no-op, additive).
- **i18n × 15 locales** for the External ID feature (4 keys: `fldExternalTicketId`, `fldExternalTicketIdOptional`, `hintExternalTicketId`, `thExternalTicketId`).

### Added — UX architecture (v1.8.1)
- **Per-role status badges in the widget header.** Replaces the aggregated single-badge (which showed `min(STATUS_RANK)` of all roles and displayed «Draft» when at least one role was not yet validated, regardless of others). Now each active role shows its own status with role name as prefix.
- **Per-role status badge on role cards** — reads from `_history[<sprintId>_<roleKey>].status` instead of the global `_sprint.status`. Validating one role no longer flips the status indicator on the others.
- **Settings → «Other fields» visually grouped** into «Required» (Priority, State — marked with red `*`) and «Optional» (XPriority, System, External ticket ID, Sprint, Version — each with muted `(optional)` suffix). 3 new i18n keys × 15 locales = 45 strings (`cardOtherFieldsRequired`, `cardOtherFieldsOptional`, `fldOptionalSuffix`).
- **Optional columns hide when not configured** — XPriority and System columns now disappear from all 3 tables (role composition, assignee view, history) when the corresponding YT field mapping is empty. Symmetric with External ID behavior.
- **Soft warning at Settings save** when Required fields (Priority/State) are not set — non-blocking warn-toast 400ms after the success-toast, listing which fields are recommended. 1 new i18n key × 15 locales.
- **History spoiler now shows sprint name + role in the collapsed view** — previously these were only in the expanded body, making it hard to identify which sprint/role a row referred to. 2 new i18n keys × 15 locales (`histSpoilerName`, `histSpoilerRole`).
- **«Jump to People» from a role card carries the role context** — clicking the button on Analytics card opens People tab with Analytics pre-selected, regardless of which role was last viewed there. Previously fell back to `safeLs.lastActiveRole` (stale).
- **Role selector on the People tab is visually elevated** — accent border-left, 👥 icon, uppercase bold label, larger select with primary-color border and focus-ring. The role-being-edited is no longer easy to miss.
- **Status badges in widget header wrap correctly** with 2-9 active roles — explicit `flex: 0 0 100%` + `flex-wrap: wrap` + compact font (10px, `padding 2px 6px`) ensures the badge list moves to its own line under the sprint selector and reflows across rows without horizontal scroll, even on narrow viewports.
- **Inline-error highlight at sprint param save** (v1.8.2) — name and date fields gate. When validation fails, the offending field gets a red border + `field-err` text under it + `scrollIntoView({behavior:'smooth', block:'center'})`. Toast remains as duplicate signal but is no longer the only feedback — relevant when the YT-iframe scroll position pushes the fixed-position toast outside the main window viewport.

### Fixed
- **`saveRoleHistorySnapshot` did not copy `externalTicketId`** into `snap.items` — values were live on items but never reached history. Root of the v1.8.0 acceptance failure («тикет ID не записался в историю»). Field is now explicitly copied when non-empty.
- **`invalid_history_structure` on auto-snapshot** after sprint validation — caused by a stale `revisions[i].level = 'NONE'` entry accumulated in `_history` from earlier working-copy commits without significant changes. `'NONE'` was returned by `computeRequiredRevalidationLevel` but missing from backend `ALLOWED_REVISION_LEVELS` whitelist. Fixed both sides: backend whitelist now accepts `'NONE'` (backward-compat for existing poisoned data); frontend `_commitWorkingCopy` skips writing a revision entry when `level === 'NONE'` (forward fix — no more accumulation).
- **`renderWidgetHeader` not called after working-copy commit** — header badge stayed on old status after editing a historical sprint via «Open for editing» → validate. Added explicit `renderWidgetHeader()` call in `_commitWorkingCopy.then(...)`.
- **«+ New Sprint» button — current-sprint selector did not update** to the freshly created draft. Fixed by synchronizing `_currentSprintId = _sprint.sprintId` in `doNewSprint` before the API roundtrip, and persisting to `ui` draft.
- **Saving sprint params on a new sprint** — header selector did not refresh until tab switch. Added `_currentSprintId` sync + `renderWidgetHeader()` to `doSaveRoleHeader` success branch.
- **External ID length limit was too strict** — initial 200-char limit rejected real-world ticket URLs (e.g., `https://tracker.example.com/t#id104909392` and longer). Now uses the standard `strFields` limit of 1000 chars.
- **`SCHEMA_MIGRATIONS` migration entry for v1.8.0** — added explicit `{from:'1.7.0', to:'1.8.0', migrate:noop}` for audit-trail in `migrationLog` of each migrated snapshot. First item-level migration in the registry (previously only settings-level).
- **History POST error diagnostics** — when `validateHistoryForWrite` rejects a payload, the response now includes the specific failing field/index (e.g., `invalid_history_structure: revisions[0].level_invalid:NONE (record[5])`) instead of opaque `invalid_history_structure`. Made root-cause hunt for the `NONE` bug possible.

### Changed
- **Hint text under External ticket ID dropdown removed** — the label + `(optional)` suffix is self-explanatory.
- **Sort cycle extended** from 5 to 6 positions to include `externalTicketId`.
- **Cache-buster version bumps** (v1.8.1, v1.8.2) — multiple in-place re-installs of v1.8.0 caused YouTrack to keep cached `widgets/main/main.js` and `widgets/main/index.html`. Each version bump forces a fresh asset hash.
- **`validateItem` / `ALLOWED_ITEM_KEYS`** added to the CommonJS test-export shim — required by new unit tests.
- **`snapshot-migration.test.js`** updated: `SCHEMA_MIGRATIONS.length === 2` (was 1).

### Security
- All `externalTicketId` values pass through `esc()` on every render path. URL values pass through `safeUrl()` before being placed in `href` — same treatment as `item.url`.
- Field is read-only on the client. Population only through the existing pick / refresh API path. Whitelist guards prevent posting arbitrary unknown keys.

### Backward compatibility
- **No breaking schema changes.** `externalTicketId` is optional on every item; sprints / history / working-drafts written by v1.6.x or v1.7.x are read by v1.8.2 unchanged.
- **`level='NONE'` revisions** existing from pre-fix working-copy commits are now accepted by the backend whitelist. They stop accumulating on new commits but old ones are tolerated and pass POST validation.
- **Rollback** (soft, per-project): clear the «External ticket ID» dropdown in Settings → save. Column disappears; stored values remain in snapshots. **Rollback** (hard, reinstall v1.7.1 zip): v1.7.1 backend silently ignores `externalTicketId` keys via tolerant ForRead (`WARN_UNKNOWN_KEY` in `migrationLog`).

### Test coverage
- **185 unit tests** (was 169 at v1.7.1).
- **New test file** `tests/unit/external-ticket-id.test.js` — 8 cases (whitelist presence, boundary, type rejection, URL acceptance, backward compat).
- **Accumulating fixtures**: `tests/fixtures/snapshots/1.4.2/`, `1.6.0/`, `1.6.3/`, `1.7.0/`, `1.7.1/`, `1.8.0/`, `1.8.1/`, `1.8.2/` — every previous release is regression-validated by `compat-prev-release.test.js` against current validators.

---

## [1.8.1] — 2026-05-16

### Changed
- **Settings → «Other fields» regrouped** into two visual blocks:
  - **Required:** `Priority` and `State` (marked with red `*`)
  - **Optional:** `XPriority`, `System`, `External ticket ID`, `Sprint field`, `Version` — each with a muted `(optional)` suffix
- **External ID column moved to 2nd position** in all three task tables (Role composition, Assignee view, History) — right after the issue ID link.
- **Removed hint text** under the External ticket ID dropdown — the label + optional suffix is self-explanatory.
- **3 new i18n keys × 15 locales = 45 strings:** `cardOtherFieldsRequired`, `cardOtherFieldsOptional`, `fldOptionalSuffix` (unified optional marker across XPriority / System / External ticket ID / Sprint / Version).

### Fixed
- **YT-app static-asset cache.** Version bump 1.8.0 → 1.8.1 forces YouTrack to refresh cached `widgets/main/main.js` and `widgets/main/index.html` after multiple in-place v1.8.0 reinstalls. No data migration involved — schema unchanged.

### Backward compatibility
- **No schema changes.** v1.8.0 snapshots are read by v1.8.1 transparently (same shape, same whitelists). `SCHEMA_MIGRATIONS` unchanged (still 2 entries: v1.6.0 → v1.7.0, v1.7.0 → v1.8.0).
- New `tests/fixtures/snapshots/1.8.1/` is byte-identical to `1.8.0/` except for `pluginVersion: "1.8.1"`.

---

## [1.8.0] — 2026-05-16

### Added
- **Settings UI — External ticket ID dropdown.** New optional field in «Other fields» settings section. Selects a YouTrack `string`-type custom field that stores ticket IDs in an external system (Service Desk, Jira, 1C, SAP, etc.). Supports any string field — plain IDs (e.g. `EXT-1234`) and clickable URLs alike. Available in all 15 supported interface languages.
- **Read-only «External ID» column in three tables:** role composition, assignee view («Люди»), and history snapshots. Column is hidden when the setting is not configured — zero visual impact for teams that don't use it. URL values (matching `^https?://`) render as clickable `<a>` links opening in a new tab; plain strings render truncated to `12em` with the full value in a tooltip.
- **Auto-populate at pick/refresh.** External ticket ID is read from YouTrack when adding tasks («Подобрать задачи») or refreshing estimates. Value is frozen in confirmed history snapshots — historical accuracy is preserved even if the YT field changes later.
- **Sort by External ID.** `externalTicketId` added to the sort cycle (`off → xpriority → priority → id → system → externalTicketId`). Lexicographic order; undefined/empty values sort last.
- **First item-level schema migration.** `ALLOWED_ITEM_KEYS` extended with `externalTicketId` (optional, ≤ 200 chars). A corresponding `SCHEMA_MIGRATIONS` entry (`from: '1.7.0', to: '1.8.0'`, no-op) proves the pipeline end-to-end — previously only settings-level migrations had been exercised (v1.7.0 stateRollup).
- **4 new i18n keys × 15 locales = 60 translation strings.** Full translations in all locales; no EN placeholders.
- **Backward-compat fixture for v1.7.1** frozen in `tests/fixtures/snapshots/1.7.1/`. New v1.8.0 fixture contains a sample history item with `externalTicketId: "EXT-1234"`. All prior fixtures (v1.4.2 through v1.7.1) pass `validateItem`/`validateHistory` without `invalid_*_structure`.
- **8 new unit tests** (`tests/unit/external-ticket-id.test.js`): whitelist presence, valid values, boundary (200 chars), rejection of oversized and non-string values, backward compat (undefined field), version bump guard.

### Changed
- **Sort cycle extended** from 5 to 6 positions to include `externalTicketId`.
- **`validateItem` and `ALLOWED_ITEM_KEYS` added to CommonJS test-export shim** — required to support the new unit tests; previously these were only accessible internally.
- **`snapshot-migration.test.js`** updated: the hardcoded `SCHEMA_MIGRATIONS.length === 1` guard now expects 2 entries and validates both the v1.7.0 and v1.8.0 steps.

### Security
- `externalTicketId` values are passed through `esc()` on every render path. URL values are passed through `safeUrl()` before being placed in `href` — same treatment as existing `item.url`.
- Field is read-only in the plugin; population only through the existing pick/refresh path via the YT API. Whitelist guards prevent posting arbitrary unknown keys.

### Backward compatibility
- **No breaking changes.** `externalTicketId` is optional on every item; any sprint, history, or working-draft written by v1.6.x or v1.7.x is read by v1.8.0 without error.
- **Rollback.** Soft rollback: clear the «External ticket ID» dropdown in Settings → save. Column disappears; stored values remain in existing snapshots. Hard rollback: reinstall v1.7.1 zip — the v1.7.1 backend tolerates unknown `externalTicketId` keys via `validateItemForRead` (`WARN_UNKNOWN_KEY` in `migrationLog`).

---

## [1.7.1] — 2026-05-15

### Added (Translations)
- **Full translations for state rollup in 13 locales** (`cs`, `de`, `es`, `fr`, `hu`, `it`, `ja`, `ko`, `nl`, `pl`, `pt`, `tr`, `zh`). Previously v1.7.0 shipped these as EN placeholders with `TODO(i18n v1.7.x): translate` markers — surfaced during smoke test when a Czech-language user saw English workflow messages despite `pickLocale` correctly returning `'cs'`. Now state rollup is on parity with cascade/dta/forbid (which already had full translations). Coverage: 4 workflow message keys × 13 locales (52 strings) + 28 UI labels × 13 locales (364 strings) = **416 new translations**.
- **Strict i18n placeholder guard test** (`workflow-i18n.test.js`). Catches accidental `dict[key] === en[key]` placeholder regressions on any future workflow-message addition. Per-workflow allowlist for legitimate non-translatable values (`cascadeFieldChange` template, `unitH`/`unitM` symbols).

### Fixed
- **Pre-existing critical: KPE whitelist rejected canonical English grade keys.** Frontend storage layer since v1.4.1 D128 writes English KPE grade keys (`Intern` / `Junior` / `Middle` / `Senior`), but backend `ALLOWED_KPE_KEYS` whitelist contained only legacy Russian keys (`Стажёр` / `Джун` / `Мидл` / `Синьор`). Any settings POST returned `invalid_settings_structure` for projects re-initialized after v1.4.1 — including all clean test installs. Surfaced during v1.7.0 acceptance smoke test in clean YT instance. Whitelist extended to accept both alphabets. Backward compatible. Adds 6 unit tests including direct repro of the failing settings payload.
- **Sticky save button regression.** «Save settings» button no longer slides off-screen when scrolling long settings forms. Replaced fragile `position: sticky bottom: 0` (broken under various layout conditions since v1.3.1) with reliable `position: fixed` + inner-wrapper for max-width centering.
- **Toast UX overlap with interactive elements.** Toasts moved from `top-right` to `bottom-right`, positioned 80 px above the fixed save row, and `pointer-events: none` is now permanent (even during `.show`) — clicks always pass through to underlying buttons / inputs, never blocking the user.
- **Rescan stub button tooltip.** Disabled HTML buttons don't show native `title` tooltip in most browsers. Wrapped `#stateRollupRescanBtn` in a `<span>` with the title attribute + `pointer-events: none` on the button — tooltip now appears reliably on hover with text «Coming in a future release» / «Появится в одном из следующих релизов» (version-agnostic phrasing — actual rescan implementation is on the backlog, no fixed target version).

### Changed
- **All settings sections now collapse by default.** Previously all 11 setting cards (`<details>` elements) opened automatically, producing a long unwieldy form. After upgrade, every settings section starts collapsed; clicking a top-nav chip auto-expands all `<details>` inside the target section AND scrolls to it. Manual toggle on the section summary still works.
- **Toast: 1 hardcoded English string moved to i18n.** «limit 100 groups» error in the group multi-select replaced with localized `toastMaxGroupsReached` key (added to all 15 locales — EN + RU full, 13 placeholder).

### Added
- **Workflow message i18n audit (`workflow-i18n.test.js`).** Verifies all 4 workflow files (`cascade-aggregation`, `dta-aggregation`, `forbid-container`, `state-rollup`) export `WF_I18N` covering all 15 supported locales, that `pickLocale` correctly resolves project default → user locale → `FALLBACK_LANG`, and that EN/RU translations are distinct (not placeholders). 24 new unit tests; `WF_I18N` + `tWf` + `pickLocale` test-export shims added to all 4 workflows.
- **Settings validation test suite (`settings-validation.test.js`).** Targeted KPE bug repro + future regression guard.

### Compatibility
- **No schema changes.** `stateRollup*` whitelist additions from v1.7.0 unchanged. Existing `ssp_settings` payloads (with either Russian or English KPE keys) continue to validate.

---

## [1.7.0] — 2026-05-15

### Added
- **State rollup: parent issue State ← min(children.State).** New workflow rule (`workflow-state-rollup.js`) automatically recomputes container State (Story / Epic) as the least-progressed state across child issues whenever any child State changes. Disabled by default — upgrade is safe for all existing projects. Enable per-project in Plugin Settings → «State rollup» section.
- **Settings UI — State rollup section.** Configure: ordered list of states (least → most progressed), resolved states guard (containers won't be re-opened), optional floor state (containers won't drop below it), strategy enum (v1.7.0: `min` only; `max`/`mode` reserved for future). Uses hierarchy config from «Cascade aggregation» section (kindField / level-2 / level-3 values / parent link).
- **Status-bar chip `ssbStateRollup`.** Shows rollup on/off state at a glance in the widget status bar.
- **«Rescan all containers» button** (disabled stub in v1.7.0, Variant B). Full mass-rescan implementation deferred to v1.7.1 after pilot feedback — see [ROADMAP.md: Stage В.1](../Documentation/ROADMAP.md).
- **Schema migration registry.** `SCHEMA_MIGRATIONS` gets its first real entry (`1.6.x → 1.7.0`, no-op for sprint/history snapshots). Settings additions are purely additive — no migration step required.
- **28 new i18n keys × 15 locales** for the State rollup UI (EN + RU fully translated; 13 other locales: EN placeholder with `TODO(i18n v1.7.x)` marker).
- **Backward-compat fixture frozen** for v1.6.3 (`tests/fixtures/snapshots/1.6.3/`). All prior fixture sets (v1.4.2, v1.6.0, v1.6.3) pass through v1.7.0 validators without `invalid_*_structure`.

### Compatibility
- **No breaking schema changes.** All `stateRollup*` settings keys are additive and optional. Sprints, history snapshots, and working drafts written by v1.6.x are read unchanged by v1.7.0. Rollback to v1.6.3: disable `stateRollupEnabled` per-project (soft rollback) or reinstall v1.6.3 zip (hard rollback) — v1.6.3 backend simply ignores unknown `stateRollup*` keys on the next settings save.

---

## [1.6.3] — 2026-05-15

### Fixed
- **Critical: wrong-row mutation in role composition table under active sort.** With sorting enabled on the role composition table, clicking «Delete» on a row deleted a *different* task — the one at the same visual position in the unsorted (storage) order. The same wrong-row mutation affected the «Inclusion status» dropdown, the allocation input, and the dynamic-edit cells (estimate, state, priority, xpriority, system). Root cause: per-row interactive elements were tagged with `data-gi` (numeric position in the rendered sorted+paginated view), but click/blur handlers used that index to splice/lookup into the unsorted `_roleItems[rk]` source array. Fixed by tagging every interactive element with `data-iid="<issueId>"` and resolving the source index by issueId on every action. Diag-log entries (`del-item-btn click: item iid=… not found in role …`) surface any future mismatch.

### Compatibility
- **No schema changes.** Storage written by v1.6.0/v1.6.1/v1.6.2 reads unchanged.

---

## [1.6.2] — 2026-05-15

### Fixed
- **Required sprint name and dates on save.** Clicking «Save parameters» when the sprint name, start date or end date is empty now blocks the save, shows a localized toast (4 new keys across all 15 locales), and focuses the missing field. Previously the form silently saved an empty-name sprint that later appeared in the sprint dropdown as a UID-like undeletable entry.
- **«New sprint» button — single draft reuse.** Each click no longer generates a new UID-named sprint. Instead, the button reuses a single unsaved draft with a readable, localized name «New sprint (unsaved)». Multiple consecutive clicks overwrite the same draft. Once the user fills in name + dates and saves, the next «New sprint» click creates a fresh draft.
- **«New sprint» button — auto-switch to Planning.** Clicking the «New sprint» button from any tab (History, Settings, Gantt, etc.) now switches the active tab to «Planning → Roles» automatically so the user lands on the correct context for filling in sprint name, dates, and role composition.

### Added
- New i18n keys (15 locales): `newSprintDraftName`, `toastSprintNameRequired`, `toastSprintDateStartRequired`, `toastSprintDateEndRequired`.

### Compatibility
- **No schema changes.** Storage written by v1.6.0/v1.6.1 is read by v1.6.2 unchanged.

---

## [1.6.1] — 2026-05-15

### Fixed
- **Critical hotfix: `module.exports` override broke all backend API calls in YouTrack.** The test-export shim added in v1.6.0 used `module.exports = {...}`, which in YouTrack's CommonJS-based scripting runtime replaced the entire exports object, removing the `exports.httpHandler` entry point. Every backend API call failed silently, causing the frontend to degrade to viewer mode — settings, history, and all interactive elements disappeared despite the user having settings-group access. Fixed by switching to `Object.assign(exports, {...})`, which adds the test symbols to the existing exports object without discarding `httpHandler`.

### Compatibility
- **No data changes.** Storage written by v1.6.0 (if any) is read correctly by v1.6.1.
- **Upgrade from v1.4.2 is safe.** All v1.6.0 forward-compat infrastructure (pluginVersion stamping, BASELINE_ASSUMED, ForRead/ForWrite validators) is present and working.

---

## [1.6.0] — 2026-05-15

### Added
- **Forward-compatibility foundation (Stage A — single-shot).** All three backend snapshot whitelists now accept an optional `pluginVersion` string (`X.Y.Z`, max 32 chars). Every snapshot written by v1.6.0+ is stamped with `CURRENT_PLUGIN_VERSION` immediately before storage. Legacy snapshots without the field receive a `BASELINE_ASSUMED` audit entry in `migrationLog` on first read (assumed version `1.4.2`).
- **Schema migration registry** (`SCHEMA_MIGRATIONS`, `migrateSnap`, `versionLt`). The registry is empty in v1.6.0 — the first entry will be added when the first breaking schema change lands (expected v1.7.0 State Rollup). Infrastructure is in place.
- **Split read/write validators.** `validateSprintForRead` / `validateHistoryForRead` / `validateWorkingDraftForRead` — tolerant: unknown top-level keys are logged as `WARN_UNKNOWN_KEY` in `migrationLog` and accepted. `validateSprintForWrite` / `validateHistoryForWrite` / `validateWorkingDraftForWrite` — strict: current whitelist enforcement. Old names (`validateSprint` etc.) remain as deprecated aliases until v1.7.0.
- **JSON whitelist source of truth.** `schema/whitelists.json` is the single source for the three `ALLOWED_*_KEYS` arrays. `npm run build` auto-syncs the AUTOGEN block in `backend-project.js`. CI verifies sync is idempotent via `git diff --exit-code backend-project.js`.
- **Backward-compatibility CI suite.** Four new unit test files (78 tests total): `snapshot-migration.test.js`, `backward-compatibility.test.js` (full migrate+validate chain), `schema-evolution.test.js` (whitelist expansion guard), `compat-prev-release.test.js` (prev-version fixture upgrade path). Deterministic fixture generator at `tests/fixtures/generate-baseline.js`; frozen snapshots in `1.4.2/` (legacy contract) and `1.6.0/`.
- **CommonJS test-export shim** in `backend-project.js` (guarded `if (typeof module !== 'undefined')`). Unit tests can `require()` the backend and access internals directly.
- **PR template** updated with schema-change checklist. CI `build.yml` step added: verify whitelist sync idempotent after `npm run build`.

### Compatibility
- **No breaking changes.** All existing v1.4.x snapshots in storage continue to load unchanged. The `BASELINE_ASSUMED` audit entry is written to `migrationLog` on the next read and the snapshot passes validation as before.
- **No user-visible changes.** Every UI surface, workflow, export and import path behaves identically to v1.4.2.

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
