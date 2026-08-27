# 21. Rollout checklist

A reference page: walk through the list before handing the planner to the team.

## Before configuring

- [ ] The project has assignee, estimate and actual fields **for every role** you switch on.
- [ ] The estimate and actual fields are of type **period**, the assignee field is a **user** field.
- [ ] There is a state flow and the states have **colours**.
- [ ] **Time tracking** is switched on in the project.
- [ ] If differentiated tracking is planned — **work types** exist, one per role.

## YouTrack level

- [ ] The app is installed (chapter [02](02-install.md)).
- [ ] The app is **attached to the project** (chapter [03](03-attach.md)).
- [ ] The **settings-management group** is set (chapter [04](04-manager-group.md)) — the yellow bar is gone.
- [ ] The verbose logging checkbox is **off**.

## Required planner settings

- [ ] **Roles** are chosen and each has its three fields (chapter [05](05-roles-fields.md)).
- [ ] The **priority field** and **state field** are set (chapter [06](06-other-fields.md)).
- [ ] A **capacity model** is chosen (chapter [10](10-capacity.md)).
- [ ] **Permissions** are granted to groups (chapter [09](09-permissions.md)) — at least editing and validation.

## Modules, as needed

- [ ] **Backlog**: the zones cover every state, no orange bar (chapter [11](11-backlog.md)).
- [ ] **Stand-up**: the done-state list is complete — otherwise Velocity is understated (chapter [12](12-standup.md)).
- [ ] **Differentiated tracking**: the work-type mapping is filled in and the actual fields are no longer edited by hand (chapter [13](13-dta.md)).
- [ ] **Issue links**: hierarchy and dependency types are described (chapter [16](16-links.md)) — before the roll-ups are switched on.
- [ ] **Roll-ups** of estimates and states are switched on together (chapters [14](14-cascade.md), [15](15-state-rollup.md)).
- [ ] **Display fields**: only existing, populated fields are chosen (chapter [17](17-display-fields.md)).
- [ ] **Releases**: the status mapping is set (chapter [18](18-releases.md)).
- [ ] **Reporting**: switched on AND the circuits are ticked in the permissions matrix (chapter [19](19-reporting.md)).

## The check

- [ ] The first-sprint scenario has been run (chapter [20](20-first-sprint.md)).
- [ ] The sprint is closed and visible in the history.
- [ ] Someone on the team other than you has opened the planner and seen the same thing.

## What to tell the team

- The planner reads hours **from issue fields** — no estimate on the issue, no estimate in the planner.
- Over-limit is **not forbidden**, it is highlighted: the decision is the team's.
- Closing a sprint takes a **snapshot**: after that, edits to issues do not affect the history.
- The planner's language is switched **in its own header**, separately from YouTrack's.
