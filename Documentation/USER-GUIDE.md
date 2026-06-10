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
5. [Picking tasks and setting role capacity](#5-picking-tasks-and-setting-role-capacity)
6. [Distributing tasks among assignees](#6-distributing-tasks-among-assignees)
7. [Calendar timeline](#7-calendar-timeline)
8. [Daily stand-up view](#8-daily-stand-up-view)
9. [Sprint stages: review, commit, complete](#9-sprint-stages-review-commit-complete)
10. [Sprint history and re-editing](#10-sprint-history-and-re-editing)
11. [Who can do what: group permissions](#11-who-can-do-what-group-permissions)
12. [FAQ](#12-faq)

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
- **Sprint status badge** and **"Edit draft exists" badge** — short hints about the sprint stage and an unfinished edit (see [section 9](#9-sprint-stages-review-commit-complete) and [section 10](#10-sprint-history-and-re-editing)).
- **"+ New sprint" button** (see [section 4](#4-creating-a-new-sprint)).
- **Navigation tree** — switch between sections: "Sprint parameters", "Planning" (with sub-items "Shared resource allocation" / "Per-assignee distribution" / "Stand-up"), "Gantt chart", "Sprint history".
- **«Share» button** (at the bottom of the navigation tree) — copies a link to the current view (see below).
- **Service links at the bottom:** the user guide, feedback, language switcher.

**2. Work area on the right** — the content of the selected section.

> On a narrow screen the panel and work area stack into a single column (as before); on a wide screen they sit side by side. The panel can be collapsed with the button in its top corner.

### Sharing a link to a sprint

The page address in main-menu mode **automatically reflects what you're looking at**: the selected project, sprint, and navigation tree section. To give a colleague exactly this view, click **«Share»** at the bottom of the navigation tree — the link is copied to the clipboard (a "Link copied" tooltip confirms it). Send it any way you like; when the recipient opens it, they land directly on the same project, sprint and section.

The button is active when a sprint is open. Share the link **after saving the sprint** — the recipient sees the last saved state, not your unfinished draft.

**Handoff.** This is the primary use case: an analysis lead prepares sprint composition and sends the link to the dev lead. The dev lead opens it, sees the sprint view, and — if they have assignee-editing rights — clicks «Open for editing» and distributes tasks. The link **only navigates** to the view; what the recipient can do (view or edit) is determined by their project access in YouTrack and the working-draft mode — the link grants no extra permissions.

If the recipient opens a link to a project they don't have access to (or the planner isn't connected to that project), they'll see a message and can pick an accessible project instead.

Everything you do in the plugin is **saved automatically** — nothing is lost even if you close the browser tab or lose your internet connection. The **Save parameters** and **Confirm** buttons are for fixing sprint stages (see [section 9](#9-sprint-stages-review-commit-complete)), not for saving data itself.

---

## 3. First-time setup: what the project admin configures

This section is needed **only once** — when the project is connected to the planner. After settings are in place, regular users don't need to go here — they work in the main-menu planner.

Connecting is done **in project settings** (not in the main menu). Open your project → **Project Settings** (gear icon) → find the **Smart Sprint Planner** block. Right after installation this block is read-only — the editing buttons are hidden, so a random person can't rewrite settings on a freshly installed project.

To make the project operational and **make it appear in the main-menu planner**, the project admin needs to do **four things**:

1. **Open settings.** In the plugin block, click the **Plugin Settings** gear — a dialog opens with several sections (navigation list on the left — two-pane layout).

2. **Set the settings manager group — this is the "connection".** In the **Access and roles** section, in the **Settings manager group** field, pick the YouTrack group whose members can change this project's settings. As soon as the group is set, **the project becomes visible in the main-menu planner** — anyone with access to the project in YouTrack can open it. Until the group is set, the project won't appear in the menu, and its settings stay read-only.

3. **Choose active roles.** In the same **Access and roles** section there's a list of nine checkboxes — these are the functional roles (Analysis, Testing, Backend, Frontend, iOS, Android, Fullstack, Database, Platform development). Tick only the roles that actually work in your project. Each active role gets its own "lane" in the planning view.

4. **Map YouTrack fields to roles.** In the **Task fields** section, for each active role, specify three YouTrack fields:

   - **Estimate field** — for example, *Estimation* (how many hours are planned).
   - **Actual field** — for example, *Spent time* (how many hours were actually spent).
   - **Assignee field** — for example, *Assignee*, *Developer*, *Tester* (who's responsible for the task).

   If your project uses standard YouTrack fields, you usually just pick them once from the dropdowns.

After saving these four settings, the plugin becomes functional: you can create sprints, pick tasks, and distribute them among people.

**What else can be configured** (not required for launch): groups that can confirm sprints; groups that can only change assignees; monthly hour quotas; cascading effort aggregation; automatic state roll-up from child tasks to parent containers; "external ID" field for integration with another system; daily stand-up settings. The full list is in [Appendix A](#appendix-a-full-reference-of-project-settings).

> 💡 If you need to give someone the ability to **only** reassign tasks and change dates without touching composition or hours — that's a separate group, see [section 11](#11-who-can-do-what-group-permissions).

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

The new sprint is in the **planning** stage — which means you can freely pick tasks, change role capacities, and distribute assignees. Until the sprint is reviewed (see [section 9](#9-sprint-stages-review-commit-complete)), everything in it is a working draft.

Next steps — in [section 5 (picking tasks and capacity)](#5-picking-tasks-and-setting-role-capacity).

### Good to know

- **You can create sprints in advance.** If a sprint is already in progress and you want to prepare the next one — just click **+ New sprint**. The current one stays active; the new one appears in the list and you can switch between them through the dropdown.
- **Use meaningful names.** *Sprint 47* is worse than *Mobile app · 03.06–14.06*. Searching the history six months later will be easier.
- **Sprint goal is frozen at review.** When the sprint moves to the *reviewed* stage, the goal field is saved into history and no longer changes — this is so that at sprint close, you can assess the outcome against what was originally agreed, not against later edits.

---

## 5. Picking tasks and setting role capacity

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

Top left — role status badge (*planning* / *reviewed* / *committed*) and a **Save parameters** button. Parameters here are sprint name, dates, Sprint/Version fields (shared across all roles). When you change them in the **Sprint inputs** card, this button lets you commit those changes without going through full sprint review.

#### Available resources

In the center of the card — the **Role resource** field in hours. This is the role's capacity for the sprint.

There are two ways to set capacity:

- **Manually** — just enter the number of hours (e.g. `160h` or `160 h`).
- **Calculated** — click the **Calculate resource** button: the plugin takes the monthly hour quota (January / May / other months — configurable, see [Appendix A](#appendix-a-full-reference-of-project-settings)), multiplies it by the rate, participation percent, and grade coefficients of the role's assignees, and inserts the result.

On the right — the **Resource remainder** badge: the difference between capacity and the sum of hours by tasks. It tells you whether there's still room to add tasks or whether the role is already overloaded.

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

**To refresh data from YouTrack** (if someone changed an estimate or state in parallel): the **Refresh task data** button at the top — the plugin pulls fresh values.

### Working with multiple roles

If, for example, three roles are active in the project (Analysis, Platform development, Testing) — repeat the steps for each role:

1. Expand the role card.
2. Set capacity.
3. Pick tasks.

Cards are independent — you can expand all three at once or work with one and keep the others collapsed.

### Sorting tasks in the table

Click the **ID**, **Priority** or **Cross-priority** column header to sort. The ▼ icon shows the active column, ↕ — sortable. Clicking the same column again returns to the original order. The chosen sort order is remembered between visits.

### When composition is ready

When tasks are picked, capacity is set, and the sum of hours fits within capacity — the role composition can be **reviewed**: the **Confirm composition** button in the expanded card. What this means — see [section 9](#9-sprint-stages-review-commit-complete).

Each role is reviewed separately on purpose — so a team where one role is ready earlier than the others doesn't have to wait for everyone.

---

## 6. Distributing tasks among assignees

Once role compositions are picked, you usually need to decide **who specifically does what** and on which days. That's what the second mode of the **Planning** tab — **By assignees** — is for.

> This mode is available if **Per-assignee distribution** is enabled in settings (see [Appendix A](#appendix-a-full-reference-of-project-settings)). If disabled, the mode switcher below the **Sprint inputs** card simply doesn't appear.

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
- **Grade** — Intern / Junior / Mid / Senior. Affects capacity calculation through a coefficient.
- **Resource (h)** — how many hours this person is committing to the sprint. Editable inline.
- **Allocations by project** — a small list of "task · hours · percent" with tasks assigned to this person.
- **Remainder** — how many hours the person still has unallocated.

Buttons above the table: **+ Pick assignees**, **Clear** (remove all), **Refresh task data** (pull fresh assignees from YouTrack).

#### "Task distribution" table

This is the main table of the mode. Each row is a task in the role:

| Column | Contents |
|---|---|
| ID | Task identifier. |
| Title | Title. |
| Priority / Cross-priority | Standard. |
| Allocation (h) | Hours for this task within this role. |
| Subsystem | From the corresponding YouTrack field. |
| Assignee | Dropdown: pick which person from those selected does the task. Can leave as **— Unassigned —**. |
| Start / Finish | Dates when the person plans to start and finish the task. |

Changes in this table are saved automatically — a separate save button isn't needed.

### Buttons at the top of the page

- **Calculate resource** — recalculates resources for all assignees by the hour quota and grade (useful if quota settings or roster changed).
- **Save parameters** — commits the shared role parameters (same action as in the first mode).
- **Confirm distribution** — moves the sprint from the *reviewed* stage to *committed*. When to click — see [section 9](#9-sprint-stages-review-commit-complete).

### Good to know

- **Change an assignee in one table → it updates everywhere.** Change an assignee via the dropdown here — the corresponding bar on the Gantt chart (see [section 7](#7-calendar-timeline)) immediately recolors. No two-way drift between views.
- **If someone changed an assignee directly in YouTrack** — click **Refresh task data**: the plugin pulls fresh values for all sprint tasks (up to 200 at a time).
- **Switching roles with unsaved changes** — the plugin asks for confirmation so you don't accidentally lose your distribution.
- **If an old completed sprint is selected** — all fields are greyed out (read-only). To change the distribution, open the sprint for editing from history (see [section 10](#10-sprint-history-and-re-editing)).

---

## 7. Calendar timeline

The **Gantt chart** tab shows the tasks of the active sprint on a timeline — who's doing what on which days. Each task is one horizontal bar; bar color matches the assignee, bar length matches the **Start / Finish** date range set in **By assignees** mode (see [section 6](#6-distributing-tasks-among-assignees)).

### What's on the page

- **Role selector at the top.** The chart always shows tasks for **one role** — this is intentional, so the chart doesn't turn into a mess. If you have three roles, switch between them with the selector.
- **Task list on the left** — YouTrack ID and assignee name.
- **Date scale at the top** — dates within the active sprint.
- **Colored bars** — tasks. Color is the same for all tasks of one assignee.
- **Grey bars** — tasks without an assignee.
- **Refresh Gantt button** — re-renders the chart from current data (useful if something changed in parallel).
- **Refresh task data button** — same as in **By assignees**: pulls fresh assignees from YouTrack.

### What you can do directly on the chart

#### Single click on a bar → reassign

A small dialog opens with the list of all picked assignees for the role plus **— Unassigned —**. Pick the person and click **Apply** — the bar instantly recolors, and the assignee is **written back to the YouTrack task**.

> ⚠ This works only if **Inline field editing** is enabled in settings (see [Appendix A](#appendix-a-full-reference-of-project-settings)). If disabled, the plugin won't write changes back to YouTrack — and click-reassign is blocked, so you don't end up with "I changed it locally, but the YouTrack task still has the old assignee".

#### Double click on a bar → mark with a color

Double click cycles the bar color: *original → red → blue → original*. This is a local marker for yourself (e.g. red = "discuss at daily", blue = "ready for review"). The marker isn't written to YouTrack — it's just for your own navigation.

### If the chart is empty

Possible reasons:

- The selected role has no tasks — add them in **Composition by roles** mode.
- Tasks exist but **Start / Finish** dates aren't set — set them in **By assignees** mode.
- An old sprint without an edit draft is selected — the chart is in view mode. To edit, open the sprint for editing from history.

---

## 8. Daily stand-up view

There's a third mode on the **Planning** tab — **Stand-up**. It's made for short daily team meetings: open the mode, walk through three columns, close the meeting in 5 minutes.

### What it shows

All tasks of the active role in the active sprint, split into three columns:

| Column | What goes there |
|---|---|
| **✅ Done** | Tasks in states "Done" / "Closed" / "Verified" — those considered completed (the exact list is configurable). |
| **🔄 In progress** | Tasks with logged time or marked as started. |
| **📋 Not started** | Tasks with no actual hours yet. |

Each card inside a column shows: task ID, title, assignee, actual/planned hours.

### How to use

1. Open the **Planning** tab.
2. Switch to **Stand-up** mode.
3. Pick a role in the selector at the top (shared with the other modes).
4. If a sprint goal is set, it's shown as a large banner on top.
5. The team walks through the columns: what closed yesterday → what's in progress → what's waiting.
6. To refresh — click **🔄 Refresh**, which re-reads YouTrack data.

### Important to know

- **This is read-only.** You can't drag tasks between columns or change assignees here — just look. Any edits go in the other modes of the Planning tab.
- **If the "Done" column is empty even though tasks are closed** — check settings. Which YouTrack states count as *Done* is configured in plugin settings (see [Appendix A](#appendix-a-full-reference-of-project-settings)). By default it's the last two states from the auto state roll-up setting.
- **No "Blocked" column.** Task blocking info isn't shown by the plugin yet — this may appear in future versions.
- **Sprint goal.** If the field was filled in when the sprint was created, it's shown on top as a reminder to the team about the main outcome they're working toward. If not — there's a soft suggestion to add it.

---

## 9. Sprint stages: review, commit, complete

A sprint in the plugin goes through **four sequential stages**:

```
planning → reviewed → committed → finished
```

Each stage is a **fixed checkpoint** you can return to (see [section 10](#10-sprint-history-and-re-editing)). Stages aren't "hard gates" — you can always go back if you need to fix something.

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

If during the sprint you need to make a change that's blocked — you have to **open the sprint for editing** in Sprint history. This creates a working copy (edit draft) without destroying the fixed plan. Details — in [section 10](#10-sprint-history-and-re-editing).

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

> 💡 The outcome dialog can't be bypassed with a stray click — even if you try to finish without picking an outcome, **Confirm** stays disabled. This is intentional, so every finished sprint has an explicit assessment.

### What if you "miss the stage"

- **Accidentally clicked Confirm composition** and now can't change tasks — open the sprint for editing from history (see [section 10](#10-sprint-history-and-re-editing)), make the edits, and reconfirm.
- **Accidentally finished a sprint** — same thing: **Open for editing**, edit, re-finish with an outcome.
- **Changed your mind about closing the sprint** already in the outcome dialog — click **Cancel**. The sprint stays as it was.

---

## 10. Sprint history and re-editing

The **Sprint history** tab shows all reviewed sprints of the project — 10 per page, newest first. It's both an archive and the entry point for two important actions: **open a sprint for editing** and **finish a sprint**.

### Sprint card in history

Each sprint is a collapsible card with metadata:

- Name and dates.
- Status (reviewed / committed / finished).
- Who last confirmed and when.
- Sprint goal and outcome — if set.
- Task count and resource remainder.

Click the card — it expands and shows the full task table with assignees and hours.

### What buttons are on the card

| Button | What it does |
|---|---|
| **Excel** | Exports the sprint to Excel (tasks, estimates, actuals, allocations, assignees). Convenient for reports and discussion outside the plugin. |
| **✏ Open for editing** | Creates an edit draft based on this sprint — see below. |
| **✓ Finish** | Available if the sprint isn't finished yet. Opens the outcome dialog (see [section 9](#9-sprint-stages-review-commit-complete)). |
| **🗑 Delete** | Full sprint deletion. Two-step confirmation. |

Separately, above the whole list, there's a **🗑 Clear all history** button — available only to members of a special group (see [section 11](#11-who-can-do-what-group-permissions)).

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
| Name / dates / Sprint / Version only | **Save parameters** in the expanded role card. |
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

## 11. Who can do what: group permissions

Access to different actions in the plugin is regulated through **YouTrack groups**. In plugin settings, the project admin specifies which group is responsible for which permissions.

Groups are **additive**: one person can be in multiple groups and gets the sum of their permissions.

### Five permission groups

| Group | What they can do |
|---|---|
| **Plugin configurators** | Open the plugin settings dialog and change configuration (YouTrack fields, active roles, quotas, the other group memberships). This is the "root" group — without it, all other settings are useless. |
| **Editors** | Full sprint editing: pick tasks, change hours, capacities, assignees, dates. Access to **Composition by roles** and **By assignees** both ways. |
| **Confirmers** | Everything editors can, plus the ability to click **Confirm composition** and **Confirm distribution**, plus open sprints for editing from history and apply drafts. |
| **Assignee-and-date-only** | Limited permissions: can change **only** assignees and Start / Finish dates in **By assignees** and on the Gantt chart. Composition, capacities, status — not allowed. Useful for team leads who shuffle assignees inside a fixed sprint but shouldn't change "what was agreed". |
| **History cleaners** | See and can click **🗑 Clear all history** above the History list. A strong, irreversible action — usually given to 1–2 responsible people. |

**If a person isn't in any of these groups** — they see the plugin in read-only mode: they can browse compositions, charts, history, but editing buttons are hidden.

### How groups are configured

Groups are picked in the plugin settings dialog (gear in the header) in the **Access and roles** section. Group names come from YouTrack — the same groups your project uses for other permissions.

For details about which settings come by default and how they're named in the dialog — see [Appendix A](#appendix-a-full-reference-of-project-settings).

### Checking permissions

If you see a button hidden or a field greyed out — it's probably permissions. To check:

1. Ask the project admin which YouTrack groups you're in.
2. Cross-reference with the table above.
3. If permissions are missing — ask the admin to add you to the needed group.

> ⚠ Changing group membership is YouTrack administration, not an action inside the plugin. The plugin just reads which groups you belong to.

---

## 12. FAQ

**I changed something but I'm afraid to close the tab — will it really be saved?**
Yes. The plugin saves your changes to the server automatically in the background. If you close the tab, get a coffee, and come back an hour later — you'll see everything exactly as you left it. The **Save parameters** and **Confirm** buttons are not for saving data, but for fixing sprint stages.

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
Correct behavior. This group is deliberately limited: you can change **only** the assignee and Start / Finish dates. Changing task composition, role capacity, status — requires Editor or Confirmer permissions. If you need full permissions, ask the configurator to add you to the Editors group.

**The "Done" column in Stand-up is empty even though tasks are closed in YouTrack.**
Check the plugin settings (gear → **Stand-up**) for the **"Done" states** field. If empty — the plugin doesn't know which YouTrack states count as completed. Pick the relevant states (typically *Done*, *Closed*, *Verified*) and save — the stand-up stops being empty.

**Single-clicking a bar on the Gantt chart does nothing.**
Reassign-by-click only works when **Inline field editing** is enabled in settings. This is intentional: if the plugin can't write the change back to the task, the reassign would only be "local" and the YouTrack task would still show the old assignee — a source of confusion. To enable, ask the plugin configurator (or do it yourself if you have rights) to turn on the corresponding option in settings.

**The "External ID" column doesn't appear in tables.**
Check the plugin settings, in the **Task fields** section, for the **External ID field** option. If empty — the column is hidden. If filled with a YouTrack field name — the column appears, but only for tasks that have a value in that field (rows without an external ID just skip the cell).

**A reminder "Sprint goal not set" appeared. Can I ignore it?**
Yes. It's a soft reminder that doesn't block saving. Fill in the Sprint goal field if you want to see it during the daily stand-up and assess the outcome at sprint close. If your team doesn't use sprint goals — just ignore the reminder or fill in any meaningful text.

**Where do I see error logs if something doesn't work?**
At the bottom of the plugin there's a collapsible **Diagnostics** block — all server calls, errors, and warnings are logged there. The **📥 Export** button downloads the last 100 lines as a text file — attach it to a support request if you run into issues. If the block is in the way — hide it in settings (**Other → Hide diagnostics panel**); events still get recorded and are available via export.

---

## Appendix A. Full reference of project settings

This is the complete list of settings the project admin configures in the **Plugin Settings** dialog (gear in the header). The dialog uses a two-pane layout: a navigation list of sections on the left, the active section on the right.

> Most users don't need to go here. This section is for the project configurator.

### "Access and roles" section

- **Settings manager group** — who can open this dialog and change configuration. Without it, the plugin only works in read-only mode.
- **Active roles** — list of 9 functional roles (Analysis, Testing, Platform development, Backend, Frontend, iOS, Android, Fullstack, Database). Roles ticked here get their lanes in planning.
- **Editor groups** — who can edit composition, capacities, assignees.
- **Confirmer groups** — who can click **Confirm composition** and **Confirm distribution**.
- **Assignee-and-date-only groups** — who gets limited permissions (only assignees and Start / Finish dates).
- **History clearing groups** — who sees the **Clear all history** button.

### "Task fields" section

Mapping of YouTrack fields to plugin concepts. For **each active role**:

- **Estimate field** — where planned hours are stored (e.g. *Estimation*).
- **Actual field** — where actual spent hours are stored (e.g. *Spent time*).
- **Assignee field** — who's responsible for the task in this role (e.g. *Assignee*, *Developer*, *Tester*).

Shared fields (for all roles):

- **Priority field**, **Cross-priority field**, **State field**, **Subsystem field**, **Sprint field**, **Fix version field**.
- **External ticket ID field** — if your tasks come from an external system (Service Desk, 1C, SAP, legacy JIRA) and the YouTrack task has a text field with the ID from that system. If set — an **External ID** column appears in tables as the second column after the YouTrack ID.

Options:

- **Inline field editing.** If enabled, the plugin can write assignee / state / priority changes back to the YouTrack task directly from sprint tables. Without this mode, all changes stay local to the plugin.

### "Calculation quotas" section

Used by the **Calculate resource** button to auto-calculate role and per-person capacities.

- **Hour quotas** — separately for **January**, **May** and **other months** (in Russia, January and May are short due to public holidays).
- **Rate** — general multiplier for all calculations.
- **Participation percent** — what fraction of their working time a person spends on this project.
- **Grade coefficients** — separate multipliers for **Intern**, **Junior**, **Mid** and **Senior**.

Formula: `month_quota × rate × participation_percent × grade_coefficient`.

### "Effort tracking" section

Automatic split of task-logged time across different roles' actual fields.

- **Enable differentiated effort tracking.** If enabled, when hours are logged on a task the plugin looks at the **work item type** (Development / Testing / Analysis etc.) and puts the hours into the corresponding role's actual field.
- **Type → role map** — a table of mappings: e.g. `Development → Frontend`, `Testing → Testing`. One type → one role. Inactive roles in the map are ignored with a warning.

### "Cascade aggregation" section

Automatic roll-up of estimates and actuals from child tasks to parent containers.

- **Enable cascade aggregation.** When a task's estimate or actual changes, the plugin sums that field across all "siblings" and writes the result to the parent task. If the parent is a container (e.g. a Story with subtasks) and the Story itself rolls into an Epic, the Epic is recalculated too.
- **Forbid logging on container tasks.** If enabled, logging or editing time entries on container tasks (Story, Epic) is blocked. This is a safety net: without the ban, cascade aggregation would overwrite "direct" logging on the next run.
- **Type field** — which YouTrack field stores the task type (default *Type*).
- **Level-2 types** — what counts as a first-level container (default *Story*).
- **Level-3 types** — what counts as a second-level container (default *Epic*).
- **Parent ← child link name** in both directions (default — built-in *Subtask* link).

> ⚠ If cascade aggregation is enabled but the "forbid container logging" is off, the plugin shows a warning in settings. This is a "dangerous combination" — recommended to enable both together.

### "Automatic state roll-up" section

Automatic recalculation of parent (Story / Epic) state from children states.

- **Enable state roll-up.**
- **State order** — ordered list of states from "least progressed" to "most progressed". E.g. `Open → In progress → Ready for review → Done`.
- **Resolved states** — states in which the parent task is **not recalculated**. This protects against the situation "Epic is Done, but one forgotten Story moved back to In progress — Epic rolled back". Typically: *Done*, *Closed*, *Cancelled*.
- **Floor state** (optional) — the state below which the parent doesn't drop. E.g. if set to *In progress*, the Epic won't "bounce back" to *Open* because of one returned Story.

After setting the state order, a **🔄 State roll-up: on/off** chip appears at the bottom of the plugin.

### "Stand-up" section

- **"Done" states** — which YouTrack states count as completed for the **✅ Done** column in Stand-up mode. Multiple states can be selected. If left empty — the plugin takes the last two states from the state roll-up order. If both are empty — the Done column stays empty and a hint appears.

### "Other" section

- **Interface language** — language switcher (duplicates the one in the plugin header).
- **Verbose log.** Enables debug-level logging on the server side. Off by default. Doesn't log user-entered values — only short operation markers.
- **Hide diagnostics panel.** Hides the **Diagnostics** block at the bottom of the plugin. Events still get recorded and are available via the **📥 Export** button after unsetting the flag.

---

---

_Updated 2026-05-27, plugin v2.1.8._
