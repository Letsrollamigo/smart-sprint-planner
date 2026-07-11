# Methodology Guide — Smart Sprint Planner for Team Leads, Scrum Masters and PMs

> 🇬🇧 English · 🇷🇺 [Читать по-русски](METHODOLOGY-GUIDE.ru.md)

> **Audience:** team leads, Scrum masters, project managers, delivery
> managers — anyone responsible for *how* a multi-role team plans, runs and
> reflects on a sprint, not only *what* gets built.
>
> **Companion:** [USER-GUIDE.md](USER-GUIDE.md) explains every screen and
> button. This document explains *when and why* to use them inside a Scrum
> or Scrum-ban process.

---

## Table of contents

1. [Why a multi-role planner](#1-why-a-multi-role-planner)
2. [Plugin map across Scrum ceremonies](#2-plugin-map-across-scrum-ceremonies)
3. [Capacity planning: KPI, Grade and Availability](#3-capacity-planning-kpi-grade-and-availability)
4. [Time-tracking discipline: DTA + cascade](#4-time-tracking-discipline-dta--cascade)
5. [Multi-team coordination via roles](#5-multi-team-coordination-via-roles)
6. [Operational reporting: the feedback loop](#6-operational-reporting-the-feedback-loop)
7. [Anti-patterns and common mistakes](#7-anti-patterns-and-common-mistakes)
8. [First-week checklist for the team lead](#8-first-week-checklist-for-the-team-lead)
9. [Further reading](#9-further-reading)

---

## 1. Why a multi-role planner

### The "single-bucket velocity" trap

Most agile tools track sprint commitment as a single number — total story
points, or total estimated hours. That works when every backlog item is
worked end-to-end by one fungible engineer. It breaks the moment your
team has more than one role: when a story needs analysis, then backend,
then frontend, then QA — and each role has its own queue, its own people,
and its own capacity.

The "single-bucket velocity" tells you the team finished 38 points last
sprint. It doesn't tell you that QA was the bottleneck for 25 of them,
or that backend sat idle waiting for the analyst, or that one frontend
engineer carried 70% of the visible work. You can't plan the next sprint
honestly without that breakdown.

### When roles are first-class citizens

Smart Sprint Planner treats each role as its own planning surface. A
sprint isn't a flat list of stories with a sum at the bottom — it's
**nine parallel composition tables**, one per role, each with its own
assignees, its own capacity vs. load, and its own overlimit guard. You
plan the QA load and the backend load separately, you see them side by
side, and you commit only to the slice that fits in each role's budget.

This isn't a different methodology. It's still Scrum, still Kanban, still
whatever flavor your team practices. It's the same ceremonies, the same
backlog, the same goal — just with the planning lens that matches the
shape of your actual team.

### What the plugin assumes about your team

- You have **at least two distinct functional roles** that meaningfully
  hand off work to each other (analysis ↔ engineering, engineering ↔ QA,
  backend ↔ frontend, etc.). For a single-role team, a flat backlog
  view is enough.
- Roles are **stable enough to be configured project-wide**. People can
  hold multiple roles, and the role mix can change between projects, but
  within a sprint you know which roles are in play.
- Hours (not just story points) are a meaningful unit. The plugin tracks
  capacity in hours and time spent in hours; teams that work purely in
  abstract points can still use it for assignment and overlimit
  signalling, but DTA and cascade aggregation deliver most of their value
  when actual hours are logged.

If those three hold, the rest of this guide will pay off. If they don't,
a vanilla YouTrack agile board may serve you better.

---

## 2. Plugin map across Scrum ceremonies

The plugin doesn't replace your ceremonies — it gives each one a
purpose-built screen. Here's where to point your team during each event.

> **Where the planner lives.** Planning itself lives in the **YouTrack
> main menu** (the sprint-planner item): on the left, the project,
> sprint and section tree; on the right, the working area. The
> housekeeping **project settings** (roles, fields, planning model,
> permissions, backlog) stay in the plugin block inside *project
> settings* — you visit them rarely. The main-menu page address
> reflects project + sprint + section, so the **handoff between leads**
> is done by link: the analysis lead prepares the composition and sends
> a link to the development lead, who opens the exact same view and (if
> they have the rights) assigns people. The link only takes you to a
> view; what the recipient can do is governed by their permissions.

### Sprint Planning — composition, capacity, working drafts

This is the plugin's home turf. Open the **Planning** tab and walk down
the role list with the team. For each role: confirm assignees, look at
capacity vs. load (the right-hand totals), and pull issues from the
backlog into the role's table until you're at — or just under — capacity.
The overlimit guard will block obvious over-commitments; soft-orange
warnings are signals to discuss, not silently push through.

Use **working drafts** for in-meeting iteration: the team can experiment
with the composition without overwriting the confirmed sprint. When the
meeting ends, click **Confirm** to snapshot the agreed composition into
sprint history. Personal drafts let individuals sketch their own view
without affecting the shared one — useful for offline preparation before
the meeting.

### Daily Stand-up — status bar, filters, Gantt per role

The status bar in the widget header shows the live state of feature
modules at a glance — which integrations are wired up, which are off,
which are in a warning state. For the daily, switch to the **People**
view or the per-role **Gantt timeline** and filter by today's sprint.
Each role's lane shows what's in flight and what's queued, so the
stand-up question moves from "what did you do yesterday" to "is the
backend lane backed up by the analyst lane".

### Sprint Review — DTA fact, cascade roll-up as accuracy metric

At the review, switch on **DTA fact aggregation** and look at the
plan/fact ratio per role. Cascade aggregation makes parent issues show
the sum of child plan and fact, so a feature-level summary of "we
estimated 80h, we spent 95h" appears without manual tallying. Treat the
ratio as a **calibration metric** for the team's estimates, not a
performance score. A consistent 30% overrun in QA means QA estimates
need a bigger buffer next sprint, not that QA needs to "go faster".

### Sprint Retrospective — plan/fact warnings as feedback loop

If `dtaWarningsEnabled` is on, every work-item log triggers a workflow
check that reports the running plan/fact ratio per role. Across a
sprint, those warnings build a record of where reality drifted from the
plan and when. Bring that record to the retrospective: the conversation
shifts from "we felt overloaded" to "the analysis role hit the 110%
threshold on day 3 of every sprint for the last six". That's a much
sharper retro input.

### Backlog Refinement — pre-sizing per role before the planning meeting

Estimate per role at refinement, not at planning. Use YouTrack's
estimation custom fields (one per role — these are what the plugin reads
as `fieldX` for each role) so a story carries `analysisEstimate=4h,
backendEstimate=12h, qaEstimate=6h` before it ever enters a sprint.
Planning then becomes a fitting exercise across role budgets, not an
estimation marathon. Refinement is also where you assign work-item types
that DTA needs — without them, time logged later won't aggregate.

**The "Working with the backlog" module as a refinement tool.** Since
version 2.15.0 the plugin has a dedicated navigation-tree section —
**"Working with the backlog"**. It's a preliminary phase *before*
planning: the customer's issue pool, grouped either **by zones** of the
pipeline (state → role(s) — e.g. `Analysis → analyst`,
`In development → backend/frontend`) or as an **Epic ▸ Story ▸ Task**
tree. Methodologically it turns refinement from "estimate ahead in the
fields" into **visual queue triage**: you see how many issues sit at
each stage, which need an estimate (a "Needs estimate" badge), what is
carried over from the previous sprint ("Carryover" / "Continuation"
badges derived from the transition history), and what is paused. Straight
from the pool an issue is **laid out into the sprint** with the "To
sprint" button — the plugin suggests the roles for the zone, shows each
role's remaining resource, and drops the issue into the composition.

**How this changes the refinement ceremony:** instead of "we went down
the list in the tracker", the team opens the "By zones" view, checks the
conveyor left to right (customer pool → analysis → development → …), and
right there lays out the work-ready issues into the nearest sprint by
role, without waiting for planning. Zones are an explicit model of your
delivery conveyor; keep them in the same order as your real stages.
Issues in unmapped states aren't lost — they land in an "Other" bucket
with a warning that this is a signal to fine-tune the zones, not to lose
the work.

---

## 3. Capacity planning: KPI, Grade and Availability

Per-person capacity in the plugin is the product of three independent
inputs. Tuning them honestly is what makes the overlimit signal
trustworthy — and what makes a "we have room" answer in planning mean
something.

> **Pick the depth of the model first.** In settings ("Capacity
> management" → **"Planning model"**) there are three levels: **Simple**
> — no per-person calculation, the role's capacity is entered manually
> as a single number (a fit for small teams where per-person accounting
> is excess bookkeeping); **Light** — the full per-person calculation
> below (KPI × Grade × Availability), with the calculation method set to
> "auto by formula" or "manual per person"; **Full** — an extended
> capacity model, still in development. This whole section applies to the
> **Light** model; in Simple you just enter the role's hours and skip
> the per-person mechanics.

### The three knobs and what each one models

- **KPI** — the baseline output expectation for a person in a role,
  expressed in hours per sprint (or whatever unit your team uses
  consistently). This is *not* the contractual hour count. It's the
  hours of *planned, sprint-eligible* work you expect that person to
  absorb at full availability and full performance, after deducting the
  realistic overhead (meetings, reviews, support rotations, context
  switching). For a full-time mid-level engineer with average overhead,
  KPI commonly lands at 50–60% of the contractual hours — not 100%.

- **Grade** — a multiplier capturing seniority, domain familiarity, or
  current ramp-up state. A senior engineer in their core domain might
  carry grade 1.2; a junior still ramping might carry 0.6. Grade lets
  you keep KPI as a single role-level baseline and adjust per person
  without rewriting KPI for every new hire.

- **Availability** — the time-window adjustment for *this specific
  sprint*. Vacations, training, on-call weeks, parental leave, planned
  cross-team loans all live here. Set it to 0.5 if someone is gone for
  half the sprint, 0 if they're fully out, 1.0 in a normal sprint.

Effective capacity for a person in a role for a sprint is the product:
**KPI × Grade × Availability**. The role's total capacity is the sum
across its assignees.

### Working with part-time, vacations and on-call rotations

- **Part-time staff**: model as a permanent **Grade < 1**. A 0.6 FTE
  engineer with the same baseline KPI as their 1.0 FTE peers would
  carry grade 0.6 indefinitely.
- **Vacations and planned absences**: adjust **Availability** for the
  sprint(s) affected, not Grade. Grade is structural; Availability is
  per-sprint. Bumping Availability back to 1.0 next sprint is one
  click; "remember to revert the Grade" is how teams accidentally lose
  capacity for months.
- **On-call rotations and rotating duties**: if the rotation is
  predictable and ~constant overhead, fold it into KPI (lower the
  baseline). If it lands on different people each sprint, model it as
  Availability adjustments per person per sprint. Never try to track it
  as a separate role unless on-call is itself a planned, queued
  workstream.

### Reading the overlimit signal — when to push back vs. when to commit

The plugin highlights a role table when planned load exceeds capacity.
Three honest interpretations:

1. **Genuine over-commitment** — load > capacity by more than ~10%.
   Either pull stories out, split a story so part lands next sprint, or
   accept the risk explicitly with the team and capture *what will be
   dropped if reality pushes back*. Don't silently dismiss the warning.

2. **Estimation noise** — overshoot under ~10% on a well-calibrated
   team. Acceptable to commit, but log it: if this happens every sprint,
   your KPI baseline is too high.

3. **Stale capacity inputs** — overshoot that disappears the moment you
   correct an Availability or Grade value someone forgot to update. Fix
   the input, don't fight the signal.

A team that always commits to a soft-orange role for "the team is
strong, we'll absorb it" is a team that's quietly normalising overtime.
The signal exists so the conversation happens *during planning*, not in
the retrospective after a missed sprint.

### When to skip the three-knob model — manual per-assignee resource (v1.4.0)

Some teams don't model capacity through KPI × Grade × Availability. The
team lead simply says: "Anna has 30 hours this sprint, Boris has 24,
Clara is on training so 8". In that mode, the three knobs and the grade
multiplier add ceremony without adding signal.

For those teams, plugin settings expose **«Manual per-assignee
resource»** (the `manualPersonalResource` checkbox under the Planning
Modes section, dependent on Personal Planning being enabled). When it's
on, the «Resource (h)» cell in the per-assignee distribution table
becomes a numeric input you fill directly; the autocalc from KPE × rate
× participation is silenced. Grade stays editable but becomes a label —
useful as a reference, no longer a multiplier. The overlimit signal,
totals, and remainder all follow the manually-entered hours.

Use it when capacity is set top-down (fixed weekly hours, contracted
external resource, partner-team loans) and the team lead owns the
number directly. Switch back to the three-knob model when capacity
becomes a function of structural inputs the team itself can tune.

### The "Full" model: approved capacity instead of three knobs (v2.16.0+)

The three knobs above are the **"Light"** model: the lead enters or
auto-calculates people's resource right inside planning. The
**"Full"** model inverts the flow: sprint capacity is computed in
advance on a dedicated **Capacity** tab — from the production
calendar (uploaded as CSV, optionally to all projects at once),
grades and people's absences (including partial days) — and goes
through explicit **approval**. Planning then consumes the approved
numbers: the role and per-person resource fields become read-only.

The methodological point is separation of roles: whoever *owns*
capacity (a manager, a planning manager) approves it before the
planning meeting; whoever *distributes* (the lead) works inside the
approved budget and can't quietly nudge it to fit a desired
composition. The sign you've outgrown "Light": role capacity has
become something negotiated *during* planning instead of an input to
it. If your team owns its own capacity and calibrates it at retros,
"Light" is simpler and sufficient. The tab reference is
[USER-GUIDE.md, section 6](USER-GUIDE.md#6-picking-tasks-and-setting-role-capacity).

### Capacity → planned dates: the auto-forecast

Since v3.1.0 the approved capacity stops being just an "hour budget"
and starts working on the calendar: the **Forecast dates** button
lays the assignee's tasks over the sprint days — sequentially, in the
order of their personal queue, respecting the production calendar,
absences and the daily "useful hours" cap. The methodological point
is twofold. First, **dates are derived from capacity, not the other
way around**: the team stops eyeballing deadlines and gets a calendar
projection of the same budget that was approved in §3. Second,
**overload becomes visible before the sprint starts**: tasks that
don't fit the capacity honestly stay without dates with an "over
capacity" badge — the same signal as the planning overlimit, just in
calendar form. The assignee's queue (the "#" column) is a
prioritization within one person: what we do first. The forecast is
an explicit lead action, not background magic; manual date edits
(including dragging bars on the Gantt, v3.2.0) persist until the next
recalculation.

---

## 4. Time-tracking discipline: DTA + cascade

DTA (Differentiated Time Accounting) and cascade aggregation are the
two workflow rules that turn logged hours into trustworthy numbers.
Both are off by default; both are worth turning on once the team has
the basic planning rhythm down.

### Why "hours per role" beats "hours per task" for multi-role work

A YouTrack work-item by default carries one author and one duration.
A story that took "20 hours" tells you nothing about the split — was
it 16h backend and 4h QA, or 8h analysis, 8h backend and 4h QA? The
plan/fact comparison falls apart at the role level, which is exactly
the level where you set capacity.

DTA fixes this by reading the **work-item type** on each log entry and
mapping it to a role. Log a "QA" type entry, and the hours roll up into
the QA fact bucket on the issue and on the sprint. The plugin then
writes per-role fact totals back into custom fields on the issue, so
the same fields you read at planning (`qaEstimate`, `backendEstimate`,
…) get a `qaActual`, `backendActual` … companion. Plan and fact live
in the same shape, and the team can compare apples to apples.

### The mandatory work-type rule and how to roll it out

When DTA is on, the workflow blocks any work-item save that has no
type. The user sees a localised "Specify the work type!" message and
the save fails until they pick one. This sounds harsh; it's the only
way to keep the data clean, because a single typeless entry destroys
the per-role aggregation for that issue.

Roll it out in two steps:

1. **Soft week** — announce the rule, configure the type → role
   mappings, demo it in a stand-up. Don't enable the mandatory check
   yet. Watch for confusion ("which type do I pick for this?") and
   adjust your type list before turning enforcement on.
2. **Hard switch** — enable the rule. Expect a few days of friction;
   support it actively. After that, the discipline holds itself.

Keep the work-item type list **short and obvious**. If people can't
choose between two types in under five seconds, the list is wrong, not
the people.

### Plan/fact warnings — three thresholds, three conversations

With `dtaWarningsEnabled` on, every work-item log triggers a per-role
report comparing the running fact to the plan. The plugin uses three
thresholds and emits a different message at each:

- **Up to 80% of plan** — silent or informational. The role is on
  track or under-spent.
- **80–110% of plan** — soft warning. Worth a brief mention at the
  next stand-up: "we're approaching the QA budget, anything we should
  reshuffle?".
- **Over 110% of plan** — hard warning. Stop and discuss before
  logging more time. Either the estimate was wrong (calibration data
  for retro), the scope grew (separate ticket, separate budget), or
  the team is silently absorbing overrun (anti-pattern; see §7).

The thresholds are not a performance management tool. They're a real-
time conversation prompt — the plugin fires them per log so that
problems surface *while the work is happening*, not at sprint end.

### Cascade aggregation parent ← child — when to use containers

Cascade aggregation makes parent issues display the sum of their
direct children's plan and fact, per role. Turn it on when your team
groups issues hierarchically: epics with stories underneath, features
with sub-tasks, releases with feature issues. Suddenly an epic
"costs 80h plan / 95h fact" without anyone tallying manually.

Two practical rules:

- **Containers should not carry direct work-item logs.** Enable
  `forbidContainerWorkItems` to enforce this — the workflow rejects
  any log on an issue that has children. This keeps the cascade math
  honest: parent totals = sum of children, never "sum of children +
  whatever someone logged on the parent".
- **Don't nest deeper than your team actually thinks.** Cascade rolls
  up arbitrarily deep, but if your team thinks in two levels (epic →
  story), don't introduce a third level just because the tool
  supports it. Hierarchy depth costs cognitive overhead at refinement
  and planning.

### State rollup parent.State ← min(children) — closing the container narrative (v1.7.0)

Cascade aggregation handles the *numbers* (hours flow up); state
rollup handles the *status* (container State follows the slowest
child). Together they form the **container discipline triad** —
container = projection: time aggregated ←, state inherited ←, direct
work forbidden. This is what makes parent issues actually trustworthy
on a board: the team never has to remember to manually drag a Story
forward when its tasks move.

Three practical rules for adopting state rollup:

- **Define your state order as a team, not as a tool config.** The
  ordered list of states is the team's shared model of "what
  progress looks like". If two team members would rank `In Review`
  and `In Testing` differently, you have a bigger conversation to
  have than a settings field. Run a 15-minute alignment session
  before enabling rollup — once everyone agrees on the order,
  rollup becomes invisible infrastructure.
- **Configure the resolved-states guard.** Set `Done` and
  `Cancelled` (or your equivalents) as resolved states from day one.
  Without this guard, reopening a single child task drags a
  closed Epic back into "In Progress" — annoying enough that teams
  turn rollup off entirely. With the guard, closed containers stay
  closed; reopening a child triggers a deliberate human conversation
  about whether to reopen the container too.
- **Use the floor only when business rules demand it.** A floor
  state ("Epic never goes below `In Analysis`") is useful when an
  Epic represents a commitment that survives sub-task churn — once
  analysis starts, the Epic shouldn't appear in the backlog again
  even if all current children are dropped. For most teams, no
  floor is the right starting point.

State rollup is **disabled by default**. Treat it as the third
opt-in step after enabling DTA and cascade aggregation — the same
container hierarchy config (`cascadeKindField` + level-2 / level-3
values + parent link) is reused, so there's no extra setup work.

---

## 5. Multi-team coordination via roles

The plugin ships with nine role slots: analysis, testing, platform
development, backend, frontend, iOS, Android, fullstack, database. Most
teams will not use all nine. The point isn't to fill the matrix — it's
to map each *meaningful queue* in your delivery pipeline to a slot.

### Roles as functional teams, not job titles

A role in the plugin is a **planning queue**, not a HR title. If you
have a single QA engineer who also does some manual security review, you
have one queue (testing). If you have separate dedicated QA and security
practices that compete for sprint slots, you have two — even if both
are formally "QA engineers".

The implication: **don't enable a role until it has its own backlog,
its own assignees and its own capacity worth tracking separately**.
A role enabled "just in case" with one person and zero estimates becomes
noise in every planning meeting.

For teams that span multiple feature crews under one PM, a clean
pattern is: enable the **same** role set per project, but vary the
assignee list. The frontend role exists in every project; only the
people in it differ. This keeps cross-project capacity views readable.

### The `devPlatform` slot — mapping 1C, SAP, Salesforce, low-code

`devPlatform` is the generic engineering role designed for stacks that
don't fit the "iOS / Android / backend / frontend / fullstack /
database" labels. It maps to whatever your team calls platform work:
1C in an enterprise context, SAP/ABAP, Salesforce/Apex, an internal
low-code tool, Mendix, Power Platform, an embedded firmware queue,
anything.

Two practical notes:

- The slot is **named for clarity in the UI** (you can localise the
  visible label per project), but the underlying identifier is fixed
  as `devPlatform`. Don't try to repurpose it for a role that already
  has its own slot (don't use `devPlatform` for "another frontend
  team").
- If you have *two* platform stacks — say, "1C" and "Salesforce" both
  in scope for the same project — you have two roles, not one.
  Currently the plugin offers one `devPlatform` slot per project; if
  you genuinely need two, fold one into `backend` or open a feature
  request.

### Cross-project visibility and per-project role enablement

Roles are enabled **per project**, in the plugin settings overlay. The
project where a person is the lead frontend engineer enables `frontend`;
the project where they're an occasional reviewer doesn't. Each project
sees only the role set the team configured.

For cross-project visibility (e.g. "what's the total backend load this
sprint across three projects?"), use YouTrack's native cross-project
boards or saved searches alongside the plugin. The plugin is
single-project by design — it owns the *composition* of a sprint within
one project, not the multi-project portfolio view.

This is a deliberate constraint. A multi-project portfolio view that
also tries to model per-role capacity quickly becomes either too
abstract to act on or too detailed to read. Keep capacity decisions
inside the project, and use higher-level YouTrack views for portfolio
roll-up.

---

## 6. Operational reporting: the feedback loop

Chapters §2–§5 are about *agreeing*: composition, capacity, roles,
tracking discipline. The operational reporting module (v3.0.0) is about
*finding out what actually happened*: the planner captures intent,
the reports show fact. Without the second half, the first degenerates
into ritual — the team plans beautifully, but nobody sees where the
plan systematically diverges from reality.

The reference for every report and setting is
[USER-GUIDE.md, section 13](USER-GUIDE.md#13-operational-reporting).
This chapter is about *which report to read at which ritual* and the
organisational decisions the module will demand from you.

### The planner says "as agreed", reporting says "as it went"

Reports are computed from live YouTrack data — state-transition
history, work logs, sprint snapshots — at the moment you build them.
The module stores nothing: it's a pull model. The practical
consequence cuts both ways. Upside: a report is never "yesterday's",
there are no nightly jobs and no drift. Downside: the module won't
show you "how it looked a month ago" — except the Roll-up, which
reconstructs the monthly trend for the last 6 months from transition
history. History is something *you* create — with an export ritual
(see below).

### Reading rhythm: which report at which ritual

Don't try to read all 13 reports every day — each has its own data
tempo and its own conversation.

| Rhythm | Reports | Conversation |
|---|---|---|
| **Daily, before stand-up** | Aging / stuck | "What's on fire" — issues that have outsat their status thresholds. Complements the stand-up view: that one is about people, aging is about issues. |
| **Weekly** | Flow · Progress · Effort | Where the bottleneck is and whether there's rework; what actually reached the target statuses; where the hours went and who didn't log. |
| **At the sprint retro** | Spillover · Plan vs fact · TTM | Underfulfilment by role and "zombie issues"; estimate accuracy against the threshold; median delivery speed against the norms. |
| **Monthly / quarterly (contour B)** | Roll-up · Technical debt · Bug tax · Thousand small tasks | Trends by system; tech-debt volume and share; how many engineering hours bugs eat; the small-stuff flow against the yearly pace. |

### Two contours — two different conversations

Contour A ("Operational") is the lead's tool: issues and people of
their own team at an operational tempo. Contour B ("Management") is
the manager's tool: aggregates by role and system, monthly trends.
Access is granted via **separate reporting groups** that don't reuse
planning permissions: contour-B membership automatically grants A,
but not the other way around.

Don't hand contour A to "the whole team just in case": the Effort
report shows hours by name, Plan vs fact shows whose estimates didn't
hold. That's material for a lead's conversation with the team, not a
public wall of shame. A sensible starting lineup: contour A — leads
and the Scrum master; contour B — the department manager and PM.

### Thresholds and norms are agreements, not physics

The module ships with starting values: TTM norms (Lead ≤ 21,
Team ≤ 15 working days), the plan-vs-fact threshold (±20 %), the
Spillover zombie thresholds (yellow from the 2nd, red from the 5th
sprint); the aging thresholds you set yourself. All of them are
**hypotheses to calibrate**, not industry constants. The rule is the
same as with overlimit in §3: if the traffic light is red every
sprint, fix either the process or the threshold — don't get used to
red. After two or three sprints you'll have enough data to shift the
thresholds toward your team's reality.

### TTM under reopens: first close or settled close

Tasks come back: "done" turns into "reopened" and gets finished
again. Since v3.2.0 the plugin lets you choose how to read that (the
"Terminal milestone on reopen" setting). **First close** (default) —
the metric stops at the first entry into the end anchor: that's the
speed of the *first delivery*; returns don't blur it, but they're
invisible in it. **Settled close** — the metric end follows the last
entry: that's the *full cost of finishing*, more honest under
frequent returns, but the median will grow. Cycle is always computed
**by episodes**: only time in development is summed, pauses between
rounds (testing, waiting) don't tick. A practical rule: if you live
by an SLA on the first release — keep "first"; if the retro keeps
arguing about the "real" duration of rework — switch to "settled"
and compare: the difference between the two modes is the price of
your returns (cross-check with the Flow report's rework section).

### What must be in order for the reports to come alive

The reports are consumers of the discipline from the previous
chapters. Before enabling, check what the module will feed on:

- **Aging, Progress, TTM, Flow** read state-transition history.
  They work out of the box, but they're only meaningful if the team
  actually moves statuses rather than jumping "Open → Done" on
  closing day.
- **Effort** and the **Bug tax** count logged hours — without the §4
  discipline (DTA, mandatory work type) they'll show garbage.
- **Plan vs fact** compares role-field estimates against fact — it
  needs the pre-sizing practice from §2 Backlog Refinement.
- **Spillover** debriefs closed sprints with history snapshots — no
  validated sprints, no debrief.
- **The "by system" split** (Technical debt, Bug tax, Roll-up) needs
  the subsystem field filled in on issues.

Hence the practical rule: it makes sense to enable reporting in
**week 3** of the rollout (see the checklist in §8), once the first
sprint is closed and the first work logs have accumulated.

### A metric that becomes a target stops being a metric

Goodhart's law applies to every one of the 13 reports. Don't hang KPIs
on "median TTM" and don't reward "zero red aging" — you'll get issues
shuffled through statuses for the report's sake and pauses marked
after the fact. Reports are raw material for the stand-up and retro
conversation: "why has this issue been sitting for 12 days — how can
we help?", not "who's to blame". The tell-tale sign of abuse: the
team starts discussing *how to look better in the report* instead of
discussing the work.

### History through an export ritual

Any report exports to Excel/PDF with one button — with a header
(project, period, generation time). Agree on a ritual: at the end of
the month a designated person exports the Roll-up (and, to taste,
Technical debt and Bug tax) to the wiki or a drive. This buys you
three things: history beyond the Roll-up's 6-month window, an
artefact for the quarterly review without a live YouTrack demo, and a
bridge into BI — the Excel files will travel anywhere.

---

## 7. Anti-patterns and common mistakes

The five most common ways teams quietly break the value of the plugin —
and the test that tells you you're doing one of them.

### Treating the plugin as a Gantt chart only

**Symptom:** the team opens the Gantt view at planning, agrees on a
visual schedule, and never touches the composition tables, the capacity
numbers or DTA.

**Why it backfires:** the Gantt is the *output* of a per-role planning
exercise, not a substitute for it. If you skip composition and capacity,
you're back to "single-bucket velocity" with prettier visualisation.
The Gantt's lanes will fill with whatever was lying around, capacity
warnings won't fire, and the plan will look believable until reality
hits in week two.

**Fix:** plan in the composition tables first; treat the Gantt as the
sanity check at the end of planning, not the start.

### Letting overlimit become the new normal

**Symptom:** a role table shows soft-orange or red overlimit every
sprint; the team commits anyway "because we always pull through".

**Why it backfires:** the overlimit signal is the only thing standing
between honest commitment and slow, invisible burnout. Once it's
ignored systematically, capacity stops meaning anything and the plugin
degrades into a status dashboard.

**Fix:** treat any persistent overlimit as a calibration bug — your
KPI baseline is too high, your assignee list is wrong for the workload,
or the team is silently doing unscheduled work that should be modelled
explicitly. Fix the model, not your tolerance for the warning.

### Logging time on container issues

**Symptom:** parent issues (epics, features, releases) accumulate
direct work-item logs alongside their child logs.

**Why it backfires:** cascade aggregation rolls up child totals.
Direct logs on the parent get added on top, and parent fact totals
become "child sum + ad-hoc parent logs" — neither comparable to plan
nor reproducible. The numbers stop being trustworthy.

**Fix:** enable `forbidContainerWorkItems` to make this structurally
impossible. Train the team to either log on a child issue or create
a "general work" child issue under the container.

### Skipping the work-type field

**Symptom:** people log hours without a work-item type ("it's just
five minutes, I'll skip the dropdown").

**Why it backfires:** DTA reads the type to map hours to a role. A
typeless entry can't be aggregated, so it silently drops out of the
per-role fact totals. One typeless entry per issue is enough to make
that issue's plan/fact comparison meaningless.

**Fix:** keep the mandatory-type rule on. Keep the work-item type list
short — three to five types is plenty for most teams. If people game
the system by always picking the same generic type, your type list is
too vague: rebuild it around the team's actual queues.

### One person owning settings forever

**Symptom:** only the team lead is in `settingsManagerGroup`. When
they're on vacation or change role, the team can't update assignees,
roles, or DTA mappings.

**Why it backfires:** plugin settings need maintenance — every new
hire, every project scope change, every retro insight that suggests a
KPI tweak. A single point of failure in `settingsManagerGroup` turns
those edits into requests that pile up.

**Fix:** put **at least two trusted people** in `settingsManagerGroup`
from day one: the team lead and a deputy (a senior engineer, the
Scrum master, or a designated PM). Document who's in the group in your
team's onboarding notes so the responsibility is explicit, not folkloric.

---

## 8. First-week checklist for the team lead

A pragmatic ramp-up plan. Stretch it across two weeks if your team has
a sprint mid-rollout — don't try to introduce every feature in one go.

### Day 1 — install and lock down `settingsManagerGroup`

Install the plugin from the release zip (Project Settings → Apps →
Install from file). Open the widget on the project's settings page and
click **⚙ Plugin settings**. Until `settingsManagerGroup` is configured,
*all* mutating endpoints are denied — this is intentional, not a bug.
Add at least two people to the group (team lead + deputy, see §7),
save, confirm a reload still respects the rule.

### Day 2 — enable the roles your team actually uses

In settings → **Roles**, switch on only the roles that map to a real
queue with a real backlog (see §5). For most teams that's three to
five roles. Set the visible label per role to whatever your team
calls it — "Frontend" might be "Web UI", "devPlatform" might be "1C"
or "Salesforce". Leave the rest off; you can enable them later
without losing anything.

### Day 3 — define KPI/Grade/Availability for everyone

For each enabled role, list the assignees and set:

- **KPI** — the role-level baseline (see §3). Start conservative; you
  can raise it once you've calibrated against actual fact for a
  couple of sprints.
- **Grade** — per person; default to 1.0 unless someone is clearly
  ramping up or carries a permanent multiplier (part-time, junior,
  domain expert).
- **Availability** — per person, for the *current* sprint. Vacations,
  on-call, training. Update this every sprint at the start of
  planning, not in the middle.

### Day 4 — turn on DTA mappings for the roles that log time

In settings → **DTA**, map each work-item type that appears in your
team's logs to a role. Don't enable the **mandatory type** check yet —
that's the "soft week" from §4. Enable **fact aggregation** so the
per-role actuals start writing back into custom fields. Spot-check a
handful of issues after a day of logging to confirm the mapping fires.

### Day 5 — first planning session with the new structure

Run sprint planning in the **Planning** tab. Walk down the roles,
not the backlog: for each role, pull stories until you're at
capacity. Use a working draft so the team can experiment, then
**Confirm** to snapshot the agreed sprint. Expect this to take
longer than usual the first time — it's a planning-skill change as
much as a tooling change.

After the meeting, write down two things: which roles felt
under/over-budgeted, and which estimates were obviously off. Both
become inputs to the calibration loop in week 2.

### Week 2 — turn on plan/fact warnings and cascade

Once the team has one sprint under the new model:

- Switch the DTA mandatory-type check to **on** (the "hard switch"
  from §4). Announce it on the Friday before, support it actively
  for a few days.
- Enable `dtaWarningsEnabled` so per-log threshold messages start
  firing. Use them as stand-up prompts, not as alerts.
- If your team uses parent/child issue structure, enable cascade
  aggregation and `forbidContainerWorkItems` together. Don't enable
  cascade alone — without the container lock, the math will drift
  (see §7).

By the end of week 2, the team has the full plugin behaviour on, and
you have one sprint of actual data to start calibrating KPI in week 3
and beyond.

### Week 3 — enable operational reporting

Once the first sprint is closed and the first work logs have
accumulated, the reports have something to feed on (see §6, "What
must be in order"):

- Enable the module in settings → **Reporting**; set the contour
  groups: A — leads and the Scrum master, B — the manager/PM.
- Configure the minimum for the daily rhythm: aging thresholds for
  two or three working statuses and the Progress target statuses.
- If you want TTM and Flow — set the Lead/Team/Cycle anchors and
  order the flow statuses; leave the norms at their defaults
  (21/15 wd) until you calibrate on your own data.
- Run every report once: an empty report with a hint is not an
  error but a signal telling you which setting is missing.
- Agree on a reading rhythm (see the table in §6) and on the ritual
  of exporting the Roll-up at the end of each month.

---

## 9. Further reading

- [USER-GUIDE.md](USER-GUIDE.md) — every screen, every button, every
  setting. The reference companion to this guide.
- [CHANGELOG.md](CHANGELOG.md) — what changed in each release and when.
  Useful when a behaviour described here was introduced in a specific
  version.
- [SECURITY.md](../.github/SECURITY.md) — server-side authorization model,
  threat surface, and disclosure process. Read this before granting
  `settingsManagerGroup` to a wider audience.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to file bugs, request
  features, or contribute fixes back upstream.

External:

- *Scrum Guide* (Schwaber & Sutherland, 2020) — the canonical short
  reference for the ceremonies this guide maps onto.
- *Estimation* (Steve McConnell, *Software Estimation: Demystifying
  the Black Art*, 2006) — the calibration mindset behind §3 and the
  §4 retro use of plan/fact data.
- YouTrack Workflow API documentation (JetBrains) — for teams that
  want to extend the workflow rules shipped with the plugin (DTA,
  cascade, container lock).

If something in this guide is unclear or contradicts your team's
experience in the field, please open an issue using the **Question**
template — this document improves with real reports from real teams.
