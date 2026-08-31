/**
 * #101 — крестик «очистить» у Ring Select обязан доходить до формы.
 *
 * Первопричина дефекта: Ring `Select.clear()` (ring-ui-built/components/select/select.js)
 * зовёт ТОЛЬКО `props.onChange(null)` — `onSelect` при очистке не вызывается. Обёртки,
 * подписанные на один `onSelect`, показывали «— не выбрано —», но в React-стейт формы
 * очистка не попадала: сохранялось прежнее значение, а тост рапортовал успех.
 *
 * Пин источника (без React-рендера): каждый вендорный `Select` с флагом `clear`/
 * `clearable` обязан подписываться на `onChange`. Для одиночного выбора `onChange` —
 * надмножество `onSelect` (Ring зовёт их парой), поэтому подписка на него не теряет
 * обычный выбор.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REACT_DIR = path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'react');

/** Блоки JSX `<Select … />` и императивные `React.createElement(Select, { … })`. */
function selectBlocks(src) {
  const out = [];
  const reJsx = /<Select\b[\s\S]*?\/>/g;
  const reCe = /React\.createElement\(\s*Select\s*,\s*\{[\s\S]*?\n\s*\}\s*\)/g;
  let m;
  while ((m = reJsx.exec(src))) out.push(m[0]);
  while ((m = reCe.exec(src))) out.push(m[0]);
  return out;
}

test('#101 — вендорный Select с clear подписан на onChange', () => {
  const files = fs.readdirSync(REACT_DIR).filter((f) => f.endsWith('.jsx'));
  const offenders = [];
  let checked = 0;
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(REACT_DIR, f), 'utf8');
    selectBlocks(src).forEach((block) => {
      /* clear / clear={…} / clear: … — но не clearable как имя пропа обёртки. */
      if (!/\bclear\b/.test(block)) return;
      checked++;
      if (!/\bonChange\s*[:=]/.test(block)) offenders.push(f + ': ' + block.slice(0, 120).replace(/\s+/g, ' '));
    });
  });
  assert.ok(checked >= 3, 'ожидали найти хотя бы 3 clear-Select (FieldSelect, RingSelLite, select-mount), нашли ' + checked);
  assert.deepStrictEqual(offenders, [], 'Select с clear без onChange — крестик очистки не дойдёт до формы (#101)');
});
