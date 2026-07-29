/* #58-1/#58-2 — контракт сборки запросов отчётности:
   1) юзер-хвост QueryAssist клеится ЯВНЫМ `and` перед скобочной группой (юкстапозицию
      `project: X (A)` парсер YT отвергает 400 invalid_query на 2025.3 и 2026.1);
   2) `sort by:` со скобочной группой несовместим → отбрасывается;
   3) bulkWorkItems режет записи окном клиентски: `work date:` фильтрует ЗАДАЧУ, а не запись. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'widgets', 'main', 'src');

/* _wrapUserQuery — приватная; вытаскиваем тело функции из исходника и исполняем. */
function loadWrapUserQuery() {
  const src = fs.readFileSync(path.join(SRC, 'domain', 'reporting-view.js'), 'utf8');
  const m = /function _wrapUserQuery\(q\) \{[\s\S]*?\n\}/.exec(src);
  assert.ok(m, '_wrapUserQuery не найдена в domain/reporting-view.js');
  return new Function(m[0] + '; return _wrapUserQuery;')();
}

test('58-1: непустой фильтр клеится через `and (…)`', () => {
  const w = loadWrapUserQuery();
  assert.strictEqual(w('$Тип: Фича'), 'and ($Тип: Фича)');
  assert.strictEqual(w('State: Open or State: Fixed'), 'and (State: Open or State: Fixed)');
});

test('58-1: `sort by:` отбрасывается (со скобочной группой несовместим)', () => {
  const w = loadWrapUserQuery();
  assert.strictEqual(w('$Тип: Фича sort by: created desc'), 'and ($Тип: Фича)');
  assert.strictEqual(w('sort by: updated'), '', 'один только sort by → пустой хвост, клеить нечего');
});

test('58-1: собранный запрос не содержит юкстапозиции `X (`', () => {
  const w = loadWrapUserQuery();
  const parts = ['project: TEST'];
  const uq = w('$Тип: Фича');
  if (uq) parts.push(uq);
  const query = parts.join(' ');
  assert.strictEqual(query, 'project: TEST and ($Тип: Фича)');
  assert.ok(!/[^ ]\s+\(/.test(query.replace(' and (', ' and ')), 'скобка только после and');
});

test('58-2: bulkWorkItems режет записи окном клиентски', async () => {
  const src = fs.readFileSync(path.join(SRC, 'data', 'reporting-data.js'), 'utf8');
  assert.ok(/outOfWindow/.test(src), 'диагностика outOfWindow должна считать отброшенные записи');
  assert.ok(/and work date: /.test(src), 'серверная клауза клеится явным and');
  assert.ok(/dateTs >= winFrom && parsed\[i\]\.dateTs < winTo/.test(src),
    'окно полуоткрытое [fromTs, toTs) — как во всём reporting-period');
});
