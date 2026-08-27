'use strict';
/* #77 — пины констант, намеренно различающихся между редакциями планера.

   Механика дефекта: правки переносятся между редакциями пофайлово, и в v3.28.0
   так приехало чужое `REPORTING_DISABLED = true`. Модуль отчётности при этом
   включается в настройках, но колонки «Контур A»/«Контур B» матрицы прав уходят
   в disabled — выдать группам доступ к отчётам через интерфейс становится нечем,
   и отчёты остаются видны только менеджеру настроек. Так ушли три релиза подряд
   (3.28.0, 3.29.0, 3.29.1); единственной защитой был комментарий в файле.

   Тест намеренно живёт отдельным файлом с разными ожиданиями в каждой редакции:
   перенос файла целиком упирается в него конфликтом, который придётся разрешить
   руками, а не молча. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'widgets', 'main', 'src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const ROOT = path.join(__dirname, '..', '..');
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const WF_FILES = ['workflow-cascade-aggregation.js', 'workflow-common.js',
  'workflow-dta-aggregation.js', 'workflow-forbid-container.js', 'workflow-state-rollup.js'];

test('fork-constants: отчётность включена — REPORTING_DISABLED = false', function () {
  assert.match(read('react/settings-shared.jsx'), /^const REPORTING_DISABLED = false;$/m,
    'В этой редакции модуль отчётности рабочий. При `true` колонки «Контур A»/«Контур B» ' +
    'матрицы прав приходят disabled и доступ к отчётам нельзя выдать ни одной группе (#77).');
});

test('fork-constants: в core.js гейта отчётности нет', function () {
  assert.doesNotMatch(read('core.js'), /REPORTING_DISABLED/,
    'Гейт в core.js глушит доступ к отчётности независимо от настроек проекта — вкладки, ' +
    'рельса и фетч мертвы. В этой редакции его быть не должно (#77).');
});

test('fork-constants: done-пикер стендапа виден — STANDUP_DONE_PICKER_HIDDEN = false', function () {
  assert.match(read('react/settings-standup.jsx'), /^const STANDUP_DONE_PICKER_HIDDEN = false;$/m,
    'Список done-состояний — канон отчётности (A10/spillover), и настраивается он только здесь. ' +
    'При `true` пикер скрыт и отчёты считают по умолчанию (#77, тот же класс дрейфа).');
});

test('fork-constants: workflow-правила подписаны именем этой редакции', function () {
  /* `title` правила виден администратору YouTrack в списке рабочих процессов, поэтому имя
     продукта в нём — часть идентичности редакции, а не косметика. Перенос workflow-файла
     из другой редакции упрётся в этот пин и потребует ручного решения. */
  for (const f of WF_FILES.filter((x) => x !== 'workflow-common.js')) {
    assert.match(readRoot(f), /^ {2}title: 'Smart Sprint Planner — /m,
      f + ': заголовок правила начинается с имени продукта этой редакции.');
  }
  for (const f of WF_FILES) {
    assert.match(readRoot(f), /Smart Sprint Planner/,
      f + ': шапка файла подписана именем продукта этой редакции.');
  }
});
