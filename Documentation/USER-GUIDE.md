# Smart Sprint Planner — User Guide

> 🇬🇧 English · 🇷🇺 [Читать по-русски](USER-GUIDE.ru.md)

A short guide to working with the plugin: creating a sprint, adding tasks, distributing them between assignees, and closing the sprint with an outcome review. No technical details — just what's visible in the interface and what you need to click.

> 💡 If you're a team lead, Scrum master, or product manager and want to understand how the plugin maps onto Scrum ceremonies (planning, daily, retro) — see the [methodology guide](METHODOLOGY-GUIDE.md). This document is about the interface itself.

---

## Table of contents

1. [What the plugin does](#1-what-the-plugin-does)
2. [How to open the plugin in your project](#2-how-to-open-the-plugin-in-your-project)
3. [First-time setup: what the project admin configures](#3-first-time-setup-what-the-project-admin-configures)
4. [Creating a new sprint](#4-creating-a-new-sprint)
5. [Working with the backlog](#5-working-with-the-backlog)
6. [Picking tasks and setting role capacity](#6-picking-tasks-and-setting-role-capacity)
7. [Distributing tasks among assignees](#7-distributing-tasks-among-assignees)
8. [Calendar timeline](#8-calendar-timeline)
9. [Daily stand-up view](#9-daily-stand-up-view)
10. [Sprint stages: review, commit, complete](#10-sprint-stages-review-commit-complete)
11. [Sprint history and re-editing](#11-sprint-history-and-re-editing)
12. [Releases (release management)](#12-releases-release-management)
13. [Operational reporting](#13-operational-reporting)
14. [Who can do what: group permissions](#14-who-can-do-what-group-permissions)
15. [FAQ](#15-faq)

**Appendix A.** [Full reference of project settings](#appendix-a-full-reference-of-project-settings)

---

## 1. What the plugin does

**Smart Sprint Planner** helps teams whose sprints involve people from different specialties — analysts, developers, testers, platform specialists — plan a shared sprint without lumping everyone into a single pool of hours.

What this means in practice:

- Each role has its own capacity in hours and its own task list. Analysts don't "compete" with developers for hours; each role has its own plan.
- It's visible who's doing what: tasks can be distributed among specific assignees within a role, with start and end dates.
- Every confirmed sprint is preserved in history in its original form — you can later see what was planned, what actually got done, and where the variances are.
- There's a calendar timeline for the sprint and a daily stand-up view.

The plugin isn't tied to a specific methodology — it works equally well in pure Scrum and in more flexible hybrid processes.

---

## 2. How to open the plugin in your project

The Sprint Planner now lives in the **YouTrack main menu** — in the left column, next to "Issues" and "Agile Boards". To open it:

1. In the YouTrack left menu, click **Smart Sprint Planner**.
2. The full planner opens: on the left — a panel with the project picker and navigation; on the right — the work area.
3. **Pick a project** from the dropdown on the left — and work with that project's sprints.

This is where you do all your day-to-day planning: create sprints, pick tasks, distribute them among people, view the Gantt chart and history.

If there's no **Smart Sprint Planner** item in the menu — contact your YouTrack admin: the plugin is installed once per instance via App upload. If the item is there but the project you need isn't in the picker — the project hasn't been connected to the planner yet (how to connect it — [section 3](#3-first-time-setup-what-the-project-admin-configures)).

> 💡 **Where the settings went.** The plugin also has a second, service part — the **Smart Sprint Planner block inside project settings**. You go there rarely: only to connect a project once and to change its settings later (roles, fields, modes). No planning happens there anymore — it's all in the main menu.

### What you'll see inside

The planner has two parts:

**1. Left panel** — context and navigation. It contains:

- **Project picker.** Work starts here — until a project is picked, the right side shows a "pick a project" hint.
- **Sprint dropdown.** The current sprint is on top, followed by completed ones. Switching sprints instantly re-renders what's shown on the right.
- **Sprint status badge** and **"Edit draft exists" badge** — short hints about the sprint stage and an unfinished edit (see [section 10](#10-sprint-stages-review-commit-complete) and [section 11](#11-sprint-history-and-re-editing)).
- **"+ New sprint" button** (see [section 4](#4-creating-a-new-sprint)).
- **Navigation tree** — switch between sections: "Sprint parameters", "Capacity" (with the "Full" planning model — see [section 6](#6-picking-tasks-and-setting-role-capacity)), "Planning" (with sub-items "Shared resource allocation" / "Per-assignee distribution" / "Stand-up"), "Working with the backlog" (if configured — see [section 5](#5-working-with-the-backlog)), "Gantt chart", "Sprint history". When the corresponding modules are enabled, the release items (see [section 12](#12-releases-release-management)) and the "Reporting" group (see [section 13](#13-operational-reporting)) appear as well.
- **«Share» button** (at the bottom of the navigation tree) — copies a link to the current view (see below).
- **Service links at the bottom:** the user guide, feedback, language switcher. The chosen language, last role, table sort order and rail state are remembered **per user on the server** — they survive page reloads and browser switches.

**2. Work area on the right** — the content of the selected section.

> On a narrow screen the panel and work area stack into a single column (as before); on a wide screen they sit side by side. The panel can be collapsed with the button in its top corner.

### Sharing a link to a sprint

The page address in main-menu mode **automatically reflects what you're looking at**: the selected project, sprint, and navigation tree section. To give a colleague exactly this view, click **«Share»** at the bottom of the navigation tree — the link is copied to the clipboard (a "Link copied" tooltip confirms it). Send it any way you like; when the recipient opens it, they land directly on the same project, sprint and section.

The button is active when a sprint is open; on YouTrack servers without deep-link support for apps (older builds) the button is hidden and appears by itself after a server upgrade. Share the link **after saving the sprint** — the recipient sees the last saved state, not your unfinished draft.

**Handoff.** This is the primary use case: an analysis lead prepares sprint composition and sends the link to the dev lead. The dev lead opens it, sees the sprint view, and — if they have assignee-editing rights — clicks «Open for editing» and distributes tasks. The link **only navigates** to the view; what the recipient can do (view or edit) is determined by their project access in YouTrack and the working-draft mode — the link grants no extra permissions.

If the recipient opens a link to a project they don't have access to (or the planner isn't connected to that project), they'll see a message and can pick an accessible project instead.

Everything you do in the plugin is **saved automatically** — nothing is lost even if you close the browser tab or lose your internet connection. The **Save sprint parameters**, **Save role resource** and **Confirm** buttons are for fixing sprint inputs and stages (see [section 10](#10-sprint-stages-review-commit-complete)), not for saving data itself.

---

## 3. First-time setup: what the project admin configures

This section is needed **only once** — when the project is connected to the planner. After settings are in place, regular users don't need to go here — they work in the main-menu planner.

Connecting starts **in project settings** (not in the main menu). Right after installation the plugin runs on the project in read-only mode — the editing buttons are hidden, so a random person can't rewrite settings on a freshly installed project.

To make the project operational and **make it appear in the main-menu planner**, the project admin needs to do **four things**:

1. **Set the settings manager group — this is the "connection".** This is done **not in the plugin dialog** but in the settings of the app itself: open your project → **Project Settings** (gear icon) → **Apps** → **Smart Sprint Planner** → the **Plugin settings manager group** field. Pick the YouTrack group whose members can change this project's settings. As soon as the group is set, **the project becomes visible in the main-menu planner** — anyone with access to the project in YouTrack can open it, and group members get the **⚙ Plugin Settings** button in the planner header. Until the group is set, the project won't appear in the menu and everything stays read-only.

2. **Choose roles and map YouTrack fields to them.** Open the planner (from the main menu or from the plugin block in project settings) and click **⚙ Plugin Settings** in its header — a dialog opens with several sections (navigation list on the left, the active section on the right). The **Roles and issue fields** section is a table of nine rows, one per functional role (Analysis, Testing, Backend, Frontend, iOS, Android, Fullstack, Database, Platform development). Tick only the roles that actually work in your project — each active role gets its own "lane" in the planning view. For every ticked role, in the same row, specify three YouTrack fields:

   - **Estimate field** — for example, *Estimation* (how many hours are planned).
   - **Actual field** — for example, *Spent time* (how many hours were actually spent).
   - **Assignee field** — for example, *Assignee*, *Developer*, *Tester* (who's responsible for the task).

   If your project uses standard YouTrack fields, you usually just pick them once from the dropdowns.

3. **Set the sprint editing group.** In the **Manage permissions** section, fill in the **Sprint Editing** field — the group (or groups) whose members can save sprint composition and parameters. This step is **required**: while the group is empty, writing is closed for everyone except the YouTrack instance administrator — the plugin follows the "everything not explicitly allowed is denied" rule. If your sprints will go through review and get finished (see [section 10](#10-sprint-stages-review-commit-complete)), fill in **Sprint Validation** here as well — without it nobody can confirm or finish a sprint. Every field in the form has a hint underneath saying what the group grants.

4. **Check "Other Fields".** In the **Other Fields** section, under the **Main** heading, there are the **Priority** and **State** fields. If you leave them empty, the plugin uses the project fields named *Priority* and *State*; saving isn't blocked, but a "Required fields are not set" warning is shown. If your project names these fields differently — pick them explicitly.

After saving these settings, the plugin becomes functional: you can create sprints, pick tasks, and distribute them among people.

**What else can be configured** (not required for launch): groups that can only change assignees; monthly hour quotas; cascading effort aggregation; automatic state roll-up from child tasks to parent containers; "external ID" field for integration with another system; daily stand-up settings. The full list is in [Appendix A](#appendix-a-full-reference-of-project-settings).

> 💡 If you need to give someone the ability to **only** reassign tasks and change dates without touching composition or hours — that's a separate group, see [section 14](#14-who-can-do-what-group-permissions).

---

## 4. Creating a new sprint

One sprint in the plugin is a **shared team iteration** with specific dates. Inside the sprint, each active role has its own task composition, capacity in hours, and assignees.

### How to create

1. In the plugin header, click the **+ New sprint** button.
2. The **Planning** tab opens with an empty **Sprint inputs** card at the top.
3. Fill in three required fields:
   - **Sprint name** — short and meaningful, e.g. *Mobile app · June 2026* or *Sprint 47*.
   - **Start date.**
   - **End date** — must be later than the start date.
4. Optionally fill in the other fields:
   - **Sprint goal** — one or two sentences about the outcome the team wants to achieve. Not a "task list", but the answer to "why this sprint?". The field is optional; if left empty, a soft reminder appears after saving, but it doesn't block further work. The goal is convenient to display during the daily stand-up and to assess at sprint close.
   - **Sprint / Version** — if your YouTrack project uses these fields, you can link the plugin's sprint to the corresponding value right away.
5. Click **Save** under the card.

After saving, the sprint appears in the sprint dropdown in the plugin header and automatically becomes active.

### What's next

The new sprint is in the **planning** stage — which means you can freely pick tasks, change role capacities, and distribute assignees. Until the sprint is reviewed (see [section 10](#10-sprint-stages-review-commit-complete)), everything in it is a working draft.

Next steps — in [section 6 (picking tasks and capacity)](#6-picking-tasks-and-setting-role-capacity).

### Good to know

- **You can create sprints in advance.** If a sprint is already in progress and you want to prepare the next one — just click **+ New sprint**. The current one stays active; the new one appears in the list and you can switch between them through the dropdown.
- **Use meaningful names.** *Sprint 47* is worse than *Mobile app · 03.06–14.06*. Searching the history six months later will be easier.
- **Sprint goal is frozen at review.** When the sprint moves to the *reviewed* stage, the goal field is saved into history and no longer changes — this is so that at sprint close, you can assess the outcome against what was originally agreed, not against later edits.

---

## 5. Working with the backlog

Before filling a sprint with tasks by hand (section 6), it's convenient to first sort through the **shared task pool** — what came from the customer and hasn't yet been split across roles and sprints. There's a dedicated navigation-tree section for this — **Working with the backlog**.

This is a **pre-planning phase**: you look at the pool, understand which tasks are at which stage and who will work on them, and lay the right ones straight into the sprint composition by role.

> The section appears in the navigation tree only after the admin has added **at least one "state → role" zone** in the backlog settings — see [Appendix A](#appendix-a-full-reference-of-project-settings). While there are no zones, the section won't be there.

### What's on the page

In the section header:

- **Target sprint** — which sprint tasks will be laid into (taken from the shared sprint selector). Until a sprint is picked, you'll see the hint "Select an active sprint".
- **Filter** — a YouTrack search box (query-assist, the same syntax as in task picking): narrow the pool by any condition.
- **View switch:** **By zones** and **Tree**.

#### "By zones" view

The pool is grouped by **pipeline zones** — the stages a task passes through. Each zone is a state (or several) mapped to the role(s) that work at that stage (for example, "Analysis → Analysis role", "In development → Backend/Frontend"). The zones and their order are set by the admin (see Appendix A).

- **Customer pool** — tasks in the start states, not yet taken into work.
- Then come the zones in pipeline order.
- **Other** — tasks in states that didn't fall into any zone. They are **not lost**: the "Other" bucket collects them, and a warning appears at the top listing the unmapped states — a signal to the admin to finish configuring the zones.

#### "Tree" view

The same tasks, grouped by the **Epic ▸ Story ▸ Task** hierarchy (by task links). Handy when you need to see which larger theme a task belongs to. Tasks without a parent go into the "No parent" group.

### Labels on task cards

- **Needs estimate** — the task has no estimate for the required role (it can't be laid out meaningfully until it's estimated).
- **Carryover** / **Continuation** — based on the transition history: the task was already in work in a previous sprint (carried over / continuing).
- **Paused** — the task is in a paused state or has a pause tag (both are configurable).
- **In a sprint** — the task is already part of some sprint's composition (the current one or one from history). The badge tooltip warns you not to lay it out again. Visible in both pool views.

### Laying a task into a sprint

To send a task from the pool into the sprint composition:

1. Make sure a **target sprint** is selected at the top.
2. On the task card, click **To sprint**.
3. The **Lay into sprint** dialog opens: the plugin suggests the **roles for the sprint** — it automatically checks the roles by the task's zone, and you can adjust them manually. Next to each role its remaining resource is shown.
4. Click **Lay** — the task lands in the composition of the selected roles as "included in plan". If the task is already in the selected role's composition, it won't be duplicated.

After laying out, the task appears in the "Composition by roles" mode (section 6) under the corresponding roles — from there you work with it as usual (capacity, per-person distribution).

> 💡 "Working with the backlog" is the entry into a sprint "from the top", from the customer pool. If you already know the tasks you need, you can still add them directly with the "+ Pick tasks" button in a role's composition (section 6). Both paths lead to the same sprint composition.

---

## 6. Picking tasks and setting role capacity

When the sprint is created, you need to decide two things:

1. **How many hours** each role has for this sprint.
2. **Which tasks** go into it.

Both are done on the **Planning** tab in **Composition by roles** mode (selected by default). Below the **Sprint inputs** card is a list of roles as collapsible cards — one per active role.

### Collapsed role card

The collapsed view shows a short summary:

`▶ Analysis · Resource: 160 h · Allocation: 54 / 160 h · 7 tasks`

— that is, role capacity (160 hours), sum of hours by already picked tasks (54), and total task count (7). If task allocations sum exceeds capacity — a **⚠** badge appears (overlimit).

To start working with a role — click the card; it expands.

### Expanded role card

Inside — three blocks:

#### Role status

Top left — role status badge (*planning* / *reviewed* / *committed*) and a **Save role resource** button. It writes **only this role's resource** (the "Role resource" field below) without going through full sprint review. The shared parameters — name, dates, goal, Sprint/Version fields — are committed with the **Save sprint parameters** button in the **Sprint inputs** card (since v3.20.1 the role button neither validates nor writes them; values typed into the header are still picked up by autosave, as before).

#### Available resources

In the center of the card — the **Role resource** field in hours. This is the role's capacity for the sprint.

There are two ways to set capacity:

- **Manually** — just enter the number of hours (e.g. `160h` or `160 h`).
- **Calculated** — click the **Calculate resource** button: the plugin takes the monthly hour quota (January / May / other months — configurable, see [Appendix A](#appendix-a-full-reference-of-project-settings)), multiplies it by the rate, participation percent, and grade coefficients of the role's assignees, and inserts the result.

On the right — the **Resource remainder** badge: the difference between capacity and the sum of hours by tasks. It tells you whether there's still room to add tasks or whether the role is already overloaded.

> 💡 With the **Full** planning model, role capacity is not entered here: the field shows the **approved** capacity from the Capacity tab (see below) and is edited only there.

#### Sprint composition by role

This is the table of tasks that are in the sprint for this role. It's empty for a new sprint.

**To add tasks:**

1. Click the **+ Pick tasks** button above the table.
2. The picker dialog opens — type a YouTrack search query (e.g. `state: Open AND assignee: me`) or a title.
3. Check the boxes for the tasks you want and click **Add**. They appear in the table.

**What the table shows:**

| Column | Contents |
|---|---|
| ID | YouTrack task identifier (clickable link). |
| Subsystem | Value from the corresponding YouTrack field — helps grouping. |
| Priority | Standard task priority. |
| Cross-priority | Second priority, if your project uses two different ones. |
| State | Current task state (Open, In progress, Done, etc.). |
| Title | Task title. |
| Resource | Remaining work for this role: estimate minus actual. |
| Allocation | Hours you plan to allocate to this task in this sprint. Editable inline. |
| Inclusion status | How the task participates in the sprint: *planned*, *unplanned*, *pending*, *excluded*. By default all added tasks are *planned*. |

**To recalculate to "defaults":** the **Recalculate remainder** button auto-fills the **Allocation** column with remaining work (`estimate − actual`) for all tasks whose allocation hasn't been set manually.

**To remove a task from the sprint:** the trash icon at the right end of the row.

**To refresh data from YouTrack** (if someone changed an estimate or state in parallel): one shared **Refresh from task** button above the list of role cards (next to the **Hide tasks excluded from sprint** switch). It refreshes the tasks of the whole sprint across all roles at once — the role cards have no buttons of their own. The **By assignees** page and the chart keep their own refresh buttons.

### Working with multiple roles

If, for example, three roles are active in the project (Analysis, Platform development, Testing) — repeat the steps for each role:

1. Expand the role card.
2. Set capacity.
3. Pick tasks.

Cards are independent — you can expand all three at once or work with one and keep the others collapsed.

### Sorting tasks in the table

Click the **ID**, **Priority** or **Cross-priority** column header to sort. The ▼ icon shows the active column, ↕ — sortable. Clicking the same column again returns to the original order. The chosen sort order is remembered between visits.

### When composition is ready

When tasks are picked, capacity is set, and the sum of hours fits within capacity — the role composition can be **reviewed**: the **Confirm composition** button in the expanded card. What this means — see [section 10](#10-sprint-stages-review-commit-complete).

Each role is reviewed separately on purpose — so a team where one role is ready earlier than the others doesn't have to wait for everyone.

### The Capacity tab: calculation and approval (the "Full" model)

> Appeared when the "Full" model was unlocked (v2.16.0). The **Capacity** item is shown in the navigation tree right below "Sprint parameters" — only with the "Full" planning model (see [Appendix A](#appendix-a-full-reference-of-project-settings)).

With the "Full" model, role capacity is neither entered manually nor calculated by a button in the role card — planning consumes the **approved** capacity computed on this tab from the production calendar, grades and people's absences.

What's on the tab:

- **Sprint selector.** The calculation targets a specific sprint (its dates are required). Historical sprints open with a "Read-only (historical sprint)" note.
- **"By roles" / "By persons" view switch.** "By roles" — the aggregated capacity of each role; "By persons" — the per-person breakdown (added in v2.18.0). When a sprint's capacity record is opened for the first time, each person's grade is taken from the per-assignee distribution (if it's already set there) rather than defaulting to "Mid".
- **The "Calendar & absences" block.**
  - The **production calendar** is uploaded as a CSV file: **Download template** → fill it in → **Upload CSV** (the button is visible to members of the settings manager group). If there's no calendar for the required year, the plugin warns ("No production calendar for: …") and falls back to "weekends = Saturday and Sunday".
  - **Upload to all projects** — the same CSV pushed to every project connected to the planner in one go. The button is visible only in the main-menu planner and only to global instance administrators; on completion you get a summary "Calendar updated in X of N projects" (added in v2.18.0).
  - **Absences** are marked per person: select a person on the left, mark the days and set the **absence type** — Vacation, Sick leave, Out of team, Regional holiday, Training, Team leading, Other. An absence can be **partial**: instead of "full day", enter the number of hours in the "Partial day, h" field — only that share is subtracted from capacity (added in v2.18.1). The **Save absences** button commits the changes.
- **Status and approval.** **Save** stores a draft of the calculation; **Approve** makes the capacity effective — the approved numbers are what feeds "Role resource" and "Available resources" on the Planning tab. Record statuses: **"Not approved"** → **"Approved"** → **"Changed after approval"** (after editing an approved record, re-approve it). Approving is blocked while over limit.
- **The "Archive (N)" spoiler** at the bottom — capacities of old sprints move to a read-only archive automatically (content loads on expand), so the working record doesn't balloon (added in v2.18.1).

---

## 7. Distributing tasks among assignees

Once role compositions are picked, you usually need to decide **who specifically does what** and on which days. That's what the second mode of the **Planning** tab — **By assignees** — is for.

> **Depends on the planning model.** This section is available with the **Light** and **Full** models (the [Capacity management](#appendix-a-full-reference-of-project-settings) section); with "Full", per-person resources come from the approved capacity (see [section 6](#6-picking-tasks-and-setting-role-capacity)). With the **Simple** model the **Per-assignee distribution** nav item is **hidden**: no per-person capacity accounting is done, role capacity is entered **manually** on the "Shared resource allocation" tab, and task owners are assigned directly on the [Gantt chart](#8-calendar-timeline) — clicking a task opens the assignee picker.

### How to enter

At the top of the page there's a mode switcher:

`[ Composition by roles ] [ By assignees ] [ Stand-up ]`

Click **By assignees** — or in the expanded role card, click **→ Open in per-assignee distribution mode**. The active role is preserved automatically.

### If assignees haven't been picked yet for this role

You'll see a placeholder: *"No assignees picked for role «Analysis» yet"* and a **➕ Pick assignees** button. One click — and the plugin offers a list of people from the corresponding YouTrack assignee field, ticks those mentioned in the role's tasks, and immediately calculates their capacities by the quota.

### What's on the page

#### Role selector at the top

Role dropdown. The active role is shared with the first mode and the Gantt chart: if you switch back to **Composition by roles**, the role stays the same.

#### "Available resources" block

Shows three lines:

- **Role resource** — hours set for the role (same value you saw in **Composition by roles**).
- **People sum** — sum of capacities across all assignees.
- **Match indicator** — ✅ matches, 🟡 underfilled, 🔴 over.

This lets you see whether the sum across people is consistent with the declared role capacity.

#### "Assignee resources" table

List of assignees participating in the role. For each:

- **Full name.**
- **Grade** — Intern / Junior / Mid / Senior. Affects capacity calculation through a coefficient. With the "Full" model and an **approved** sprint capacity, the grade here is read-only (with a "set on the Capacity tab" hint next to it) — the resource comes from the approved record; until capacity is approved, the grade is editable as usual.
- **Resource (h)** — how many hours this person is committing to the sprint. Editable inline.
- **Allocations by project** — a small list of "task · hours · percent" with tasks assigned to this person.
- **Remainder** — how many hours the person still has unallocated.

Buttons above the table: **+ Pick assignees**, **Clear** (remove all), **Refresh from task** (pull fresh assignees from YouTrack).

#### "Task distribution" table

This is the main table of the mode. Each row is a task in the role:

| Column | Contents |
|---|---|
| ID | Task identifier. |
| Title | Title. |
| Priority / Cross-priority | Standard. |
| Allocation (h) | Hours for this task within this role. |
| Subsystem | From the corresponding YouTrack field. |
| State | The task's current YouTrack state — read-only, for orientation while distributing (the column appears when the state field is mapped; added in v2.19.0). |
| Assignee | Dropdown: pick which person from those selected does the task. Can leave as **— Unassigned —**. |
| Start / Finish | Dates when the person plans to start and finish the task. |

Changes in this table are saved automatically — a separate save button isn't needed.

### Auto-forecast of start and finish dates

> Added in v3.1.0. The button is visible when the configurator enables **Auto-forecast dates** in the "Planning modes" section ([Appendix A](#appendix-a-full-reference-of-project-settings)).

The **Forecast dates** button computes the planned Start / Finish dates of all distributed tasks automatically:

- **The assignee's sprint capacity** (approved business capacity in the Full model, personal resource in Light) is spread over the sprint days respecting the production calendar and absences (including partial days), with a daily "useful hours" cap from settings.
- **Tasks are laid out sequentially** — in the order of the assignee's personal queue (see below). The dates are written into the same fields as manual input: the Gantt chart, exports and history treat forecasted dates like regular ones.
- **What doesn't fit, honestly doesn't fit.** Tasks over capacity stay without dates, get an "over capacity" badge and a summary warning. That's a signal to revisit the scope or the capacity — not to cram at any cost.

#### The assignee's personal queue (the "#" column)

In the task-distribution table every task has a number in its assignee's queue and **↑ / ↓** arrows. The queue defines the layout order for the forecast; swapping two tasks instantly recomputes that assignee's forecast. The order is stored in the dates themselves — there is no extra field, and sprint history doesn't grow.

#### Good to know

- **Re-running the forecast overwrites all dates** (after a confirmation) — including manually adjusted ones. Make manual corrections after the final forecast run: they persist until you recalculate again.
- **The forecast is an explicit action.** Changing an assignee or an estimate does not recompute dates by itself.
- After the forecast you can also adjust dates with the mouse — by dragging bars on the [Gantt chart](#8-calendar-timeline) (v3.2.0).

### Buttons at the top of the page

- **Calculate resource** — recalculates resources for all assignees by the hour quota and grade (useful if quota settings or roster changed).
- **Save distribution** — force-saves the **per-person distribution** (assignees, dates, people's resources) and updates the sprint's history record without waiting for the background autosave (called "Save parameters" before v3.20.1). The role resource is saved by **Save role resource** in the role card; the shared sprint parameters — by **Save sprint parameters** in the Sprint inputs card.
- **Confirm distribution** — moves the sprint from the *reviewed* stage to *committed*. When to click — see [section 10](#10-sprint-stages-review-commit-complete).

### Good to know

- **Change an assignee in one table → it updates everywhere.** Change an assignee via the dropdown here — the corresponding bar on the Gantt chart (see [section 8](#8-calendar-timeline)) immediately recolors. No two-way drift between views.
- **If someone changed an assignee directly in YouTrack** — click **Refresh from task**: the plugin pulls fresh values for all sprint tasks (up to 200 at a time).
- **Switching roles with unsaved changes** — the plugin asks for confirmation so you don't accidentally lose your distribution.
- **If an old completed sprint is selected** — all fields are greyed out (read-only). To change the distribution, open the sprint for editing from history (see [section 11](#11-sprint-history-and-re-editing)).

---

## 8. Calendar timeline

The **Gantt chart** tab shows the tasks of the active sprint on a timeline — what's in which state on which days. Each task is one horizontal bar; **bar color matches the task's state** (native YouTrack state colors), bar length matches the **Start / Finish** date range (set manually in **By assignees** mode, by the [auto-forecast](#7-distributing-tasks-among-assignees), or right here by dragging). Since v3.2.0 the chart runs on a full Gantt engine: bars can be dragged with the mouse and the scale can be zoomed.

### What's on the page

- **Role selector at the top.** The chart always shows tasks for **one role** — this is intentional, so the chart doesn't turn into a mess. If you have three roles, switch between them with the selector.
- **Day / Week / Month zoom buttons** — scale density: "Day" for working inside the sprint, "Week" and "Month" for longer ranges.
- **Task list on the left** — the YouTrack ID (as a link), the assignee, and the **current state badge** (in the state's color). If the state changed recently, the previous state and how many days ago it changed are shown under the badge.
- **Date scale at the top**; **today** is highlighted with a vertical stripe.
- **Colored bars** — tasks; hovering shows a tooltip with the ID, title, assignee and dates. Tasks without a state are grey; tasks without their own dates are drawn across the sprint boundaries.
- **Refresh from task button** — pulls fresh assignees, task states and their transition history from YouTrack and re-renders the chart (useful if something changed in parallel).

### What you can do directly on the chart

#### Drag or resize a bar → change the dates

A bar can be **dragged as a whole** (both dates shift) or **stretched by its left/right edge** (only Start or Finish changes). The new dates are immediately written into the same Start / Finish fields as in **By assignees** mode — the section 7 table, exports and history see them as regular dates. This is the fastest way to manually adjust the [auto-forecast](#7-distributing-tasks-among-assignees) result.

> ⚠ Dragging requires date-editing permissions (the **Sprint Editing** or **Assignee-and-date-only** groups) and an editable sprint. An old sprint without an edit draft is view-only: bars don't move.

#### Double click on a bar → reassign

A small dialog opens with the list of all picked assignees for the role plus **— Unassigned —**. Pick the person and click **Apply** — the assignee is **written back to the YouTrack task**. A single click doesn't change the assignee: it selects the bar and starts a drag.

> ⚠ This works only if **Direct editing of YouTrack issue fields** is enabled in settings (see [Appendix A](#appendix-a-full-reference-of-project-settings)) and you have edit permissions. If disabled, the plugin won't write changes back to YouTrack — and reassign is blocked, so you don't end up with "I changed it locally, but the YouTrack task still has the old assignee".

### If the chart is empty

Possible reasons:

- The selected role has no tasks — add them in **Composition by roles** mode.
- Neither the tasks nor the sprint itself have dates (sprint dates are usually enough: tasks without their own dates are drawn across the sprint boundaries).
- An old sprint without an edit draft is selected — the chart is in view mode. To edit, open the sprint for editing from history.

---

## 9. Daily stand-up view

There's a third mode on the **Planning** tab — **Stand-up**. It's made for short daily team meetings: open the mode, walk through the task states, close the meeting in 5 minutes.

### What it shows

The sprint's tasks, grouped into **sections by their real states** — the same values that sit in the State field of the YouTrack issues. Section order and chip colours come from the field's value set in the project, so the picture matches the YouTrack boards. Every state of the set is shown, empty ones included; tasks without a state are collected into a "No state" section at the end.

Each section is a **spoiler**, collapsed by default: at the top you see a compact "state · task count" overview and expand only what you're discussing. A task card shows: task ID, title, assignee, actual/planned hours.

The selector at the top switches whose tasks you're looking at:

- **All roles** (default) — the combined composition of all active roles in the sprint: hours are summed plan/actual across roles, assignees are listed, each task shows a role badge.
- **A specific role** — only its tasks. If a **state → roles mapping** is configured in the stand-up settings, the role sees sections only for its own states, and its tasks that ended up in other roles' states land in a summary **Other states** section with the actual state as a label. Without a mapping, every state is shown.

States that aren't needed at the meeting (long-closed ones, for example) can be **hidden** by the admin — the section disappears together with its tasks.

### How to use

1. Open the **Planning** tab.
2. Switch to **Stand-up** mode.
3. Keep **All roles** or pick a role in the selector at the top.
4. If a sprint goal is set, it's shown as a large banner on top.
5. The team walks through the sections in state order: expand a section, talk through its tasks, collapse it.
6. To refresh — click **🔄 Refresh**, which re-reads YouTrack data (in **All roles** — for every role at once).

### Important to know

- **This is read-only.** You can't drag tasks between sections or change assignees here — just look. Any edits go in the other modes of the Planning tab or in the YouTrack issue itself.
- **If a section you expect is missing** — either the state is hidden in the stand-up settings, or it isn't in the selected role's state → roles mapping (then look for the tasks under **Other states**). The settings are described in [Appendix A](#appendix-a-full-reference-of-project-settings).
- **No "Blocked" section.** Task blocking info isn't shown by the plugin yet — this may appear in future versions.
- **Sprint goal.** If the field was filled in when the sprint was created, it's shown on top as a reminder to the team about the main outcome they're working toward. If not — there's a soft suggestion to add it.

---

## 10. Sprint stages: review, commit, complete

A sprint in the plugin goes through **four sequential stages**:

```
planning → reviewed → committed → finished
```

Each stage is a **fixed checkpoint** you can return to (see [section 11](#11-sprint-history-and-re-editing)). Stages aren't "hard gates" — you can always go back if you need to fix something.

Stages are **separate per role**. If three roles are active in the project, each has its own status. The plugin header shows a **rolled-up** status by the least-advanced stage: e.g. if two roles are in *committed* and one is in *reviewed*, the header shows *reviewed*.

### Stage 1. "Planning"

**What it means:** a freshly created or reopened sprint. Composition isn't fixed; you can freely add and remove tasks, change hours and assignees.

**What's available:**
- Picking and removing tasks in **Composition by roles** mode.
- Setting role capacity.
- Distributing assignees in **By assignees** mode.

**When to move forward:** when the role's task composition is picked and the team is ready to commit to it.

**What to click:** in the expanded role card — **Confirm composition**. The plugin checks that name, dates, and at least one task are set, and moves the role to *reviewed*.

### Stage 2. "Reviewed"

**What it means:** the role's composition is fixed — tasks, estimates, capacity. You can work on per-person distribution.

**What's available:**
- Changing assignees and start/finish dates in **By assignees** mode and on the Gantt chart.
- Changing allocation hours (within role capacity).
- Adjusting per-person capacities.

**What's not allowed:**
- Changing **composition**: if you try to add or remove a task, the plugin warns that this will reset the role back to *planning*.

**When to move forward:** when every task in the role has an assignee and the sum of hours across people matches the role capacity.

**What to click:** in **By assignees** mode — **Confirm distribution**. The role moves to *committed*.

### Stage 3. "Committed"

**What it means:** the plan is fully fixed. The sprint is running, the team works, and people mostly come into the plugin to look at the Gantt, run the stand-up, or — when needed — reassign someone on the fly (if [inline field editing](#appendix-a-full-reference-of-project-settings) is enabled).

**What's available:**
- Reassigning via the Gantt chart or **By assignees** mode.
- Adjusting start/finish dates.

**What's not allowed:** changing composition, role capacity, allocation hours. Tables become greyed out and not editable.

If during the sprint you need to make a change that's blocked — you have to **open the sprint for editing** in Sprint history. This creates a working copy (edit draft) without destroying the fixed plan. Details — in [section 11](#11-sprint-history-and-re-editing).

**When to move forward:** when the sprint has actually ended.

**What to click:** on the **Sprint history** tab, in the current sprint's card — the **✓ Finish sprint** button.

### Stage 4. "Finished"

**What it means:** the sprint is closed for good. Composition, assignees, actual — all frozen in history.

Clicking **✓ Finish sprint** opens an outcome dialog:

| What's in the dialog | What you do |
|---|---|
| **Sprint goal** | Shown as a reminder (read-only). |
| **Outcome** | Pick: ✅ **Achieved**, ⚖ **Partial**, ❌ **Not achieved**. Required field — **Confirm** is disabled without it. |
| **Retro note** | Optional: 1–2 sentences about what worked or didn't. Visible in history. |
| **Cancel** | The sprint **doesn't finish** and stays in the *committed* stage. |
| **Confirm sprint** | Final close. |

After **Confirm**, the sprint moves to *finished* and its history card gets a green outcome badge.

**If the sprint has several roles**, you don't have to finish each one separately: the header of the sprint's group card in History has a **Finish all roles** button — one outcome dialog and one confirmation for all the sprint's roles that aren't finished yet. The per-role **✓ Finish Sprint** button stays — for the cases where roles close at different times. If one of the sprint's roles is already finished, the outcome dialog is **prefilled** with its outcome and retrospective note — a sprint has one outcome, no need to write it again.

> 💡 The outcome dialog can't be bypassed with a stray click — even if you try to finish without picking an outcome, **Confirm** stays disabled. This is intentional, so every finished sprint has an explicit assessment.

### What if you "miss the stage"

- **Accidentally clicked Confirm composition** and now can't change tasks — open the sprint for editing from history (see [section 11](#11-sprint-history-and-re-editing)), make the edits, and reconfirm.
- **Accidentally finished a sprint** — same thing: **Open for editing**, edit, re-finish with an outcome.
- **Changed your mind about closing the sprint** already in the outcome dialog — click **Cancel**. The sprint stays as it was.

---

## 11. Sprint history and re-editing

The **Sprint history** tab shows all reviewed sprints of the project — 10 per page, newest first. It's both an archive and the entry point for two important actions: **open a sprint for editing** and **finish a sprint**.

### Sprint card in history

Each sprint is a collapsible card with metadata:

- Name and dates.
- Status (reviewed / committed / finished).
- Who last confirmed and when.
- Sprint goal and outcome — if set.
- Task count and resource remainder.

Click the card — it expands and shows the full task table with assignees and hours. The roles of one sprint are grouped under a shared sprint header; while at least one role is unfinished, the header has a **Finish all roles** button (see [section 10](#10-sprint-stages-review-commit-complete)).

### What buttons are on the card

| Button | What it does |
|---|---|
| **Excel** | Exports the sprint to Excel (tasks, estimates, actuals, allocations, assignees). Convenient for reports and discussion outside the plugin. |
| **JSON** | Exports **this single sprint** to a JSON file — for backup or transfer to another project/instance (see below). |
| **✏ Open for editing** | Creates an edit draft based on this sprint — see below. |
| **✓ Finish** | Available if the sprint isn't finished yet. Opens the outcome dialog (see [section 10](#10-sprint-stages-review-commit-complete)). |
| **🗑 Delete** | Full sprint deletion. Two-step confirmation. |

Separately, above the whole list, there are buttons: **🗑 Clear all history** (available only to members of a special group — see [section 14](#14-who-can-do-what-group-permissions)), **All history (JSON)** and **Import from file** — see below.

### Export and import history (JSON)

Beyond Excel (a report for a single sprint), the plugin can save and restore the entire history as JSON — a format for **backup** and **transfer** between projects or YouTrack instances.

- **All history (JSON)** (above the list) — exports all history sprints as a single file.
- **JSON** (on a sprint card) — exports only that sprint.
- **Import from file** (above the list) — loads a previously exported JSON. Before importing, the plugin shows a review dialog: how many sprints are in the file, which project/instance they came from, and lets you choose which ones to restore. The import **fully replaces** the current history with the selected sprints, so it's worth exporting "just in case" beforehand.

> 💡 JSON files are interchangeable between the community and corporate versions of the plugin — both formats are accepted on import.

### Edit draft: what it is and why

The main function of History is the ability to **change an already reviewed or finished sprint without losing the original**.

When you click **✏ Open for editing**:

1. An **edit draft** is created — a separate mutable copy of the chosen sprint.
2. The original sprint **doesn't change**. It stays in history in its original form until you "apply" the draft.
3. A visible colored banner appears in the plugin header: *"✏ Edit draft: Sprint 47 [Analysis] · original from 15.05.2026"* — a reminder that you're editing not the current sprint but a copy of an old one.
4. All planning modes become available for edits.

The draft banner has two buttons:

- **Show differences** — shows exactly what you changed compared to the original (added / removed / changed).
- **✕ Collapse** — hides the banner, but the draft is preserved. You can return later via **Continue editing** in history.

### How to apply the edit draft

When edits are done, you need to "apply" them. It depends on what exactly you changed:

| What you changed | What to click |
|---|---|
| Name / dates / goal / Sprint / Version only | **Save sprint parameters** in the Sprint inputs card. |
| Role resource only | **Save role resource** in the expanded role card. |
| Task composition, hours, capacity | **Confirm composition** — go through the review stage again. |
| Assignees or Start / Finish dates | **Confirm distribution** — go through the commit stage again. |

After applying, the draft disappears and the sprint in History is updated. A record of who edited and when stays in the sprint card (up to 200 latest edits).

### If someone is editing in parallel

- **You opened a sprint that a colleague is already editing.** The **✏ Open for editing** button is disabled; hover tooltip says *"Already editing: NAME"*. Coordinate directly and wait for them to finish.
- **You opened your own draft in a second browser tab.** A soft warning appears: *"Open in another tab"* with a choice — continue here or view-only.
- **When applying the draft, the original was rewritten in parallel.** A **Version conflict** dialog appears with three options:
  - **Overwrite with mine** — your edits become current, others are lost.
  - **Download both versions to Excel** — both versions export as files for manual merging.
  - **Cancel** — the draft is preserved, you can discuss and decide later.

### If you decide to discard the edit

In the History card of a sprint that has a draft, an **Discard edit** button appears — available only to whoever opened the draft. Two-step confirmation → the draft is deleted, the original isn't affected.

### Automatic cleanup of stale drafts

If an edit draft sits **more than 30 days without changes**, the plugin gently removes it on the next open and shows a short notification. This is a safety net against "abandoned" drafts blocking colleagues from opening the same sprint for editing.

---

## 12. Releases (release management)

> Added in v2.17.0 and **disabled by default** — the project's settings manager turns it on.

### What it is

Group project tasks into **releases** and walk each release through statuses — with mapped YouTrack State changes (previewed before applying), a readiness traffic-light, and an irreversible composition snapshot on close. A release is the plugin's own entity: native YouTrack «Versions» are not touched.

### Enabling and permissions

Plugin settings → the **Releases** section: the enable toggle, two permission groups, and the **«release status → task State» mapping** (which State the release's tasks get when its status changes):

- **Release managers (RM)** — create and edit releases, pick tasks, any status changes, cancellation, composition freeze. The plugin settings manager automatically has RM rights.
- **Release engineers (RE)** — can only advance the status to the next step in the chain.

Everyone else sees the tabs read-only — and can export releases to .txt.

### Tabs

Once enabled, **«Planned releases»** (cards of open releases) and **«Release history»** (closed snapshots) appear in the navigation.

### The release card

- **«Create release»** — name, kind (**Release / Hotfix**), source (**Internal / Vendor**), planned date, composition-freeze date, the release's RM/RE, patch note, notes, **release task link** (an optional URL — shown as a clickable link on the card, in history and in the .txt export; added in v2.19.0). Since v2.19.0 the notes are shown right on the planned card, not only in the edit form and history.
- **«+ Tasks»** — pick project tasks into the release. A task can be moved from another release — the plugin shows the collision and asks for confirmation.
- **Readiness traffic-light** — a composition summary: done / in progress / not started / no state. Zones derive automatically from the State field and the mapping anchor; an overdue planned date adds an **«Overdue»** badge.
- **Composition tree** — epic ▸ story ▸ task (from Subtask links), readiness rolled up from the subtree leaves; tasks without a parent are listed separately.
- **«Change status ▾»** — Planned → Preparation → In progress → **Released** / **Cancelled**. Closing is irreversible: the composition is frozen as a snapshot and the release moves to «Release history». If **task tags** are configured in the mapping (see below), entering a new release status removes the previous status's tag from the composition's tasks and adds the new one (added in v2.18.0).
- **«Update task states»** — a mapping preview (which task gets which State, with «already there», «diverged», «unreachable» marks) and bulk or per-task application to YouTrack tasks.
- **«❄ Freeze composition»** — blocks composition edits until explicitly unfrozen.
- **«⤓ Export to .txt»** — downloads the card (type, dates, patch note, notes, traffic-light, composition). Available to everyone including viewers; the button is on the live card and on history/archive records.

### History and archive

History records are spoilers with the at-close snapshot (traffic-light, composition tree, patch note/notes) and .txt export. When the history grows past ~300 KB, the oldest closed releases automatically move to a read-only **«Archive (N)»** spoiler at the end of the history.

---

## 13. Operational reporting

> The module appeared in v3.0.0 and is **off by default** — the project configurator enables it.

### What it is

A showcase of **14 reports** about what is actually happening to the project's issues: where they get stuck, how fast they reach the finish line, where the hours go, how accurate the estimates turn out. If the planner answers "what did we agree on", reporting answers "what is really happening".

Reports are computed **from live YouTrack data** (state-transition history, logged work, sprint snapshots) at the moment you build them — the plugin stores nothing and runs no nightly jobs. Open a report → the plugin reads YouTrack → shows the result. A report is therefore always current "as of now", and for capturing history there's Excel/PDF export (see below).

### Two contours and access

The reports are split into two contours with separate access via YouTrack groups:

- **"Operational (A)"** — 10 reports for leads and Scrum masters: the daily and weekly work with the task flow.
- **"Management (B)"** — 4 reports for management: monthly trends, technical debt, the "bug tax".

Access groups are set in plugin settings, in the **Reporting** section — these are separate groups, not reusing planning or release permissions. Membership in a contour-B group automatically grants contour A as well. Membership is also checked on the server — a hidden button is not the only line of defence.

Once the module is enabled, the navigation tree gets a **"Reporting"** group with the items **"Operational (A)"** and **"Management (B)"** — each person sees only the contours their groups grant. If you see neither, you are not in any reporting group — ask the project configurator.

### How to build a report

At the top of a contour page there's a control bar:

1. **Report** — a dropdown with the contour's reports.
2. **Period** — for "windowed" reports (Progress, TTM, Flow, Effort, Plan vs fact, Bug tax, Thousand small tasks): presets from "Today" to "Calendar year" plus "Custom range" (two dates). Snapshot reports (Aging, ITBP WIP/Done, Backlog in hours, Technical debt, Roll-up) don't ask for a period — they show the "now" slice (Roll-up itself looks 6 months back). Spillover picks a **closed sprint** instead of a period.
3. **Task filter** — a YouTrack query field (with suggestions, like the YouTrack search): the condition is AND-ed with the project scope. Available in contour A only.
4. **↻ Refresh** — re-read the data and rebuild the report.

If there's a lot of data and the report takes long to build, a **"⏹ Cancel"** button appears next to it. There's also a timeout backstop (90 seconds by default): on expiry the report cancels itself gracefully instead of hanging the tab.

> 💡 If a report shows a "…not set — configure…" hint instead of data — that's not an error. Every report needs its own configuration (thresholds, anchors, states, tags — see [Appendix A](#appendix-a-full-reference-of-project-settings), the "Reporting" section), and the hint tells you exactly what's missing.

### Reports of the "Operational (A)" contour

| Report | The question it answers |
|---|---|
| **Aging / stuck** | Which issues have been sitting in their current status longer than the threshold — "what's on fire now". Thresholds in working days (yellow/red) are set per status. |
| **Progress** | What entered the target statuses in the period — "what got done". Target statuses and their labels are configurable. |
| **ITBP WIP/Done** | A "now" slice of epics and solo stories: what's in progress and what's done — with business columns (stage, org unit, priority) from configurable fields. |
| **TTM · Time to Market** | Median delivery time for the period in working days: **Lead** (analysis → prod), **Team** (analysis → business testing), **Cycle** (dev-start → dev-done). A traffic light against the norms, pause subtraction (pause statuses and tags), Lead Time distribution buckets. Cycle is computed from development episodes (repeat rounds after returns are summed); how the "closed" milestone is read on reopen is configurable (see Appendix A). |
| **Flow** | The bottleneck (median days per flow status + WIP per status) and rework — backward transitions against the configured status order. |
| **Effort** | Hours by person and role for the period + a "no hours logged" list. |
| **Plan vs fact** | Estimate accuracy: average variance per role and the issues whose fact-vs-estimate variance exceeded the threshold. The estimate is taken "as it was" when the issue entered work — it can't be rewritten in hindsight. |
| **Backlog in hours** | How many "months of work" have piled up in the backlog per role: the sum of estimates divided by the role's monthly capacity. |
| **Spillover** | A closed-sprint debrief: underfulfilment by role, tails — carried into or dropped from the next sprint — and "zombie issues": how many consecutive sprints an issue keeps rolling over not-done. "Done-ness" is determined by the "Done" states list (the **Done states for Stand-up** setting in the Stand-up assist section; if the list is empty — the last two states of the state roll-up order). |
| **Team velocity** | Velocity by role from the snapshots of closed sprints: hours closed per sprint and the plan-completion percentage, with a rolling average over a window of recent sprints (the window size is a setting). |

### Reports of the "Management (B)" contour

| Report | The question it answers |
|---|---|
| **Roll-up** | The monthly trend of five metrics over the last 6 months, split by system, each metric as its own chart: TTM (Lead, median), estimate accuracy, bottleneck, backlog in months and backlog in hours. |
| **Technical debt** | Tech-debt volume (sum of estimates in person-hours) and its share of all issues — by role, split by system. Tech debt is selected by issue type or tag. |
| **Bug tax** | The share of engineering hours spent on bugs rather than features — by system and role. A bug is linked to its feature via the configured link types. |
| **Thousand small tasks** | The flow of small tagged tasks in the period versus the monthly pace year-to-date. |

The "system" in the reports is the value of the issue's **subsystem field** (the "Other Fields" → "System" setting).

### Charts in reports

Since v3.2.0 nearly every report has a chart above its table: **Progress** — transition tempo by day (by month on long periods), **Effort** — hours by assignee (top-12; the full list is in the table below), **Plan vs fact** — average variance by role in traffic-light colors, **Aging** — task counts by zone (ok / yellow / red), **Spillover** — carried/dropped stack by role, **Tech debt** and **Bug tax** — hours by role. TTM's distribution buckets and the five Roll-up trends have been there since v3.0.0; "A thousand small things" stays a counter. Charts show the same data as the tables — Excel/PDF exports carry the tables.

### Export to Excel and PDF

The **⭳ Excel** and **⭳ PDF** buttons download the current report as a file: the same data plus a header — project, period (or a "Snapshot (now)" mark) and generation time. Since the reports themselves store nothing, regular export **is** your archive: e.g. export the Roll-up at the end of every month and the history accumulates in files. The Excel files can travel further into a BI system if you have one.

---

## 14. Who can do what: group permissions

Access to different actions in the plugin is regulated through **YouTrack groups**. In plugin settings, the project admin specifies which group is responsible for which permissions.

Groups are **additive**: one person can be in multiple groups and gets the sum of their permissions.

### Eleven permission groups

| Group | What they can do |
|---|---|
| **Settings manager group** | Open the plugin settings dialog and change the whole configuration (YouTrack fields, active roles, quotas, permissions, modules). This is the "root" group — without it the project isn't connected to the planner and everything is read-only. The only group that is set **not in the plugin dialog** but in the app settings: Project Settings → Apps → Smart Sprint Planner (see [section 3](#3-first-time-setup-what-the-project-admin-configures)). |
| **Planning settings managers** | Can open the settings dialog and edit only the planning sections (roles and fields, other fields, planning modes, multi-role planning, stand-up, other). The administration sections (permissions, capacity, time tracking, cascades, backlog, releases, reporting) are not shown to them. |
| **Sprint Editing** | Full sprint editing: pick tasks, change hours, capacities, assignees, dates. Access to **Composition by roles** and **By assignees** both ways. A **required** group: while it's empty, nobody but the YouTrack instance administrator can save sprints. |
| **Sprint Validation** | Everything editors can, plus the ability to click **Confirm composition** and **Confirm distribution**, finish a sprint, open sprints for editing from history and apply drafts. Without this group, review and finishing are unavailable to everyone. |
| **Sprint creation lock** | Can flip the "sprint creation lock" toggle in the planner header. While the lock is on, existing sprints keep working but new ones can't be created. |
| **Assignee-and-date-only** | Limited permissions: can change **only** assignees and Start / Finish dates in **By assignees** and on the Gantt chart. Composition, capacities, status — not allowed. Useful for team leads who shuffle assignees inside a fixed sprint but shouldn't change "what was agreed". |
| **Release managers** | Full release management (when the «Releases» module is enabled, see [section 12](#12-releases-release-management)): create and edit, pick tasks, any status changes, cancellation, composition freeze. |
| **Release engineers** | Advance a release's status to the next step in the chain (Planned → Preparation → In progress → Released). Composition and release fields are read-only. |
| **Reporting: contour A** | See the "Reporting" group and the "Operational (A)" section — 10 operational reports (with the module enabled, see [section 13](#13-operational-reporting)). Grants no sprint-editing permissions. |
| **Reporting: contour B** | Everything contour A sees, plus the "Management (B)" section — 4 management reports. Contour-B membership automatically includes contour A. |
| **History cleaners** | See and can click **🗑 Clear all history** above the History list. A strong, irreversible action — usually given to 1–2 responsible people. |

**If a person isn't in any of these groups** — they see the plugin in read-only mode: they can browse compositions, charts, history, but editing buttons are hidden.

### How groups are configured

The settings manager group is set in the app settings (Project Settings → Apps → Smart Sprint Planner). All the other groups are picked in the **⚙ Plugin Settings** dialog: planning and history groups in the **Manage permissions** section, release groups in the Release management section, reporting groups in the Reporting section. Group names come from YouTrack — the same groups your project uses for other permissions.

The Release management section also has two **candidate pools** for release representatives (managers and engineers) — these aren't permissions but lists of people the responsible persons for a specific release are picked from.

> ⚠ **Groups are matched by name.** The plugin remembers the group's name, not its internal identifier. If you **rename** a group in YouTrack, its members lose access — open the settings and pick the group again under its new name. Nested groups are honoured: a member of a child group gets the parent group's permissions.

For details about which settings come by default and how they're named in the dialog — see [Appendix A](#appendix-a-full-reference-of-project-settings).

### Checking permissions

If you see a button hidden or a field greyed out — it's probably permissions. To check:

1. Ask the project admin which YouTrack groups you're in.
2. Cross-reference with the table above.
3. If permissions are missing — ask the admin to add you to the needed group.

> ⚠ Changing group membership is YouTrack administration, not an action inside the plugin. The plugin just reads which groups you belong to.

---

## 15. FAQ

**The plugin says «The sprint was modified by another user. Reload the page and try saving again» — what is this?**
Concurrent-editing protection (added in v2.17.0). Someone saved this sprint after you loaded it — your save was rejected so it wouldn't silently wipe their work. Reload the page (your view picks up their changes) and re-apply your edit.

**I changed something but I'm afraid to close the tab — will it really be saved?**
Yes. The plugin saves your changes to the server automatically in the background. If you close the tab, get a coffee, and come back an hour later — you'll see everything exactly as you left it. The **Save sprint parameters**, **Save role resource** and **Confirm** buttons are not for saving data, but for fixing sprint inputs and stages.

**I opened a sprint for editing from history but decided not to change anything. How do I go back?**
The banner *✏ Edit draft…* appeared in the plugin header. Click **✕ Collapse** on it — the plugin returns to normal mode, the draft is preserved (you can return to it later). If you want to delete it entirely — in the sprint's history card, click **Discard edit**. Two-step confirmation → the original isn't affected.

**Someone is already editing the sprint I need.**
Wait until your colleague finishes editing, or ask them to collapse the draft. The plugin doesn't allow forcibly "taking over" someone else's edit — this is a safety net against accidentally destroying their work. If a colleague's draft was forgotten and sits more than 30 days without changes — the plugin removes it automatically and the sprint becomes editable again.

**I changed only the sprint name but the status didn't change — is that normal?**
Yes. Metadata changes (name, dates, Sprint/Version fields) don't break review. The status is preserved; the draft banner shows a blue **parameters only** badge.

**I changed allocation hours in a committed sprint and the status reset to "reviewed". Why?**
This is intentional. Changing hours requires re-confirming the per-person distribution because the per-person sum may no longer match. Switch to **By assignees** for the role in question and click **Confirm distribution** — the status returns to *committed*.

**I added/removed a task in an edit draft and the status dropped to "planning". Why?**
Task composition is the most important content of a sprint. Any change to it requires going through all stages from the start: first confirm composition, then distribution. This ensures an accidentally added task doesn't "dangle" without an assignee or hours.

**When applying the draft, a "Version conflict" dialog appeared. What now?**
Someone changed the original sprint in parallel while you were editing the draft. Options:
- **Overwrite with mine** — your edits become current, others are lost. Pick this if you're confident your version is more current.
- **Download both versions to Excel** — both versions export as files, you can open and merge them manually.
- **Cancel** — the draft is preserved as-is; you can discuss with your colleague first and decide.

**I'm in "Assignee-and-date-only" but I can't change sprint composition.**
Correct behavior. This group is deliberately limited: you can change **only** the assignee and Start / Finish dates. Changing task composition, role capacity, status — requires the **Sprint Editing** or **Sprint Validation** group. If you need full permissions, ask the configurator to add you to the Sprint Editing group.

**Stand-up has no section for the state I need, even though there are tasks in it.**
Stand-up groups tasks by the real states of the project's State field, so there's no need to "explain" to it what counts as done. If a section isn't there, check two things in the plugin settings (**⚙ Plugin Settings → Stand-up assist**): whether the state is listed under **Hidden states in Stand-up**, and whether the selection for this role is narrowed by the **State → roles mapping** (then the role's tasks in that state are shown under **Other states**). Switching to **All roles** removes the role filter.

**I can't reassign a task by clicking a bar on the Gantt chart.**
Since v3.2.0 reassign is a **double click** on the bar: a single click selects the bar and starts a date drag. Besides that, reassign only works when **Direct editing of YouTrack issue fields from sprint table** is enabled in settings (the Planning Modes section). This is intentional: if the plugin can't write the change back to the task, the reassign would only be "local" and the YouTrack task would still show the old assignee — a source of confusion. To enable, ask the plugin configurator (or do it yourself if you have rights) to turn on the corresponding option in settings.

**The "External ID" column doesn't appear in tables.**
Check the plugin settings, in the **Other Fields** section, for the **External ticket ID** field. If empty — the column is hidden. If filled with a YouTrack field name — the column appears, but only for tasks that have a value in that field (rows without an external ID just skip the cell).

**A reminder "Sprint goal not set" appeared. Can I ignore it?**
Yes. It's a soft reminder that doesn't block saving. Fill in the Sprint goal field if you want to see it during the daily stand-up and assess the outcome at sprint close. If your team doesn't use sprint goals — just ignore the reminder or fill in any meaningful text.

**Where do I see error logs if something doesn't work?**
At the bottom of the plugin there's a collapsible **Diagnostics** block — all server calls, errors, and warnings are logged there. The **Export TXT** button downloads a **state snapshot** — a file with the plugin version, YouTrack environment, effective settings, planner state slices (working sprint, selected sprint, role compositions, history snapshots) and the error tail of the log. Attach this file to a support request if you run into issues — it shows the full picture without follow-up questions. Since v2.17.0 the block is **hidden by default** — enable it in settings (**Other → Show diagnostic log panel**).

---

## Appendix A. Full reference of project settings

This is the complete list of settings the project admin configures in the **⚙ Plugin Settings** dialog (the button in the planner header). The dialog uses a two-pane layout: a navigation list of sections on the left, the active section on the right. The administration sections (marked with a lock) are visible only to members of the settings manager group; a planning settings manager sees just the planning sections.

> Most users don't need to go here. This section is for the project configurator.

### App settings (Project Settings → Apps → Smart Sprint Planner)

Two parameters live **outside the plugin dialog** — in the app's card in the YouTrack project settings:

- **Plugin settings manager group** — who can open the settings dialog and change configuration. Until it's set, the project doesn't appear in the planner and everything is read-only. It can't be set from inside the plugin — deliberately, so a fresh project can't be "taken over" from within.
- **Verbose logging** — writes debug messages to the YouTrack server log. Off by default; enable only while investigating an incident.

### "Roles and issue fields" section

One table: a row per functional role (9 rows: Analysis, Testing, Platform development, Backend, Frontend, iOS, Android, Fullstack, Database), columns — the active checkbox and three YouTrack fields. Ticked roles get their lanes in planning; fields are picked only for active roles:

- **Estimate field** — where planned hours are stored (e.g. *Estimation*).
- **Actual field** — where actual spent hours are stored (e.g. *Spent time*).
- **Assignee field** — who's responsible for the task in this role (e.g. *Assignee*, *Developer*, *Tester*).

The same estimate (or actual) field can't be assigned to two roles — the form highlights the duplicate.

### "Manage permissions" section (administration)

- **Planning settings manager** — who can edit the planning sections of this dialog without touching permissions and automation rules.
- **Sprint Validation** — who can confirm (**Confirm composition**, **Confirm distribution**) and finish a sprint. **Required for review**: without a group, validation is unavailable to everyone.
- **Sprint Editing** — who can save composition, capacities, assignees and sprint parameters. **Required**: without a group, writing is closed for everyone except the instance administrator.
- **Full Sprint History Clearing** — who sees the **Clear all history** button.
- **Assignee & Dates Edit (Assigner)** — limited permissions: only assignees and Start / Finish dates.
- **Sprint creation lock** — who can flip the "sprint creation lock" toggle in the planner header.

Every field has a hint underneath saying exactly what the group grants. How groups are matched and why renaming a group in YouTrack breaks access — see [section 14](#14-who-can-do-what-group-permissions).

### "Other Fields" section

Shared fields for all roles.

**Main:**

- **Priority**, **State**. If not selected — the project field named *Priority* / *State* is used; saving isn't blocked, but a "Required fields are not set" warning is shown.

**Optional:**

- **Cross Priority**, **System** (subsystem), **Sprint Field**, **Version**.
- **External ticket ID** — if your tasks come from an external system (Service Desk, 1C, SAP, legacy JIRA) and the YouTrack task has a text field with the ID from that system. If set — an **External ID** column appears in tables as the second column after the YouTrack ID.
- **Type** — the issue type field (Feature / Bug / Spike…) whose values drive the type filter in the **Working with the backlog** module. Changing the field resets the backlog filter.

### "Capacity management" section (administration)

An admin section: visible and editable only by the project settings manager (a member of the settings manager group); a planning settings manager doesn't see the administration sections. It gathers everything that affects role and per-person capacity calculation.

The section opens with the **Planning model** dropdown (described below) — it decides what's shown further down. With the **Light** and **Full** models, these unfold under it:

- **Working hours per day** and **Useful hours per day** — the length of the working day and the share of it that can actually go to tasks. These numbers are read by the capacity calculation, the date auto-forecast and the time-tracking rules.
- The calculation quotas and grade coefficients (below).

With the **Simple** model these blocks aren't there — role capacity is entered as a single number and the quotas aren't used.

**Calculation quotas** — used by the **Calculate resource** button:

- **Hour quotas** — separately for **January**, **May** and **other months** (in Russia, January and May are short due to public holidays).
- **Rate** — general multiplier for all calculations.
- **Participation percent** — what fraction of their working time a person spends on this project.
- **Grade coefficients** — separate multipliers for **Intern**, **Junior**, **Mid** and **Senior**.

Formula: `month_quota × rate × participation_percent × grade_coefficient`.

**Assignee resource source** — chosen with a single **Planning model** dropdown:

- **Simple** — no per-person calculation: just shared resource allocation by role. The "Per-assignee distribution" tab is hidden, role capacity is entered manually, and assignees are set directly on the Gantt chart. This is the lightest mode for small teams.
- **Light** — per-person resource calculation; the "Per-assignee distribution" tab appears. Additionally, a **resource calculation method** is chosen:
  - **Auto-calculate by formula** — people's capacity is calculated from the quota (the formula above), and their sum is automatically filled into the role's resource (the field becomes read-only).
  - **Manual per-assignee entry** — each person's capacity is entered manually in hours instead of being auto-calculated from grade.
- **Full** — the planner consumes **approved** business capacity (unlocked in v2.16.0). A **Capacity** tab appears in the navigation tree (see [section 6](#6-picking-tasks-and-setting-role-capacity)): per-sprint personal capacity calculated from the production calendar, grades and absences, "By roles" / "By persons" views, record approval. The "Role resource" field and per-person resources become read-only — approved capacity is their only source.

> Before version 2.14.0 these were three separate toggles ("Personal-planning mode" + two sub-modes). Now it's a single dropdown; the modes' behavior is unchanged.

### "Effort tracking" section

Automatic split of task-logged time across different roles' actual fields.

- **Enable differentiated effort tracking.** If enabled, when hours are logged on a task the plugin looks at the **work item type** (Development / Testing / Analysis etc.) and puts the hours into the corresponding role's actual field.
- **Enable plan/fact ratio control notifications** — a switch nested under the master toggle: without effort tracking the notifications don't work.
- **Type → role map** — a table of mappings: e.g. `Development → Frontend`, `Testing → Testing`. One type → one role. Inactive roles in the map are ignored with a warning.

While the master toggle is off, the sub-fields are shown dimmed but stay editable — you can set everything up in advance and switch it on with one click. The "Cascade aggregation", "State rollup" and "Releases" sections work the same way.

### "Cascade aggregation" section

Automatic roll-up of estimates and actuals from child tasks to parent containers.

- **Enable cascade aggregation.** When a task's estimate or actual changes, the plugin sums that field across all "siblings" and writes the result to the parent task. If the parent is a container (e.g. a Story with subtasks) and the Story itself rolls into an Epic, the Epic is recalculated too.
- **Forbid logging on container tasks.** If enabled, logging or editing time entries on container tasks (Story, Epic) is blocked. This is a safety net: without the ban, cascade aggregation would overwrite "direct" logging on the next run.
- **Type field** — which YouTrack field stores the task type (default *Type*).
- **Level-2 types** — what counts as a first-level container (default *Story*).
- **Level-3 types** — what counts as a second-level container (default *Epic*).
- **Parent ← child link name** in both directions (default — built-in *Subtask* link).

> ⚠ If cascade aggregation is enabled but the "forbid container logging" is off, the plugin shows a warning in settings. This is a "dangerous combination" — recommended to enable both together.

### "State rollup parent ← children" section

Automatic recalculation of parent (Story / Epic) state from children states. The parent gets the **least-progressed** state among its children — there is no other strategy to choose from.

- **Enable state roll-up.**
- **State order** — ordered list of states from "least progressed" to "most progressed". E.g. `Open → In progress → Ready for review → Done`.
- **Resolved states** — states in which the parent task is **not recalculated**. This protects against the situation "Epic is Done, but one forgotten Story moved back to In progress — Epic rolled back". Typically: *Done*, *Closed*, *Cancelled*.
- **Floor state** (optional) — the state below which the parent doesn't drop. E.g. if set to *In progress*, the Epic won't "bounce back" to *Open* because of one returned Story.

After setting the state order, a **🔄 State roll-up: on/off** chip appears at the bottom of the plugin.

### "Stand-up assist" section

Stand-up groups tasks by every state of the project's State field (see [section 9](#9-daily-stand-up-view)); here you configure what of it to show.

- **State → roles mapping** — a "state — roles" table. In a single-role view only the sections of that role's states are shown; the role's tasks in other states go to the **Other states** section. Empty — every state is shown. Row order doesn't matter — section order is dictated by the field's value set.
- **Copy from backlog zones** — copies the mapping from the pipeline zones of the **Working with the backlog** module, so you don't enter the same thing twice. Disabled while there are no zones.
- **Hidden states in Stand-up** — sections of these states (together with their tasks) aren't shown in Stand-up.
- **Done states for Stand-up** — which states count as "done". Stand-up itself doesn't read this list (it groups by every state of the set); it's used by reporting — Spillover, Team velocity and the bug resolution time in Bug tax (see [section 13](#13-operational-reporting)). If the list is empty, the last two states of the state roll-up order are taken.

### "Planning Modes" section

- **Direct editing of YouTrack issue fields from sprint table.** If enabled, the plugin can write assignee / state / priority changes back to the YouTrack task directly from sprint tables (with a confirmation). Without this mode, all changes stay local to the plugin.
- **Allow planning over the limits** — when enabled, a role's resource overlimit **does not block** the "Validate" button and doesn't trigger a warning dialog. A negative remainder is still highlighted in red as an indicator, and a mode chip is shown in the plugin header. Off by default (overlimit blocks validation).
- **Auto-forecast dates** (v3.1.0) — enables the **Forecast dates** button and the "#" queue column on the **By assignees** level (see [section 7](#7-distributing-tasks-among-assignees)). Off by default. With the "Simple" planning model the toggle isn't shown — there's no per-person level in it.

### "Backlog" section

Configures the **Working with the backlog** module (see [section 5](#5-working-with-the-backlog)). The "Working with the backlog" item appears in the navigation tree only after at least one zone has been added.

- **Start states (customer pool)** — the states in which a task counts as "new", not yet taken into work. They form the top "Customer pool" bucket.
- **Pipeline zones (state → role)** — a table of stages: each zone is mapped to a state and one or more roles working at that stage. The zone order = pipeline order (changeable with arrows). A single state cannot be mapped twice. These zones drive the "By zones" view and the role auto-suggestion when laying a task into a sprint.
- **Type filter** — which task types to show in the pool (values of the type field). The type field is taken from the "Other Fields" section → **Type**; changing that field resets the filter.
- **Pause states** / **Pause tags** — states (or comma-separated YouTrack tags) by which a task in the pool is marked with the "Paused" label.

### The «Releases» section

- **Enable release management** — the module's master toggle (see [section 12](#12-releases-release-management)). While off, there are no release tabs.
- **Release manager groups** and **release engineer groups** — who manages releases and who advances statuses.
- **Representative candidate groups** — which groups the RM/RE of a specific release are picked from (separate from the permission groups).
- **«Release status → task State» mapping** — the target task State for each release status; the «Planned» status serves as the traffic-light zone anchor.
- **Task tag** (a column in the same mapping, optional; added in v2.18.0) — a YouTrack tag applied to the composition's tasks when the release enters a status; the previous status's tag is removed at the same time. Pick **existing** tags: an auto-created tag would be private to its owner and invisible to everyone else.

### "Reporting" section (administration)

Settings of the operational reporting module (see [section 13](#13-operational-reporting)). While the master toggle is off, there's no "Reporting" group in the navigation.

- **Enable reporting module for the project** — the master toggle.
- **Reporting access** — the **"Contour A — operational (leads)"** and **"Contour B — management"** groups. Separate reporting groups (not reusing planning/release permissions); contour-B membership also grants contour A; membership is checked on the server as well.
- **Aging thresholds (per status)** — working days in a status before the yellow/red flag in "Aging / stuck". An empty row means the status isn't monitored; red must exceed yellow.
- **Progress (A1) — target statuses + labels** — entry into which statuses counts as movement, and the caption shown in the report.
- **TTM anchors** — start/end state pairs for the **Lead** (analysis → prod), **Team** (analysis → biz-test) and **Cycle** (dev-start → dev-done) metrics. The start milestone is the first entry into a state; the end milestone follows the "Terminal milestone on reopen" setting (below). A metric is computed only when both ends are set. Cycle sums **development episodes**: every "start anchor → end anchor" round adds to the metric (time between episodes — testing, waiting — is not counted).
- **TTM norms, workdays** — "Lead ≤" and "Team ≤" (21 and 15 by default); a median above the norm is flagged by the traffic light. Cycle has no norm.
- **Terminal milestone on reopen** (v3.2.0) — how "closed" is read when a task was reopened: **First close** (default) — the metric stops at the first entry into the end anchor, a reopen doesn't extend it; **Settled (last) close** — the metric end and the period membership follow the last entry, and Cycle sums all development episodes. Affects the TTM report and the TTM line of the Roll-up.
- **Pause markers** — pause statuses and pause tags: such intervals are subtracted from TTM. Unmarked time accrues into TTM.
- **Flow statuses (A8/A9)** — the ordered list of work-flow statuses; it drives "Bottleneck" (median dwell + WIP) and "Rework" (backward moves against the order). A status without an order number is outside the flow.
- **Plan vs fact** — the variance threshold in percent (20 by default): issues whose absolute variance exceeds it are listed.
- **A3 · ITBP slice fields** — names of the YouTrack fields for the business columns ("Business stage", "Org unit", "Priority"); a column is shown only when its field is set.
- **A6 · role monthly capacity** — hours per month per role; the denominator of "months of backlog".
- **A10 · tail-age thresholds (zombie)** — how many consecutive not-done sprints before the yellow (default 2) and red (default 5) badge in Spillover.
- **B1 · technical debt** — the tech-debt filter: issue type OR tag (if a type is set, the tag is ignored).
- **B2 · bug tax** — the bug issue type and the bug→feature link types.
- **B3 · thousand small tasks** — the small-tasks tag.
- **Report timeout** — the maximum data-collection time in seconds (90 by default); on expiry the report auto-cancels and rolls back — a protection against hangs.

### "Other" section

- **Project default language** — the planner's interface language for those who haven't switched it themselves; empty — follows the user's browser language. Everyone switches their own language with the selector in the planner header — there's no separate switcher in settings.
- **Show diagnostic log panel.** Shows the **Diagnostics** block at the bottom of the plugin; **hidden by default** since v2.17.0. Events are always recorded; once enabled, the **Export TXT** button downloads a state snapshot for support.

---

_Updated 2026-08-21, plugin v3.21.0._
