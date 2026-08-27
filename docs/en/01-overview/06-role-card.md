# 06. Inside a role card

An expanded role card is the workplace of whoever builds the sprint for that role.

## Where

Rail → **Total resource allocation** → click a role's row.

![The expanded «Platform development» card: status, resource, remainder and a table of ten issues](../../assets/ov-003-role-composition.en.png)

## The three tiles at the top

| Tile | What it shows |
|---|---|
| **Planning status** | which rung the role is on: draft, composition agreed, distributed, closed. The **Save Role Resource** button lives here too |
| **Available resources** | the role's resource in hours — comes from the Capacity screen |
| **Resource remainders** | resource minus the sum of allocations |

## The buttons above the table

- **+ Pick Tasks** — a dialog for choosing issues from the project: search, filter, tick, add in bulk.
- **Σ Recalculate Remainder** — settle the remainder against the current numbers without saving anything.
- **Clear** — remove every issue from the role's composition.
- **Validate** — check the composition and move the role to the next rung.

## The table's columns

| Column | Where it comes from |
|---|---|
| **ID**, **Title** | the YouTrack issue; the ID is clickable |
| **System** | a project field: which system the issue belongs to |
| **Priority**, **Cross priority** | the issue's priority and, if configured, a separate cross-project one |
| **State** | the issue's state in the tracker |
| **Estimate** | the role's estimate field — how much work is in the issue |
| **Actual** | the role's actual field — how much has been logged already |
| **Resource** | estimate minus actual: how much is still left to do |
| **Allocation** | how many hours the role takes for this issue in this sprint |
| **Inclusion status** | planned / excluded from the sprint |
| **bin** | remove the issue from the composition |

Further right there may be **display fields** — arbitrary project fields added in the settings; in the screenshot those are «Stage» and «Unit». The planner does not store them but reads them from YouTrack when the table opens, so you see exactly what you have access to.

## A negative resource

The **Resource** column can go negative and turn red: more has been logged than was estimated. That is not a typo but a fact — the issue turned out to cost more than expected. The planner shows it plainly so that the retrospective has something to discuss.

## Inclusion statuses

- **Planned** — the issue counts towards the role's allocation.
- **Excluded** — the issue stays in the list but its hours do not count.

Excluding exists so that the record of a decision is not lost: it is visible that the issue was considered and taken out, rather than forgotten.

## The «Assign to people» button

At the bottom of the card. It moves you to the [Distribution by assignees](07-assignees.md) screen, where the role's hours are spread across people.

## Validation

**Validate** is not cosmetic: it checks the composition against the project's rules and moves the role to the next rung. The button is not available to everyone — the right to validate is granted to a group in the project settings (chapter 09 of the setup document).

If the composition breaks the limits, the planner says so. Whether it can still be saved depends on the «allow planning above the limits» setting.
