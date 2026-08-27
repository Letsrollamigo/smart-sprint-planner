# 11. Backlog: pipeline zones

**Optional.** This module turns the project's issue list into a queue of work laid out by stage and role.

## Where

**Project Settings → Apps → Smart Sprint Planner → ADMINISTRATION → Backlog**.

## What is configured

| Setting | What it defines |
|---|---|
| **Starting states** | which states count as «work has not begun» — the customer pool is built from them |
| **Zones** | an ordered list: state → role (or several roles) |
| **Type filter** | which issue types reach the pool |
| **Pause states** | states where an issue is formally in progress but the team is not moving it |
| **Pause tags** | the same, by issue tag |

## Zones

A zone is a pair: «pipeline state → whose work this is». The order of zones in the list drives the order of sections on the backlog screen, and it should mirror the real flow.

An example:

| State | Role |
|---|---|
| Analysis | analysis |
| Analysis Review | analysis |
| Development | platform development |
| Code Review | platform development |
| Testing | testing |
| Business Test | testing |

One state may belong to several roles — the planner allows that.

## The type filter

It limits the pool by issue type: usually `Feature`, `Bug`, `Tech Debt`. Epics and stories are kept out so that the queue consists of work rather than containers.

⚠️ **The filter applies to the tree as well.** The Tree view builds its hierarchy from the same issues that reached the pool. If an epic's child has a type outside the filter, it will not be in the tree and the epic will look empty.

## Pauses

A pause is a state or tag meaning «we are waiting on someone else»: a vendor, a customer's answer, another team's release. The planner singles such issues out, and reporting subtracts pauses from cycle time — otherwise waiting on a vendor lands in the team's speed metric.

## Unmapped states

The planner compares the project's list of states against its own layout and shows an orange bar when a state belongs to no zone, no starting state and no pause, and is not marked resolved in YouTrack.

Close that bar before the team starts using the module: issues in an unmapped state are simply invisible on the backlog screen.
