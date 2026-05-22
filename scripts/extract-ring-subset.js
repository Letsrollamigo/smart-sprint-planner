#!/usr/bin/env node
// Ring UI CSS tree-shaker — extracts only needed classes from ring-ui-built/components/style.css
// Run via: npm run build:ring-css
// Output:  widgets/main/ring-subset.css
// Zero external dependencies — custom brace-depth tokenizer for minified CSS.

'use strict';

const fs   = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, '../node_modules/@jetbrains/ring-ui-built/components/style.css');
const DEST = path.join(__dirname, '../widgets/main/ring-subset.css');

// ── Allowlist ──────────────────────────────────────────────────────────────
// Keep rules whose selector contains any of these prefixes.
const KEEP_PATTERNS = [
  ':root',
  'ring-variables',   // .ring-variables_dark-dark
  'ring-button',
  'ring-input',
  'ring-select',
  'ring-checkbox',
  'ring-radio-btn',
  'ring-radio-container',
  'ring-icon',
  'ring-form',
  'ring-control-label',
  'ring-control-help',
  'ring-loader',
  'ring-global',      // utility resets, font helpers
];

// These override KEEP_PATTERNS — if a selector contains these, it is dropped
// (avoids dragging in .ring-list-* inside compound button selectors etc.)
const EXCLUDE_PATTERNS = [
  'ring-dialog',
  'ring-date-picker',
  'ring-table',
  'ring-data-list',
  'ring-popup',
  'ring-dropdown',
  'ring-tooltip',
  'ring-tags',
  'ring-auth',
  'ring-banner',
  'ring-alert-',     // avoid matching alert within other names
  'ring-avatar',
  'ring-badge',
  'ring-breadcrumb',
  'ring-calendar',
  'ring-island',
  'ring-link',
  'ring-list',
  'ring-multi',
  'ring-navigation',
  'ring-pager',
  'ring-panel',
  'ring-progress',
  'ring-query',
  'ring-spin-',      // avoid matching .ring-input (no overlap but be safe)
  'ring-status',
  'ring-tag',        // covers ring-tags too (already covered) + ring-tag-input
  'ring-toolbar',
  'ring-tree',
  'ring-upload',
  'ring-user',
  'ring-code',
  'ring-header',
  'ring-sidebar',
  'ring-tabs',       // ring-tabs are out of scope for tier 2 (decided SC-3)
  'ring-message',
  'ring-collapsible',
  'ring-heading',
];

// ── CSS tokenizer ──────────────────────────────────────────────────────────
// Splits minified CSS into top-level "blocks":
// Each block = { header: string, body: string, raw: string }
// - header: everything before the opening `{` (selector or @-rule)
// - body: everything inside `{ ... }` (may include nested blocks)
// - raw: header + `{` + body + `}`

function tokenize(css) {
  const blocks = [];
  const len = css.length;
  let i = 0;

  function skipString(pos) {
    const q = css[pos];
    pos++;
    while (pos < len) {
      if (css[pos] === '\\') { pos += 2; continue; }
      if (css[pos] === q) return pos + 1;
      pos++;
    }
    return pos;
  }

  function readBlock(pos) {
    // pos points to the opening `{`
    // Returns [innerContent, posAfterClosingBrace]
    // Inner content does NOT include the surrounding `{` and `}`.
    let depth = 1;          // already inside the opening brace
    let out = '';
    pos++;                  // skip the opening `{`
    while (pos < len) {
      const ch = css[pos];
      if (ch === '"' || ch === "'") {
        const end = skipString(pos);
        out += css.slice(pos, end);
        pos = end;
        continue;
      }
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return [out, pos + 1];
      }
      out += ch;
      pos++;
    }
    return [out, pos];
  }

  while (i < len) {
    // skip whitespace
    while (i < len && css[i] <= ' ') i++;
    if (i >= len) break;

    const headerStart = i;
    // read until `{`
    while (i < len && css[i] !== '{') {
      if (css[i] === '"' || css[i] === "'") { i = skipString(i); continue; }
      i++;
    }
    if (i >= len) break;

    const header = css.slice(headerStart, i).trim();
    const [body, end] = readBlock(i);
    const raw = css.slice(headerStart, end);
    i = end;

    if (header) blocks.push({ header, body, raw });
  }

  return blocks;
}

// ── Filter logic ───────────────────────────────────────────────────────────

function selectorMatches(selector) {
  // Check exclude first
  for (const ex of EXCLUDE_PATTERNS) {
    if (selector.includes(ex)) return false;
  }
  for (const k of KEEP_PATTERNS) {
    if (selector.includes(k)) return true;
  }
  return false;
}

function filterBlocks(blocks) {
  const kept = [];

  for (const block of blocks) {
    const { header, body, raw } = block;

    if (header.startsWith('@keyframes')) {
      // Keep all @keyframes — they're referenced by animation rules we keep,
      // and their total size is small.
      kept.push(raw);
      continue;
    }

    if (header.startsWith('@font-face') || header.startsWith('@charset') || header.startsWith('@layer')) {
      // Keep font + charset declarations
      kept.push(raw);
      continue;
    }

    if (header.startsWith('@media') || header.startsWith('@supports')) {
      // For @media/@supports: recurse and keep the block only if ≥1 inner rule survives.
      const inner = tokenize(body);
      const innerKept = filterBlocks(inner);
      if (innerKept.length > 0) {
        kept.push(header + '{' + innerKept.join('') + '}');
      }
      continue;
    }

    // Regular rule
    if (selectorMatches(header)) {
      kept.push(raw);
    }
  }

  return kept;
}

// ── Main ───────────────────────────────────────────────────────────────────
function run() {
  const srcCss = fs.readFileSync(SRC, 'utf8');
  const srcSize = Buffer.byteLength(srcCss, 'utf8');

  console.log('[ring-subset] Parsing Ring UI CSS...');
  const blocks = tokenize(srcCss);
  console.log(`[ring-subset] Top-level blocks found: ${blocks.length}`);

  const kept = filterBlocks(blocks);
  const output = kept.join('\n');
  const outSize = Buffer.byteLength(output, 'utf8');

  // Hard limit enforcement
  const HARD_LIMIT = 80 * 1024; // 80 KB
  if (outSize > HARD_LIMIT) {
    console.error(`[ring-subset] ERROR: Output ${(outSize / 1024).toFixed(1)} KB exceeds hard limit of 80 KB!`);
    console.error('[ring-subset] Review KEEP_PATTERNS and narrow the allowlist.');
    process.exit(1);
  }

  fs.writeFileSync(DEST, output, 'utf8');

  const reduction = ((1 - outSize / srcSize) * 100).toFixed(1);
  console.log(`[ring-subset] Original: ${(srcSize / 1024).toFixed(1)} KB`);
  console.log(`[ring-subset] Output:   ${(outSize / 1024).toFixed(1)} KB (${reduction}% reduction)`);
  console.log(`[ring-subset] Written:  ${DEST}`);

  if (outSize > 50 * 1024) {
    console.warn(`[ring-subset] WARNING: Output ${(outSize / 1024).toFixed(1)} KB exceeds target of 50 KB. Consider narrowing KEEP_PATTERNS.`);
  }
}

run();
