'use strict';
// Unit tests for widgets/main/src/toast-pure.js
// Pure helpers — no DOM, no browser globals.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  computeToastDuration,
  selectToastToEvict,
  normaliseToastText,
  TOAST_DEFAULTS,
  TOAST_LIMIT
} = require('../../widgets/main/src/toast-pure.js');

// ── computeToastDuration ───────────────────────────────────────────────────

describe('computeToastDuration', () => {
  it('returns 4000ms for info by default', () => {
    assert.strictEqual(computeToastDuration('info'), 4000);
  });

  it('returns 6000ms for warn by default', () => {
    assert.strictEqual(computeToastDuration('warn'), 6000);
  });

  it('returns 4000ms for success by default', () => {
    assert.strictEqual(computeToastDuration('success'), 4000);
  });

  it('returns 0 (persistent) for error by default', () => {
    assert.strictEqual(computeToastDuration('error'), 0);
  });

  it('falls back to info duration for unknown type', () => {
    assert.strictEqual(computeToastDuration('mystery'), TOAST_DEFAULTS.info);
  });

  it('honours custom duration override for any type', () => {
    assert.strictEqual(computeToastDuration('info',  1500), 1500);
    assert.strictEqual(computeToastDuration('error', 2500), 2500);
    assert.strictEqual(computeToastDuration('warn',  0),    0);
  });

  it('treats non-numeric custom duration as missing (falls back to defaults)', () => {
    assert.strictEqual(computeToastDuration('info', undefined), 4000);
    assert.strictEqual(computeToastDuration('warn', null),      6000);
    assert.strictEqual(computeToastDuration('info', '1500'),    4000);
    assert.strictEqual(computeToastDuration('info', NaN),       NaN);
  });
});

// ── selectToastToEvict ─────────────────────────────────────────────────────

describe('selectToastToEvict', () => {
  it('returns -1 when queue length is below limit', () => {
    assert.strictEqual(selectToastToEvict([], 3), -1);
    assert.strictEqual(selectToastToEvict([{ type: 'info' }], 3), -1);
    assert.strictEqual(selectToastToEvict([{ type: 'info' }, { type: 'warn' }], 3), -1);
  });

  it('returns -1 when queue length is exactly limit - 1', () => {
    const q = [{ type: 'info' }, { type: 'info' }];
    assert.strictEqual(selectToastToEvict(q, 3), -1);
  });

  it('returns 0 (FIFO) when limit reached and head is non-error', () => {
    const q = [{ type: 'info' }, { type: 'warn' }, { type: 'success' }];
    assert.strictEqual(selectToastToEvict(q, 3), 0);
  });

  it('skips error toasts and returns first non-error index', () => {
    const q = [{ type: 'error' }, { type: 'info' }, { type: 'warn' }];
    assert.strictEqual(selectToastToEvict(q, 3), 1);
  });

  it('returns -1 when all queued toasts are persistent errors', () => {
    const q = [{ type: 'error' }, { type: 'error' }, { type: 'error' }];
    assert.strictEqual(selectToastToEvict(q, 3), -1);
  });

  it('handles invalid queue gracefully (non-array)', () => {
    assert.strictEqual(selectToastToEvict(null, 3),      -1);
    assert.strictEqual(selectToastToEvict(undefined, 3), -1);
    assert.strictEqual(selectToastToEvict('queue', 3),   -1);
  });

  it('handles entries without a type field', () => {
    const q = [{}, {}, {}];
    // Records without type are treated as non-error (FIFO head evicted).
    assert.strictEqual(selectToastToEvict(q, 3), 0);
  });
});

// ── normaliseToastText ─────────────────────────────────────────────────────

describe('normaliseToastText', () => {
  it('replaces single newline with " · "', () => {
    assert.strictEqual(normaliseToastText('line1\nline2'), 'line1 · line2');
  });

  it('collapses multiple consecutive newlines into one separator', () => {
    assert.strictEqual(normaliseToastText('a\n\n\nb'), 'a · b');
  });

  it('passes plain text unchanged', () => {
    assert.strictEqual(normaliseToastText('hello world'), 'hello world');
  });

  it('handles null and undefined', () => {
    assert.strictEqual(normaliseToastText(null),      '');
    assert.strictEqual(normaliseToastText(undefined), '');
  });

  it('coerces numbers and objects to string', () => {
    assert.strictEqual(normaliseToastText(42),       '42');
    assert.strictEqual(normaliseToastText({ a: 1 }), '[object Object]');
  });
});

// ── Frozen constants ───────────────────────────────────────────────────────

describe('TOAST constants', () => {
  it('TOAST_LIMIT is 3', () => {
    assert.strictEqual(TOAST_LIMIT, 3);
  });

  it('TOAST_DEFAULTS has expected types', () => {
    assert.strictEqual(TOAST_DEFAULTS.info,    4000);
    assert.strictEqual(TOAST_DEFAULTS.warn,    6000);
    assert.strictEqual(TOAST_DEFAULTS.success, 4000);
    assert.strictEqual(TOAST_DEFAULTS.error,   0);
  });

  it('TOAST_DEFAULTS is frozen', () => {
    assert.ok(Object.isFrozen(TOAST_DEFAULTS));
  });
});
