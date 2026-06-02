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
  // v2.0.0 Phase D5: Ring Radio uses .ring-radio-circle/focus/input/label/radio/btn — wide prefix to cover all.
  // Old KEEP entries 'ring-radio-btn' + 'ring-radio-container' missed 5 of 6 classes.
  'ring-radio',
  'ring-icon',
  'ring-form',
  'ring-control-label',
  'ring-control-help',
  'ring-loader',
  'ring-global',      // utility resets, font helpers
  // v2.0.0 Phase D2: Ring Dialog mount-points
  'ring-dialog',      // dialog wrapper, backdrop, focus trap
  'ring-island',      // AdaptiveIsland — visual container for Dialog content
  'ring-popup',       // popup positioning used by Dialog overlay
  'ring-shortcuts',   // keyboard shortcut scope used by Dialog Escape handling
  // v2.0.0 Phase D4: Ring DatePicker — все calendar/month/day/year классы под единым префиксом
  'ring-date-picker',
  // v2.0.0 Phase D6: Ring Tabs — реальные классы это ring-tabs-* (с 's'),
  // ring-dumb-tabs (root), ring-tab (single tab item).
  'ring-tab',
  'ring-tabs',
  'ring-dumb-tabs',
  // v2.0.0 Phase D7: Ring Table — 29 классов на одном префиксе ring-table-*
  // (cell, headerCell, headerCellSortable, sorter, sortedUp, row, rowFocused,
  // rowSelected, tableHead, tableWrapper, stickyHeader, etc.)
  'ring-table',
  /* v2.1.0 F1+F2+F3 — Ring Input + Select + Collapse mount-points */
  'ring-collapse',     // dumb collapsible from @jetbrains/ring-ui-built/components/collapse
  'ring-list',         // options list rendered by Ring Select dropdown
  'ring-dropdown',     // popup anchor used by Ring Select
  /* #32 Phase 6c — Ring Alert (toast → alertService). Alert item visuals/animations
     (.ring-alert-*) + portal container (.ring-container-alert*). Контейнер
     position:fixed переопределяется в index.html на click-anchor (auto-grow iframe). */
  'ring-alert',
  'ring-container-alert',
];

// These override KEEP_PATTERNS — if a selector contains these, it is dropped
// (avoids dragging in .ring-list-* inside compound button selectors etc.)
const EXCLUDE_PATTERNS = [
  /* v2.0.0 D4 — ring-date-picker moved to KEEP_PATTERNS */
  /* v2.0.0 D7 — ring-table moved to KEEP_PATTERNS */
  'ring-data-list',
  /* v2.1.0 F2 — 'ring-dropdown' moved to KEEP_PATTERNS (Ring Select uses it). */
  'ring-tooltip',
  'ring-tags',
  'ring-auth',
  'ring-banner',
  /* #32 Phase 6c — 'ring-alert-' moved to KEEP_PATTERNS (toast → Ring alertService). */
  'ring-avatar',
  'ring-badge',
  'ring-breadcrumb',
  'ring-calendar',
  'ring-link',
  /* v2.1.0 F2 — 'ring-list' moved to KEEP_PATTERNS (Select dropdown options). */
  'ring-multi',
  'ring-navigation',
  'ring-pager',
  'ring-panel',
  'ring-progress',
  'ring-query',
  'ring-spin-',      // avoid matching .ring-input (no overlap but be safe)
  'ring-status',
  'ring-tag',        // covers ring-tags too + ring-tag-input
  'ring-toolbar',
  'ring-tree',
  'ring-upload',
  'ring-user',
  'ring-code',
  'ring-header',
  'ring-sidebar',
  /* v2.0.0 Phase D6 — 'ring-tabs' moved to KEEP_PATTERNS (this is the actual
     dumb-tabs container + tab-title classes that Ring renders). */
  'ring-message',
  /* v2.1.0 F3 — 'ring-collapse' moved to KEEP_PATTERNS (Settings accordion). */
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

  // Hard limit enforcement — v2.0.0 D4: 80 → 100 KB (Ring DatePicker adds ~10 KB)
  /* v2.1.0 F1+F2+F3 — limit raised 100→130 KB to accommodate ring-input,
     ring-select, ring-popup (extended for Select dropdown), ring-list
     (Select options), ring-dropdown, ring-collapse classes. */
  const HARD_LIMIT = 130 * 1024; // 130 KB
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
