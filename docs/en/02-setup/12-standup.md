# 12. Stand-up assist

**Optional.** This module adds the daily five-minute screen to the rail.

## Where

**Project Settings → Apps → Smart Sprint Planner → PLANNING → Stand-up assist**.

## What is configured

| Setting | What it defines |
|---|---|
| **States and roles** | which state belongs to which role — the same contract as the backlog zones |
| **Hidden states** | which states not to show on the stand-up screen |
| **Done states** | what counts as finished work |

## States and roles

The list mirrors the backlog zones exactly: state → role. On the stand-up it decides what is written to the right of each section — whose zone this is.

If the backlog is already configured (chapter [11](11-backlog.md)), the simplest thing is to repeat the same list.

## Hidden states

By default every state of the flow is visible, empty ones included. That is deliberate: an empty «Code Review (0)» section is information too.

But if the flow contains technical states the team never discusses, they can be removed. Reasonable candidates are `Cancelled` and `Duplicate`.

## Done states

The list of states meaning finished work: usually `Ready for Release`, `Released`, `Done`.

It is used beyond the stand-up: the **Velocity** and **Spillover** reports decide what «closed» means from this list, not from the actual-hours field. An issue whose state is not in it is not closed for those reports, even if all its hours have been logged.

⚠️ Because of that the list is worth keeping honest: an incomplete list understates Velocity and inflates Spillover.

## How the stand-up differs from a board

A YouTrack board shows issues and lets you drag them. The stand-up screen shows the spread across states in terms of the **sprint's** roles and moves nothing. An issue that is not in the sprint composition will not be there.
