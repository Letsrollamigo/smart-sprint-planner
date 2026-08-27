# 12. Sprint stages and who can do what

Planning in the planner is not «save and done» but a ladder of four rungs. Each role climbs it on its own.

## The four rungs

| Rung | What it means | How it is reached |
|---|---|---|
| **Draft** | the composition is being built, the numbers will still move | the default state |
| **Composition agreed** | the role has confirmed which issues it takes | the **Validate** button in the role card |
| **Distributed** | every issue has an owner and dates | the **Validate Distribution** button |
| **Closed** | the role's sprint is over, the composition is frozen as a snapshot | **Finish all roles** in the history |

Roles climb the ladder **independently**. Analysis can already be distributed while testing is still a draft: roles move at different speeds, and the planner does not get in the way.

## Where the rung is visible

The chips below the sprint selector — one per role. The same state is repeated in the role card, in the «Planning status» tile, and in [sprint history](10-history.md) in the Status column.

## Rights: independent permissions

The planner does not think in terms of «admin and not admin» but in separate permissions. Four of them concern the sprint ladder; each is granted to a YouTrack group in the project settings (chapter 09 of the setup document).

| Permission | What it allows |
|---|---|
| **Editing** | change the composition, hours, dates; save a draft |
| **Validation** | move a role to the next rung |
| **Assigning people** | set an issue's assignee inside the planner |
| **Clearing history** | wipe the project's sprint history |

Two more permissions sit outside the ladder — access to reporting circuits A and B; they are covered in the same chapter 09.

On top of those there is the **settings-manager group**: the people who may change the planner's settings in the project at all. Without it the planner runs read-only — protection for a freshly attached project against accidental configuration.

## Why they are split up

Because these actions cost different amounts. Fixing hours is ordinary work. Moving a role to the next rung is a statement that «we have agreed», and not everyone makes it. Wiping the history is irreversible.

The split makes a realistic scheme possible: the team edits, the lead validates, and nobody touches the history except one or two people.

## What happens on closing

**Finish all roles** moves the sprint into the history and freezes a **snapshot**: a copy of the composition, resources, distribution and issue states at that moment.

From then on, changes to issues in the tracker do not affect the closed sprint. That is exactly why the Velocity and Spillover reports count from snapshots: otherwise «how much did we deliver in June» would change every time someone touched an old issue.

## Bringing a closed sprint back

A closed sprint can be returned for editing from the [history](10-history.md). It is a legitimate operation — but it changes data that reports may already have been built from, so it is worth keeping behind a separate group.
