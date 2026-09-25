// Гейт общего слоя: копии = MCP-сервер, notes.<язык>.json = выборка реестра, в JS-слое нет того, что линтер n8n
// (он смотрит только .ts) пропустил бы, а сканер верификации — нет.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { diff, sourceAvailable, SHARED, FILES } from '../scripts/sync-shared.mjs';

const RESTRICTED = /\b(globalThis|process|setTimeout|setInterval|setImmediate|clearTimeout|clearInterval|clearImmediate|__dirname|__filename|console|require)\b/;
const IMPORT = /^\s*import\s[^'"]*['"]([^'"]+)['"]/gm;

/** @param {string} src */
function violations(src) {
	const out = [];
	const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
	const m = RESTRICTED.exec(code);
	if (m) out.push('global ' + m[1]);
	for (const [, spec] of code.matchAll(IMPORT)) if (!spec.startsWith('./')) out.push('import ' + spec);
	return out;
}

test('shared — копии совпадают с mcp-server/src, выборка подсказок — с реестром', { skip: !sourceAvailable() && 'источника нет (вне репозитория плагина)' }, () => {
	assert.deepEqual(diff(), []);
});

test('shared — в JS-слое нет запрещённых глобалов и внешних импортов', () => {
	for (const f of FILES) assert.deepEqual(violations(fs.readFileSync(path.join(SHARED, f), 'utf8')), [], f);
});

test('shared — детектор способен упасть', () => {
	assert.deepEqual(violations('export const a = () => setTimeout(() => {}, 1);'), ['global setTimeout']);
	assert.deepEqual(violations("import x from 'node:fs';\nexport default x;"), ['import node:fs']);
	assert.deepEqual(violations('// globalThis в комментарии\nexport const b = 1;'), []);
});
