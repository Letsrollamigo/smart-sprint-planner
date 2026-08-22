#!/usr/bin/env node
// v1.9.6 — генерирует widgets/main/src/icons.generated.js из widgets/main/src/icons/*.svg.
// Output устанавливает window.__SSP_ICONS (side-effect паттерн, аналог i18n-bridge.js).
// Запускается как npm run build:icons перед esbuild.

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', 'widgets', 'main', 'src', 'icons');
const OUT = path.join(__dirname, '..', 'widgets', 'main', 'src', 'icons.generated.js');

const files = fs.readdirSync(ICONS_DIR).filter(f => f.endsWith('.svg')).sort();

const entries = files.map(f => {
  const name = path.basename(f, '.svg');
  const svg = fs.readFileSync(path.join(ICONS_DIR, f), 'utf8').trim().replace(/\r?\n\s*/g, ' ');
  return `  '${name}': ${JSON.stringify(svg)}`;
}).join(',\n');

const out = [
  '// AUTOGEN by scripts/build-icons.js — DO NOT EDIT MANUALLY.',
  '// To update: edit widgets/main/src/icons/*.svg, then run `npm run build:icons`.',
  '// Устанавливает window.__SSP_ICONS до исполнения IIFE core.js (аналог i18n-bridge).',
  'if (typeof window !== \'undefined\') {',
  '  window.__SSP_ICONS = {',
  entries,
  '  };',
  '  /* v3.24.0 (#69 строка 18) — строковый хелпер для HTML-string рендереров (history-view,',
  '     currentrole-view): инлайн-иконка вместо эмодзи. cls — модификаторы (.ssp-icon--inline). */',
  '  window.__SSP_ICON_HTML = function (name, cls) {',
  '    var s = window.__SSP_ICONS[name];',
  '    return s ? \'<span class="ssp-icon\' + (cls ? \' \' + cls : \'\') + \'" aria-hidden="true">\' + s + \'</span>\' : \'\';',
  '  };',
  '}',
  '',
].join('\n');

fs.writeFileSync(OUT, out);
console.log(`[build-icons] generated ${files.length} icons → ${OUT}`);
