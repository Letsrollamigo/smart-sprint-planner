# Setup and rollout

Bringing the planner into a new YouTrack project step by step — from installing the app to the first sprint.

Planner version **3.29.3**. Screenshots taken on YouTrack **2026.1**.

## Who this is for

The YouTrack project admin who sets the planner up for their team. Project administrator rights are needed; installing the app itself needs YouTrack administrator rights.

If you simply work inside a sprint, you want the [Overview](../01-overview/).

## Contents

| # | Chapter | Required? |
|---|---|---|
| 01 | [What the project needs before you start](01-prerequisites.md) | yes |
| 02 | [Installing the app](02-install.md) | yes, once per YouTrack |
| 03 | [Attaching the planner to a project](03-attach.md) | yes |
| 04 | [The settings-management group](04-manager-group.md) | **yes — without it the planner does not work** |
| 05 | [Roles and issue fields](05-roles-fields.md) | yes |
| 06 | [Other fields](06-other-fields.md) | yes |
| 07 | [Planning modes](07-planning-modes.md) | no |
| 08 | [Multi-role planning](08-multirole.md) | no |
| 08a | [Other: project language and diagnostics](08a-misc.md) | no |
| 09 | [Managing permissions](09-permissions.md) | **yes** |
| 10 | [Capacity: choosing a planning model](10-capacity.md) | yes — pick a model |
| 11 | [Backlog: pipeline zones](11-backlog.md) | no |
| 12 | [Stand-up assist](12-standup.md) | no |
| 13 | [Differentiated time tracking](13-dta.md) | no |
| 14 | [Estimate roll-up](14-cascade.md) | no |
| 15 | [State roll-up](15-state-rollup.md) | no |
| 16 | [Issue links](16-links.md) | no |
| 17 | [Display fields](17-display-fields.md) | no |
| 18 | [Release management](18-releases.md) | no |
| 19 | [Reporting: setup](19-reporting.md) | no |
| 20 | [Check: the first sprint](20-first-sprint.md) | yes |
| 21 | [Rollout checklist](21-checklist.md) | for reference |

## How to read this

The chapters run in the order things are worth configuring in. The required ones are 01–06, 09, 10 and 20; the rest are switched on as needed.

Every settings section is a separate screen with its own save button. Configure a section, save it, move to the next.

## Two levels of configuration

- **YouTrack level** (chapters 02, 04) — installing the app and its parameters in the project. Done with YouTrack's own means.
- **Planner level** (chapters 05–19) — the planner's own settings: roles, fields, modules, permissions. They live on **Project Settings → Apps → Smart Sprint Planner**.

The first level unlocks the second. Until the settings-management group is set (chapter 04), the second level is unavailable: the planner runs read-only.
