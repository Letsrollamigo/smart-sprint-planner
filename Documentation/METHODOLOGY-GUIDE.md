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
6. [Anti-patterns and common mistakes](#6-anti-patterns-and-common-mistakes)
7. [First-week checklist for the team lead](#7-first-week-checklist-for-the-team-lead)
8. [Further reading](#8-further-reading)

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

---

## 3. Capacity planning: KPI, Grade and Availability

Per-person capacity in the plugin is the product of three independent
inputs. Tuning them honestly is what makes the overlimit signal
trustworthy — and what makes a "we have room" answer in planning mean
something.

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
  the team is silently absorbing overrun (anti-pattern; see §6).

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

## 6. Anti-patterns and common mistakes

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

## 7. First-week checklist for the team lead

A pragmatic ramp-up plan. Stretch it across two weeks if your team has
a sprint mid-rollout — don't try to introduce every feature in one go.

### Day 1 — install and lock down `settingsManagerGroup`

Install the plugin from the release zip (Project Settings → Apps →
Install from file). Open the widget on the project's settings page and
click **⚙ Plugin settings**. Until `settingsManagerGroup` is configured,
*all* mutating endpoints are denied — this is intentional, not a bug.
Add at least two people to the group (team lead + deputy, see §6),
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
  (see §6).

By the end of week 2, the team has the full plugin behaviour on, and
you have one sprint of actual data to start calibrating KPI in week 3
and beyond.

---

## 8. Further reading

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
