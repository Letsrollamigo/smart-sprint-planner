import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resourceKey, resourcesOf, sprintHeader, sprintBodyFromInput, itemView, itemBodyFromInput, itemsByRole, historyView, filterHistory, filterAbsences, semverGte, releaseView } from '../src/shape.js';

test('ключи ресурсов ролей сворачиваются и разворачиваются', () => {
  assert.equal(resourceKey('analysis'), 'resourceAnalysis');
  assert.equal(resourceKey('devPlatform'), 'resourceDevPlatform');
  assert.deepEqual(resourcesOf({ resourceAnalysis: 60, resourceDevDb: 0, remainAnalysis: 5, resourceX: 1 }), { analysis: 60, devDb: 0 });
  assert.deepEqual(sprintBodyFromInput({ name: 'S', resources: { analysis: 60, devFs: 120 } }), { name: 'S', resourceAnalysis: 60, resourceDevFs: 120 });
});

test('шапка спринта: ревизия и служебные ключи', () => {
  const h = sprintHeader({ sprintId: 's', name: 'n', status: 'PLANNING', _rev: 4, pluginVersion: '2.8.0', personalPlanning: {}, resourceTesting: 10 });
  assert.equal(h.rev, 4);
  assert.equal('pluginVersion' in h, false);
  assert.deepEqual(h.resources, { testing: 10 });
  assert.equal(sprintHeader(null), null);
  assert.equal(sprintHeader({ sprintId: 'x' }).rev, 0);
});

test('задача: estimate_<role> ↔ estimate по роли группы', () => {
  const it = { issueId: 'DEMO-1', estimate_analysis: 480, estimate_testing: 60, fact_analysis: 30, stateColor: '#fff' };
  const v = itemView(it, 'analysis');
  assert.equal(v.estimate, 480); assert.equal(v.fact, 30); assert.equal(v.alloc, null); assert.equal('stateColor' in v, false);
  assert.equal(itemView(it, 'testing').estimate, 60);
  assert.deepEqual(itemBodyFromInput({ issueId: 'DEMO-1', estimate: 5, alloc: 7, title: 't' }, 'devBack'), { issueId: 'DEMO-1', title: 't', estimate_devBack: 5, alloc_devBack: 7 });
});

test('состав по ролям: фильтр роли, исключённые, лимит', () => {
  const ri = { analysis: [{ issueId: 'A-1', inclusionStatus: 'INC_PLANNED' }, { issueId: 'A-2', inclusionStatus: 'INC_EXCLUDED' }, { issueId: 'A-3' }], testing: [{ issueId: 'A-9' }], devDb: 'garbage' };
  const all = itemsByRole(ri, {});
  assert.deepEqual(Object.keys(all), ['analysis', 'testing']);
  assert.equal(all.analysis.total, 3);
  assert.equal(itemsByRole(ri, { includeExcluded: false }).analysis.total, 2);
  const lim = itemsByRole(ri, { roleKey: 'analysis', limit: 2 });
  assert.deepEqual(Object.keys(lim), ['analysis']);
  assert.equal(lim.analysis.count, 2); assert.equal(lim.analysis.hasMore, true);
  assert.deepEqual(itemsByRole(null, {}), {});
});

test('история: фильтр по sprintId ловит записи ролей, представление без items по умолчанию', () => {
  const h = [{ sprintId: 's1_analysis', roleKey: 'analysis', status: 'FINISHED', items: [{ issueId: 'X-1', estimate_analysis: 1 }] }, { sprintId: 's2_analysis', roleKey: 'analysis', status: 'CONFIRMED' }, { sprintId: 's1_testing', roleKey: 'testing' }];
  assert.equal(filterHistory(h, { sprintId: 's1' }).length, 2);
  assert.equal(filterHistory(h, { sprintId: 's1', roleKey: 'testing' }).length, 1);
  assert.equal(filterHistory(h, { status: 'FINISHED' }).length, 1);
  const v = historyView(h[0], false, { analysis: 'Анализ' });
  assert.equal(v.itemCount, 1); assert.equal('items' in v, false); assert.equal(v.roleLabel, 'Анализ');
  assert.equal(historyView(h[0], true, {}).items[0].estimate, 1);
});

test('отсутствия: фильтр по логину и пересечению периода', () => {
  const a = { ivanov: [{ from: '2026-10-13', to: '2026-10-17', type: 'vacation' }, { from: '2026-12-01', to: '2026-12-02', type: 'sick' }], petrov: [{ from: '2026-10-16', to: '2026-10-20', type: 'other' }] };
  assert.deepEqual(Object.keys(filterAbsences(a, { login: 'petrov' })), ['petrov']);
  const oct = filterAbsences(a, { from: '2026-10-17', to: '2026-10-31' });
  assert.equal(oct.ivanov.length, 1); assert.equal(oct.petrov.length, 1);
  assert.deepEqual(filterAbsences(a, { from: '2026-11-01', to: '2026-11-30' }), {});
});

test('semver и проекция релиза', () => {
  assert.equal(semverGte('3.49.1', '3.49.1'), true);
  assert.equal(semverGte('3.50.0', '3.49.1'), true);
  assert.equal(semverGte('3.48.3', '3.49.1'), false);
  assert.equal(semverGte('4.0.0', '3.99.99'), true);
  assert.deepEqual(releaseView({ id: 'r', status: 'prep', snapshot: { big: 1 }, createdBy: 'x' }).issues, []);
  assert.equal('snapshot' in releaseView({ id: 'r' }), false);
});
