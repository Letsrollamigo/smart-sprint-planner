# 05. Roles and issue fields

**Required.** The main configuration screen: it decides which roles take part in planning and which issue fields their numbers are read from.

## Where

**Project Settings → Apps → Smart Sprint Planner → PLANNING → Roles and fields**.

![The roles table: three enabled roles with estimate, actual and assignee fields; six disabled](../../assets/setup-009-settings-unlocked.en.png)

## The table

One row per role, nine in total: **Analysis**, **Testing**, **Platform development** and six kinds of specialised development (Back, Front, iOS, Android, FullStack, DB).

| Column | What to choose |
|---|---|
| the checkbox on the left | whether the role takes part in this project's planning |
| **Estimate field** | a period-type issue field holding this role's planned hours |
| **Actual field** | a period-type issue field holding the actuals |
| **Assignee field** | a user-type issue field: who does this work |

A disabled role appears nowhere: not in the sprint, not in the backlog, not in reports. The dashes in its row are normal.

## How many roles to enable

Exactly as many kinds of work as the team really plans **separately**. If development is planned as a single figure, there is no need to enable six sub-roles — it only fragments the tables.

The typical set is three roles: analysis, development, testing.

## Why the fields are required

The planner does not keep hours of its own: it reads the role's **estimate field** and adds them up. Without that field the role cannot work out an allocation, a remainder or an over-limit — it will be enabled but empty.

The same goes for the **actual field**: without it there is no «Actual» column, the issue's resource (estimate minus actual) is not computed and the «Plan vs fact» report does not work.

The **assignee field** is what the distribution screen and the Gantt chart need: it tells the planner who does the issue in this role. An ordinary `Assignee` will not do when there are several roles: an issue has one `Assignee` but three role assignees.

## What happens if a field is chosen wrongly

The planner does not check meaning; it checks only the field's type. Point the analysis role's «estimate field» at development's estimate and everything will work — and add up the wrong thing. Check the names line up.

## The order of roles

Roles come in a fixed order and cannot be rearranged. That same order drives how roles appear on the planning screens and in reports.

## After saving

The **Save Settings** button at the bottom. Once saved, the roles appear in the planner's pickers and a sprint can be built.

⚠️ A **sprint's** set of roles is fixed when it is created. Enable a new role later and it appears in new sprints, while older ones keep their original set — that way history is not rewritten after the fact.
