#!/usr/bin/env bash
#
# release-check.sh — предрелизная проверка консистентности версии.
#
# Сверяет, что presentation-версия совпадает во всех точках объявления,
# что имена zip-архивов соответствуют версии, и (community) что бейджи в
# README не отстали от факта. Возвращает ненулевой код при любом ЖЁСТКОМ
# рассогласовании (CI-friendly); мягкие замечания — предупреждения.
#
# Форк определяется автоматически по "name" в package.json:
#   smart-sprint-planner → community (плюс проверка бейджей README)
#   scbt-sprint-planner  → corp (без публичных бейджей)
#
# НЕ путать с backend CURRENT_PLUGIN_VERSION (schema-маркер) — он бампается
# только при schema-change и здесь намеренно не проверяется.
#
# Запуск:  npm run release-check     (из корня проекта)

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

FAIL=0
WARN=0
red()  { printf '\033[31m%s\033[0m\n' "$1"; }
grn()  { printf '\033[32m%s\033[0m\n' "$1"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$1"; }
fail() { red "  [FAIL] $1"; FAIL=1; }
warn() { ylw "  [WARN] $1"; WARN=1; }
ok()   { grn "  [ ok ] $1"; }

semver='[0-9]+\.[0-9]+\.[0-9]+'

# ── каноническая версия из package.json ──────────────────────────────────────
PKG_VER=$(node -p "require('./package.json').version" 2>/dev/null) || { red "не удалось прочитать package.json:version"; exit 2; }
NAME=$(node -p "require('./package.json').name" 2>/dev/null)
printf '\nrelease-check: %s @ %s\n' "$NAME" "$PKG_VER"

if ! printf '%s' "$PKG_VER" | grep -qE "^${semver}$"; then
  fail "package.json:version '$PKG_VER' не является 3-числовым semver"
fi

# ── синхронизация версии ──────────────────────────────────────────────────────
echo "— синхронизация версии —"

MAN_VER=$(node -p "require('./manifest.json').version" 2>/dev/null)
[ "$MAN_VER" = "$PKG_VER" ] && ok "manifest.json:version = $MAN_VER" \
  || fail "manifest.json:version '$MAN_VER' ≠ package '$PKG_VER'"

APP_VER=$(grep -oE "APP_VERSION = '${semver}'" widgets/main/src/core.js | grep -oE "$semver" | head -1)
[ "$APP_VER" = "$PKG_VER" ] && ok "core.js:APP_VERSION = $APP_VER" \
  || fail "core.js:APP_VERSION '$APP_VER' ≠ package '$PKG_VER'"

BE_VER=$(grep -oE "var APP_VERSION = '${semver}'" backend-core.js | grep -oE "$semver" | head -1)
[ "$BE_VER" = "$PKG_VER" ] && ok "backend-core.js:APP_VERSION (/app-version) = $BE_VER" \
  || fail "backend-core.js:APP_VERSION '$BE_VER' ≠ package '$PKG_VER' (часто забывается!)"

# ── имена zip-архивов ─────────────────────────────────────────────────────────
echo "— имена zip-архивов —"
ZIP_VERS=$(node -e "const s=require('./package.json').scripts||{}; const j=Object.entries(s).filter(([k])=>k==='zip'||k.indexOf('zip:')===0).map(([,v])=>v).join(' '); const m=j.match(/v[0-9]+\.[0-9]+\.[0-9]+/g)||[]; console.log([...new Set(m)].join(' '))")
if [ -z "$ZIP_VERS" ]; then
  warn "в package.json:scripts не найдено версионированных имён zip"
else
  BAD=0
  for v in $ZIP_VERS; do
    [ "$v" = "v$PKG_VER" ] || { fail "имя zip ссылается на $v (ожидалось v$PKG_VER)"; BAD=1; }
  done
  [ $BAD -eq 0 ] && ok "все имена zip ссылаются на v$PKG_VER"
fi

# ── git-тег ───────────────────────────────────────────────────────────────────
echo "— git-тег —"
if git rev-parse "v$PKG_VER" >/dev/null 2>&1; then
  ok "тег v$PKG_VER существует"
else
  warn "тег v$PKG_VER ещё не создан (создать после прохождения проверки)"
fi

# ── бейджи README (только community) ──────────────────────────────────────────
case "$NAME" in
  smart-sprint-planner)
    echo "— бейджи README (community) —"
    GH_BADGE=$(grep -oE "GitHub-v${semver}" README.md | grep -oE "v$semver" | head -1)
    if [ "$GH_BADGE" = "v$PKG_VER" ]; then
      ok "GitHub-бейдж = $GH_BADGE"
    else
      warn "GitHub-бейдж $GH_BADGE отстал от v$PKG_VER (бампнуть после GitHub-релиза)"
    fi
    if [ -f Documentation/README.ru.md ]; then
      RU_BADGE=$(grep -oE "GitHub-v${semver}" Documentation/README.ru.md | grep -oE "v$semver" | head -1)
      if [ "$RU_BADGE" = "v$PKG_VER" ]; then
        ok "RU README GitHub-бейдж = $RU_BADGE"
      else
        warn "RU README (Documentation/README.ru.md) GitHub-бейдж $RU_BADGE отстал от v$PKG_VER — частый пропуск, синхронизировать RU-зеркало"
      fi
    fi
    MP_BADGE=$(grep -oE "Marketplace-v${semver}" README.md | grep -oE "v$semver" | head -1)
    ok "Marketplace-бейдж = $MP_BADGE (намеренно отслеживает последний апрув, не текущую версию)"
    ;;
  scbt-sprint-planner)
    echo "— corp: бейджи README пропущены (нет публичных бейджей) —"
    ;;
  *)
    warn "неизвестное имя форка '$NAME' — проверка бейджей пропущена"
    ;;
esac

# ── architecture gate + зеркало форков ────────────────────────────────────────
echo "— architecture gate —"
if npm run --silent gate >/dev/null 2>&1; then
  ok "gate (arch+mirror+unit+golden) зелёный"
else
  fail "gate красный — 'npm run gate' (arch+mirror+unit+golden) не прошёл"
fi

# mirror-parity на релизе = FAIL при отсутствии sibling (нельзя резать релиз-пару вслепую)
SIBLING="../Smart Sprint Planner"
[ "$NAME" = "smart-sprint-planner" ] && SIBLING="../Sprint Planer for  MultiTeams"
if [ -d "$SIBLING/widgets/main/src" ]; then
  ok "sibling-форк на месте ($SIBLING)"
else
  fail "sibling-форк не найден ($SIBLING) — mirror-parity вслепую"
fi

# community: origin/main не отстал от локального тега (lockstep — сейчас local впереди origin)
case "$NAME" in
  smart-sprint-planner)
    if git remote get-url origin >/dev/null 2>&1; then
      git fetch --tags --quiet origin 2>/dev/null || true
      if git merge-base --is-ancestor "v$PKG_VER" origin/main 2>/dev/null; then
        ok "origin/main содержит v$PKG_VER"
      else
        warn "origin/main НЕ содержит v$PKG_VER — community отстал, нужен push"
      fi
    fi
    ;;
esac

# ── итог ──────────────────────────────────────────────────────────────────────
echo
if [ $FAIL -ne 0 ]; then red "release-check: ПРОВАЛ (рассинхрон версии)"; exit 1; fi
if [ $WARN -ne 0 ]; then ylw "release-check: пройдено с предупреждениями"; exit 0; fi
grn "release-check: ПРОЙДЕНО"; exit 0
