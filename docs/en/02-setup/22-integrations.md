# 22. Integrations: the external REST

**Optional.** The planner makes no outgoing requests and never connects to external systems on its own. Integration works one way: an external system calls the planner's server endpoints through the YouTrack REST under a service account and its permanent token. Typical scenarios — an external agent assembles a sprint draft and writes it into the project's working slot; an agent makes pinpoint changes to the issue set, absences or releases; an external system reads sprint history and capacity.

## The contract

The contract is the file [`Integrations/openapi-sprint.yaml`](../../../Integrations/openapi-sprint.yaml) in the repository (OpenAPI 3.1): 43 operations in eight sections — sprint, history, capacity, calendar and absences, releases, reminders, sprint lock, administration. Any OpenAPI viewer opens it (Swagger UI, Redoc); the descriptions inside the file are in Russian. The contract version equals the planner version and moves with every release.

The full table of refusal codes is [`Integrations/ERROR_CODES.md`](../../../Integrations/ERROR_CODES.md); it is generated from the server code at release time.

The default server address in the contract file is a placeholder, `https://youtrack.example.local`: put your own YouTrack address into `baseUrl` before pressing «Try it out».

## Preparation

1. **A YouTrack service user** — a separate account, not a living person; the permanent token is created in its profile. One user per project, not one for all — that limits the token's blast radius.
2. **Project access** — the service user must see the project by YouTrack's own means.
3. **The planner is attached to the project** (chapter 03) — otherwise the platform answers `404 HTTP handler not found` before the app code even runs.
4. **The settings-management group is set** (chapter 04). Without it every write returns `plugin_not_configured`; reads keep working.
5. **A planner permission** — the service user's group is ticked in the right column of the permissions table (chapter 09). For uploading a sprint draft that is «Editing».
6. **Open the planner in the project once.** A write through the primary address checks the settings-management group against its copy in the project data. The copy is created and refreshed when someone opens the planner on the project tab or saves its settings. Until then, writes by project key answer `plugin_not_configured`; after the settings-management group changes, open the planner in the project once more.
7. **Keep the token in a protected credential store** of the integrating system — never in the scenario body and never in plain-text environment variables.

## Addresses

| | Address | Notes |
|---|---|---|
| **Primary — by project key** | `{baseUrl}/api/extensionEndpoints/smart-sprint-planner/backend-global/{path}?projectKey={KEY}` | A readable project key. The user's right to read the project is checked before planner permissions; a missing project and a missing right give the same refusal, `project_unavailable`. Depends on step 6. If the planner is disabled in the project — `planner_disabled` |
| Alternative — by internal id | `{baseUrl}/api/admin/projects/{projectId}/extensionEndpoints/smart-sprint-planner/backend-project/{path}` | `{projectId}` looks like `0-9` (`GET {baseUrl}/api/admin/projects?fields=id,shortName`). Does not depend on step 6. The «planner disabled» toggle does not close it |

Authentication is the header `Authorization: Bearer <permanent token>`. Permissions and data checks are the same on both addresses.

## Who writes what

Reading (every GET) is open to any project member: no planner permission is checked, a token and project access are enough. As a consequence, any project member reads the planner settings, rates, grades and people's absences. This is the accepted trust model.

| Permission (chapter 09) | What it writes |
|---|---|
| Editing | The sprint and the issue set: full write, `upsertItem`, `removeItem`, `patchSprint`; phases; a history snapshot |
| Validation | Agreeing a sprint per role; phases; a history snapshot; the full history write (restricted) |
| Assignees & dates | Personal distribution: `assignerSync`, `assignPerson`; writing issue fields (restricted) |
| Settings-management group | Capacity, calendar, absences, releases, disabling the planner |
| Planning managers | Capacity and absences |
| Clear history | Clearing history and restoring it from a backup (restricted). Not inherited even by an administrator |
| Release manager | Releases: every operation |
| Release engineer | Releases: only moving the status one step forward |
| Sprint lock | The sprint-creation lock (restricted) |

Permissions do not inherit from one another. **Restricted operations** replace data wholesale, are irreversible or change how the project works; the contract marks them with «⚠». Do not use them when small operations solve the task.

A service token reaches further than uploading a sprint: «Editing» also admits writing the issue fields assigned to the planner — the ceiling is the service user's own YouTrack rights (the server checks that the user sees the issue and may change the field). Give a scenario the smallest permission it needs and keep the service user's group apart from groups of living people. Who changed the data and when is stamped by the server from the caller's account; values from the request body are ignored.

## Responses

The YouTrack platform does not pass the app's HTTP statuses through: both success and an application refusal arrive as **HTTP 200**. The outcome is told by the response body only. Real non-200 responses come from the platform itself: **401** — the token is missing or invalid; **404** `HTTP handler not found` — a wrong path or app name, or the app is not attached to the project.

- **Success:** `{ "success": true, … }`. Ignore unknown response keys — responses may grow.
- **Refusal:** `{ "success": false, "error": …, "reason": …, "cid": … }`.

| Key | What it is |
|---|---|
| `error` | The refusal class: `Bad Request`, `Forbidden`, `rev_conflict`, `internal_error`. For issue-field write refusals `error` carries the reason code itself |
| `reason` | The machine-readable reason code — always present. **Branch on it** |
| `cid` | The request id — always present. It finds the single refusal line in the server log: status and reason code, no request body |
| `rev` | Only with `rev_conflict`: the current data revision |
| `errors` | Only with `calendar_invalid`, `absences_invalid` and `phases_out_of_sprint:` — an array locating every error |

A code that ends with a colon in the code table is a prefix: the server appends a detail (`ops_field_required:roleKey`). Compare by the start of the string.

## Revisions and `baseRev`

The sprint (`sprint._rev` in the sprint read response; an empty slot is 0), history, releases and absences (the `rev` key of the matching GET) are written only with a numeric `baseRev`:

- no `baseRev` — refusal `base_rev_required`, nothing is written;
- the revision has moved — refusal `rev_conflict` with the current `rev`: re-read the GET, apply the change again, retry;
- success — the response carries the new revision `rev`; the next write may use it without re-reading.

No revision by design: capacity, calendar, reminders, sprint lock, disabling the planner, clearing and restoring history.

## Example: pinpoint changes by an agent

**Small operations** are eleven write variants of the «one change instead of a full replace» kind (the `action` parameter): for agents they are the main way to change data. An agent adds an issue to a role and assigns a person without touching the rest of the set:

```
GET  sprint-data?projectKey=DEMO                   → sprint._rev = 25

POST sprint-data?projectKey=DEMO&action=upsertItem
{ "roleKey": "analysis",
  "item": { "issueId": "DEMO-101", "inclusionStatus": "INC_PLANNED", "estimate_analysis": 480 },
  "baseRev": 25 }
→ { "success": true, "rev": 26, "action": "upsertItem",
    "applied": { "roleKey": "analysis", "issueId": "DEMO-101", "created": true } }

POST sprint-data?projectKey=DEMO&action=assignPerson
{ "roleKey": "analysis", "issueId": "DEMO-101", "login": "ivanov", "baseRev": 26 }
→ { "success": true, "rev": 27, "historyRev": 12, "action": "assignPerson", … }
```

- Effort and resources are **in minutes** (the interface shows hours). Statuses are Latin codes only (`PLANNING`, `INC_PLANNED`).
- `upsertItem` merges: the keys you send are updated, the rest stay. The only required issue key is `issueId`: the server fills in the summary, state and priority itself from the fields configured in the project.
- `assignPerson` works once the role has been sent for agreement or the sprint is running — otherwise `role_record_not_found`; `login: null` removes the assignment.
- The full write `POST sprint-data` with the body `{sprint, roleItems, baseRev}` replaces the working slot wholesale — upload a draft **before** manual planning starts. An unknown key in the body is refused with `invalid_*_structure`.
- The same rules apply to absences (`upsertAbsence`, `removeAbsence`), capacity (`upsertPerson`) and releases (`upsertRelease`, `setReleaseStatus`, `addReleaseIssues`, `removeReleaseIssues`).

## Compatibility

The external contract changes **by addition only**: keys and paths a scenario was written against are never renamed and never disappear; new things arrive as new keys and new `action` variants. The promise covers what the client sends; responses may grow. The guarantee is held by automated tests in the repository: the contract is checked against the code's allowlists and a baseline of keys, the list of refusal codes — against the server code.
