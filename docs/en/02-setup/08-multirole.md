# 08. Multi-role planning

**Optional.** This section is about how the planner behaves when several roles work on one issue.

## Where

**Project Settings → Apps → Smart Sprint Planner → PLANNING → Multi-role planning**.

## What is configured

| Setting | What it gives |
|---|---|
| **Cross-role summary table** | a shared spoiler appears above the role list: one issue per row, roles as columns, totals at the edges |
| **Cross-role exclusion of an issue** | excluding an issue from the sprint in one role also excludes it in the sprint's other roles |

## The summary table

The expanded summary answers a question that otherwise means switching between roles: **how many hours in total has the whole team put into one issue**.

A row is an issue, a column is a role, and the intersection holds the allocation. The right edge totals the issue, the bottom totals the role. Over-limit is highlighted in the same red as in the role cards.

It is a read-only view: hours cannot be edited here — the role's composition is for that.

## Cross-role exclusion

With this setting, excluding an issue is global: excluded from the sprint in one role — by an inclusion-status change or with the bin — means excluded from every role. On a status change the same reason and the same who/when stamp go to all roles in one act, and the reason dialog lists the roles the cascade will reach (the bin removes the row without a reason). Returning an issue does not cascade.

Without it, exclusion is per-role: analysis on the issue is finished and excluded while testing carries on. Useful on long issues that stretch across several sprints through different roles.

## When to switch this on

With a single role, not at all. With three, where issues regularly pass through all of them, the summary saves time in a planning meeting: it shows that an issue does not «cost» 40 hours of development but 40 plus 18 of analysis plus 14 of testing.
