# Security Model — Smart Sprint Planner

> 🇬🇧 English · 🇷🇺 [Читать по-русски](../Documentation/SECURITY.ru.md)

Applies to version **3.35.0**. The model is server-authoritative: deny-by-default, whitelist validators, defense against Prototype Pollution, and an explicit role model.

> The "Roles", "Access matrix" and "Threats and mitigations" sections were regenerated from code following authz audit #67 (2026-08-19): the matrix covers every endpoint of both handlers (project + global). The unit invariant `tests/unit/security-matrix-invariant.test.js` checks the matrix against the actual `core.ENDPOINTS` registry — any drift fails the gate.
>
> **v3.35.0 — #88 “A sprint field per role”: no new endpoints, but a new WRITE PATH into issues.** Nine per-role settings keys `fieldSprint<Role>` (planning tier, like the other `field*` keys) and a boolean `sprintWriteEnabled` were added to `SETTINGS_WHITELIST`; `ALLOWED_SPRINT_KEYS` gained an optional map `sprintFieldValByRole` (role-shaped keys only, values ≤500 chars, ≤50 entries). The 3.32.0 → 3.35.0 migration is a no-op, with boundary-version fixtures as the regression. **The feature adds no endpoint of its own:** writes go through the existing `POST update-issue-field`, whose allow-list is built by filtering the stored settings for `field*`/`userField*` keys and therefore picks the new keys up automatically — so writes are still possible ONLY into fields the plugin settings designate. Every lock on that endpoint stays: the `assigner` role, project isolation, `Issue.isVisibleTo` and `Issue.canBeWrittenBy` under the user's own permissions (#67 Q1). What is new in the risk model is the bulk write itself: the channel is off by default, fires only on confirming a role composition (not on every issue added), runs in batches of 25 and **never clears a field** — clearing would destroy data entered outside the planner. Multi-value fields are refused before any write: assignment would replace the issue's entire value list. Authorization gates, groups and the access matrix are unchanged.

> **v3.32.0 — “Disable planner in this project”: a new narrow endpoint + two server-side gates.** Additive settings key `plannerDisabled` (bool, admin tier, preserve-merged for non-managers). It is written ONLY by `POST planner-disabled` under the settingsManager role (fail-closed: `plugin_not_configured` without a configured group; the standard instance-admin bypass applies); a regular settings save preserves the stored value — the form cannot wipe the flag. The global delegation gate answers `403 planner_disabled` for a disabled project (the only exemption is the re-enable channel), and the `filter-planner-projects` gate hides a disabled project from everyone except users passing `isSettingsManager` via the `ssp_acl` mirror (fail-closed) and instance admins. Both gates read ONLY the current `ssp_settings` blob — never `history[].settings` snapshots. Workflow rules are deliberately not gated by the flag. Schema migration is a no-op (3.29.0 → 3.32.0).

> **v3.29.0 — 68-8 «Display fields»: an additive settings key, field values are never stored.** `displayFields` was added to `SETTINGS_WHITELIST` and `ADMIN_TIER_SETTINGS_KEYS` — the column set of the three issue tables (`array<{name,summary,role,my}>`, ≤50 rows, `name` a non-empty string ≤200 deduplicated, the three flags boolean or null). The admin tier is deliberate: the set is project-wide, so only the settings manager edits it, and a save by the planning manager preserve-merges the stored value. The key name deliberately does **not** start with `field`/`userField`: such keys enter the server-side allow-list for writing issue fields (`backend-issuefields.js`), where this setting has no business. **No new server endpoint was added**: field values are read by the front end through `host.fetchYouTrack`, i.e. under the user's own account — YouTrack will not return what a person cannot see, so per-person visibility comes from the tracker's own access model rather than from app logic. Values are stored neither in the sprint composition, nor in snapshots, nor in history — the data schema is unchanged (the 3.28.0 → 3.29.0 migration is a no-op). The feature adds no issue-field writes: the columns only display. A field value may contain raw HTML, so the chip cell is escaped explicitly and the color coming from YouTrack is validated before it reaches `style` (regression test — `tests/unit/fieldvalues-loader.test.js`). Authorization gates, groups and the access matrix are unchanged.

> **v3.28.0 — #74 «Issue links» phase 1: an additive settings key, the permission model did not change.** `linkTypeRoles` was added to `SETTINGS_WHITELIST` and `ADMIN_TIER_SETTINGS_KEYS` — the «link type × role» table (`array<{type,hier,dep,info}>`, ≤50 rows, `type` a non-empty string ≤200 with deduplication, sides as the enum `source|target|null`, `info` boolean). The admin tier is deliberate: the key decides which links build the backlog tree and the release scope, so only the settings manager edits it, and a planning manager's save preserve-merges the stored value. The app only **reads** links — no write path to YouTrack was added. The legacy pair `cascadeParentLinkInward`/`Outward` entered step 1 of the deprecation ladder: the backend accepts it as before and logs `SCHEMA_DEPRECATION_WARN`, while the form keeps writing the pair **derived** from the table — both workflow rules (cascade aggregation, parent state rollup) read that same blob directly, and simply ceasing to write would strip their configuration. Hard removal comes no earlier than one minor later. Authz gates, groups and the access matrix are unchanged.

> **v3.27.0 — #73 per-sprint participating roles: an additive schema key, the permission model did not change.** An optional `roles` key was added to `ALLOWED_SPRINT_KEYS`/`ALLOWED_HISTORY_SNAP_KEYS` (array ⊆ `ROLE_KEYS`, deduplicated, server-side `validateSprintRoles` on WRITE and READ). Validation is deliberately **independent of `settings.activeRoles`**: the «subset of project settings» rule is enforced only by the creation dialog's UI gate — a settings-based write gate would reject a legitimate save after settings change. A sprint's role set is a display filter, never a deletion command: the server neither deletes nor filters history records by the set (the invariant is pinned by a test on a production state snapshot). Authz gates, groups and the access matrix are unchanged.
>
> **v3.26.0 — #71 permissions management as a single table: presentation only.** Twelve group permissions (six planning + four release + two reporting tiers) are collected from three settings sections into one «group × permission» table. **The permission model did not change:** settings keys, `ADMIN_TIER_SETTINGS_KEYS`, whitelists, `mergeAdminTierFromStored`, role predicates and the access matrix below are all untouched; the form's save path is not modified by a single line (round-trip invariant: open → save with no edits → all 24 arrays byte-identical, unit test + smoke). The section remains admin-tier (`ADMIN_SECTION_IDS.groups`) — a planning manager still cannot see it. The settings-manager row is read-only: it lives in the project's app settings and is deliberately absent from the plugin settings whitelist. New on the security side — **warning markers, not gates**: automatic YouTrack groups («All Users», «Registered Users», a project team) are flagged as an ineffective carrier of permissions, because `ctx.currentUser.groups` only reports explicitly assigned groups; an empty required column («Validation»/«Editing») raises a deny-by-default warning. Neither marker blocks saving — backend behaviour is unchanged.

> **v3.25.0 — #67 closed in full: "the app never grants more than YouTrack does".** A stand experiment on YouTrack 2025.3 (a user with the Issue Reader role — read issues, no `UPDATE_ISSUE` — placed in the app's groups) confirmed the worse of the two hypotheses: inside an app handler the platform **checks neither the user's right to write a field nor issue visibility** — `entities.*` runs with delegated permissions (JetBrains docs, "Permission delegation"). Through `POST /update-issue-field` such a user changed State and the assignee, including on an issue with `Visible to` they cannot even read via REST; `POST /refresh-assignees` returned that issue's assignee and state. Closed server-side, fail-closed on any SDK exception:
> - `update-issue-field`: `Issue.isVisibleTo(ctx.currentUser)` — an invisible issue answers `issue_not_found` (indistinguishable from a missing one, no oracle); then `Issue.canBeWrittenBy(<project field>, ctx.currentUser)` — without the YouTrack right to the field the answer is `field_not_writable` and the field is untouched. The app's groups remain the second lock, not a replacement for the first: a project Contributor writes as before.
> - `refresh-assignees`: an invisible issue is returned as `null` — same as a missing one.
> - The enricher (v3.18.0) was verified on the live platform against a hidden issue: not enriched, the counter does not reveal it.
> - Also confirmed live: the **"All Users"** group in the app's permission settings grants nothing to anyone — `ctx.currentUser.groups` contains only explicitly assigned groups.
> Endpoints, whitelists and the data schema are unchanged; the matrix rows for `update-issue-field`/`refresh-assignees` are extended.

> **v3.24.1 — R6 "Mirror", incidental UI polish.** CSS and two UI strings only: the permission model, endpoints, whitelists and the data schema are unchanged, the access matrix is unaffected. Horizontal padding for textual `.ring-button-inline` buttons; ❄/🔒 replaced with the `lock` icon from the already vendored `@jetbrains/icons` (static SVG from the bundle, no user input involved).

> **v3.24.0 — Simplification slice R4 "Forks" (rows 18, 20, 22, 28; owner decisions 2026-08-22).** UI-only slice: the permission model, endpoints, whitelists and data schema are unchanged; the access matrix is unchanged.
> - **18** — emoji in the UI are replaced with icons from `@jetbrains/icons` (Apache-2.0, already vendored in `widgets/main/src/icons/`; +4 SVGs: flag/success/cancel/pencil). The new string bridge `window.__SSP_ICON_HTML` (generated by `build-icons.js`, infra layer in the registry) and the React `RingIcon` component render only static SVGs from the bundle (`dangerouslySetInnerHTML` / `innerHTML` over a fixed dictionary, no user input involved).
> - **20** — the native language `<select>` in the header is recorded as an explicit exception to the Ring UI mandate (`CLAUDE_SHARED §3`); no code change.
> - **22** — ≈8–9 leftover keys ×13 locales translated (dictionaries only).
> - **28** — the release composition tree (`release-view.fetchIssueData` → `_linkParents`) resolves parents by the `cascadeParentLinkInward` setting (link phrase from the issue's side; default "subtask of" = previous behaviour) instead of the hard-coded `linkType.name === 'Subtask'`; same REST request `issues?fields=…links(direction,linkType(name,sourceToTarget,targetToSource),issues(idReadable))` under the user's rights as the backlog already uses. Behaviour changes only for teams using a different link.

> **v3.23.0 — Simplification slice R3 "Ladders", step 2 (row 27, hard removal).** Second rung of the ≥2-minor deprecation ladder after the v3.22.0 soft-deprecation — the schema narrows; no new endpoints or permissions.
> - **Whitelists narrowed:** `editingFromHistory`/`historyIdx` removed from `ALLOWED_SPRINT_KEYS` (`schema/whitelists.json` → sync), `migratedTo` from `ALLOWED_SETTINGS_KEYS` (+ validator); `items` removed from the top-level body list of `POST sprint-data` (`ALLOWED_SPRINT_DATA_KEYS`) — the key is silently dropped by `filterKeys`, the step-1 warning is gone. Schema marker `CURRENT_PLUGIN_VERSION` → `3.23.0`; new `SCHEMA_MIGRATIONS` entry `3.6.0 → 3.23.0` (`delete` of the legacy sprint keys; `migratedTo` is cleaned by `migrateSettingsObj` step 3 — also inside `history[].settings` via `migrateHistoryArr`), `SCHEMA_BUMP` is recorded in `migrationLog` on the first read of every snapshot.
> - **Silent strip on WRITE** (same class as `gantt` in v6.1.0): the migration runs on READ only and is not persisted, while `assignerSync`, the bulk `working-drafts` POST (nested `sprint` of old/foreign drafts) and settings-save/confirm from a stale tab carry legacy keys on WRITE past the migration — `stripDeprecatedSprintKeys` extended (`editingFromHistory`/`historyIdx`), new `stripDeprecatedSettingsKeys` (`migratedTo`) applied to `body.settings` and to `history[].settings` inside `stripDeprecatedHistoryKeys`. The bare strict validator (no strip) still rejects the keys as unknown. No change to rights or trust boundaries — only the accepted blob shape.
> - **`ssp_items` removed from `entity-extensions.json`** together with the READ fallback in `GET sprint-data` (and the frontend `r.items` branch); the frontend `migrateEditingFromHistoryV52` (+ `wcMigrationNotice` toast ×15 locales) and the defensive legacy-key `delete`s in `validation-controller`/`working-copy`/`project-nav` are gone. Verified on both test stands: a project with a previously stored value of the removed extension property reads normally.
> - Fixture `tests/fixtures/snapshots/3.23.0/`; compat regression on `3.21.0` (carries the legacy keys) and the D109 gate on the production fixture (`migratedTo` ×9 in embedded settings) are green.

> **v3.22.0 — Simplification slice R3 "Ladders", step 1 (rows 21 and 27).**
> - **Row 21 — `GET/POST user-prefs` (global-only, `backend-userprefs.js`)**: a single per-user preferences blob `User.extensionProperties.ssp_user_prefs` (new declaration in `entity-extensions.json`). The frontend mirrors its localStorage keys (language, last role, sort key, collapsed rail, hint flag, version cache, last project) into it — on YouTrack builds where the widget sandbox has no `allow-same-origin` (e.g. 2025.3) `localStorage` throws SecurityError and preferences did not survive a reload. Access: any authenticated user, **own slot only** (`ctx.currentUser`; no projectKey accepted); server-side allow-list of 7 keys + per-value length caps (strings; `null` = delete) + 2 KB blob cap; reason codes never echo values. No new permissions or outbound requests.
> - **Row 27, step 1 — soft-deprecation of legacy keys** (≥2-minor ladder): the `ssp_items` write path in `POST sprint-data` is closed — a body with `items` is accepted but not stored (`warnings: deprecated:items_ignored`, key absent from `saved`); the READ fallback stays. Sprint keys `editingFromHistory`/`historyIdx` and settings key `migratedTo` are no longer written by the frontend (stripped from loaded blobs); the server still accepts them on WRITE (whitelists unchanged) and records `SCHEMA_DEPRECATION_WARN` in `migrationLog`. Hard removal (migration `delete`, whitelist removal, `SCHEMA_BUMP`) is step 2, not before v3.23.0. Fixture `tests/fixtures/snapshots/3.21.0/` + compat regression.

> **v3.21.0 — build slice R2:** build-only change. Recharts moved out of `vendored-react.chunk.js` into a lazy `recharts.chunk.js` (loaded by a relative script tag when the reporting panel mounts — same pattern as pdfmake/XLSX; React/ReactDOM come through shims from `SSP_VENDORED`, no second React instance is bundled); esbuild `--charset=utf8`. No new endpoints, permissions or outbound requests; the marketplace zip allow-list includes the chunk and `release-check.sh` asserts its presence.

> **v3.20.1 — save buttons split (#69 row 2):** `doSaveRoleHeader` («Save role resource») now writes only `_sprint[role.resKey]` — the per-role button no longer rewrites the shared sprint fields (name/dates/goal/Sprint/Version) read from the Sprint-inputs form; the «selected sprint ≠ working slot» gate (#70) stays in both savers. Access model and server validators unchanged.

> **v3.18.0 — authz audit #67 remainder + server-side task enrichment:** new `editorOrValidator` pseudo-role — a validator can clear the sprint slot (`sprint:null`) when deleting the last history record, and an editor takes auto-snapshots via the narrow `POST /history?action=snapshot` branch (single-record upsert by `sprintId`, deletes nothing); the frontend resets the slot locally only after the server acks (ordering fix for the "ghost sprint" class); `update-issue-field` gets a `fieldName` allow-list (only fields configured in the plugin + the `'State'` release fallback); server-side audit stamps for `sprint.updatedBy/At`, `confirmedBy`/`finishedBy` and `revisions[].by` (`import-replace` deliberately unstamped — a backup restore preserves original attribution); the `ssp_acl` mirror re-syncs after every settings save; `filter-planner-projects` gets a 256 KB body cap and the global adapter answers "no such project" and "no access" with a single `project_unavailable` (project-existence oracle closed). Server-side enrichment: a composition item with an `issueId` but no `title` is filled from the issue (title/state/priority/xpriority/system/externalTicketId, empty fields only) — project isolation + fail-closed visibility (`Issue.isVisibleTo`), up to 200 per request, result reported as `enriched: {count, skipped}`. Viewer access to the full settings blob is kept and documented as an accepted limitation (project-member trust model).

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
- `editorOrValidator` (#67 H5, v3.18.0) — editor ∨ validator. Serves two narrow branches: the `sprint:null` slot reset (a validator finishes cleaning history together with the slot; a reset is weaker than the full replace it already performs under `?action=validate`) and `history?action=snapshot` (an editor's auto-snapshot; single-record upsert, deletes nothing).
- `settingsOrPlanning` — settingsManager ∨ planningManager. planningManager writes only the planning tier of settings: admin-tier keys (all group keys, sprint-lock, reporting fields) are preserve-merged from stored settings — self-escalation by writing group keys is impossible.

**Global project administrator bypass** (#51): a user with the global `UPDATE_PROJECT` permission is treated as a member of every planner role in every project, including projects with no configured `settingsManagerGroup`.

> **Exception — `historyManager` (#66, since v3.16.1).** Full clearing (`history?action=clear`), file import replacement (`history?action=import-replace`) and — since v3.17.0 (#67) — bulk truncation via the main write branch are irreversible, so the bypass does **not** extend to this role: a global admin needs explicit membership in `historyClearGroups`/`historyClearGroupNames`. The carve-out is applied both in `isHistoryManager()` and in the early admin-return of `authzGuard()`, so the UI button and the server gate stay in sync. No lock-out: the admin keeps `settingsManager` and can assign the clearing group to themselves.

**Roles are orthogonal** (clarified by #67): validator does not inherit editor and vice versa. The narrow inclusion that does hold: validator ⊇ editor **for slot writes** to `ssp_sprint`/`ssp_roleitems` under `?action=validate` (a deliberate v3.2.1 mechanic). The documented unions are `assigner` and `editorOrValidator` (see pseudo-roles) on top of viewer: narrow branches, not wholesale role inheritance.

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
| POST   | `sprint-data` (`body.sprint`/`roleItems`/`settings`) | editor; **the `sprint:null` branch (slot reset, incl. the paired `roleItems` gate) — editor ∨ validator (#67 H5)**; items without a `title` are enriched server-side from issues — project isolation + `isVisibleTo`, limit 200 |
| POST   | `sprint-data` (`body.settings`) | settingsManager OR planningManager (admin tier preserve-merged) |
| POST   | `sprint-data?action=validate` | validator (writes `sprint`/`roleItems` without editor — deliberate, v3.2.1; the `sprint:null` branch — editor ∨ validator, #67) |
| POST   | `sprint-data?action=assignerSync` | assigner union (partial save of `personalPlanning` only) |
| GET    | `history` | viewer |
| POST   | `history` | validator; **shortening by more than 1 record — historyManager (#67, no admin bypass)**; audit fields are server-stamped (#67 H8) |
| POST   | `history?action=snapshot` | editor ∨ validator (upsert of exactly one record by `sprintId`, deletes nothing — #67 H5; H8 audit stamps) |
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
| POST   | `update-issue-field` | assigner union (types: `period`/`enum`/`state`/`version`/`owned`/`build`/`user`; project isolation; `fieldName` — length/characters + **allow-list of configured fields, #67 H7**; **v3.25.0: `Issue.isVisibleTo` → `issue_not_found`, `Issue.canBeWrittenBy` against the user's own rights → `field_not_writable`**) |
| POST   | `refresh-assignees` | **viewer** (bulk read of assignee/state, up to 200 issueIds per request; **v3.25.0: an issue invisible to the user → `null`**) |
| GET    | `releases` | viewer |
| GET    | `releases-archive` | viewer |
| POST   | `releases` | settingsManager OR releaseManager; releaseEngineer — advance-diff only (`engineerDiffAllowed`) |
| GET    | `reporting-access` | viewer (response carries A/B contour flags by membership) |
| GET    | `sprint-lock` | viewer |
| POST   | `sprint-lock` | sprintLockManager |
| POST   | `planner-disabled` | settingsManager (#80: the only writer of `plannerDisabled`; fail-closed — `plugin_not_configured` without a configured group) |
<!-- authz-matrix:project:end -->

### Global scope (`backend-global.js`)

Every project endpoint except `sync-acl` and `app-version` is reachable via the global URL with `?projectKey=<KEY>`: the adapter resolves the project and applies the read gate (`READ_PROJECT_BASIC`) **before** the core role logic — role checks are not weakened. **#80:** when `ssp_settings.plannerDisabled === true`, delegation answers `403 planner_disabled` (the gate reads only the project's current settings blob, never history); the single exemption is `planner-disabled` (the re-enable channel). In `filter-planner-projects` a disabled project is returned (with `disabled: true`) only to users passing `isSettingsManager` via the `ssp_acl` mirror (fail-closed), or to instance admins. "No such project" and "no access" are answered with a single `project_unavailable` (#67 H11 — the project-existence oracle is closed). The global handler's own endpoints:

<!-- authz-matrix:global:begin -->
| Method | Path | Minimal role |
|--------|------|--------------|
| GET    | `app-version` | authentication (static, no read gate — the version badge before a project is picked) |
| POST   | `filter-planner-projects` | authentication (picker arbiter: up to 5000 keys per request; 256 KB body cap, #67 H11) |
| GET    | `last-project` | authentication (own slot) |
| POST   | `last-project` | authentication (writes own slot only) |
| GET    | `user-prefs` | authentication (own slot; preferences blob `ssp_user_prefs`, row 21) |
| POST   | `user-prefs` | authentication (writes own slot only; allow-list of 7 keys + 2 KB cap) |
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
| 14 | **Conflict replay (overwriting concurrent edits)** *(restated in v3.17.0 — per code)* | The `baseSnapshotHash` comparison happens **on the client** (the “Version conflict” flow); the server only validates the field as a string. The server-side protection is the `baseRev` optimistic lock on the `sprint-data`/`history`/`releases`/`absences` slots: a mismatch → `rev_conflict`. Limitation (by design): a client that sends no `baseRev` passes in last-write-wins mode — the lock is advisory. External integrations must always send `baseRev` per contract; a server-side mandatory lock was deliberately not introduced (#67 H11). |
| 15 | **Runaway `_workingDrafts` size** | Limits: 256 KB per WC, 480 KB total across all `ssp_workdrafts`. `validateWorkingDraft` enforces `revisions.length ≤ 1000`. Lazy purge on load: WCs older than 30 days or orphaned (no base snapshot) are removed automatically. |
| 16 | **Privilege escalation via `assignerSync`** | `action=assignerSync` allows writes **only** into `personalPlanning` (assignee + start/end-dates). The backend filters the body down to that subset; sending `body.sprint.items` / `body.settings` / etc. is silently stripped. An assigner cannot change sprint composition, role capacity, status, or validation. |
| 17 | **DoS via a large `refresh-assignees` batch** *(clarified in v3.17.0 — per code)* | Hard limit of **200 issueIds per request** (`MAX_REFRESH_ASSIGNEES_BATCH`); exceeding it → `invalid_issue_ids`. Every issueId is checked against `^[A-Za-z][A-Za-z0-9_]*-\d+$` (lowercase letters allowed), `fieldName` — for length and forbidden characters. Limitation (accepted remainder, #67 H11): there is no limit on the number of requests — not cheaply implementable in a stateless handler. |
| 18 | **`editorLogin` forgery via body** *(closed in v3.17.0, #67)* | Before v3.17.0 the server stamp was applied only to new entries — for one's own existing entry the client value went to storage (a foreign login → a persistent edit lock; `null` → an ownerless entry). Now the `editorLogin` of every entry is derived from storage (existing — the previous owner, new/ownerless — the writer). Since v3.18.0 (#67 H8) server audit stamps cover the remaining fields too: `sprint.updatedBy/At` — always server-side; `confirmedBy`/`finishedBy` — stamped with the request author when they differ from stored; `revisions[].by` — for new entries. `?action=import-replace` is deliberately unstamped (a backup restore preserves attribution). |
| 19 | **Race between delete and save on `/working-drafts`** | YouTrack extension properties are atomic at the POST/SET level; a concurrent `?action=delete` + POST resolves either into a save or a delete, with no partial state. The UI copes via retry + state refresh from `GET /working-drafts`. |
| 20 | **`ssp_acl` mirror staleness after a settings-manager group change** *(#67 H9, v3.18.0)* | Group membership is always live from `ctx.currentUser.groups`; only the group itself can go stale in the global-mode mirror. Re-sync: project widget init + every successful settings save (`syncAclMirror`). Accepted limitation: after changing the group, open the project widget or save settings once. |
| 21 | **Viewer reads the full settings blob / other users' drafts** *(#67 H10, kept)* | Project-member trust model: `GET /sprint-data` returns role group keys and rate settings, `GET /working-drafts` — everyone's working copies. No escalation — authorization never reads settings from the body; trimming the admin tier on GET was rejected (risk of regressing UI gates). |
| 22 | **Project-existence oracle via the global adapter** *(#67 H11, closed in v3.18.0)* | `project_not_found`/`project_access_denied` collapsed into a single `project_unavailable` — enumerating the instance's project keys by response difference is no longer possible. |
| 23 | **"Laundering" hidden issue titles via server-side enrichment** *(v3.18.0)* | The enricher reads the issue server-side and writes into `ssp_roleitems`, readable by any viewer → fail-closed: `Issue.isVisibleTo(ctx.currentUser)` before enriching; an invisible issue is indistinguishable in the response from a non-existent one (the `skipped` counter counts only the over-limit tail — not an oracle). Project isolation — same as `refresh-assignees`/`update-issue-field`. |
| 24 | **Writing to an issue past the user's own YouTrack rights** *(#67 Q1, stand 2026-08-23, closed in v3.25.0)* | The platform runs `entities.*` inside a handler with delegated permissions and checks neither `UPDATE_ISSUE` nor `Visible to`: a member of the app's groups with read-only rights changed State/assignee, including on an issue hidden from them. `update-issue-field` now checks `Issue.isVisibleTo(ctx.currentUser)` itself (denial = `issue_not_found`, no oracle) and `Issue.canBeWrittenBy(<field>, ctx.currentUser)` (denial = `field_not_writable`); an SDK exception = denial. The app's groups are the second lock, not a replacement for the first. |
| 25 | **Reading assignee/state of hidden issues via `refresh-assignees`** *(#67 Q2, stand 2026-08-23, closed in v3.25.0)* | `findById` returns an issue with `Visible to` that the user cannot see via REST (404), and the endpoint returned its fields. An invisible issue is now `null`, same as a missing one. |

---

## Reporting a security issue

Please email **Oberon999@yandex.kz** (vendor from `manifest.json`) **before** any public disclosure, so we can coordinate a fix.

In your report, include:
- Affected version (from `manifest.json:version` or the badge on the page header).
- A minimal reproduction or proof-of-concept.
- The impact you observed (data exposure, privilege escalation, denial-of-service, etc.).

We aim to acknowledge reports within **5 working days** and to ship a fix or mitigation within **30 days** for confirmed issues, depending on severity. As a sole maintainer, the timeline is best-effort — for critical reports we will publish an interim advisory in the [Security Advisories](https://github.com/Letsrollamigo/smart-sprint-planner/security/advisories) tab even if a fix takes longer.

Smart Sprint Planner does not currently offer a paid bug bounty.
