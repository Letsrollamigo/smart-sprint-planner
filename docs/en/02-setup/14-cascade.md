# 14. Estimate roll-up

**Optional.** This module adds children's estimates and actuals up into the parent: an epic shows the sum of its stories, a story the sum of its subtasks.

## Where

**Project Settings → Apps → Smart Sprint Planner → ADMINISTRATION → Cascade**.

## What is configured

| Setting | What it defines |
|---|---|
| **Enable the roll-up** | the main switch |
| **Type field** | which field decides the hierarchy level |
| **Level 2** | type values that count as a «story» |
| **Level 3** | type values that count as an «epic» |
| **Manual estimate protection tag** | a tag that excludes a parent from aggregation |
| **Forbid work items on containers** | prevent logging time on parents |

## Two levels, no more

The roll-up supports **two levels** of hierarchy: epic ← story ← subtask. It goes no deeper, deliberately: deep trees turn aggregation into a source of discrepancies nobody can check.

## The parent-child link type

The roll-up walks the hierarchy links. Which link types count as hierarchy is set not here but in [Issue links](16-links.md) — the «link type × role» table lives there.

## The manual estimate protection tag

Sometimes a parent has a meaningful estimate of its own that the sum of its children would ruin: an epic estimated by judgement whose children are not all created yet.

Put the configured tag on such a parent and the roll-up skips it.

## Forbidding work items on containers

A separate workflow rule: it refuses to let time be logged on level-2 and level-3 issues. The point is that hours should land on concrete work rather than on a container — otherwise the sum of the children and the parent's own hours start arguing.

Worth switching on together with the roll-up: separately the two contradict each other.
