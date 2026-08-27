# 19. Reporting: setup

**Optional.** This module adds two report sections to the rail: **Operational (A)** and **Management (B)**. What each report shows is in the [Reporting](../03-reporting/) document.

## Where

**Project Settings → Apps → Smart Sprint Planner → ADMINISTRATION → Reporting**.

## Two conditions for access

Reports are visible when two conditions hold:

1. the module is **switched on** in this project — here;
2. you belong to a group with the relevant **circuit** ticked in the [permissions matrix](09-permissions.md).

Switching on is not enough by itself: without a tick in the matrix the reports stay visible to the settings manager alone.

## What is configured

### Flow and target statuses

| Setting | What it defines |
|---|---|
| **Flow states** | an ordered list of states — the «Flow» and «Progress» reports are built on it |
| **Target statuses** | what counts as «arrived»: usually `Ready for Release`, `Released`, `Done` |
| **Status labels** | human names for the reports: `Released` → «Shipped» |
| **Terminal transition policy** | count the first entry into a terminal state, or the last |

### Thresholds and norms

| Setting | What it defines |
|---|---|
| **Aging thresholds** | how many days in a state is «yellow» and how many is «red»; set per state |
| **TTM anchors** | which state to which state to measure Lead, Team and Cycle between |
| **TTM norms** | target Lead and Team values in days |
| **Spillover age bands** | how many consecutive sprints an issue must carry over to become «warm» and «hot» |
| **Velocity window** | how many recent sprints to average |
| **Role monthly capacity** | a reference point for the «Backlog in hours» report |

### Other

| Setting | What it defines |
|---|---|
| **Pause markers** | states and tags whose time is subtracted from cycle time |
| **Link types for reports** | which links mean «this bug is about that feature» — the «Bug tax» report needs it |
| **Show system** | add a system breakdown to the report tables |
| **Report timeout**, **Slice size cap** | limiters for heavy queries |

## What must be set

The reports are forgiving about empty settings, but three of them break specific reports when left blank:

- **Target statuses** — without them «Progress» does not know what to count transitions into;
- **TTM anchors** — without them the TTM report does not build;
- **Link types for reports** — without them «Bug tax» refuses to compute.

Everything else has sensible defaults.

## Load

Reports query issue history and put a noticeable load on YouTrack. The **Report timeout** and **Slice size cap** limiters exist precisely for that: they stop one report from occupying the instance.

On large projects it makes more sense to narrow the report's period than to raise the cap.
