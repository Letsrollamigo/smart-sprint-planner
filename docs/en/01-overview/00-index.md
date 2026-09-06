# Smart Sprint Planner — Overview

A walk through every screen of the planner: what each tab shows, what each button does, where the numbers come from.

Planner version **3.36.0**. Screenshots taken on YouTrack **2026.1**.

## Who this is for

Everyone who works inside a sprint: analysts, developers, testers, leads and managers. Knowing YouTrack at the level of «I can open an issue» is enough.

If you need to **set the planner up** in a new project, that is a different document: [Setup and rollout](../02-setup/). If you need **reports**, a third one: [Reporting](../03-reporting/).

## What the planner does, in two sentences

The planner answers one question: does the work fit into the sprint. It takes YouTrack issues, lays them out by role, adds up each role's hours, compares that with the role's resource and shows where the team over-promised.

Everything the planner knows about an issue it reads from YouTrack. It invents nothing: if an estimate is not filled in on the issue, it will not appear in the planner either.

## Contents

| # | Chapter | About |
|---|---|---|
| 01 | [Where the planner lives and how to open it](01-entry.md) | two entry points, picking a project, the header, language |
| 02 | [Sprint parameters](02-sprint-params.md) | creating a sprint, the goal, the period, participating roles |
| 03 | [Capacity](03-capacity.md) | working out each person's resource, the calendar, absences |
| 04 | [Backlog](04-backlog.md) | the incoming pool, zones, the tree, sending issues into the sprint |
| 05 | [Total resource allocation](05-allocation.md) | sprint composition by role, resources, remainders, over-limit |
| 06 | [Inside a role card](06-role-card.md) | the role's issue table, inclusion statuses, validation |
| 07 | [Distribution by assignees](07-assignees.md) | who does what, personal remainders, dates |
| 08 | [Stand-up](08-standup.md) | the screen for the daily five minutes |
| 09 | [Gantt chart](09-gantt.md) | dates, dependencies, zoom levels |
| 10 | [Sprint history](10-history.md) | closed sprints, export, going back to edit |
| 11 | [Releases](11-releases.md) | planned releases, composition, the readiness bar |
| 12 | [Sprint stages and who can do what](12-stages-rights.md) | draft → agreed → distributed → closed |
| 13 | [Day one on a new project](13-first-day.md) | what you see before setup, and why |
| 14 | [Coming from Jira: a glossary](14-jira-mapping.md) | Jira term → its place in the planner, what is done differently |

## Conventions

- **Role** — a kind of work: analysis, development, testing. Not a job title and not a person.
- **Role resource** — how many hours the role can take into the sprint.
- **Allocation** — how many hours the role has planned for an issue.
- **Remainder** — resource minus the sum of allocations. A negative remainder is shown in red.
- **Estimate** and **actual** are fields on the YouTrack issue itself; the planner only reads and sums them.

All data in the screenshots is invented — the issues, the systems and the people.
