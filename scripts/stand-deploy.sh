#!/usr/bin/env bash
# stand-deploy.sh — temp-деплой приложения на тест-стенд (localhost:8080).
#
# Собирает flat-zip (manifest в КОРНЕ зипа — формат POST /api/admin/apps/import),
# патчит temp-версию в ДВУХ местах деплой-копии (репо не трогает):
#   1. manifest.json:version          — дедуп импорта YT + кэш-бюст;
#   2. backend-core.js APP_VERSION    — бейдж версии в шапке виджета (GET /app-version);
#      require('./manifest.json') в песочнице YT НЕ работает (проба 2026-07-11) — только патч.
# Включает ВСЕ корневые runtime-ассеты (app-logo*.svg — иконка главного меню! —
# entity-extensions/settings/workflow-*) и widgets/ без src/ (смоук-урок 2026-07-11:
# рукопашный zip терял логотипы и литерал версии).
#
# Использование:  bash scripts/stand-deploy.sh <temp-version> [base-url]
#   temp-version — строго выше последней задеплоенной (напр. 3.2.94)
#   base-url     — дефолт http://localhost:8080
# Креды: Keychain scbt-yt-teststand/Letsrollamigo (или env YT_STAND_USER/YT_STAND_PASS).
set -euo pipefail

VER="${1:?usage: stand-deploy.sh <temp-version> [base-url]}"
BASE="${2:-http://localhost:8080}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_="${YT_STAND_USER:-Letsrollamigo}"
PASS="${YT_STAND_PASS:-$(security find-generic-password -s scbt-yt-teststand -a "$USER_" -w)}"

cd "$ROOT"
npm run build >/dev/null

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Корневые runtime-файлы (манифест, бэкенды, workflow, декларации, логотипы)
cp manifest.json entity-extensions.json settings.json "$STAGE/" 2>/dev/null || true
cp backend-*.js "$STAGE/"
cp workflow-*.js "$STAGE/" 2>/dev/null || true
cp app-logo*.svg "$STAGE/" 2>/dev/null || true
rsync -a --exclude 'src' widgets "$STAGE/"

# Патч temp-версии: manifest + backend-литерал (только деплой-копия)
node -e "
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('$STAGE/manifest.json', 'utf8'));
m.version = '$VER';
fs.writeFileSync('$STAGE/manifest.json', JSON.stringify(m, null, 2) + '\n');
let b = fs.readFileSync('$STAGE/backend-core.js', 'utf8');
const re = /var APP_VERSION = '[0-9.]+';/;
if (!re.test(b)) { console.error('APP_VERSION literal not found'); process.exit(1); }
fs.writeFileSync('$STAGE/backend-core.js', b.replace(re, \"var APP_VERSION = '$VER';\"));
console.log('patched → $VER');
"

( cd "$STAGE" && zip -qr app.zip . -x '*.DS_Store' )
RESP=$(curl -s -u "$USER_:$PASS" -X POST "$BASE/api/admin/apps/import" -F "file=@$STAGE/app.zip")
echo "import: $RESP"
echo "$RESP" | grep -q '"id"' || { echo "IMPORT FAILED"; exit 1; }
echo "✓ deployed $VER to $BASE"
