'use strict';
// Unit tests for widgets/main/src/util-pure.js — pure helpers, no DOM.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { esc, safeUrl, uid, deepClone, formatHoursLight } =
  require('../../widgets/main/src/util-pure.js');

describe('esc', () => {
  it('escapes the five HTML-significant characters', () => {
    assert.strictEqual(esc('<a href="x">&\'</a>'),
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
  it('coerces falsy values to empty string (legacy String(s||"") behaviour)', () => {
    assert.strictEqual(esc(null), '');
    assert.strictEqual(esc(undefined), '');
    assert.strictEqual(esc(0), '');
    assert.strictEqual(esc(''), '');
  });
  it('stringifies non-falsy non-strings', () => {
    assert.strictEqual(esc(42), '42');
  });
});

describe('safeUrl', () => {
  it('passes http(s) URLs through escaped', () => {
    assert.strictEqual(safeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
    assert.strictEqual(safeUrl('HTTP://EXAMPLE.com'), 'HTTP://EXAMPLE.com');
  });
  it('blocks dangerous schemes → "#"', () => {
    assert.strictEqual(safeUrl('javascript:alert(1)'), '#');
    assert.strictEqual(safeUrl('data:text/html,x'), '#');
    assert.strictEqual(safeUrl('/relative/path'), '#');
  });
  it('empty/nullish → "#"', () => {
    assert.strictEqual(safeUrl(''), '#');
    assert.strictEqual(safeUrl(null), '#');
    assert.strictEqual(safeUrl(undefined), '#');
  });
  it('escapes quotes in an otherwise valid URL', () => {
    assert.strictEqual(safeUrl('https://e.com/"x"'), 'https://e.com/&quot;x&quot;');
  });
});

describe('uid', () => {
  it('matches the v4-style template and is non-repeating', () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const a = uid();
    const b = uid();
    assert.match(a, re);
    assert.match(b, re);
    assert.notStrictEqual(a, b);
  });
});

describe('deepClone', () => {
  it('produces an independent deep copy', () => {
    const src = { a: 1, nested: { b: [2, 3] } };
    const out = deepClone(src);
    assert.deepStrictEqual(out, src);
    assert.notStrictEqual(out, src);
    out.nested.b.push(4);
    assert.deepStrictEqual(src.nested.b, [2, 3]);
  });
  it('passes null/undefined through untouched', () => {
    assert.strictEqual(deepClone(null), null);
    assert.strictEqual(deepClone(undefined), undefined);
  });
  it('returns the original reference on serialisation failure (cyclic)', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    assert.strictEqual(deepClone(cyclic), cyclic);
  });
});

describe('formatHoursLight', () => {
  it('renders whole numbers without decimals', () => {
    assert.strictEqual(formatHoursLight(40), '40');
    assert.strictEqual(formatHoursLight(0), '0');
  });
  it('rounds to 2dp and trims trailing zeros', () => {
    assert.strictEqual(formatHoursLight(1.5), '1.5');
    assert.strictEqual(formatHoursLight(1.504), '1.5');
    assert.strictEqual(formatHoursLight(1.234), '1.23');
  });
  it('NaN/null/undefined → "0"', () => {
    assert.strictEqual(formatHoursLight(NaN), '0');
    assert.strictEqual(formatHoursLight(null), '0');
    assert.strictEqual(formatHoursLight(undefined), '0');
  });
});
