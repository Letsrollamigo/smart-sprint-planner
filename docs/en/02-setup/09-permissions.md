# 09. Managing permissions

**Required.** Until permissions are granted to anyone, only the settings-management group can plan.

## Where

**Project Settings → Apps → Smart Sprint Planner → ADMINISTRATION → Manage permissions**.

## One table: group × permission

The screen is a matrix: a row is a YouTrack group, a column is a permission, and the intersection holds a checkbox.

| Column | What it allows |
|---|---|
| **Editing** | change the sprint composition, hours, dates; save a draft |
| **Validation** | move a role to the next rung (composition agreed → distributed) |
| **Assigning people** | set an issue's assignee inside the planner |
| **Clearing history** | wipe the project's sprint history |
| **Circuit A** | access to the operational reports |
| **Circuit B** | access to the management reports |

Groups are added with the **Add group** button; the list comes from YouTrack's groups.

## Why six permissions rather than one

Because these actions cost different amounts. Fixing hours is the team's ordinary work. Saying «the composition is agreed» is a statement with an agreement behind it. Wiping the history is irreversible. Seeing management reports is not a technical question but one of who those numbers are addressed to.

A typical layout:

| Group | Edit | Validate | Assign | Clear | Circuit A | Circuit B |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Delivery team | ✓ | | | | | |
| Team leads | ✓ | ✓ | ✓ | | ✓ | |
| Product managers | | | | | ✓ | ✓ |
| Planner admins | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## The settings-management group is separate

It is set not here but in the app's parameters (chapter [04](04-manager-group.md)), and it sits above every permission in this table: its members can change the table itself.

## Permission checks happen on the server

The planner does not rely on a hidden button. Every change is checked server-side: a request from someone who may not make it is rejected regardless of what the interface showed.

So «granting rights by hiding a button» does not work — and that is as it should be.

## Which groups work here

🔴 Only **real groups with explicit membership**. YouTrack's implicit groups — «All Users», «Registered Users» and the project's automatic «<Project> Team» — **do not work** in this table: the app does not see them among the user's groups, and the permission reaches nobody. Verified on a live instance: a member of such a group is refused by the server when trying to set an assignee.

If there is no suitable group yet, create one in YouTrack and add the people explicitly. That is the only reliable way.

The planner does try to honour nesting — membership is also looked for in parent groups — but do not rely on it: the platform does not always hand the app the chain of parents. Grant the permission to the group a person belongs to directly.
