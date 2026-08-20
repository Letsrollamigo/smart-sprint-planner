# Security Model — Smart Sprint Planner

> 🇬🇧 English · 🇷🇺 [Читать по-русски](../Documentation/SECURITY.ru.md)

Applies to version **3.17.0**. The model is server-authoritative: deny-by-default, whitelist validators, defense against Prototype Pollution, and an explicit role model.

> The "Roles", "Access matrix" and "Threats and mitigations" sections were regenerated from code following authz audit #67 (2026-08-19): the matrix covers every endpoint of both handlers (project + global). The unit invariant `tests/unit/security-matrix-invariant.test.js` checks the matrix against the actual `core.ENDPOINTS` registry — any drift fails the gate.
>
> **v3.17.0 — authz audit #67 fixes:** effect-based gate on history clearing (shortening the stored history by more than 1 record in a single POST now requires `historyManager`; the threshold was chosen because deleting a single record via the trash icon is a routine validator operation, while bulk truncation in one POST is never produced by the UI); `?action=validate` no longer bypasses the editor gate on the slot-reset branch (`sprint:null`); a load-failure flag on the absences registry blocks saving (the one data-loss-by-ordinary-click path is closed); the working copy `editorLogin` is always derived from storage; `hasOwnProperty` guard in `history?action=assignerSync`.

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

13 roles: 12 group-based + 1 contextual (`wcOwner`). Plus two union pseudo-roles that exist only as `authzGuard` arguments (see below the table).

| Role | Configured in | Granted by |
|------|---------------|------------|
| `settingsManager` | `ctx.settings.settingsManagerGroup` (project-scoped app-settings) | Project admin / Global admin (via Project Settings → Apps) |
| `editor` | `ssp_settings.editGroups` / `editGroupNames` | settingsManager |
| `validator` | `ssp_settings.validationGroups` / `validationGroupNames` | settingsManager |
| `historyManager` | `ssp_settings.historyClearGroups` / `historyClearGroupNames` · **no admin bypass (#66)** | settingsManager |
| `assigner` | `ssp_settings.assignerGroups` / `assignerGroupNames` | settingsManager |
| `planningManager` | `ssp_settings.planningManagerGroups` / `planningManagerGroupNames` | settingsManager |
| `releaseManager` | `ssp_settings.releaseManagerGroups` / `releaseManagerGroupNames` | settingsManager |
| `releaseEngineer` | `ssp_settings.releaseEngineerGroups` / `releaseEngineerGroupNames` | settingsManager |
| `sprintLockManager` | `ssp_settings.sprintLockGroups` / `sprintLockGroupNames` | settingsManager |
| `reportingViewerA` | `ssp_settings.reportingGroupsA` / `reportingGroupsANames` | settingsManager |
| `reportingViewerB` | `ssp_settings.reportingGroupsB` / `reportingGroupsBNames` · **B ⊇ A** | settingsManager |
| `viewer` | any authenticated project user | YouTrack project permissions |
| `wcOwner` *(contextual)* | `editorLogin === ctx.currentUser.login` in `_workingDrafts[key]` | automatic on `POST /working-drafts` |

**`authzGuard` pseudo-roles (unions, not separate groups):**

- `assigner` as a gate argument is a union of **five** roles: editor ∨ assigner ∨ settingsManager ∨ releaseManager ∨ releaseEngineer (+ the instance-admin bypass).
- `settingsOrPlanning` — settingsManager ∨ planningManager. planningManager writes only the planning tier of settings: admin-tier keys (all group keys, sprint-lock, reporting fields) are preserve-merged from stored settings — self-escalation by writing group keys is impossible.

**Global project administrator bypass** (#51): a user with the global `UPDATE_PROJECT` permission is treated as a member of every planner role in every project, including projects with no configured `settingsManagerGroup`.

> **Exception — `historyManager` (#66, since v3.16.1).** Full clearing (`history?action=clear`), file import replacement (`history?action=import-replace`) and — since v3.17.0 (#67) — bulk truncation via the main write branch are irreversible, so the bypass does **not** extend to this role: a global admin needs explicit membership in `historyClearGroups`/`historyClearGroupNames`. The carve-out is applied both in `isHistoryManager()` and in the early admin-return of `authzGuard()`, so the UI button and the server gate stay in sync. No lock-out: the admin keeps `settingsManager` and can assign the clearing group to themselves.

**Roles are orthogonal** (clarified by #67): validator does not inherit editor and vice versa. The narrow inclusion that does hold: validator ⊇ editor **for slot writes** to `ssp_sprint`/`ssp_roleitems` under `?action=validate` (a deliberate v3.2.1 mechanic). The only documented hierarchy is the `assigner` union (see pseudo-roles) on top of viewer.

**`wcOwner`** (working copy owner) is the only role whose authorization comes not from `ssp_settings` / `ctx.settings.*` but from `_workingDrafts[key].editorLogin` itself. Since v3.17.0 (#67) the backend derives `editorLogin` from storage on every POST — the client value is never persisted. Taking over someone else's WC is impossible: overwriting a foreign key with your own login → `not_owner`; a bulk flush carrying foreign entries silently keeps the server version. `settingsManager` may delete any WC.

---

## Endpoint access matrix

Regenerated from code (#67, 2026-08-19): `core.ENDPOINTS` holds 34 project endpoints; the global handler exposes the same endpoints via `?projectKey=` (except `sync-acl` and `app-version`) plus 4 of its own. The "matrix = code" invariant lives in `tests/unit/security-matrix-invariant.test.js`.

### Project scope (`backend-project.js` → `core.ENDPOINTS`)

`?action=…` rows are branches of the same endpoint with a different role; the row without `action` is the main branch.

<!-- authz-matrix:project:begin -->
| Method | Path | Minimal role |
|--------|------|--------------|
| GET    | `project-fields` | viewer |
| GET    | `sprint-data` | viewer (the response includes the entire `ssp_settings` blob, incl. role group keys) |
| POST   | `sprint-data` (`body.sprint`/`roleItems`/`items`) | editor |
| POST   | `sprint-data` (`body.settings`) | settingsManager OR planningManager (admin tier preserve-merged) |
| POST   | `sprint-data?action=validate` | validator (writes `sprint`/`roleItems` without editor — deliberate, v3.2.1; the `sprint:null` branch — editor, #67) |
| POST   | `sprint-data?action=assignerSync` | assigner union (partial save of `personalPlanning` only) |
| GET    | `history` | viewer |
| POST   | `history` | validator; **shortening by more than 1 record — historyManager (#67, no admin bypass)** |
| POST   | `history?action=assignerSync` | assigner union (partial save of `personalPlanning` in existing snaps) |
| POST   | `history?action=clear` | historyManager (no admin bypass, #66) |
| POST   | `history?action=import-replace` | historyManager (no admin bypass, #66) |
| GET    | `working-drafts` | viewer (returns working copies of ALL users) |
| POST   | `working-drafts` | validator (`editorLogin` derived from storage, #67) |
| POST   | `working-drafts?action=delete&key=…` | validator + (wcOwner OR settingsManager), otherwise `not_owner` |
| GET    | `draft` | viewer (own slot only) |
| POST   | `draft` | viewer (writes own slot only; `?action=clear` deletes own slot) |
| GET    | `check-settings-manager` | viewer |
| GET    | `check-instance-admin` | viewer |
| GET    | `check-validator` | viewer |
| GET    | `check-editor` | viewer |
| GET    | `check-assigner` | viewer |
| GET    | `check-history-manager` | viewer |
| GET    | `app-version` | viewer |
| POST   | `sync-acl` | viewer (writes the `ssp_acl` mirror ONLY from `ctx.settings`; the body is not read) |
| GET    | `capacity` | viewer (grades, rates, roster allocations) |
| GET    | `capacity-archive` | viewer |
| POST   | `capacity` | settingsManager OR planningManager (`approvedBy` is a server stamp) |
| GET    | `calendar` | viewer |
| POST   | `calendar` | settingsManager |
| GET    | `absences` | viewer (who is absent and when) |
| POST   | `absences` | settingsManager OR planningManager |
| GET    | `field-values` | viewer |
| GET    | `get-user-field-values` | viewer |
| POST   | `update-issue-field` | assigner union (types: `period`/`enum`/`state`/`version`/`owned`/`build`/`user`; project isolation; `fieldName` validated for length/characters) |
| POST   | `refresh-assignees` | **viewer** (bulk read of assignee/state, up to 200 issueIds per request) |
| GET    | `releases` | viewer |
| GET    | `releases-archive` | viewer |
| POST   | `releases` | settingsManager OR releaseManager; releaseEngineer — advance-diff only (`engineerDiffAllowed`) |
| GET    | `reporting-access` | viewer (response carries A/B contour flags by membership) |
| GET    | `sprint-lock` | viewer |
| POST   | `sprint-lock` | sprintLockManager |
<!-- authz-matrix:project:end -->

### Global scope (`backend-global.js`)

Every project endpoint except `sync-acl` and `app-version` is reachable via the global URL with `?projectKey=<KEY>`: the adapter resolves the project and applies the read gate (`READ_PROJECT_BASIC`) **before** the core role logic — role checks are not weakened. The global handler's own endpoints:

<!-- authz-matrix:global:begin -->
| Method | Path | Minimal role |
|--------|------|--------------|
| GET    | `app-version` | authentication (static, no read gate — the version badge before a project is picked) |
| POST   | `filter-planner-projects` | authentication (picker arbiter: up to 5000 keys per request) |
| GET    | `last-project` | authentication (own slot) |
| POST   | `last-project` | authentication (writes own slot only) |
<!-- authz-matrix:global:end -->

`viewer` — any authenticated project user. All other roles require a configured `settingsManagerGroup` (deny-by-default otherwise). `wcOwner` is a contextual role (see the roles table above).

---

## Threats and mitigations

| # | Threat | Mitigation |
|---|--------|-----------|
| 1 | **Settings takeover on a fresh install (chicken-and-egg)** | `settingsManagerGroup` lives only in app-settings; deny-by-default; no endpoint can write it |
| 2 | **Role spoofing via request body** | Backend never reads `body.editGroups` / `validationGroups` / `historyClearGroups` / `settingsManagerGroup` for authorization; only `ctx.currentUser.groups` |
| 3 | **Accidental or malicious history clearing** | Dedicated `historyManager` role with no admin bypass (#66); the clear button is hidden in the UI; since v3.17.0 (#67) the gate is **effect-based**: both `?action=clear` and the main `POST /history` branch that shortens the history by more than 1 record require `historyManager`. The validator's residual right is single-record deletion (the routine UI trash icon). |
| 4 | **Prototype Pollution** | `sanitizeDeep` rejects `__proto__` / `constructor` / `prototype` up to 10 levels deep |
| 5 | **Garbage data written into settings** | Strict `ALLOWED_SETTINGS_KEYS` whitelist + type assertions + numeric ranges |
| 6 | **XSS via YouTrack data** | All inserts go through `esc()` (5 chars); all `href` through `safeUrl()` (https/http only); no `eval` / `Function` / `document.write` |
| 7 | **Tabnabbing via `target=_blank`** | All external links carry `rel="noopener noreferrer"` |
| 8 | **Compromised CDN xlsx bundle** | `integrity="sha384-..."` + `crossorigin="anonymous"` on the xlsx loader — the browser blocks substitution |
| 9 | **DoS via large request body** | `MAX_REQUEST_BODY=2 MB` in `getBody`, `MAX_PROP_SIZE=500 KB` per property (1 MB for history) |
| 10 | **Injection via `fieldName`** | Validation forbids only control chars and `< > "`; YouTrack field names with dots / brackets / ampersands pass. The YouTrack API performs lookups without SQL/path concatenation. |
| 11 | **Diagnostic information leaks** | All backend errors return `internal_error` without echoing request bodies; detailed logs only in server log when `enableDebugLog` is enabled |
| 12 | **Forging or tampering with personal drafts** | Drafts live in `ssp_drafts`, scoped per-user (slot key = `ctx.currentUser.login`, never passed by the client). The `data` field is an opaque blob the server does not interpret. Per-user limit: 256 KB; project-wide cap: 1 MB. |
| 13 | **Working copy take-over** *(clarified in v3.17.0)* | `POST /working-drafts` (bulk): a foreign key with your own login substituted → `not_owner`; a foreign key inside a bulk flush → the server version silently wins; the `editorLogin` of every saved entry is derived from storage, the client value is never persisted (#67). `?action=delete&key=…`: wcOwner or `settingsManager` only. |
| 14 | **Conflict replay (overwriting concurrent edits)** *(restated in v3.17.0 — per code)* | The `baseSnapshotHash` comparison happens **on the client** (the “Version conflict” flow); the server only validates the field as a string. The server-side protection is the `baseRev` optimistic lock on the `sprint-data`/`history`/`releases`/`absences` slots: a mismatch → `rev_conflict`. Limitation (by design): a client that sends no `baseRev` passes in last-write-wins mode — the lock is advisory. |
| 15 | **Runaway `_workingDrafts` size** | Limits: 256 KB per WC, 480 KB total across all `ssp_workdrafts`. `validateWorkingDraft` enforces `revisions.length ≤ 1000`. Lazy purge on load: WCs older than 30 days or orphaned (no base snapshot) are removed automatically. |
| 16 | **Privilege escalation via `assignerSync`** | `action=assignerSync` allows writes **only** into `personalPlanning` (assignee + start/end-dates). The backend filters the body down to that subset; sending `body.sprint.items` / `body.settings` / etc. is silently stripped. An assigner cannot change sprint composition, role capacity, status, or validation. |
| 17 | **DoS via a large `refresh-assignees` batch** *(clarified in v3.17.0 — per code)* | Hard limit of **200 issueIds per request** (`MAX_REFRESH_ASSIGNEES_BATCH`); exceeding it → `invalid_issue_ids`. Every issueId is checked against `^[A-Za-z][A-Za-z0-9_]*-\d+$` (lowercase letters allowed), `fieldName` — for length and forbidden characters. Limitation: there is no limit on the number of requests (rate limiting is level-3 backlog of audit #67). |
| 18 | **`editorLogin` forgery via body** *(closed in v3.17.0, #67)* | Before v3.17.0 the server stamp was applied only to new entries — for one's own existing entry the client value went to storage (a foreign login → a persistent edit lock; `null` → an ownerless entry). Now the `editorLogin` of every entry is derived from storage (existing — the previous owner, new/ownerless — the writer). Limitation: `revisions[].by` and `updatedBy`/`confirmedBy`/`finishedBy` are NOT server-stamped (client values) — server audit stamps are level-3 backlog of audit #67. |
| 19 | **Race between delete and save on `/working-drafts`** | YouTrack extension properties are atomic at the POST/SET level; a concurrent `?action=delete` + POST resolves either into a save or a delete, with no partial state. The UI copes via retry + state refresh from `GET /working-drafts`. |

---

## Reporting a security issue

Please email **Oberon999@yandex.kz** (vendor from `manifest.json`) **before** any public disclosure, so we can coordinate a fix.

In your report, include:
- Affected version (from `manifest.json:version` or the badge on the page header).
- A minimal reproduction or proof-of-concept.
- The impact you observed (data exposure, privilege escalation, denial-of-service, etc.).

We aim to acknowledge reports within **5 working days** and to ship a fix or mitigation within **30 days** for confirmed issues, depending on severity. As a sole maintainer, the timeline is best-effort — for critical reports we will publish an interim advisory in the [Security Advisories](https://github.com/Letsrollamigo/smart-sprint-planner/security/advisories) tab even if a fix takes longer.

Smart Sprint Planner does not currently offer a paid bug bounty.
