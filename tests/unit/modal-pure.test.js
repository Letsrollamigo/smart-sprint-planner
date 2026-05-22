'use strict';
// Unit tests for widgets/main/src/modal-pure.js
// Pure helpers — no DOM access required.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  findCancelButtonId,
  topmostFromStack,
  pushUnique,
  popItem,
  isBackdropClick,
  parseBackdropOptIn,
  CANCEL_BUTTON_SELECTOR,
  CANCEL_ID_SUFFIXES,
  CANCEL_ID_PREFIXES,
  CANCEL_ID_EXACT
} = require('../../widgets/main/src/modal-pure.js');

// ── findCancelButtonId ─────────────────────────────────────────────────────

describe('findCancelButtonId', () => {
  it('matches suffix "Cancel"', () => {
    assert.strictEqual(findCancelButtonId(['saveBtn', 'reassignCancelBtn']), 'reassignCancelBtn');
  });

  it('matches suffix "No"', () => {
    assert.strictEqual(findCancelButtonId(['clearDraftYes', 'clearDraftNo']), 'clearDraftNo');
  });

  it('matches suffix "CloseBtn"', () => {
    assert.strictEqual(findCancelButtonId(['wcDiffCloseBtn']), 'wcDiffCloseBtn');
  });

  it('matches prefix "close"', () => {
    assert.strictEqual(findCancelButtonId(['savePickBtn', 'closePickModal']), 'closePickModal');
  });

  it('matches exact id from whitelist', () => {
    assert.strictEqual(findCancelButtonId(['otherBtn', 'wcMultiTabReadonlyBtn']), 'wcMultiTabReadonlyBtn');
    assert.strictEqual(findCancelButtonId(['cancelPickBtn']), 'cancelPickBtn');
  });

  it('returns first matching id (suffix > prefix > exact priority not enforced — iteration order)', () => {
    // Items checked in array order; per item, exact > suffix > prefix.
    assert.strictEqual(findCancelButtonId(['settingsBtn', 'cancelPickBtn', 'closePickModal']),
                       'cancelPickBtn');
  });

  it('returns null when no patterns match', () => {
    assert.strictEqual(findCancelButtonId(['saveBtn', 'okBtn', 'applyBtn']), null);
  });

  it('returns null for empty or invalid input', () => {
    assert.strictEqual(findCancelButtonId([]),         null);
    assert.strictEqual(findCancelButtonId(null),       null);
    assert.strictEqual(findCancelButtonId(undefined),  null);
    assert.strictEqual(findCancelButtonId('not-array'), null);
  });

  it('skips non-string entries', () => {
    assert.strictEqual(findCancelButtonId([null, 42, '', 'reassignCancelBtn']), 'reassignCancelBtn');
  });

  it('is case-sensitive (Cancel ≠ cancel as suffix)', () => {
    // "btncancel" does NOT end with "Cancel" (uppercase C). No prefix "close" match either.
    assert.strictEqual(findCancelButtonId(['btncancel']), null);
  });
});

// ── topmostFromStack ───────────────────────────────────────────────────────

describe('topmostFromStack', () => {
  it('returns last item of non-empty stack', () => {
    assert.strictEqual(topmostFromStack(['a', 'b', 'c']), 'c');
  });

  it('returns null on empty stack', () => {
    assert.strictEqual(topmostFromStack([]), null);
  });

  it('returns null on invalid input', () => {
    assert.strictEqual(topmostFromStack(null),       null);
    assert.strictEqual(topmostFromStack(undefined),  null);
    assert.strictEqual(topmostFromStack('not-array'), null);
  });
});

// ── pushUnique ─────────────────────────────────────────────────────────────

describe('pushUnique', () => {
  it('appends a new item and returns new length', () => {
    const s = ['a'];
    assert.strictEqual(pushUnique(s, 'b'), 2);
    assert.deepStrictEqual(s, ['a', 'b']);
  });

  it('is idempotent — does not push duplicates', () => {
    const s = ['a', 'b'];
    assert.strictEqual(pushUnique(s, 'a'), 2);
    assert.deepStrictEqual(s, ['a', 'b']);
  });

  it('uses identity equality (not deep equal)', () => {
    const obj1 = { id: 1 };
    const obj2 = { id: 1 };
    const s = [obj1];
    pushUnique(s, obj2);
    assert.strictEqual(s.length, 2); // different object references — added
  });

  it('returns 0 for invalid stack input', () => {
    assert.strictEqual(pushUnique(null, 'a'),       0);
    assert.strictEqual(pushUnique(undefined, 'a'),  0);
    assert.strictEqual(pushUnique('not-array', 'a'), 0);
  });
});

// ── popItem ────────────────────────────────────────────────────────────────

describe('popItem', () => {
  it('removes the first occurrence of item', () => {
    const s = ['a', 'b', 'c'];
    assert.strictEqual(popItem(s, 'b'), 2);
    assert.deepStrictEqual(s, ['a', 'c']);
  });

  it('is no-op when item not in stack', () => {
    const s = ['a', 'b'];
    assert.strictEqual(popItem(s, 'z'), 2);
    assert.deepStrictEqual(s, ['a', 'b']);
  });

  it('removes only the first occurrence when duplicates exist', () => {
    const s = ['a', 'b', 'a'];
    popItem(s, 'a');
    assert.deepStrictEqual(s, ['b', 'a']);
  });

  it('returns 0 for invalid stack input', () => {
    assert.strictEqual(popItem(null, 'a'), 0);
  });
});

// ── isBackdropClick ────────────────────────────────────────────────────────

describe('isBackdropClick', () => {
  it('returns true when target === currentTarget', () => {
    const overlay = { id: 'modalOverlay' };
    assert.strictEqual(isBackdropClick(overlay, overlay), true);
  });

  it('returns false when target is a child (different reference)', () => {
    const overlay = { id: 'modalOverlay' };
    const child   = { id: 'modalContent' };
    assert.strictEqual(isBackdropClick(child, overlay), false);
  });

  it('returns false on null or undefined inputs', () => {
    const overlay = { id: 'x' };
    assert.strictEqual(isBackdropClick(null, overlay),      false);
    assert.strictEqual(isBackdropClick(overlay, null),      false);
    assert.strictEqual(isBackdropClick(null, null),         false);
    assert.strictEqual(isBackdropClick(undefined, undefined), false);
  });
});

// ── parseBackdropOptIn ─────────────────────────────────────────────────────

describe('parseBackdropOptIn', () => {
  it('returns true only for exact string "true"', () => {
    assert.strictEqual(parseBackdropOptIn('true'), true);
  });

  it('returns false for any other value (strict opt-in)', () => {
    assert.strictEqual(parseBackdropOptIn('false'),    false);
    assert.strictEqual(parseBackdropOptIn(''),         false);
    assert.strictEqual(parseBackdropOptIn(null),       false);
    assert.strictEqual(parseBackdropOptIn(undefined),  false);
    assert.strictEqual(parseBackdropOptIn('1'),        false);
    assert.strictEqual(parseBackdropOptIn('TRUE'),     false); // case-sensitive
    assert.strictEqual(parseBackdropOptIn(true),       false); // not a string
  });
});

// ── Constants exposed ──────────────────────────────────────────────────────

describe('exported constants', () => {
  it('CANCEL_BUTTON_SELECTOR is a non-empty string with comma-joined parts', () => {
    assert.strictEqual(typeof CANCEL_BUTTON_SELECTOR, 'string');
    assert.ok(CANCEL_BUTTON_SELECTOR.length > 0);
    assert.ok(CANCEL_BUTTON_SELECTOR.indexOf(',') !== -1);
  });

  it('CANCEL_ID_SUFFIXES includes expected core suffixes', () => {
    assert.ok(CANCEL_ID_SUFFIXES.indexOf('Cancel') !== -1);
    assert.ok(CANCEL_ID_SUFFIXES.indexOf('No') !== -1);
    assert.ok(CANCEL_ID_SUFFIXES.indexOf('Close') !== -1);
  });

  it('CANCEL_ID_PREFIXES includes "close"', () => {
    assert.ok(CANCEL_ID_PREFIXES.indexOf('close') !== -1);
  });

  it('CANCEL_ID_EXACT covers wcMultiTabReadonlyBtn', () => {
    assert.ok(CANCEL_ID_EXACT.indexOf('wcMultiTabReadonlyBtn') !== -1);
  });
});
