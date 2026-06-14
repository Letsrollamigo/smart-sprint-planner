'use strict';
// Pure CSS class-composition helpers for Ring UI Tier 2 (no React, no dynamic import).
// Class names are taken from ring-ui-built@~7.0.108 and verified against ring-subset.css.
// All functions return strings safe for use in class="..." attributes.

// ── XSS safety ────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Button ─────────────────────────────────────────────────────────────────
// Usage: ringButtonClass({ primary: true, height: 'S' })
// height: 'S' | 'M' | 'L'  (default M)
// variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' (default: none)
// iconOnly: bool — square icon-only button
// inline: bool — display:inline-block vs block
// disabled: bool — adds ring-button-disabled

function ringButtonClass(opts) {
  opts = opts || {};
  const {
    primary, secondary, ghost, danger, success,
    height, iconOnly, inline, disabled, active, short,
  } = opts;
  const h = height || 'M';
  const classes = ['ring-button-button'];

  classes.push(inline ? 'ring-button-inline' : 'ring-button-block');
  classes.push('ring-button-height' + h);

  if (primary)    classes.push('ring-button-primaryBlock', 'ring-button-flat', 'ring-button-whiteText');
  else if (ghost)     classes.push('ring-button-ghost', 'ring-button-flat');
  else if (secondary) classes.push('ring-button-secondary', 'ring-button-flat');
  else if (danger)    classes.push('ring-button-danger');
  else if (success)   classes.push('ring-button-success');

  if (iconOnly)  classes.push('ring-button-iconOnly');
  if (disabled)  classes.push('ring-button-disabled');
  if (active)    classes.push('ring-button-active');
  if (short)     classes.push('ring-button-short');

  return classes.join(' ');
}

// ── Input outer container ──────────────────────────────────────────────────
// Returns class for the outermost <span class="..."> wrapper.
// size: 'S' | 'M' | 'L' | 'FULL'  (default M)
// height: 'S' | 'M' | 'L'         (default M)

function ringInputClass(opts) {
  opts = opts || {};
  const { size, height, empty, error, withIcon } = opts;
  const s = size   || 'M';
  const h = height || 'M';
  const classes = ['ring-input-outerContainer', 'ring-input-size' + s, 'ring-input-height' + h];

  if (empty)    classes.push('ring-input-empty');
  if (error)    classes.push('ring-input-error');
  if (withIcon) classes.push('ring-input-withIcon');

  return classes.join(' ');
}

// ── Input DOM template ─────────────────────────────────────────────────────
// Returns an HTML string for a full Ring-shaped input.
// Callers must set id= for the <input> (for label association).
// Extra attributes (type, min, max, step, …) go in extraAttrs string.

function ringInputTemplate(opts) {
  opts = opts || {};
  const {
    id, value, placeholder, size, height, error, disabled,
    extraAttrs, type,
  } = opts;
  const outerClass = ringInputClass({
    size,
    height,
    empty: value == null || value === '',
    error,
  });
  const inputType = type || 'text';
  const val  = escapeHtml(value == null ? '' : value);
  const ph   = escapeHtml(placeholder || '');
  const extra = extraAttrs || '';
  const disabledAttr = disabled ? ' disabled' : '';
  return (
    '<span class="' + outerClass + '">' +
      '<span class="ring-input-container">' +
        '<input id="' + escapeHtml(id || '') + '" type="' + inputType + '"' +
               ' class="ring-input-input"' +
               ' value="' + val + '"' +
               ' placeholder="' + ph + '"' +
               disabledAttr +
               (extra ? ' ' + extra : '') +
        '/>' +
      '</span>' +
    '</span>'
  );
}

// ── Select button trigger ──────────────────────────────────────────────────
// Returns class for the <button> used as a Ring select trigger (native <select> stays).
// Ring renders .ring-select-button on the trigger; the native <select> is positioned over it.

function ringSelectButtonClass(opts) {
  opts = opts || {};
  const { height, empty, open, disabled, size } = opts;
  const classes = ['ring-select-button'];

  if (height === 'S') classes.push('ring-select-heightS');
  else if (height === 'L') classes.push('ring-select-heightL');

  if (size === 'S')    classes.push('ring-select-sizeS');
  else if (size === 'L') classes.push('ring-select-sizeL');
  else if (size === 'FULL') classes.push('ring-select-sizeFULL');
  else                    classes.push('ring-select-sizeM');

  if (empty)    classes.push('ring-select-buttonValueEmpty');
  if (open)     classes.push('ring-select-open');
  if (disabled) classes.push('ring-select-disabled');

  return classes.join(' ');
}

// ── Checkbox ───────────────────────────────────────────────────────────────
// Returns class for the <label> wrapper of a Ring checkbox.

function ringCheckboxClass(opts) {
  opts = opts || {};
  return 'ring-checkbox-cell';
}

// ── Icon wrapper ───────────────────────────────────────────────────────────
// Returns class for an inline <svg> or <img> used as a Ring icon.
// color: 'blue' | 'gray' | 'green' | 'red' | 'white' | 'magenta'

function ringIconClass(opts) {
  opts = opts || {};
  const { color, loading } = opts;
  const classes = ['ring-icon-icon'];
  if (color)   classes.push('ring-icon-' + color);
  if (loading) classes.push('ring-icon-loading');
  return classes.join(' ');
}

module.exports = {
  escapeHtml,
  ringButtonClass,
  ringInputClass,
  ringInputTemplate,
  ringSelectButtonClass,
  ringCheckboxClass,
  ringIconClass,
};
