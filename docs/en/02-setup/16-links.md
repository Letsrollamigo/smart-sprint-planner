# 16. Issue links

**Optional, but three other modules need it.** This section explains to the planner what each of YouTrack's link types means.

## Where

**Project Settings → Apps → Smart Sprint Planner → ADMINISTRATION → Issue links**.

## The problem it solves

In YouTrack link types are named freely and get renamed. The planner needs to know not the name but the meaning: this link is hierarchy, that one is a dependency, this other one is merely information.

## The «link type × role» table

A row is a link type from your YouTrack, the columns are three roles:

| Role | What it means | Who uses it |
|---|---|---|
| **Hierarchy** | a parent-child link | the backlog tree, the estimate roll-up, the state roll-up |
| **Dependency** | a predecessor-successor link | arrows on the Gantt chart |
| **Information** | a link with no structural meaning | the «Bug tax» report |

Hierarchy and dependency also need a **side**: which end of the link holds the parent or the predecessor. The phrase picker shows your instance's actual wordings — «parent for», «is required for» — so there is nothing to guess.

A typical configuration:

| Link type | Hierarchy | Dependency | Information |
|---|---|---|---|
| Subtask | source | | |
| Depend | | source | |
| Relates | | | ✓ |

## Why by name rather than by id

Link-type ids differ between YouTrack instances. The setting stores the type's **name**, so it can be moved between instances along with the rest of the project's settings.

⚠️ The flip side: rename a link type in YouTrack and the setting has to be corrected.

## Arrow colours on the Gantt chart

Every link type marked as a dependency gets its own colour, and the planner draws a legend above the chart. One picture then shows that one arrow is a hard dependency and another is «preferably after».

## What happens with nothing configured

The planner falls back to a sensible default: hierarchy by the built-in `Subtask` type (plus the historical `subtask of` phrase), dependency by `Depend`, information by `Relates`. It works — right up to the first renamed type.
