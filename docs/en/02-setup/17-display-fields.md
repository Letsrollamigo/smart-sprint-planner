# 17. Display fields

**Optional.** This section lets you bring any of your project's fields into the issue tables.

## Where

**Project Settings → Apps → Smart Sprint Planner → ADMINISTRATION → Display fields**.

## How it works

A list of fields, each with three checkboxes: which tables to show it in.

| Checkbox | Where the column appears |
|---|---|
| **Summary** | the cross-role allocation summary |
| **Role** | the role composition and the distribution by assignees |
| **My role** | the personal «My role» view |

![A role composition with the Stage and Unit columns to the right of the inclusion status](../../assets/ov-003-role-composition.en.png)

## Values are not stored

The planner does not copy field values to itself: it reads them from YouTrack when the table opens.

Two consequences follow, and both are good:

1. **You see exactly what you have access to.** A field hidden from you by YouTrack's permissions stays empty — the planner does not go around the tracker's rights.
2. **Values are always fresh.** Change a field on an issue and the table already shows the new value; the composition need not be refreshed.

## How many columns can be added

Technically as many as you like: the planner already fetches every field of an issue in one request, and an extra column costs nothing in speed.

Practically three or four. Beyond that the table stops fitting on screen and the columns start getting in each other's way.

## What to choose

Fields that answer «what kind of work is this» are useful: system, component, stage, stream. Fields already in the table — priority, state, estimate — are not offered at all (see below).

🔴 **Only choose fields the project actually has and that are filled in.** YouTrack's «Spent time», for instance, is not a custom field — it lives in time tracking, and a column for it comes out empty. An empty column is worse than a missing one: it looks like breakage.

## What the list leaves out

Fields the planner already shows as columns through other settings do not appear in the list: role estimates, actuals and assignees, priority, cross priority, state, system, external ticket ID. That way the same field never lands in the table twice.

The issue type, sprint (the shared one and per-role ones) and version fields are not shown as columns, so they are in the list: «Type», for instance, can be shown as a column of its own without removing it from «Other fields» (since version 3.43.0).
