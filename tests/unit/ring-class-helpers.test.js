'use strict';
// Unit tests for ring-class-helpers.js
// Verifies class composition logic and XSS safety of escapeHtml.
// Does NOT import the browser bundle — requires the src file directly.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  escapeHtml,
  ringButtonClass,
  ringInputClass,
  ringInputTemplate,
  ringSelectButtonClass,
  ringCheckboxClass,
  ringIconClass,
} = require('../../widgets/main/src/ring-class-helpers.js');

// ── escapeHtml ─────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes & < > " \'', () => {
    assert.strictEqual(escapeHtml('&'), '&amp;');
    assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
    assert.strictEqual(escapeHtml('"hello"'), '&quot;hello&quot;');
    assert.strictEqual(escapeHtml("it's"), 'it&#39;s');
  });

  it('handles null and undefined safely', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
  });

  it('passes plain text unchanged', () => {
    assert.strictEqual(escapeHtml('hello world'), 'hello world');
    assert.strictEqual(escapeHtml('1.9.9'), '1.9.9');
  });

  it('coerces numbers to string', () => {
    assert.strictEqual(escapeHtml(42), '42');
  });
});

// ── ringButtonClass ────────────────────────────────────────────────────────

describe('ringButtonClass', () => {
  it('returns base class with defaults (block, heightM)', () => {
    const cls = ringButtonClass();
    assert.ok(cls.includes('ring-button-button'));
    assert.ok(cls.includes('ring-button-block'));
    assert.ok(cls.includes('ring-button-heightM'));
  });

  it('primary variant adds primaryBlock + flat + whiteText', () => {
    const cls = ringButtonClass({ primary: true });
    assert.ok(cls.includes('ring-button-primaryBlock'));
    assert.ok(cls.includes('ring-button-flat'));
    assert.ok(cls.includes('ring-button-whiteText'));
    assert.ok(!cls.includes('ring-button-danger'));
  });

  it('secondary variant adds secondary + flat, not primaryBlock', () => {
    const cls = ringButtonClass({ secondary: true });
    assert.ok(cls.includes('ring-button-secondary'));
    assert.ok(cls.includes('ring-button-flat'));
    assert.ok(!cls.includes('ring-button-primaryBlock'));
  });

  it('ghost variant adds ghost + flat', () => {
    const cls = ringButtonClass({ ghost: true });
    assert.ok(cls.includes('ring-button-ghost'));
    assert.ok(cls.includes('ring-button-flat'));
  });

  it('danger variant adds danger only', () => {
    const cls = ringButtonClass({ danger: true });
    assert.ok(cls.includes('ring-button-danger'));
    assert.ok(!cls.includes('ring-button-flat'));
  });

  it('success variant adds success', () => {
    const cls = ringButtonClass({ success: true });
    assert.ok(cls.includes('ring-button-success'));
  });

  it('height S/L respected', () => {
    assert.ok(ringButtonClass({ height: 'S' }).includes('ring-button-heightS'));
    assert.ok(ringButtonClass({ height: 'L' }).includes('ring-button-heightL'));
  });

  it('inline adds ring-button-inline instead of block', () => {
    const cls = ringButtonClass({ inline: true });
    assert.ok(cls.includes('ring-button-inline'));
    assert.ok(!cls.includes('ring-button-block'));
  });

  it('iconOnly adds ring-button-iconOnly', () => {
    assert.ok(ringButtonClass({ iconOnly: true }).includes('ring-button-iconOnly'));
  });

  it('disabled adds ring-button-disabled', () => {
    assert.ok(ringButtonClass({ disabled: true }).includes('ring-button-disabled'));
  });

  it('active adds ring-button-active', () => {
    assert.ok(ringButtonClass({ active: true }).includes('ring-button-active'));
  });

  it('short adds ring-button-short', () => {
    assert.ok(ringButtonClass({ short: true }).includes('ring-button-short'));
  });
});

// ── ringInputClass ─────────────────────────────────────────────────────────

describe('ringInputClass', () => {
  it('returns outerContainer with defaults (sizeM, heightM)', () => {
    const cls = ringInputClass();
    assert.ok(cls.includes('ring-input-outerContainer'));
    assert.ok(cls.includes('ring-input-sizeM'));
    assert.ok(cls.includes('ring-input-heightM'));
  });

  it('size and height options', () => {
    const cls = ringInputClass({ size: 'S', height: 'L' });
    assert.ok(cls.includes('ring-input-sizeS'));
    assert.ok(cls.includes('ring-input-heightL'));
  });

  it('empty flag', () => {
    assert.ok(ringInputClass({ empty: true }).includes('ring-input-empty'));
    assert.ok(!ringInputClass({ empty: false }).includes('ring-input-empty'));
  });

  it('error flag', () => {
    assert.ok(ringInputClass({ error: true }).includes('ring-input-error'));
    assert.ok(!ringInputClass({ error: false }).includes('ring-input-error'));
  });

  it('withIcon flag', () => {
    assert.ok(ringInputClass({ withIcon: true }).includes('ring-input-withIcon'));
  });

  it('FULL size', () => {
    assert.ok(ringInputClass({ size: 'FULL' }).includes('ring-input-sizeFULL'));
  });
});

// ── ringInputTemplate ──────────────────────────────────────────────────────

describe('ringInputTemplate', () => {
  it('produces ring-input-outerContainer wrapper with input inside', () => {
    const html = ringInputTemplate({ id: 'myInput', value: 'hello' });
    assert.ok(html.includes('ring-input-outerContainer'));
    assert.ok(html.includes('ring-input-container'));
    assert.ok(html.includes('ring-input-input'));
    assert.ok(html.includes('id="myInput"'));
    assert.ok(html.includes('value="hello"'));
  });

  it('escapes XSS in value and placeholder', () => {
    const html = ringInputTemplate({ id: 'x', value: '<script>alert(1)</script>', placeholder: '"test"' });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&quot;test&quot;'));
  });

  it('empty value adds ring-input-empty class on outer', () => {
    const html = ringInputTemplate({ id: 'x', value: '' });
    assert.ok(html.includes('ring-input-empty'));
  });

  it('non-empty value does not add ring-input-empty', () => {
    const html = ringInputTemplate({ id: 'x', value: 'hello' });
    assert.ok(!html.includes('ring-input-empty'));
  });

  it('disabled attribute rendered when disabled:true', () => {
    const html = ringInputTemplate({ id: 'x', disabled: true });
    assert.ok(html.includes(' disabled'));
  });

  it('type attribute propagated', () => {
    const html = ringInputTemplate({ id: 'x', type: 'number', extraAttrs: 'min="0" max="100"' });
    assert.ok(html.includes('type="number"'));
    assert.ok(html.includes('min="0" max="100"'));
  });
});

// ── ringSelectButtonClass ──────────────────────────────────────────────────

describe('ringSelectButtonClass', () => {
  it('returns ring-select-button base + default sizeM', () => {
    const cls = ringSelectButtonClass();
    assert.ok(cls.includes('ring-select-button'));
    assert.ok(cls.includes('ring-select-sizeM'));
  });

  it('open adds ring-select-open', () => {
    assert.ok(ringSelectButtonClass({ open: true }).includes('ring-select-open'));
  });

  it('disabled adds ring-select-disabled', () => {
    assert.ok(ringSelectButtonClass({ disabled: true }).includes('ring-select-disabled'));
  });

  it('height S/L', () => {
    assert.ok(ringSelectButtonClass({ height: 'S' }).includes('ring-select-heightS'));
    assert.ok(ringSelectButtonClass({ height: 'L' }).includes('ring-select-heightL'));
  });

  it('size FULL', () => {
    assert.ok(ringSelectButtonClass({ size: 'FULL' }).includes('ring-select-sizeFULL'));
  });

  it('empty flag adds ring-select-buttonValueEmpty', () => {
    assert.ok(ringSelectButtonClass({ empty: true }).includes('ring-select-buttonValueEmpty'));
  });
});

// ── ringCheckboxClass ──────────────────────────────────────────────────────

describe('ringCheckboxClass', () => {
  it('returns ring-checkbox-cell', () => {
    assert.strictEqual(ringCheckboxClass(), 'ring-checkbox-cell');
  });
});

// ── ringIconClass ──────────────────────────────────────────────────────────

describe('ringIconClass', () => {
  it('returns ring-icon-icon base', () => {
    assert.ok(ringIconClass().includes('ring-icon-icon'));
  });

  it('blue color', () => {
    assert.ok(ringIconClass({ color: 'blue' }).includes('ring-icon-blue'));
  });

  it('loading state', () => {
    assert.ok(ringIconClass({ loading: true }).includes('ring-icon-loading'));
  });
});
