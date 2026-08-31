'use strict';

/* #99 — отчётность на смене языка: подписи запечены в vm (_labels(T) → vm.labels),
 * поэтому принудительный React-рендер их не переводит. rerenderFromCache пересобирает
 * labels из актуального T и перемонтирует кэш последнего НЕ-loading вида — без рефетча.
 * Запуск: node --test 'tests/unit/reporting-lang-rerender-99.test.js'. */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

/* window/document-песочница ДО require модуля (паттерн reporting-view.golden) */
const hosts = {};
global.window = global.window || {};
global.document = { getElementById: function (id) { return hosts[id] || null; } };

const VIEW = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'domain', 'reporting-view.js'));

const mounts = [];
global.window.__SSP_REPORTING_MOUNT = { mountAt: function (host, vm) { mounts.push({ host: host, vm: vm }); } };

const T_EN = (k) => 'EN:' + k;

test('#99: кэш готового вида перемонтируется с labels из нового T, данные не тронуты', () => {
  mounts.length = 0;
  hosts['tab-reporting-a'] = { id: 'tab-reporting-a',
    __sspReportingGood: { report: 'a7', labels: { a11Title: 'СТАРОЕ' }, rows: [1, 2, 3], loading: false } };
  hosts['tab-reporting-b'] = { id: 'tab-reporting-b' };   /* контур без кэша → no-op */

  VIEW.rerenderFromCache({ T: T_EN });

  assert.strictEqual(mounts.length, 1, 'перемонтирован только контур с кэшем');
  const vm = mounts[0].vm;
  assert.strictEqual(vm.labels.a11Title, 'EN:repA11Title', 'labels пересобраны из актуального T');
  assert.strictEqual(vm.labels.a11Easter, 'EN:repA11Easter', '#98 — пасхалка тоже из словаря');
  assert.deepStrictEqual(vm.rows, [1, 2, 3], 'данные отчёта не пересчитывались');
  assert.strictEqual(vm.report, 'a7');
  assert.strictEqual(hosts['tab-reporting-a'].__sspReportingGood, vm,
    'цель отката обновлена — прерывание после смены языка не вернёт старые подписи');
});

test('#99: идущий прогон не перебивается (in-flight доедет со своими подписями)', () => {
  mounts.length = 0;
  hosts['tab-reporting-a'] = { id: 'tab-reporting-a', __sspReportingLoading: true,
    __sspReportingGood: { report: 'a1', labels: {} } };
  hosts['tab-reporting-b'] = null;

  VIEW.rerenderFromCache({ T: T_EN });
  assert.strictEqual(mounts.length, 0);
});

test('#99: нет хоста / нет кэша → no-op без исключений', () => {
  mounts.length = 0;
  hosts['tab-reporting-a'] = null;
  hosts['tab-reporting-b'] = { id: 'tab-reporting-b' };
  assert.doesNotThrow(() => VIEW.rerenderFromCache({ T: T_EN }));
  assert.strictEqual(mounts.length, 0);
});
