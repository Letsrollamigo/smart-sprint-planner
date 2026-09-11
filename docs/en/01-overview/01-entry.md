# 01. Where the planner lives and how to open it

The planner has two entry points, and they do different things.

## Entry one: YouTrack's main menu

**Smart Sprint Planner** in YouTrack's left menu is the planning itself. Here you pick a project, pick a sprint and work: build the composition, spread the hours, look at the Gantt chart and the history.

![The planner opened from the main menu: the rail of sections on the left, sprint parameters on the right](../../assets/ov-001-sprint-params.en.png)

On the left is the **rail** — the tree of the planner's sections. It is the same on every screen and does not change as you move between them. The `«` button above it collapses the rail when a table needs more room.

## Entry two: project settings

**Project Settings → Apps → Smart Sprint Planner** is not planning but *configuration* of the planner for one project: which roles take part, which issue fields hold the estimate and the actual, who is allowed to do what.

![The planner's settings screen inside a project: settings sections on the left, the roles-and-fields table on the right](../../assets/setup-009-settings-unlocked.en.png)

The blue bar at the top says exactly that: sprint planning has moved to the main menu, and this screen is the settings. What to do here is covered in [Setup and rollout](../02-setup/).

This entry is not visible to everyone: YouTrack shows the project settings page only to users with the **Update Project** permission (typically a project administrator or the project lead) — that is how YouTrack itself works. If you manage the planner's settings without being a project administrator, you do not need this entry: the same settings form opens via the **Plugin settings** button in the main-menu rail header.

## Picking a project

The **Project** picker in the rail lists only the projects where the planner is attached and configured and where you have access to it. If a project is missing, either the app is not attached to it or the settings-manager group has not been set — chapter 04 of the setup document.

Switching the project switches the whole screen: sprints, composition, history — each project has its own. The planner never mixes data from different projects.

## The header above the rail

| Item | What it is for |
|---|---|
| Reminders bell | in the panel header next to the collapse button; appears when reminders are on in the project and at least one module is addressed to you; the number is the count of active items; a click opens the dialog with the «Active» and «Journal» tabs (Setup, chapter 19a) |
| Icon row | under the version: **Clear draft** (only while a draft exists), **Plugin Settings** (shown only to members of the settings-manager group), **User Guide** (this documentation), **Feedback** (the product's issue tracker), **Language** (globe; 15 languages). Each icon's label is a tooltip shown on hover or keyboard focus |
| **Planning modules activity status** | an expandable list: which modules are enabled in this project |

## Sharing a link

**Share** is the last item in the rail's section tree. A click copies a link to the clipboard; whoever opens it lands on the same project, the same sprint and the same section. The link only brings them to the screen: whether they can just look or also edit is decided by their own permissions. In the main menu, YouTrack's address bar follows along by itself, showing the current project, sprint and section.

- Until a sprint is picked, the item is inactive — the tooltip says «Open a sprint first». The active item has a different tooltip: «Share the link after saving the sprint».
- If the link points at something specific, the toast names it — «Link copied: …» followed by the name; otherwise it says «Link copied to clipboard».
- On [Capacity](03-capacity.md) the link also carries the person or role picked in the right-hand column. Planned releases and release-history records have their own **Copy link** button — chapter [11](11-releases.md). Everywhere else, the release screens included, **Share** opens the screen as a whole.
- If the link carries a specific target, the recipient sees it highlighted. The highlight waits up to five seconds for the screen to finish loading; if the data is not there in time, the screen opens without it.

The item exists only in the main-menu entry; the project settings screen has none. It needs YouTrack 2026.1 and newer; on older versions the item is hidden and appears by itself once YouTrack is upgraded — the planner itself needs no update. The **Go to** button in reminders is not a link but a move inside the open planner, so it works on any YouTrack version.

## Two languages, two switches

This one is easy to miss and worth remembering: **the planner's language and YouTrack's language are switched separately.**

- **The planner's language** — the picker in the rail header. It affects the planner's own text only and is remembered for you personally.
- **YouTrack's language** — in your YouTrack profile. It drives the sidebar, the breadcrumbs and the names of the project settings sections.

Switch only one and the interface comes out mixed. In this documentation both are switched.


## Picking a sprint

Below the project picker are the **Current sprint** selector and the **+ New sprint** button. The selector holds live sprints only: closed ones move into the [history](10-history.md) and come back from there when they need editing.

The create button can be unavailable — a project can switch on a ban on creating sprints so that the team does not start a new one before closing the previous. The **Sprint creation lock** toggle is right there.

## Role status chips

Below the sprint selector there is one chip per role: **Draft**, **Composition agreed**, **Distributed**, **Closed**. Roles climb that ladder independently of one another. Details are in chapter [12](12-stages-rights.md).
