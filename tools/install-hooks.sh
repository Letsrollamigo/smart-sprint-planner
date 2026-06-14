#!/bin/sh
# Ставит версионируемые git-хуки (симлинками на tools/hooks/).
# Запускать в КАЖДОМ форке после клона/переезда пути — добавлено в чеклист
# «Cwd state synchronization» (CLAUDE.md / KB Разработка/17), т.к. .git/hooks/
# не версионируется и исчезает при reorg (единственный owner этого не заметит).
#
#   sh tools/install-hooks.sh
set -e
ROOT="$(git rev-parse --show-toplevel)"
HOOKS="$ROOT/.git/hooks"
SRC="$ROOT/tools/hooks"
for h in pre-commit pre-push; do
  if [ -f "$SRC/$h" ]; then
    chmod +x "$SRC/$h"
    ln -sf "../../tools/hooks/$h" "$HOOKS/$h"
    echo "installed: .git/hooks/$h -> tools/hooks/$h"
  fi
done
echo "✅ git-хуки установлены. Обход осознанный: --no-verify (но release-check.sh поймает)."
