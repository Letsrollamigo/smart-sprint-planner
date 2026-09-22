# MCP server for Smart Sprint Planner

[Русская версия](./README.ru.md)

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives an AI agent (Claude Code, Kilo Code, Cursor or any other MCP client) access to planner data per YouTrack project: the working sprint and its issues by role, history, capacity, calendar and absences, releases, reminders. Under the hood it speaks the planner's [external REST contract](../openapi-sprint.yaml), edition 3.49.1; the server keeps no state, has no accounts of its own and adds no permissions.

**Server version 0.1.0 · compatible with planner ≥ 3.49.1** (checked by the project overview tool).

## Access model

- The server is shared (one per team or instance), runs in a container and listens on HTTP.
- Every request carries the caller's **personal permanent YouTrack token** in the `Authorization: Bearer …` header. The server forwards the token to YouTrack and forgets it: no caching, no logging, nothing on disk. A request without the header gets 401 before the MCP protocol starts.
- Permissions are exactly those of the token user: reading is open to any project member, writing follows the planner role groups in the project settings (editor, assigner, settings manager, planning manager, release manager, release engineer). See the integrations chapter of the planner documentation.
- The dangerous contract operations (full replacement of history, calendar, absences and releases; sprint lock; disabling the planner; issue field writes) do not exist in this server at all.

## Running in a container

```bash
cd Integrations/mcp-server
cp .env.example .env        # set YT_BASE_URL and MCP_ALLOWED_HOSTS
docker compose up -d --build
curl http://localhost:8085/healthz
```

Image `node:24-alpine`, no build step — the image copies the sources. Inside the container the server listens on `0.0.0.0:8085`; TLS termination belongs to a proxy in front of it. There are no tokens in `.env` — clients hold them.

| Variable | Purpose | Default |
|---|---|---|
| `YT_BASE_URL` | YouTrack address without a trailing `/` (from the container to the host — `http://host.docker.internal:8080`) | required |
| `PLANNER_APP_ID` | planner app name in the contract address | from the build |
| `MCP_TRANSPORT` | `http` — shared server; `stdio` — local run for debugging (then `YT_TOKEN` is required) | `http` |
| `MCP_HOST`, `MCP_PORT` | listen address | `127.0.0.1`, `8085` (`0.0.0.0` in the container) |
| `MCP_ALLOWED_HOSTS` | comma-separated `host[:port]` — DNS-rebinding protection | empty (off) |
| `MCP_LANG` | language of tool descriptions and texts: `en` or `ru` | `en` |
| `PROJECT_ALLOWLIST` | comma-separated project keys; empty — all | empty |
| `READ_ONLY` | `1` — no write tools | `0` |
| `YT_TIMEOUT_MS` | YouTrack request timeout | `30000` |
| `LOG_LEVEL` | `error` / `info` / `debug` | `info` |

In `http` mode the `YT_TOKEN` variable is forbidden — the server refuses to start: a shared server has no token of its own.

The log goes to stderr as JSON lines: time, tool, project key, outcome, refusal code, `cid`, duration. No request bodies, tokens or field values.

## Connecting a client

The token is a permanent token of a YouTrack user (profile → Authentication → New token). Keep it in the client's secure store, never in prompts.

**Claude Code** — a `.mcp.json` file in the agent's project directory; the value is expanded from the environment at start:

```json
{
  "mcpServers": {
    "planner": {
      "type": "http",
      "url": "http://localhost:8085/mcp",
      "headers": { "Authorization": "Bearer ${YT_TOKEN}" }
    }
  }
}
```

Or by command (the token lands in the client configuration in plain text):

```bash
claude mcp add --transport http planner http://localhost:8085/mcp --header "Authorization: Bearer <token>"
```

**Kilo Code, Cursor and others** — type `streamable-http` (`http`), the same address and the same header.

The agent's first call is `planner_get_project_overview`: planner version and compatibility, whether the planner is configured in the project, active roles, the working slot state. The agent quickstart is the resource `planner://guide/quickstart` and the server `instructions` field.

## Tools

Units: effort and resources are **minutes** (8 h = 480), sprint and release dates are epoch-ms, absences are `YYYY-MM-DD`. Role, status and type codes are Latin (resource `planner://reference/enums`). Every tool requires `projectKey`.

| Tool | What it does | Role |
|---|---|---|
| `planner_get_project_overview` | planner version, `configured`, active roles, slot header, sprint lock, release count | project member |
| `planner_get_sprint` | working sprint and issues by role (role filter, limit, excluded; settings by flag) | member |
| `planner_get_history` | sprint snapshots by role with `sprintId`, `roleKey`, `status` filters; issues with `includeItems` | member |
| `planner_get_capacity` | sprint capacity record (participants, grades, rates, shares, base); archive by flag | member |
| `planner_get_calendar` | production calendar (year filter) | member |
| `planner_get_absences` | absences (login and period filters) | member |
| `planner_get_releases` | release registry, caller permissions, revision; archive by flag | member |
| `planner_get_reminders` | reminders addressed to the caller; journal by flag | member |
| `planner_upload_draft` | upload a whole sprint draft; an occupied slot is refused with `slot_occupied` unless `overwrite` | editor |
| `planner_upsert_item` · `planner_remove_item` | add/change a role issue · remove an issue | editor |
| `planner_patch_sprint` | change part of the sprint header (name, dates, goal, role resources) | editor |
| `planner_assign_person` | assign or unassign an issue's person, work dates | assigner |
| `planner_upsert_absence` · `planner_remove_absence` | add/replace · remove an absence | settings manager / planning manager |
| `planner_upsert_capacity_person` | add/change a capacity participant | same |
| `planner_upsert_release` · `planner_set_release_status` · `planner_update_release_issues` | create/change a release · change status · add and remove issues | release manager (engineer — next status step) |

Revisions: `baseRev` is optional — the server reads the current one and retries a point operation once on a conflict; a passed `baseRev` is used as is. A full draft upload is never retried.

A planner refusal comes back as a tool error: the `reason` code, what it means and what to do (from the code registry), and a `cid` to find the record in the planner log; platform 401 and 404 get their own wording. Resources: `planner://contract/openapi`, `planner://contract/error-codes`, `planner://reference/roles`, `planner://reference/enums`, `planner://guide/quickstart`. Scenario prompts: draft upload, point changes, release flow.

## Development and checks

```bash
npm install
npm test                                   # unit tests and invariants, no network
npm run check-contract                     # contract copies equal Integrations/
YT_BASE_URL=http://localhost:8080 YT_TOKEN=... npm run smoke -- <KEY>     # contract smoke on a test instance
```

The smoke writes data with point operations and restores the state; it only works against localhost. Through an already running server — `npm run smoke -- <KEY> --url http://localhost:8085/mcp`. Local run for MCP Inspector: `MCP_TRANSPORT=stdio YT_TOKEN=… YT_BASE_URL=… node src/index.js`.

The code is the same for both planner builds; only `src/branding.js` (app name, product name, default language), `package.json` and this file differ. The contract and code registry copies in `contract/` are synchronised with `npm run sync-contract`.

## Not in the first version

Restricted contract operations, sprint validation, capacity approval and phases; release deletion (the planner has no point operation for it); OAuth and sessions — the token travels in every request header; resources are static only.

## License

MIT — the same as the planner.
