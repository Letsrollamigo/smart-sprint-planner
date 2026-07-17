'use strict';
// Unit tests for widgets/main/src/pure/hash-pure.js — v3.12.0 канонизация key-order
// computeRevHash (P2-хвост v3.2.1) + переходный computeRevHashLegacy.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  computeRevHash,
  computeRevHashLegacy
} = require('../../widgets/main/src/pure/hash-pure.js');

test('computeRevHash: инвариантен к порядку ключей (канонизация _sortKeys)', () => {
  const a = { sprintId: 's1', status: 'PLANNING', nested: { x: 1, y: 2 } };
  const b = { nested: { y: 2, x: 1 }, status: 'PLANNING', sprintId: 's1' };
  const items = { analysis: [{ issueId: 'D-1', estimate_analysis: 60 }] };
  assert.equal(computeRevHash(a, items), computeRevHash(b, items),
    'перестановка ключей не должна менять хеш');
});

test('computeRevHashLegacy: чувствителен к порядку ключей (старый формат до v3.12.0)', () => {
  const a = { sprintId: 's1', status: 'PLANNING' };
  const b = { status: 'PLANNING', sprintId: 's1' };
  assert.notEqual(computeRevHashLegacy(a, null), computeRevHashLegacy(b, null),
    'legacy-формат зависит от порядка — ради этого и канонизировали');
});

test('computeRevHash vs legacy: разные форматы на одном входе (нужен переходный dual-compare)', () => {
  /* Внешняя обёртка {s,r}: canonical сортирует → {r,s}, legacy пишет {s,r} —
     форматы расходятся даже при «отсортированном» входе. */
  const sprint = { a: 1, b: 2 };
  assert.notEqual(computeRevHash(sprint, null), computeRevHashLegacy(sprint, null));
});
