# 10. Capacity: choosing a planning model

**Required — pick a model.** It decides where a role's resource comes from and whether the Capacity section appears in the rail.

## Where

**Project Settings → Apps → Smart Sprint Planner → ADMINISTRATION → Capacity**.

## Three models

| Model | Where a role's resource comes from | Who it suits |
|---|---|---|
| **Off** | typed in by hand on the role card | small teams, short sprints |
| **Simplified** | hours norm × the number of people in the role | when the team is stable and absences are rare |
| **Full** | computed per person: calendar, absences, rate, participation, grade | when there are more than five people and holidays are routine |

The [Capacity](../01-overview/03-capacity.md) section appears in the rail for the second and third models.

## What the full model configures

**Grade coefficients.** Junior / Middle / Senior productivity multipliers. The planner substitutes no industry values: the team decides. Setting them all to `1` is a legitimate choice meaning «we do not distinguish grades when planning».

**Hours norms.** The working-time norm, separately for January, May and other months: those months are shorter in many working calendars.

**Absence types.** Vacation, sick leave, out of team, regional holiday, training, team lead duty, other. Each type subtracts days from a person's base.

## The working calendar

The calendar is set on the Capacity screen and lives with the project. The **Load into all projects** button copies it into the other projects where the planner is configured: a company usually has one calendar, while absences belong to each team.

Bulk entry goes through CSV: **Download template** hands you a file in the right format.

## Which model to start with

Start with the **simplified** one. It gives a meaningful resource figure and does not require keeping an absence calendar from day one.

Move to the **full** model when it becomes obvious that «one hundred and sixty hours per person» is lying: half the team is on holiday and the planner does not know.

Changing the model does not break history: closed sprints keep a snapshot and stay as they were.
