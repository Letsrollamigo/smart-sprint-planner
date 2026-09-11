# 18. Release management

**Optional.** This module adds the «Planned releases» and «Release history» sections to the rail.

## Where

**Project Settings → Apps → Smart Sprint Planner → ADMINISTRATION → Releases**.

## What is configured

| Setting | What it defines |
|---|---|
| **Enable release management** | the main switch |
| **Status-to-state mapping** | which issue state corresponds to «planned» and which to «released» |
| **Release roles** | which roles take part: release manager, release engineer |
| **Automatic tags** | whether to tag issues when a release's status changes |

## The status mapping

The most important setting. It answers how **release readiness** is worked out:

- an issue in a state marked «released», or resolved in YouTrack, falls into **Ready**;
- an issue in a starting state falls into **Not started**;
- everything else is **In progress**;
- a state outside the mapping is **No state**.

A release has no separate «readiness» field: it would always lie, because it would have to be updated by hand.

## Automatic tags

When a release's status changes, the planner can tag the issues in its composition. That leaves a trace in YouTrack: the tag shows which release an issue went out with, even outside the planner.

The tag's name is set here. The tag is created if it does not exist yet.

## Freezing the scope

Not a setting but an operation on the release card: **Freeze scope** forbids adding and removing issues. It is usually applied on the freeze date named on the card.

## Work phases

The last block of the section is **“Work phases”** (independent of the “Enable release management” checkbox):

- **Toggle “Work phases in the sprint are enabled”** — off by default. On — “Sprint parameters” shows six date pairs and the phase bar: Analysis → Development → Tech test → Regression → Business test → Deploy (chapter 02 of the “Overview”). Off — the block is hidden; saved dates are kept and return when enabled.
- **Table “Which roles work in which phase”** — rows are the six phases, columns are only the roles enabled in the project. A tick means “the role works in this phase”: a role may have several phases, a phase several roles. The table is empty by default and all phases share one tone; with a filled table the phases of the selected role are highlighted on the bar and the rest are dimmed. A mapping of a disabled role is not erased — it comes back with the role.
- The “Used in” line reminds you that today only the phase bar in “Sprint parameters” reads this table.

Both settings are admin-tier: only the settings-management group changes them; the planning manager does not see them.

## Rolling states back

The **Roll back states** button returns the issues to the states they had before a bulk transition. Needed when a release falls through: without it, dozens of issues would have to be reverted by hand.
