# 01. What the project needs before you start

**Required.** The planner creates nothing in YouTrack by itself: it leans on fields and states that already exist in the project. Without them the setup stalls on the first screen that asks you to pick a field from a list.

## In short

The planner answers «how many hours does each role spend on an issue and do we fit into the sprint». To work that out, the project must have:

1. an **assignee field for each role** — who does that work;
2. an **estimate field for each role** — how many hours are planned;
3. an **actual field for each role** — how many hours were spent;
4. a **state flow** — the stages an issue moves through;
5. **time tracking switched on** in the project.

The planner supports up to nine roles (analysis, testing and seven kinds of development), but only switch on the ones the team actually has. The demo project in this documentation has three: analysis, platform development, testing.

## Role fields

Each role you switch on needs three issue fields:

| Field | YouTrack type | Example name |
|---|---|---|
| Role assignee | user | `Analyst`, `Developer`, `Tester` |
| Estimate in hours | period | `Est Analysis` |
| Actual hours | period | `Act Analysis` |

Names are free — the planner does not require specific ones. Only the **type** matters: the assignee is a user field, estimate and actual are period fields.

Fields are created the usual way: **Project Settings → Custom Fields → Add field**. If the team already uses such fields in another project, they can simply be attached to yours — no need to create copies.

## The state flow

The planner reads the issue's state and shows it in tables, on the Gantt chart and in the stand-up. Any flow will do — YouTrack's standard one or your own.

The more meaningful the flow, the more useful the backlog zones and the stand-up become (chapters [11](11-backlog.md) and [12](12-standup.md)). But whatever flow already exists is enough to start.

💡 **Give the states colours right away.** The planner uses YouTrack's state colours on the Gantt chart and in the chips. If you colour the flow after a sprint has been built, the colours will not reach the existing composition — it will have to be refreshed by hand.

## Time tracking

Check **Project Settings → Time Tracking** — the switch must be on. Without it YouTrack will not accept logged hours and the planner cannot show the actuals.

If you plan to switch on [differentiated time tracking](13-dta.md), create the work item types there too — one per role: `Investigation`, `Development`, `Testing`, for instance.

## Other fields

Useful but not required: priority, cross priority, the name of a system or subsystem, issue type. Without them the planner falls back to the standard `Priority` and `State` (chapter [06](06-other-fields.md)).

## A common mistake

Do not create fields «just in case» by the dozen: every one of them lands in the pickers during the planner's setup, and finding the right one becomes hard. Attach exactly the fields the team actually fills in.
