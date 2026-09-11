# 02. Sprint parameters

The screen a sprint starts from: its name, its goal, its period and the roles taking part.

## Where

Rail → **Sprint parameters**.

![Filled-in sprint parameters: name, goal, period and three participating roles](../../assets/ov-001-sprint-params.en.png)

## Fields

| Field | What goes in |
|---|---|
| **Sprint name** | whatever the team calls the sprint: «Sprint 24 — September 2026» |
| **Sprint goal** | one or two lines about the outcome. Not a task list — the reason the sprint exists |
| **Start date** / **End date** | the sprint's period |
| **Participating roles** | which roles take part; taken from the project settings |

There is a single **Save Sprint Parameters** button on the screen — every field is saved at once.

## How dates are set

Click a date field and the YouTrack calendar opens (the same one the people table uses for task dates). Pick a day; the ‹ › arrows move between months; you can also type the date in the line above the calendar. The cross in the field clears the choice. The planner stores dates as calendar days without a time — the same day in every time zone.

Since 3.45.0 every date picker in “Sprint parameters” is the same — for the sprint period and for the work phases alike.

## What the goal is for

The sprint goal is shown on the [stand-up](08-standup.md) screen, right above the state sections. The point is that during the daily five minutes everyone can see what all this work is for. The field is optional, but teams that fill it in argue about priorities mid-sprint less often.

The hint under the field says the same thing more briefly: one or two lines, an outcome rather than a task list.

## Creating a new sprint

The **+ New sprint** button in the rail. The dialog asks for a name and a period, after which the sprint appears in the selector as the current one.

The button can be unavailable: the **Sprint creation lock** toggle forbids starting a new sprint before the previous one is closed. The toggle sits right there in the rail, and it can be switched by anyone in the settings-manager group.

## Participating roles

The **Participating roles** line lists this sprint's roles. It is not the project's full role list but exactly those taking part here: a sprint can run without testing if there is nothing in it to test.

The sprint's set of roles is fixed when it is created and stored with the sprint. So if another role is switched on in the project settings later, older sprints will not notice — and the history stays as it was.

## Work phases

The **“Work phases”** block is the last section of the card, below the “Save sprint parameters” button, with its own **“Save work phases”** button. It appears when the “Work phases in the sprint are enabled” toggle is on in the project settings (chapter 18 of “Setup”); when the toggle is off the block is hidden, the dates you entered are kept and return once it is enabled again.

Six phases in a fixed order: **Analysis → Development → Tech test → Regression → Business test → Deploy**. Each has one “from”–“to” pair or nothing (“not planned”). Phases may overlap — regression and the business test usually do.

A phase row: name → lane with the sprint scale (weekly divisions, labels on Mondays and the last day) → “from” picker → “to” picker → marks. When roles are mapped to phases in the settings, the phases of the role selected in the rail are drawn in a saturated tone with a role chip and the rest are dimmed; with no mapping every phase shares one tone.

**Marks** (orange — they do not block saving):

- **starts before “…”** — the phase starts before the previous non-empty phase of the chain (say, the business test was placed before regression). The full explanation is in the hover tooltip.
- **outside the sprint range** — the sprint was moved or narrowed and the phase stayed outside; the bar is cut with a dashed edge at the scale border. Move the phase to clear the mark.

**Refusals** (red — the phases are not saved until the row is fixed): end before start; only one of the two dates set; an edited phase outside the sprint range. A line “Phases not saved: fix the marked rows” appears under the button. An old phase left outside after the sprint was narrowed does not block editing the other phases.

**Who can edit:** a sprint editor or a validator — independently of the “Save sprint parameters” button (a validator without editor rights sees the parameters locked and the phases editable). For everyone else the pickers are disabled and the button tooltip names both groups. Once the sprint is finished (all roles closed) the phases are read-only.

Phases are the same for every role of the sprint and are copied into all of its history snapshots; in the Excel export of a role they go as separate rows of the sheet header. Moving the sprint dates does not move the phases — it only highlights them.

## Status chips

Below the sprint selector there is one chip per role:

- **Draft** — the composition is being built;
- **Composition agreed** — the role has confirmed its composition;
- **Distributed** — the issues have been spread across people;
- **Closed** — the role's sprint is over and has moved into the history.

Roles climb that ladder independently: analysis can already be agreed while testing is still a draft. Details are in chapter [12](12-stages-rights.md).
