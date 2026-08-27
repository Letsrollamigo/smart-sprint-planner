# 07. Planning modes

**Optional.** This section switches extra planning capabilities on and off. Everything is off by default — and that is a working configuration.

## Where

**Project Settings → Apps → Smart Sprint Planner → PLANNING → Planning Modes**.

## The switches

| Switch | What it gives | When to switch it on |
|---|---|---|
| **Personal planning** | every assignee gets their own resource and remainder inside a role | when it matters to see people's load, not just roles' |
| **Manual assignee resource** | a person's resource is typed in rather than derived from the grade | when the capacity formula does not describe your reality |
| **Use personal resource** | the role's remainder is computed from the sum of personal resources | together with personal planning |
| **Dynamic editing** | edit hours straight in the composition table without opening the issue | almost always convenient |
| **Planning above the limit** | allow saving an over-limit composition without a modal warning | if the team knowingly over-promises and does not want a dialog each time |
| **Automatic date forecast** | a «Forecast dates» button lays issues out day by day as a queue | when dates are set in bulk |

## Personal planning

The weightiest of the switches. Without it a role is «336 hours» and nothing more. With it, a role gains a list of people, each with their own resource and remainder, and the [Distribution by assignees](../01-overview/07-assignees.md) screen starts computing personal remainders.

Worth switching on once the team is bigger than two or three: otherwise «the role is not over limit» can hide the fact that all the work has landed on one person.

## Planning above the limit

Even without this switch the planner does not forbid an over-limit — it shows a modal warning. The switch removes the modal and leaves the red marker.

Over-limit detection is always kept: the numbers stay honest, only the nagging changes.

## Automatic date forecast

The button appears on the distribution screen. It lays the role's issues out across the calendar as a queue: the next one starts after the previous, skipping weekends and absences.

It is a draft, not a schedule: the dates are then corrected by hand or by dragging on the [Gantt chart](../01-overview/09-gantt.md).
