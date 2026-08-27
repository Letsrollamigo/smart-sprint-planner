# 06. Other fields

**The «Main» part is required.** This is where the planner learns which field in your project holds the priority and which holds the state.

## Where

**Project Settings → Apps → Smart Sprint Planner → PLANNING → Other Fields**.

## Main

| Field | What for |
|---|---|
| **Priority** | the priority column in tables, sorting issues |
| **State** | the issue's state in tables, on the Gantt chart, in the stand-up, in the backlog zones |

If nothing is chosen, the planner falls back to fields named `Priority` and `State` — YouTrack's standard ones. Saving is not blocked, but a warning is shown.

Better to choose explicitly: in projects with renamed fields the guess fails, and half the screens end up with no states.

## Optional

| Field | What it gives | Needed? |
|---|---|---|
| **Cross priority** | a second priority scale — when an issue's importance across the portfolio differs from its importance inside the project | up to you |
| **System** | the «System» column in tables and a breakdown in reports | handy when there are many subsystems |
| **External issue ID** | the issue's number in a neighbouring tracker | if issues are kept in two systems |
| **Sprint field** | if the project already has its own sprint field, the planner can fill it | up to you |
| **Version** | ties issues to a version | up to you |
| **Type** | the issue type; used by the backlog filter, the estimate roll-up and reports | needed for chapters [11](11-backlog.md), [14](14-cascade.md) and reporting |

An empty value is a normal choice: the planner simply omits the matching column.

## What «System» affects

This is the most useful of the optional fields. The «System» column appears in role compositions, in the backlog and in the distribution by assignees, and reporting builds a whole breakdown on it — the Roll-up report shows a monthly metric trend **by system**.

If the project has one system, the field can be left out. If it has five, fill it in: without it the circuit-B reports lose half their meaning.

## What «Type» affects

The issue-type field is used in three places:

- **the backlog's type filter** — which types reach the pool at all (chapter [11](11-backlog.md));
- **the estimate roll-up** — the type decides the hierarchy levels: what counts as an epic and what as a story (chapter [14](14-cascade.md));
- **the circuit-B reports** — «Technical debt» and «Bug tax» separate bugs and debt from features by type.

## Steps

1. In «Main», choose the priority field and the state field.
2. In «Optional», choose whatever will actually be useful.
3. Press **Save Settings**.
