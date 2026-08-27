# 05. Total resource allocation

The main planning screen. This is where you see whether the work fits into the sprint.

## Where

Rail → **Planning → Total resource allocation**.

![The cross-role summary: three roles, each with resource, allocation and issue count; testing is over limit](../../assets/ov-002-allocation.en.png)

## The header

The top panel summarises the whole sprint: how many **tasks**, how many **roles**, and which roles are **over limit**. The triangle on the right expands the cross-role summary table.

## A role's row

Each role is one collapsed row:

| Item | What it means |
|---|---|
| **Resource: 336 h** | how many hours the role has — taken from the [Capacity](03-capacity.md) screen |
| **Allocation: 256 / 336 h** | how much of that resource the role has already planned |
| **9 tasks** | how many issues are in the role's composition |
| **Over limit** | a red marker: allocation has passed the resource |

**Over limit is not a block.** The planner does not stop a team from over-promising; it stops them from over-promising *unnoticed*. The decision is the team's: drop an issue, cut an estimate, or knowingly go negative.

## The «Refresh from task» button

The button above the role list re-reads the issues in YouTrack and updates what the planner stores about them: state, priority, estimate, assignee, state colour.

Press it when the team has been working in the tracker rather than in the planner: states have moved, estimates have changed, and the sprint composition does not know about it yet.

⚠️ The button refreshes the **current role**. With three roles, refreshing all of them means pressing it in each.

## The «Hide tasks excluded from sprint» switch

An issue can sit in the composition with the «excluded» status — taken out but not deleted, so the record of that decision is not lost. The switch takes such rows out of sight.

## An expanded role card

Clicking a role's row expands it fully: planning status, resource, remainder and the issue table. Details are in chapter [06](06-role-card.md).

## Where the hours come from

The planner does not invent hours. Every role has an **estimate field** named in the project settings — `Est Development`, for instance. The role's allocation for an issue is read from that field on the YouTrack issue.

Hence the main rule: **if the estimate is not filled in on the issue, it will not be in the planner either.** An empty allocation on screen is almost always an empty field in the tracker, not a planner failure.

## What counts as the remainder

**Remainder = role resource − sum of allocations.** A negative remainder is highlighted red and produces the «Over limit» marker.

The remainder is recomputed by the **Σ Recalculate remainder** button inside a role card — useful when hours have been edited by hand and you want the balance settled without saving.
