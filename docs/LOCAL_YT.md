# Running the planner in a local YouTrack

This guide is for **contributors** who want to see a change running inside a real
YouTrack instance — to verify behavior manually or drive a browser smoke. It
complements the automated suite: `npm test` (unit + golden, jsdom) covers the
deterministic DOM/logic layer and needs no YouTrack; this guide covers the
integration layer that those tests deliberately don't reach (real Ring UI runtime,
the sandboxed widget iframe, the app's REST backend, the YT workflow rules, and
CSS rendering).

> You do **not** need this to contribute a fix that's covered by golden/unit tests
> — `npm ci && npm test` is the green bar. Reach for a local YouTrack when your
> change touches integration behavior (persistence, permissions, real-browser
> rendering, workflow rules) and you want to see it end-to-end.

## Prerequisites

- **Docker** (to run YouTrack locally).
- **Node.js 20+** and **git** (to build the plugin).
- The repo cloned and dependencies installed: `npm ci`.

## 1. Run YouTrack in Docker

YouTrack ships an official Docker image. Pull a **2024.3+** build (the plugin's
`minYouTrackVersion`) and run it:

```bash
docker run -it --name youtrack-dev \
  -p 8080:8080 \
  jetbrains/youtrack:<2024.3-or-newer-tag>
```

Pick a concrete tag from the [Docker Hub tags list](https://hub.docker.com/r/jetbrains/youtrack/tags).
On first start YouTrack prints a one-time **wizard token** in the container logs
(`docker logs youtrack-dev`) — open `http://localhost:8080`, paste it, and complete
the setup wizard (create the admin user, accept defaults). For the exact wizard
flow see the [JetBrains YouTrack Docker guide](https://www.jetbrains.com/help/youtrack/server/youtrack-docker-installation.html)
(version-specific).

Then create a **permanent token** for the admin user:
**Profile → Account Security → New token…**, scope **YouTrack**. Keep it — the rest
of this guide uses it as `$YT_TOKEN`. Treat it like a password; never commit it.

```bash
export YT_BASE=http://localhost:8080
export YT_TOKEN=perm:your-token-here
```

> ⚠️ Some features are gated to newer YouTrack (e.g. share-URL deep-links require
> the `host.navigation` API, YouTrack 2026.1+). On 2024.3–2025.x the core planner
> works; version-gated features degrade gracefully.

## 2. Build the plugin

```bash
npm ci
npm run build      # bundles widgets/main/main.js (+ vendored React, Ring CSS, icons)
npm run zip        # produces Smart-Sprint-Planner-vX.Y.Z.zip (importable)
```

The runtime bundle is committed, but always rebuild after editing `widgets/main/src/`.

## 3. Install the app

**Via UI:** Administration → Apps → **Install from file** → upload the zip from step 2.

**Via REST** (faster for the inner loop):

```bash
curl -X POST "$YT_BASE/api/admin/apps/import" \
  -H "Authorization: Bearer $YT_TOKEN" \
  -F file=@"Smart-Sprint-Planner-vX.Y.Z.zip"
```

After install you get two surfaces: the **Smart Sprint Planner** item in the main
menu (the global planner) and a **Smart Sprint Planner** block inside each project's
settings.

## 4. Connect a project

The planner needs a configured project to do anything. Follow
[USER-GUIDE.md → §3 "First-time setup"](../Documentation/USER-GUIDE.md#3-first-time-setup-what-the-project-admin-configures):

1. Add the widget to the project's settings page.
2. **Set the settings-manager group** (this is the "connection" — until set, the
   project is invisible in the main-menu planner and all mutations are denied).
3. Choose active roles.
4. Map Estimate / Actual / Assignee fields per role.

## 5. (Optional) Seed deterministic demo data

For a reproducible state matching the golden fixtures, the repo ships a seeding
script. It writes planner state through the **app's own backend** (so validators
and whitelists apply), but it does **not** create the project or issues — do that
first:

1. Create a project with key **`DEMOClone`**.
2. Create issues **`DEMOClone-1` … `DEMOClone-8`**.
3. Configure the project per step 4 (roles + field mapping).
4. Run the seeder:

```bash
YT_TOKEN=$YT_TOKEN YT_BASE=$YT_BASE node tests/golden/seed-democlone.js
```

It's idempotent — re-running rewrites the same deterministic sprint + history.
Override `YT_PROJECT` to target a different project key.

## 6. Verify your change

Inner loop after the one-time setup:

```bash
# edit widgets/main/src/...
npm run build && npm run zip
curl -X POST "$YT_BASE/api/admin/apps/import" -H "Authorization: Bearer $YT_TOKEN" -F file=@"Smart-Sprint-Planner-vX.Y.Z.zip"
# hard-reload the widget page (see caching note below)
```

Open the planner, exercise the flow your change touches, and confirm behavior.
For a scripted smoke you can drive a headless browser (the maintainers use
agent-browser; any DOM-aware automation works) — focus the
widget iframe and assert on the accessibility tree.

## Notes & troubleshooting

- **Widget runs in a sandboxed cross-origin iframe (OOPIF).** `window.location` is
  `about:srcdoc`, clipboard access is restricted, and top-level console logs don't
  surface the iframe's logs — inspect inside the frame.
- **Re-importing the same version updates the server but the browser may cache the
  iframe.** Hard-reload (or bump the version) to be sure you're seeing new code.
- **Workflow rules** (`workflow-*.js`) run on YouTrack's JS engine, not in the
  widget — exercise them by changing issue fields and watching aggregation/roll-up.
- **Settings stay read-only until the settings-manager group is set** (step 4.2) —
  if mutations are denied, that's the usual cause.
