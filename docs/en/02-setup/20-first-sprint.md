# 20. Check: the first sprint

**Required.** Setup is finished not when every section is saved but when a live sprint has passed through the planner. This chapter is a half-hour scenario for that check.

## Step 1. Create a sprint

Main menu → **Smart Sprint Planner** → pick the project → **+ New sprint**. The name and period can be anything, «Setup check» included.

Set the sprint goal: it will be needed at step 6.

**What to check:** the project is visible in the picker, the sprint is created, the role chips have appeared and all say «Draft».

## Step 2. Check capacity

Rail → **Capacity**. With the full model, set the grades and make sure «Base, h» is not zero.

**What to check:** the section appeared and every role has a non-zero sum of contributions. Zero means the calendar is empty or people have no participation set.

## Step 3. Build the composition

Rail → **Backlog** → send three to five issues into the sprint with **→ To sprint**.

**What to check:** issues landed in roles according to their states, and there is no orange bar about unmapped states.

## Step 4. Check the hours

Rail → **Total resource allocation** → expand a role card.

**What to check:** the «Estimate» column holds hours from the issues. Empty means chapter [05](05-roles-fields.md) points at the wrong field, or the estimates are not filled in on the issues themselves.

Press **Validate** — the role should move to «Composition agreed».

## Step 5. Spread across people

Rail → **Distribution by assignees** → pick assignees, assign issues, set dates.

**What to check:** a person's remainder drops when an issue is assigned; **Validate Distribution** moves the role to «Distributed».

## Step 6. Look at every screen

- **Stand-up** — the sprint goal is visible, issues are spread across states.
- **Gantt chart** — bars are there and the colours match the states.
- **Sprint history** — the active sprint is in the list.

## Step 7. Close it and check what remains

History → **Finish all roles**.

**What to check:** the sprint has moved to the closed ones, expands, and its composition is visible. That is the snapshot all of reporting rests on.

## If something does not add up

| Symptom | Where to look |
|---|---|
| The project is missing from the picker | the app is not attached (chapter [03](03-attach.md)) or there is no manager group (chapter [04](04-manager-group.md)) |
| «Roles not configured» | chapter [05](05-roles-fields.md) |
| The hours are empty | the wrong estimate field (chapter [05](05-roles-fields.md)) or empty fields on the issues |
| A role's resource is zero | capacity is not filled in (chapter [10](10-capacity.md)) |
| Buttons are unavailable | permissions are not granted (chapter [09](09-permissions.md)) |
| An orange bar in the backlog | unmapped states (chapter [11](11-backlog.md)) |
