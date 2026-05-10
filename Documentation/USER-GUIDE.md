# Smart Sprint Planner — User Guide

> 🇬🇧 English · 🇷🇺 [Читать по-русски](USER-GUIDE.ru.md)

**Document version:** 1.3.0 — 2026-05-10
**Minimum YouTrack version:** 2024.3
**UI languages:** 15 (auto-detect from browser, English fallback; toggle in the widget header)

> 💡 **Looking for the team-lead / Scrum master / PM perspective?**
> See [METHODOLOGY-GUIDE.md](METHODOLOGY-GUIDE.md) — how the plugin maps
> onto Scrum ceremonies, capacity planning practice, time-tracking
> discipline and a first-week rollout checklist.

---

## Table of contents

1. [Introduction](#1-introduction)
2. [Installation and initial setup](#2-installation-and-initial-setup)
3. [Plugin settings](#3-plugin-settings)
4. [Planning tab (Resource Allocation / Per-Assignee Distribution)](#4-planning-tab)
5. [Gantt timeline tab](#5-gantt-timeline-tab)
6. [Sprint history and working copies](#6-sprint-history-and-working-copies)
7. [Roles, permissions, groups](#7-roles-permissions-groups)
8. [Localization, themes, versioning](#8-localization-themes-versioning)
9. [Diagnostics and FAQ](#9-diagnostics-and-faq)

---

## 1. Introduction

**Smart Sprint Planner** is a YouTrack plugin for multi-role sprint planning. It tracks resources separately for nine functional roles, assigns tasks to specific people within each role, takes immutable snapshots of validated sprints into history, and supports working copies for safe re-edits of validated snapshots.

### Supported roles

| Key | Role |
|-----|------|
| `analysis`     | Analysis |
| `testing`      | Testing |
| `devPlatform`  | Platform development *(map to 1C, SAP, Salesforce, low-code, etc. via plugin settings)* |
| `devBack`      | Backend development |
| `devFront`     | Frontend development |
| `devIos`       | iOS development |
| `devAndroid`   | Android development |
| `devFs`        | Fullstack development |
| `devDb`        | Database development |

Each active role gets its own sub-tab with an independent composition, resource pool, and history.

### Widget architecture

A single widget — **`ssp-main`** (extension point `PROJECT_SETTINGS`). It contains:

- **Header bar** — shared across all tabs. Includes the **Current sprint** selector (one for the whole widget), an aggregated status badge (the minimum status across active roles: PLANNING < CONFIRMED < ALLOCATED), a **✏ Working copy** indicator (if the selected sprint has a draft in progress), and a **➕ New sprint** button. Switching the sprint in the header immediately re-renders the active tab. If a historical sprint without its own working copy is selected, the active tab enters hybrid read-only mode.
- **Three top-level tabs**: **📋 Planning** (with two detail levels — *Resource Allocation* and *Per-Assignee Distribution*), **📈 Gantt** (per-role timeline), and **🕑 Sprint History**.
- **⚙ Plugin settings** button — settings overlay (visible only to members of `settingsManagerGroup`).
- **Server-side draft** — unsaved edits are debounced-flushed to the backend (`ssp_drafts`, per-user slots) and restored after F5. The header shows `●  Unsaved changes` or `💾 Draft saved HH:MM`.
- **Working copies** — a separate mutable entity for editing validated snapshots; the base snapshot stays untouched.

### Sprint lifecycle

`PLANNING` → (Validation) → `CONFIRMED` → (Allocation) → `ALLOCATED` → (Closure) → `FINISHED`.

In `ALLOCATED` state the table rows are locked from edits (to protect the per-assignee distribution). To change them, use **Open for editing** in the history spoiler (see §6).

---

## 2. Installation and initial setup

**For Project / Global Admin:**

1. Upload the plugin zip into YouTrack 2024.3+ (**Administration → Apps → Upload**).
2. **Project Settings → Apps → Smart Sprint Planner** → set **`settingsManagerGroup`** (the YouTrack group that manages the plugin's settings within this project).
3. Until `settingsManagerGroup` is set, the plugin runs in **read-only** mode (deny-by-default — protects against settings takeover on a fresh install).

**For a member of `settingsManagerGroup`:**

1. Open the project, expand the **Smart Sprint Planner** widget on the Project Settings page.
2. Click **⚙ Plugin settings** in the header.
3. Fill in the settings (see §3) and save.

Once the base settings are saved and at least one role is active, the planning widget becomes functional.

---

## 3. Plugin settings

The overlay opens via the **⚙ Plugin settings** button. Close with **✕ Close** or `Esc`. It is structured into 5 sections (with a sticky chip menu on the side):

### 3.1 Access and roles

- **`activeRoles`** — checkboxes for the 9 functional roles. Inactive roles get no sub-tab.
- **`validationGroups`** / **`editGroups`** / **`historyClearGroups`** — multi-select YouTrack groups for sprint validation, composition editing, and full history cleanup respectively.
- **`assignerGroups`** — multi-select groups for the **assigner** role: limited to changing the assignee and start/end-dates on **Per-Assignee Distribution** and on the Gantt timeline; cannot edit composition, capacity, or status. Hierarchy: `editor ⊃ assigner ⊃ viewer`. Users in none of these groups get read-only (viewer).

### 3.2 YouTrack field mapping

For each active role:

- **`fieldEst`** — estimation field (e.g., `Estimation`).
- **`fieldFact`** — actual time field (`Spent time`).
- **`userField`** — assignee field (`Assignee`, `Developer`, `Tester`).
- **Inline editing** (`dynEditEnabled`) — enables editing of `State` / `System` / `Priority` / `XPriority` directly from the sprint table with a write-back to YouTrack.
- Also: `fieldPriority`, `fieldXPriority`, `fieldState`, `fieldSystem`, `fieldSprint`, `fieldVersion`.

### 3.3 Calculation norms

- **`nkcJanuary`** / **`nkcMay`** / **`nkcOther`** — standard hours per month (January / May / other).
- **`rate`** — hourly rate.
- **`participation`** — participation percentage.
- **`kpe`** — grade coefficient (Intern / Junior / Middle / Senior).

### 3.4 Planning modes

- **`personalPlanningEnabled`** — activates the **Per-Assignee Distribution** level on the Planning tab.
- **`usePersonalForResource`** — auto-recalculates the role's resource pool from the per-assignee distribution (requires `personalPlanningEnabled`).

### 3.5 Differentiated Time Tracking (DTA)

Aggregates issue **work items** by type and writes the result into per-role fact-fields. For example, all work items of type *Development* logged on an issue can be summed into `factFrontend`; *QA* — into `factQa`. The mapping is per-project, generic over the active roles, and validated for "one type → one role".

The workflow rule (`workflow-dta-aggregation.js`) ships **inside the YT-app zip** and is registered automatically on install — no separate workflow archive, no `Admin → Workflows → Import` step. To enable DTA in a project:

1. Install the YT-app zip via **Apps → Upload App** (one-time).
2. Open the project's plugin settings, switch to the **Differentiated time tracking** chip, tick **Enable differentiated time tracking** and add rows mapping each work-item type name to a role. Save.

From that moment, every work-item add/update/delete on issues in this project triggers re-aggregation. Inactive roles in the mapping are skipped with a warning. Types not in the mapping are ignored.

**Localization**: the workflow emits `workflow.message` in the user's UI language (`currentUser.profile.locale.language`) with fallback to `ssp_settings.defaultLang` and then `en`.

### 3.6 Cascade aggregation of work hours (parent ← child)

Two complementary workflow rules ship inside the YT-app zip and aggregate per-role plan/fact fields up a configurable hierarchy of issues. Both are off by default and configured via the **Cascade aggregation** chip in plugin settings.

- **`cascadeAggregationEnabled`** (`workflow-cascade-aggregation.js`) — when a child issue's plan or fact field changes, the rule walks up the configured **parent link** (default *subtask of* / *parent for* — the built-in YouTrack «Subtask» link), sums the same field across all sibling children of the parent, and writes the result into the parent. If the parent is a **level-2** issue (story-like) and itself has a **level-3** parent (epic-like), the rule recomputes the level-3 grandparent in the same pass. Maximum 2 hierarchy levels (`task → level-2 → level-3`); deeper recursion is not supported. The set of fields aggregated is derived automatically from the existing DTA «Fields → Estimate / Fact» mapping for active roles — no separate field whitelist. Writes are idempotent (`cur !== target` diff), so a workflow re-trigger on the parent is safe.
- **`forbidContainerWorkItems`** (`workflow-forbid-container.js`) — when set, `workflow.check(false, …)` rejects any save that adds or edits a work item on a container issue (kind ∈ `cascadeLevel2Values` ∪ `cascadeLevel3Values`). Both `workItems.added` and `editedWorkItems` are blocked. The error message is localised. There is no bypass-group escape hatch in v1.3.0.

The **kind field name** (default `Type`), the **level-2 / level-3 value lists** (defaults `Story` / `Epic`, comma-separated for multi-value bundles like `Story, Feature`), and both directions of the **parent link name** are configurable per project.

**Why pair them?** Cascade aggregation overwrites the parent's plan/fact fields whenever a child changes. If someone also logs work directly on a story or epic, that direct entry will be wiped on the next aggregation. The settings UI raises a non-blocking warning whenever cascade is on and forbid is off — the safe production setup is **both on**.

### 3.7 Other

- **Language toggle** (RU/EN) — duplicates the selector in the widget header.
- **`enableDebugLog`** — debug mode for server-side logs.
- **`hideDiagLogUi`** — hides the diagnostic log panel from the UI. Events keep being recorded in memory and remain available via the **📥 Export** button after the flag is unchecked.

All settings are stored in the backend (`ssp_settings`) and validated against a strict whitelist (`ALLOWED_SETTINGS_KEYS`).

---

## 4. Planning tab

A single top-level tab with a detail-level toggle: **Resource Allocation / Per-Assignee Distribution**. The active level persists across sessions (`ui.planningLevel`).

### 4.1 Resource Allocation level

A list of 9 roles (filtered by `activeRoles`) rendered as accordion cards:

- **Collapsed card** — a mini summary: role resource / Σ allocation / task count / ⚠ overlimit indicator.
- **Expanded card** — a full editable composition editor: status badge, sprint name and dates, role capacity, the composition table with task pickers/clear/recalc actions, the validation button, and an NKC selector. All DOM ids are unique per role, so multiple expanded cards do not conflict.

The expansion state persists in `ui.expandedRoles[]`. Below the expand toggle (▼/▶) there is an **→ Open in Per-Assignee Distribution** button (it syncs `_lastActiveRole` and switches the level).

#### Sorting in task tables

The headers of the **ID / Priority / XPriority** columns are clickable — a click changes the sort key. The `↕` icon (gray) appears on inactive columns; the `▼` icon (blue) marks the active one. A second click on the active column turns sorting off (storage order). The sort key persists in `localStorage.ssp_sortKey`.

### 4.2 Per-Assignee Distribution level

Visible when `personalPlanningEnabled=true`. A role selector (`#planningRoleSel`) sits at the top; it defaults to `localStorage.ssp_lastActiveRole` or to the first active role.

- **Empty state with CTA** — for a role without `personalPlanning[roleKey]`, a banner reads "No assignees configured for the *{name}* role yet" with a **➕ Pick assignees** button. Clicking it calls `doDistribCalc()` directly. The `personalPlanning[roleKey]` entry is created only after the explicit click — no empty configs in storage.
- **Inline editor** for populated roles: an NKC selector, totals (Total resource / Remainder), the **Calculate resource** / **Save parameters** / **Validate distribution** buttons, the assignees table, and the task distribution table — all working inline in `#planningPeopleContent`.
- **Resource-mode indicator** when `usePersonalForResource=false`: ✅ OK / 🟡 under-distributed / 🔴 over-allocated — it shows the difference between the manually entered role resource and the sum across assignees.
- **Soft-warn confirm on role switch with dirty data** — prevents silent loss of unsaved per-assignee edits.
- **Two-way sync with the Gantt timeline**: changing the assignee via the `<select>` in the task table immediately recolors the corresponding bar on `#tab-gantt` (if visible). The cached color in `taskAssignments[issueId].ganttColor` is invalidated on every write. If the Gantt tab is not open, the next `refreshGanttForCurrentSprint` picks up the new assignee automatically.
- **🔄 Refresh from YouTrack** — bulk-fetches the current assignees from YouTrack for every task in the sprint (up to 200 issueIds per request, via `POST /refresh-assignees`). YouTrack is the source of truth: if someone changed the assignee directly on the issue, this button reconciles `_currentRolePP.taskAssignments` with reality. The change appears in the table immediately and recolors the Gantt.
- **Auto-select sprint when switching from Resource Allocation** — switching to Per-Assignee Distribution picks up the sprint that was active on Resource Allocation. No need to re-select.
- **Dynamic role-summary re-render** — header counters of the role block (Resource / Σ Allocation / Task count / overlimit) update after every assignee/grade/dates change, with no tab switching required.

### 4.3 Hybrid behavior for historical sprints

When a historical sprint is selected in the widget header:

- **Without an active working copy of your own** — all inputs in `#tab-planning` AND `#tab-gantt` go read-only (CSS class `.readonly-mode`); use **Open for editing** in the history spoiler.
- **With an active working copy of your own** — read-only is lifted automatically and the sprint is editable just like the current one.

### 4.4 Cross-tab synchronization

If you open the widget in a second browser tab and start editing, the `.widget-header__wc` indicator in the first tab updates without F5 (via `window.addEventListener('storage', ...)` on the `ssp:wc-touched:*` key). The active `#tab-gantt` re-renders too if the working copy is touched from the other tab.

---

## 5. Gantt timeline tab

A dedicated top-level tab `#tab-gantt` with a per-role timeline.

- **Role selector** (`#ganttRoleSel`) at the top — synchronized with `localStorage.ssp_lastActiveRole` (shared with the Per-Assignee Distribution level). Switching the role on Gantt is reflected when the next Per-Assignee Distribution opens, and vice versa.
- **Refresh Gantt** button — re-renders the timeline from current data. Hidden in hybrid read-only mode.
- **🔄 Refresh from YouTrack** — bulk-pulls current assignees from YT for every task in the sprint (the same button as on Per-Assignee Distribution; up to 200 issueIds per request).
- **Bar color = function of the assignee**: a fixed palette of 12 colors via `assigneeColorOf(login, allLogins)` — round-robin by the login's index in the role's sorted login list. The same login gets the same color regardless of the current table composition. Tasks without an assignee get gray (`#9aa3ad`).
- **Single-click → reassign**: a single click on a bar opens the `#reassignOverlay` modal with the role's assignee list and a "— Unassigned —" option. After **Apply**, `taskAssignments[issueId].assignee` is updated AND the value is **written back to the YouTrack issue field** via `POST /update-issue-field`. The bar is recolored immediately and the dirty flag is set. **Requires inline editing** (`dynEditEnabled=true` in Settings) — otherwise a single click shows a `ganttReassignDisabledByInlineEdit` toast. Reassign means a YouTrack write-back, which should not be available in plugin-only edit mode.
- **Double-click → local color marker**: dblclick on a bar cycles the local color override `taskAssignments[issueId].userColorOverride` through `red → blue → null`. **Does not require inline editing** — this is a local UI marker without a YouTrack write-back. Useful for highlighting tasks (e.g., "needs discussion" = red, "ready for review" = blue). Persisted in `personalPlanning`.
- **Two-way sync with Per-Assignee Distribution**: a reassign via the modal immediately updates the `<select>` in the task table (if the Distribution level is already rendered). The two views cannot drift out of sync.
- **Hybrid read-only mode**: when a historical sprint without your working copy is selected, clicks are blocked via CSS `pointer-events:none` plus a JS handler check on `_isEditor` / `.readonly-mode` (belt-and-suspenders).
- **Soft-warn confirm on role switch with dirty `_currentRoleGantt` data** — protects unsaved color edits.

**Tip**: if the diagram is empty, check that the role has a validated sprint (`CONFIRMED` or higher) and assignees populated on the Per-Assignee Distribution level.

---

## 6. Sprint history and working copies

A list of validated sprint snapshots (10 per page, sorted by `confirmedAt` desc). Each snapshot is a separate spoiler with metadata (dates, status, validator, resource remainder) and the task table.

### Buttons in the spoiler

- **Excel** — exports the sprint as an .xlsx with columns task / estimation / fact / resource / allocation / total.
- **✏ Open for editing** — creates a working copy (see below). Visible to validators; hidden for `FINISHED`.
- **Finish** — moves `ALLOCATED → FINISHED`. Irreversible.
- **🗑 Delete** — deletes the snapshot (requires confirmation).
- **🗑 Clear all history** — separate button above the list; only members of `historyClearGroups`.

### Working copies

Clicking **✏ Open for editing** does not destroy the base snapshot. A **working copy** is created in `_workingDrafts['<sprintId>_<roleKey>']`:

1. **Banner** in the planner header: "✏ Working copy: {sprint} [{role}] · base snapshot from {date}" with a re-validation level pill (META / ALLOC / CONFIRM):
   - **META** (blue) — only metadata changed → status is preserved.
   - **ALLOC** (orange) — allocations / role resource changed → `ALLOCATED → CONFIRMED`.
   - **CONFIRM** (red) — composition / inclusion / estimates changed → status drops to `PLANNING`.
2. **Banner buttons**: **Show diff** (added / removed / changed) and **✕ Collapse** (the working copy is kept; the banner is hidden; the active sprint is restored).
3. **✏ Working copy exists (by {who}, {when})** pill in the history spoiler, next to the status badge.

### Re-validation

Open the working copy → make edits → click **✔ Validate** in the planner. The re-validation level is applied automatically:

- If the base snapshot diverges (another validator overwrote it in parallel), a **Conflict** modal appears: "Overwrite with mine / Download both versions to Excel / Cancel".
- After commit: the working copy is removed; an entry `{at, by, level}` is appended to `snap.revisions[]` (audit-trail, capped at 200 entries).

### Multi-tab

- Opening your own working copy in a new tab → a soft-warn modal "Open in another tab" with options "Continue here / Read-only".
- Opening someone else's working copy → the **Open for editing** button is disabled with a tooltip "Currently being edited by {who}". The backend blocks take-over (HTTP 403 `not_owner`).

### Discard

The **Cancel edit** button (visible only to the working-copy owner) in the spoiler → a two-step confirm → the working copy is removed; the base snapshot is untouched.

### Garbage collection

Working copies with `updatedAt > 30 days` or orphaned (no base snapshot) are removed once on plugin load (lazy purge, no background timers). A summary toast reports: "Stale working copies removed: N".

### Export

The **Excel** button on each snapshot exports an .xlsx with columns: task, estimation, fact, resource, allocation per the selected role, plus totals.

---

## 7. Roles, permissions, groups

| Group | What it grants |
|-------|----------------|
| `settingsManagerGroup` (app-settings) | Plugin settings management (opens the settings overlay). The **source of truth** for plugin permissions. |
| `editGroups` (`ssp_settings`) | Editing `_sprint`, `_roleItems`, `_items` (sprint-data POST). Inline editing of YouTrack fields. |
| `validationGroups` (`ssp_settings`) | Sprint validation (`POST sprint-data?action=validate`); creating and committing working copies (`POST working-drafts`). |
| `historyClearGroups` (`ssp_settings`) | Full history clearing (`POST history?action=clear`). |
| `assignerGroups` (`ssp_settings`) | **Only** changing the assignee and start/end-dates on Per-Assignee Distribution and on the Gantt timeline (via `action=assignerSync`). YouTrack write-back is allowed only for assignee fields via `POST /update-issue-field`. Cannot change composition, capacity, or status. Hierarchy: `editor ⊃ assigner ⊃ viewer`. |

**Server-side authorization** (`backend-project.js`): `authzGuard(ctx, role)` runs at the start of every endpoint. Clients never pass their own group claims — the server reads `ctx.currentUser.groups`. Deny-by-default: if `settingsManagerGroup` is not configured in app-settings, every mutating endpoint returns 403.

**Cross-user protection of working copies**: `editorLogin` is always overwritten with the server-side `ctx.currentUser.login` (defense-in-depth). Take-over of someone else's working copy is forbidden.

See [SECURITY.md](../.github/SECURITY.md) for the full access matrix.

---

## 8. Localization, themes, versioning

- **Localization**: 15 languages (Czech, German, English, Spanish, French, Hungarian, Italian, Japanese, Korean, Dutch, Polish, Portuguese, Russian, Turkish, Chinese Simplified). The toggle lives in the widget header and inside the settings overlay. The choice is stored in `localStorage.ssp_lang`. Default is auto-detected from the browser, with English as the fallback. All UI strings flow through `T(key)` and per-language JSON dictionaries under `widgets/main/i18n/`.
- **Themes**: light / dark — auto-detected from the YouTrack theme (`body.theme-dark` / `body[data-theme="dark"]`). The plugin adapts via CSS variables.
- **Versioning**: SemVer. The source of truth is `manifest.json:version`. Cumulative history lives in [CHANGELOG.md](CHANGELOG.md).
- **Storage formats**:
  - `_history` — `{sprintId, roleKey, status, items[], confirmedAt, confirmedBy, hasWorkingCopy?, revisions?[]}`.
  - `_workingDrafts` — a separate extension property `ssp_workdrafts` keyed by `<sprintId>_<roleKey>`.
  - `_drafts` — `ssp_drafts`, per-user UI cache (slot key = `ctx.currentUser.login`).
  - `_settings` — `ssp_settings`, the project-scoped configuration.

---

## 9. Diagnostics and FAQ

### The diagnostics panel

A collapsible **Diagnostics** panel sits at the bottom of the widget. It logs every API request, error, data migration, and GC pass. The **Clear log** button clears it. When reporting a bug, please attach the log.

The header of the panel includes a **📥 Export** button — it produces a `ssp-diag-YYYYMMDD-HHMMSS.txt` file with the last 100 log lines. Attach this file to your bug report.

To hide the panel: **Settings → Other → Hide diagnostic log panel from UI**. Save settings; the panel disappears, but events keep being recorded in memory and the export keeps working after the flag is unchecked.

### Server-side debug log

`enableDebugLog` in app-settings enables `console.log` on the backend (`dlog`). Off by default. It does not log user input values — only short markers.

### FAQ

**Q: I opened a sprint for editing from history, but I don't actually need to change anything. How do I back out?**
A: In the planner header banner "✏ Working copy..." there is a **✕ Collapse** button. The working copy is preserved (you can return later via **Continue editing**). To delete it instead, use **Cancel edit** in the history spoiler — a two-step confirm; the base snapshot is untouched.

**Q: Someone else is already editing the sprint. How do I open it?**
A: You cannot, until they close the working copy (discard, commit a re-validation, or 30 days pass and GC removes it). Clicking shows a toast "Currently being edited by {login}". Coordinate with them directly.

**Q: What happens if I just close the browser while editing a working copy?**
A: The working copy is auto-saved to the backend with a debounced flush (300 ms). On the next load you will see the **Working copy exists** pill in the spoiler. Click **Continue editing**.

**Q: I only changed the sprint name — why did the status stay the same?**
A: That is the `META_ONLY` re-validation level. Metadata changes (name / dates / Sprint / Version fields) do not break validation. The banner pill is a blue **META**.

**Q: I changed allocations on an `ALLOCATED` sprint and the status dropped to `CONFIRMED`. Why?**
A: That is the `ALLOCATED_REVAL` level — changing allocations requires re-validating the per-assignee distribution. Switch to **Per-Assignee Distribution** for the role and click **Validate distribution** again.

**Q: I added or removed a task in the working copy and the status dropped to `PLANNING`. Why?**
A: That is the `CONFIRMED_REVAL` level — changing the task composition requires going through every stage from the start: composition validation (`PLANNING → CONFIRMED`), then per-assignee distribution (`CONFIRMED → ALLOCATED`).

**Q: A "Conflict" modal appeared when committing the working copy. What now?**
A: Someone else overwrote the base snapshot in parallel (e.g., ran a `Finish` operation or committed their own working copy). Options: **Overwrite with mine** (your version becomes the current; theirs is lost), **Download both versions to Excel** (for a manual merge), **Cancel** (the working copy is preserved for further discussion).

**Q: I am in `assignerGroups` but I cannot edit the sprint composition. Is this a bug?**
A: No, this is by design. The assigner role is restricted: you can change **only the assignee and start/end-dates** on Per-Assignee Distribution and on the Gantt timeline. Composition / capacity / status edits require `editor` or `validator`. Hierarchy: `editor ⊃ assigner ⊃ viewer`. To get full rights, ask a settings manager to add you to `editGroups`.

---

**End of guide.** Document version 1.0.0 · 2026-05-08.

