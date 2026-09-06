# Reporting

Fourteen reports in two circuits: what each one answers and what it needs from the data.

Planner version **3.36.0**. Screenshots taken on YouTrack **2026.1**.

## Who this is for

Leads, heads of disciplines and anyone who answers «how are we doing» with numbers rather than impressions.

How to **switch reporting on** and what to configure — chapter 19 of [Setup and rollout](../02-setup/19-reporting.md).

## Two circuits

| Circuit | About | Usually granted to |
|---|---|---|
| **Operational (A)** | what is happening now and why it is slow: stuck issues, cycle time, bottlenecks, effort, plan versus fact | leads and teams |
| **Management (B)** | what the process costs: technical debt, the share of work spent on bugs, the flow of small change, monthly trends by system | managers |

The split is not about secrecy but about horizon: circuit A looks at the current sprint, circuit B at quarters.

Access is granted per circuit in the [permissions matrix](../02-setup/09-permissions.md).

## Contents

| # | Chapter | Reports |
|---|---|---|
| 01 | [How reports work](01-how-it-works.md) | period, filter, building, export |
| 02 | [What is happening now](02-now.md) | Aging, Progress, WIP/Done |
| 03 | [How long it takes](03-time.md) | TTM, Flow |
| 04 | [What it cost](04-effort.md) | Effort, Plan vs fact |
| 05 | [How much is left](05-forecast.md) | Backlog in hours, Spillover, Velocity |
| 06 | [The management circuit](06-management.md) | Technical debt, Bug tax, Thousand small tasks, Roll-up |

## About the numbers in the screenshots

⚠️ The demo project was built specifically for this documentation and **has no state history**: every issue received its state on the same day. So in the screenshots the reports that measure time — TTM, Flow, Aging, Roll-up — show zeros and single points.

That is a limitation of the demo instance, not of the reports: time in a state cannot be backdated in YouTrack, unlike logged hours. Look at how the screen is built and at what exactly is counted — the numbers in your project will be your own.

Reports that need only logged time and sprint snapshots — Effort, Plan vs fact, Velocity, Spillover, Bug tax — are alive in the screenshots.
