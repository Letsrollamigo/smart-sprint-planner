# 13. Differentiated time tracking

**Optional.** This module frees the team from filling the actual-hours fields by hand: hours reach the right role by themselves, from YouTrack's ordinary work items.

## Where

**Project Settings → Apps → Smart Sprint Planner → ADMINISTRATION → Diff. tracking**.

## How it works

In YouTrack every logged work item has a **work type**. The module maps a work type onto a planner role:

| Work type | Role |
|---|---|
| Investigation | analysis |
| Development | platform development |
| Testing | testing |

A workflow rule in the app then sums the work items by type and writes the totals into the roles' **actual fields** — the ones chosen in chapter [05](05-roles-fields.md).

People log time as usual, choosing a work type. The planner receives actuals already split by role, and nobody duplicates anything.

## What is configured

| Setting | What it defines |
|---|---|
| **Enable differentiated tracking** | the main switch |
| **Work type mapping** | YouTrack work type → planner role |
| **Plan/fact notifications** | whether to warn the assignee when the actual passes the estimate |

## What to prepare first

Work types are created in YouTrack: **Project Settings → Time Tracking → Work types**. Create one per role before switching the module on.

## The workflow fills the actual fields

🔴 **Once the module is on, do not fill the actual fields by hand** — the workflow will overwrite the value on the next logged item. The module becomes the single source of those numbers.

If manual entry of actuals is needed, do not switch the module on.

## Plan/fact notifications

A separate switch. When a role's actual passes its estimate, the planner leaves a notification on the issue. Useful on long issues; noise on short ones.

## What this gives reporting

Without differentiated tracking, the «Effort», «Plan vs fact» and «Bug tax» reports rest on someone having filled the actual fields carefully by hand. With it, they rest on real logged time. The difference is usually decisive.
