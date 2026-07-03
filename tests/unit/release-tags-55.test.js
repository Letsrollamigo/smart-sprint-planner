'use strict';

/* #55 — авто-теги по статусу релиза. Контракты:
   • buildTagOps (pure, release-controller): план remove/add для перехода prev→next
     по составу; prev=null — только простановка (догонка); равные теги → no-op;
   • validateSettings: releaseTagMapping — { <status ∈ 5 хранимых> → <имя тега str≤200|null> },
     форма идентична releaseStatusStateMapping;
   • releaseTagMapping — admin-тир (preserve-merge для планировочного менеджера). */

const test   = require('node:test');
const assert = require('node:assert');
const path   = require('node:path');

const backend = require(path.join(__dirname, '..', '..', 'backend-project.js'));
const { buildTagOps } = require(path.join(__dirname, '..', '..', 'widgets', 'main', 'src', 'domain', 'release-controller.js'));

const MAP = { planned: 'релиз-план', work: 'релиз-в-работе', released: 'релиз-выпущен' };

/* ── buildTagOps ─────────────────────────────────────────────────────────── */

test('buildTagOps: оба статуса замаплены → remove прошлого + add нового на каждую задачу', () => {
  const ops = buildTagOps(MAP, 'planned', 'work', ['A-1', 'A-2']);
  assert.deepStrictEqual(ops, [
    { issueId: 'A-1', action: 'remove', tag: 'релиз-план' },
    { issueId: 'A-1', action: 'add', tag: 'релиз-в-работе' },
    { issueId: 'A-2', action: 'remove', tag: 'релиз-план' },
    { issueId: 'A-2', action: 'add', tag: 'релиз-в-работе' },
  ]);
});

test('buildTagOps: prev без тега (prep не замаплен) → только add', () => {
  assert.deepStrictEqual(buildTagOps(MAP, 'prep', 'work', ['A-1']),
    [{ issueId: 'A-1', action: 'add', tag: 'релиз-в-работе' }]);
});

test('buildTagOps: next без тега (cancelled не замаплен) → только remove прошлого', () => {
  assert.deepStrictEqual(buildTagOps(MAP, 'work', 'cancelled', ['A-1']),
    [{ issueId: 'A-1', action: 'remove', tag: 'релиз-в-работе' }]);
});

test('buildTagOps: догонка (prev=null) → только add тега текущего статуса', () => {
  assert.deepStrictEqual(buildTagOps(MAP, null, 'planned', ['A-1', 'A-2']),
    [{ issueId: 'A-1', action: 'add', tag: 'релиз-план' },
     { issueId: 'A-2', action: 'add', tag: 'релиз-план' }]);
});

test('buildTagOps: одинаковый тег prev и next → no-op', () => {
  assert.deepStrictEqual(buildTagOps({ planned: 't', prep: 't' }, 'planned', 'prep', ['A-1']), []);
});

test('buildTagOps: пустой/отсутствующий маппинг или состав → []', () => {
  assert.deepStrictEqual(buildTagOps(null, 'planned', 'work', ['A-1']), []);
  assert.deepStrictEqual(buildTagOps({}, 'planned', 'work', ['A-1']), []);
  assert.deepStrictEqual(buildTagOps(MAP, 'planned', 'work', []), []);
  assert.deepStrictEqual(buildTagOps(MAP, 'planned', 'work', null), []);
});

/* ── validateSettings: releaseTagMapping ─────────────────────────────────── */

function okSettings(extra) {
  return Object.assign({ activeRoles: ['analysis'] }, extra);
}

test('validateSettings: валидный releaseTagMapping принимается (вкл. частичный и null-значения)', () => {
  assert.strictEqual(backend.validateSettings(okSettings({ releaseTagMapping: { planned: 'x', released: 'y' } })), true);
  assert.strictEqual(backend.validateSettings(okSettings({ releaseTagMapping: {} })), true);
  assert.strictEqual(backend.validateSettings(okSettings({ releaseTagMapping: null })), true);
  assert.strictEqual(backend.validateSettings(okSettings({ releaseTagMapping: { work: null } })), true);
});

test('validateSettings: мусорный releaseTagMapping отклоняется', () => {
  assert.strictEqual(backend.validateSettings(okSettings({ releaseTagMapping: [] })), false, 'массив');
  assert.strictEqual(backend.validateSettings(okSettings({ releaseTagMapping: 'str' })), false, 'строка');
  assert.strictEqual(backend.validateSettings(okSettings({ releaseTagMapping: { bogus: 'x' } })), false, 'ключ вне статусов');
  assert.strictEqual(backend.validateSettings(okSettings({ releaseTagMapping: { work: 42 } })), false, 'не-строка');
  assert.strictEqual(backend.validateSettings(okSettings({ releaseTagMapping: { work: 'x'.repeat(201) } })), false, 'длина >200');
});

/* ── admin-тир (preserve-merge) ──────────────────────────────────────────── */

test('releaseTagMapping — admin-тир: правка планировочного менеджера игнорируется (preserve из stored)', () => {
  const stored = { releaseTagMapping: { planned: 'старый' } };
  const incoming = { releaseTagMapping: { planned: 'подмена' }, allowOverlimitPlanning: true };
  const merged = backend.mergeAdminTierFromStored(incoming, stored);
  assert.deepStrictEqual(merged.releaseTagMapping, { planned: 'старый' });
  assert.strictEqual(merged.allowOverlimitPlanning, true); // планировочный ключ — из incoming
});
