# 15. State roll-up

**Optional.** This module moves a parent's state after its children: while even one child is in progress, an epic cannot count as finished.

## Where

**Project Settings → Apps → Smart Sprint Planner → ADMINISTRATION → State rollup**.

## What it does

The rule looks at the children's states and brings the parent's state into line with them on a simple principle: a parent cannot be «ahead» of its most lagging child.

That removes the classic picture where an epic is closed while half its stories are in development — and reporting counts the work as delivered.

## What is configured

The hierarchy levels come from the same settings as the [estimate roll-up](14-cascade.md): the type field and the values for levels 2 and 3. Link types come from [Issue links](16-links.md).

Set separately is the mapping: which parent state counts as «in progress» and which as «finished».

## When to switch it on

When the team really keeps a hierarchy: creates epics and attaches stories to them. Without a hierarchy the module finds nothing and simply does not work.

## The order of switching on

The state and estimate roll-ups are worth switching on together, and after [issue links](16-links.md) are configured: both walk the same hierarchy, and without described link types neither will find a parent.
