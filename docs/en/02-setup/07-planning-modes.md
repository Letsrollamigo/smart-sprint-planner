# 07. Planning modes

**Optional.** This section switches extra planning capabilities on and off. Everything is off by default — and that is a working configuration.

## Where

**Project Settings → Apps → Smart Sprint Planner → PLANNING → Planning Modes**.

## The switches

| Switch | What it gives | When to switch it on |
|---|---|---|
| **Direct editing of YouTrack issue fields from sprint table** | edit hours straight in the composition table without opening the issue: the estimate is written on Enter or when leaving the field (an empty field does not zero it — type 0 to zero it), list fields — with confirmation | almost always convenient |
| **Write the sprint into YouTrack issues** | confirming a role composition sets the chosen sprint value on each issue; the value is only set and never cleared | when the sprint field on issues must match the agreed composition |
| **Allow planning with role resource over-allocation** | validation is not blocked when a role's allocation exceeds its resource; a negative remainder is still red | if the team knowingly plans with overload |
| **Auto-forecast dates** | a “Forecast dates” button lays issues out day by day as a queue; there is no such switch in the Simple model | when dates are set in bulk |

Personal planning is not among the switches: everyone's own resource and remainder appear with the Light or Full model, which is chosen in the Capacity section ([chapter 10](10-capacity.md)).

## Writing the sprint into issues

Off by default. When a role composition is confirmed, the planner sets the chosen sprint value in the sprint field of every active issue of that composition. The field comes from the settings: the role's sprint field ([chapter 05](05-roles-fields.md)) or, if it is not set, the common sprint field ([chapter 06](06-other-fields.md)). Until a sprint field is configured, the switch does nothing.

The write runs under the user's own rights: an issue the user may not edit is left untouched. The value is only set and never cleared — someone may have set it by hand before the planner, and wiping it would destroy their work. Multi-value fields are not supported: assigning would replace the issue's whole list of sprints.

## Resource over-allocation

While the switch is off (the default), a role whose total allocation exceeds its resource cannot be confirmed: the over-limit dialog appears and validation does not pass. The switch lifts the block and the dialog; a negative remainder is still highlighted in red.

Over-limit detection is always kept: the numbers stay honest, only whether the planner forbids confirmation changes.

## Auto-forecast dates

The switch exists in the Light and Full models: the forecast lays work out across people, and the Simple model has no people.

The button appears on the distribution screen. It lays the role's issues out across the calendar as a queue: the next one starts after the previous, skipping weekends and absences.

The same button sits on the [Gantt chart](../01-overview/09-gantt.md) in «All roles» mode: there the dates are computed for every role of the sprint at once — an issue waits for its predecessors by dependency links and along the task chain (since version 3.48.0).

It is a draft, not a schedule: the dates are then corrected by hand or by dragging on the [Gantt chart](../01-overview/09-gantt.md).
