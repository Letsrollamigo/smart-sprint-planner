# Security Model — Smart Sprint Planner

> 🇬🇧 English · 🇷🇺 [Читать по-русски](SECURITY.ru.md)

Applies to **v1.0.0** and later. The model is server-authoritative: deny-by-default, whitelist validators, defense against Prototype Pollution, and explicit role hierarchy.

---

## Principles

1. **Single source of truth for the authorization group.**
   `settingsManagerGroup` lives **only** in `ctx.settings` (project-scoped app-settings, configured via Project Settings → Apps). The backend never reads it from the request body or from `ssp_settings`.

2. **Deny by default.** Every mutating endpoint returns `{success: false, reason: 'plugin_not_configured'}` until `settingsManagerGroup` is configured. See principle #7 for the success-flag pattern.

3. **No client-side claims.** Clients do not pass their groups in the request body — the backend reads `ctx.currentUser.groups` and compares against stored settings.

4. **Whitelist over blacklist.** Every POST passes through four filters:
   1. `JSON.parse` + `sanitizeDeep` (rejects `__proto__` / `constructor` / `prototype` at any depth up to 10 levels).
   2. `filterKeys(body, ALLOWED_*_KEYS)` — top-level key whitelist.
   3. Typed validator (`validateSprint`, `validateRoleItems`, `validateSettings`, `validateHistory`, `validateWorkingDraft`) with key whitelists, type assertions, and value ranges.
   4. Final JSON size check against `MAX_PROP_SIZE` (500 KB for properties, 1 MB for history).

5. **URL safety.** All `href` values are constructed via `safeUrl()` (https/http only, length ≤ 2000). All text insertions go through `esc()` (`& < > " '`). SRI integrity is enforced for all CDN dependencies.

6. **Storage in neutral form.** Statuses and inclusion-statuses are stored as Latin enum codes (`PLANNING`, `CONFIRMED`, `INC_PLANNED`, ...). Localization happens only at display time. This decouples storage from UI language.

7. **Fail-closed diagnostics.** On validation/authorization errors the backend returns a short `reason` without echoing request body. Detailed logs go to YouTrack server log only when `enableDebugLog=true`.

   **Success-flag response pattern.** All endpoints use a uniform body shape: HTTP status is typically `200 OK` regardless of business outcome (the YouTrack app-framework HTTP host normalises status for cross-version compatibility). The response body always carries `{success: true, ...}` on success or `{success: false, error: '<short>', reason: '<machine-readable>'}` on rejection. **Clients MUST check `success` flag, not HTTP status.** Backend `forbidden()` and `badRequest()` helpers set `ctx.response.status` for completeness, but downstream routing may rewrite it; never depend on the numeric code.

---

## Closing the chicken-and-egg

If `settingsManagerGroup` were stored in mutable extension properties, any authenticated user could write settings on a fresh install and seize all access tiers (`editGroups`, `validationGroups`, `settingsManagerGroup`).

In Smart Sprint Planner v1.0.0:

- `settingsManagerGroup` lives **only** in app-settings and is configurable **only** via Project Settings → Apps → Smart Sprint Planner. It cannot be modified from inside the plugin.
- All authorization functions (`isSettingsManager`, `isEditor`, `isValidator`, `isHistoryManager`, `isAssigner`) return `false` when configuration is absent.
- A fresh install operates in read-only mode until a project admin explicitly configures the manager group.
- `validateSettings` does **not** include `settingsManagerGroup` in its key whitelist — even a settings manager cannot save it via POST.

---

## Roles (sources of truth)

| Role | Where defined | Who can assign | Notes |
|------|---------------|----------------|-------|
| `settingsManager` | `ctx.settings.settingsManagerGroup` (project-scoped app-settings) | Project admin / Global admin (via Project Settings → Apps) | Mandatory for any mutating action |
| `editor` | `ssp_settings.editGroups` / `editGroupNames` | settingsManager | Full write access to sprint composition |
| `validator` | `ssp_settings.validationGroups` / `validationGroupNames` | settingsManager | Confirms / allocates / finalizes sprints |
| `historyManager` | `ssp_settings.historyClearGroups` / `historyClearGroupNames` | settingsManager | Required to clear sprint history |
| `assigner` | `ssp_settings.assignerGroups` / `assignerGroupNames` | settingsManager | Limited to `personalPlanning` writes (assignee + dates) |
| `viewer` | any authenticated project user | YouTrack project permissions | Read-only |
| `wcOwner` *(contextual)* | `editorLogin === ctx.currentUser.login` in `_workingDrafts[key]` | Assigned automatically on `POST /working-drafts` | Guards working-copy take-over |

**Hierarchy**: `editor ⊃ assigner ⊃ viewer`. An `editor` has all `assigner` rights plus full sprint mutation. An `assigner` is restricted to writing `personalPlanning` (assignee + start/end-dates) via `action=assignerSync` and to writing assignee fields on issues via `update-issue-field`.

**`wcOwner`** (working copy owner) — the only role whose authorization is not from `ssp_settings` / `ctx.settings.*`, but from `_workingDrafts[key].editorLogin`. The backend overwrites `editorLogin` with the server-side value on every POST (defense-in-depth — clients cannot forge ownership). Take-over of someone else's WC returns `{success: false, reason: 'not_owner'}` (exception: `settingsManager` may delete any WC).

---

## Endpoint access matrix

| Method | Path | Minimum role |
|--------|------|--------------|
| GET    | `project-fields` | viewer |
| GET    | `sprint-data` | viewer |
| POST   | `sprint-data` (`body.sprint` / `roleItems` / `items`) | editor |
| POST   | `sprint-data` (`body.settings`) | settingsManager |
| POST   | `sprint-data?action=validate` | validator |
| POST   | `sprint-data?action=assignerSync` | assigner (partial save: `personalPlanning` only) |
| GET    | `history` | viewer |
| POST   | `history` (regular save / update) | validator |
| POST   | `history?action=assignerSync` | assigner (partial save: `personalPlanning` only in existing snapshots) |
| POST   | `history?action=clear` | historyManager |
| GET    | `working-drafts` | viewer (returns all accessible WC; reads are not restricted) |
| POST   | `working-drafts` | validator (`editorLogin` is overwritten with `ctx.currentUser.login`) |
| DELETE | `working-drafts/<key>` | wcOwner OR settingsManager (otherwise `{success: false, reason: 'not_owner'}`) |
| GET    | `check-settings-manager` | viewer |
| GET    | `check-validator` | viewer |
| GET    | `check-editor` | viewer |
| GET    | `check-history-manager` | viewer |
| GET    | `check-assigner` | viewer |
| GET    | `field-values` | viewer |
| GET    | `get-user-field-values` | viewer |
| GET    | `app-version` | viewer (read-only, returns `{version: '<APP_VERSION>'}`) |
| POST   | `update-issue-field` | editor OR assigner (field types: `enum` / `string` / `period` / `user`) |
| POST   | `refresh-assignees` | editor OR assigner (bulk fetch up to 200 issueId) |
| GET    | `draft` | viewer (returns only the current user's slot) |
| POST   | `draft` | viewer (writes only into the current user's slot) |
| POST   | `draft?action=clear` | viewer (deletes only the current user's slot) |

`viewer` = any authenticated project user. All other roles require a configured `settingsManagerGroup` (deny-by-default otherwise). `wcOwner` is contextual (see role table).

---

## Threats and mitigations

| # | Threat | Mitigation |
|---|--------|-----------|
| 1 | **Settings takeover on a fresh install (chicken-and-egg)** | `settingsManagerGroup` lives only in app-settings; deny-by-default; no endpoint can write it |
| 2 | **Role spoofing via request body** | Backend never reads `body.editGroups` / `validationGroups` / `historyClearGroups` / `settingsManagerGroup` for authorization; only `ctx.currentUser.groups` |
| 3 | **Accidental or malicious history wipe** | Dedicated `historyManager` role; UI clear button is hidden by default; `POST /history?action=clear` is deny-by-default |
| 4 | **Prototype Pollution** | `sanitizeDeep` rejects `__proto__` / `constructor` / `prototype` up to 10 levels deep |
| 5 | **Garbage data written into settings** | Strict `ALLOWED_SETTINGS_KEYS` whitelist + type assertions + numeric ranges |
| 6 | **XSS via YouTrack data** | All inserts go through `esc()` (5 chars); all `href` through `safeUrl()` (https/http only); no `eval` / `Function` / `document.write` |
| 7 | **Tabnabbing via `target=_blank`** | All external links carry `rel="noopener noreferrer"` |
| 8 | **Compromised CDN xlsx bundle** | `integrity="sha384-..."` + `crossorigin="anonymous"` on the xlsx loader — the browser blocks substitution |
| 9 | **DoS via large request body** | `MAX_REQUEST_BODY=2 MB` in `getBody`, `MAX_PROP_SIZE=500 KB` per property (1 MB for history) |
| 10 | **Injection via `fieldName`** | Validation forbids only control chars and `< > "`; YouTrack field names with dots / brackets / ampersands pass. The YouTrack API performs lookups without SQL/path concatenation. |
| 11 | **Diagnostic information leaks** | All backend errors return `internal_error` without echoing request bodies; detailed logs only in server log when `enableDebugLog` is enabled |
| 12 | **Forging or tampering with personal drafts** | Drafts live in `ssp_drafts`, scoped per-user (slot key = `ctx.currentUser.login`, never passed by the client). The `data` field is an opaque blob the server does not interpret. Per-user limit: 256 KB; project-wide cap: 1 MB. |
| 13 | **Take-over of someone else's working copy** | `DELETE` / `POST` `/working-drafts` verify `editorLogin === ctx.currentUser.login` (exception for DELETE: `settingsManager`). The backend always overwrites `editorLogin` with the server-side value on POST → clients cannot forge ownership in the body. |
| 14 | **Conflict replay (overwriting concurrent WC edits)** | On WC commit the backend compares `baseSnapshotHash` (FNV-1a hash of the base snapshot) with the current snapshot hash. On mismatch, the client gets a conflict response and the frontend opens a "Conflict" modal with explicit choices (Overwrite / Download both versions / Cancel). Blind replay is impossible. |
| 15 | **Runaway `_workingDrafts` size** | Limits: 256 KB per WC, 480 KB total across all `ssp_workdrafts`. `validateWorkingDraft` enforces `revisions.length ≤ 1000`. Lazy purge on load: WCs older than 30 days or orphaned (no base snapshot) are removed automatically. |
| 16 | **Privilege escalation via `assignerSync`** | `action=assignerSync` allows writes **only** into `personalPlanning` (assignee + start/end-dates). The backend filters the body down to that subset; sending `body.sprint.items` / `body.settings` / etc. is silently stripped. An assigner cannot change sprint composition, role capacity, status, or validation. |
| 17 | **DoS via large `refresh-assignees` batch** | Hard limit of **200 issueId per request** in backend code. Each `issueId` is asserted (`≤100` chars) and matches `[A-Z][A-Z0-9_]+-[0-9]+`. The limit covers a realistic sprint size with margin. |
| 18 | **Forging `editorLogin` via body** | On every `POST /working-drafts` the backend unconditionally overwrites `body.editorLogin = ctx.currentUser.login` before validation, ignoring any value from the body. The same rule applies to `revisions[].by` (always the server-side login). |
| 19 | **Race condition between DELETE and POST `/working-drafts`** | YouTrack extension-properties are atomic at the POST/SET level; concurrent DELETE + POST resolves to either a save (POST after DELETE) or a delete (DELETE after POST), never a partial state. The UI handles this via retry + a state refresh from `GET /working-drafts`. |

---

## Reporting a security issue

Please email **Oberon999@yandex.kz** (vendor from `manifest.json`) **before** any public disclosure, so we can coordinate a fix.

In your report, include:
- Affected version (from `manifest.json:version` or the badge on the page header).
- A minimal reproduction or proof-of-concept.
- The impact you observed (data exposure, privilege escalation, denial-of-service, etc.).

We aim to acknowledge reports within **5 working days** and to ship a fix or mitigation within **30 days** for confirmed issues, depending on severity. As a sole maintainer, the timeline is best-effort — for critical reports we will publish an interim advisory in the [Security Advisories](https://github.com/Letsrollamigo/smart-sprint-planner/security/advisories) tab even if a fix takes longer.

Smart Sprint Planner does not currently offer a paid bug bounty.
