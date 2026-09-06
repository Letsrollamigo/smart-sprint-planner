# 14. Coming from Jira: a glossary

If your team used Jira before, the familiar words are not where you expect them, and not under the same names. This chapter is a dictionary: Jira term → what the planner calls it → which chapter describes it. At the end — what the planner deliberately does differently, and what it does not have.

The planner does not replace YouTrack. Issues, states, time tracking and boards stay in the tracker; the planner is a sprint-planning layer **per role** on top of it.

## Planning a sprint

| In Jira | In the planner | Where |
|---|---|---|
| Sprint | **Sprint** — name, period, goal, participating roles. Each role keeps its own composition | 02 |
| The «Sprint» issue field | The project's **sprint field** — shared, or one per role. The planner reads it and, behind a separate switch, writes the chosen value into the issues of a confirmed composition | 02; [Setup](../02-setup/), chapter 05 |
| Backlog | **Backlog workspace** — a pool of issues by zones «state → role» or as a tree; «lay into sprint» distributes an issue across roles | 04 |
| Team | **Roles** — kinds of work (analysis, development, testing…), not teams and not job titles. People join a role from YouTrack groups | 05, 06; [Setup](../02-setup/), chapter 05 |
| Team capacity | **Capacity** — a role's resource in hours: entered by hand, computed as «norm × grade coefficient × rate × participation», or taken from the approved sprint capacity with the calendar and absences | 03, 05 |
| Assignee | **Assignee** — a role's issues distributed among people, with a personal remainder and auto-forecast of dates | 07 |
| Sprint Goal | **Sprint goal** — title, success metric, owner; on closing, the planner asks for the outcome | 02 |
| Start / Complete Sprint | **Role rungs**: draft → agreed → distributed → closed. «Finish sprint» (or «Finish all roles») stores a snapshot of the composition in history | 12, 10 |
| Roadmap, Timeline | **Gantt chart** per role — issue dates, dependency arrows, zoom | 09 |
| Dashboard | The planner's **main menu** — an entry across all projects, outside a project tab | 01 |

## Estimates and time

| In Jira | In the planner | Where |
|---|---|---|
| Story Points | **None.** Estimates are in hours, in a separate period field per role («Estimate field» in the roles table) | 06; [Setup](../02-setup/), chapter 05 |
| Original Estimate | **Role estimate** — the same period field. The planner reads it from the issue and does not store it | 06 |
| Time Spent, Log work | **Role fact** — YouTrack work items, split across roles by work type (differentiated time accounting) | 06; [Setup](../02-setup/), chapter 13 |
| Remaining Estimate | **Remainder** — estimate minus fact. If the issue has a manual **allocation**, that is what counts | 05, 06 |
| Velocity | **Team velocity** — report A11: closed hours per role over recent sprints, plus the trend. Computed from history snapshots, separately for each role | [Reporting](../03-reporting/), chapter 05 |
| Burndown | **None.** Sprint progress is read from role remainders, the stand-up and the «Progress» report | 05, 08; [Reporting](../03-reporting/), chapter 02 |

## Issue structure

| In Jira | In the planner | Where |
|---|---|---|
| Epic ▸ Story ▸ Sub-task | **Hierarchy through the «subtask» link** — the backlog tree, plan/fact cascade «parent ← children», the parent's state following its least-advanced child | 04; [Setup](../02-setup/), chapters 14–16 |
| Issue links (blocks, is blocked by) | **Issue links** — the set of phrasings is configurable; dependencies are drawn as arrows on the Gantt | 09; [Setup](../02-setup/), chapter 16 |
| Components | The **«System»** field — a column in composition and assignee tables | 06; [Setup](../02-setup/), chapter 06 |
| Fix Version, Release | **Releases** — kind (release or hotfix), issue composition, statuses synced to issue states, a readiness traffic light | 11 |

## During the sprint

| In Jira | In the planner | Where |
|---|---|---|
| Daily stand-up | **Stand-up** — a full-screen mode: per role «done yesterday / today / blocked», a timer | 08 |
| Sprint report | **Sprint history** — a snapshot of every role's composition, export to Excel and JSON, a way back to editing | 10 |
| Moving unfinished issues on Complete Sprint | No automatic move. In the next sprint's backlog such issues are labelled **«Carryover»** or **«Continuation»**; what to take next is decided by the team at planning | 04 |
| Retrospective | **Goal outcome** — on closing, the planner asks whether the goal was met and takes a retrospective note | 02 |

## What we deliberately do differently

1. **Hours instead of story points.** The planner compares a role's load with its resource in hours. Story points for the whole team add up into one bucket and hide that testing is the bottleneck while development idles. Hours per role are the whole point of the planner.
2. **A sprint is several compositions, not one list.** Every role has its own composition, resource, remainder and overlimit. A composition can be agreed one role at a time, without waiting for the others.
3. **Capacity is computed, not guessed.** Calendar, absences, grade coefficient, participation share — the three models are described in chapter 03.
4. **The planner stores nothing about issues.** Estimates, fact, states, assignees live in YouTrack. The planner reads them and writes back only the assignee and the sprint value — and only when explicitly configured.
5. **Closing a sprint moves nothing.** Unfinished issues stay in the tracker as they are; at the next planning the backlog shows them with the «Carryover» label. The decision belongs to the team, not to a button.

## What is not there

- Story points, a burndown chart, a drag-and-drop board — boards stay in YouTrack.
- Creating issues from the planner — issues are created in the tracker.
