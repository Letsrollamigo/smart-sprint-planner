// Fork-agnostic: значения брендинга — только в per-fork файлах; в английской сборке нет кириллицы в словаре и подсказках.
// Запрещённые литералы выводятся из самого branding.ts и package.json — имён форков в тесте нет (иначе он сам был бы утечкой).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dist } from './_mock.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { BRAND } = dist('branding.js');
const { name: PKG_NAME } = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
const PER_FORK = [
	/^package(-lock)?\.json$/,
	/^README\.md$/,
	/^credentials\/[A-Za-z]+Api\.credentials\.ts$/,
	/^(credentials|nodes\/SprintPlanner)\/sprintPlanner(\.dark)?\.svg$/,
	/^nodes\/SprintPlanner\/(branding|i18n)\.ts$/,
	/^nodes\/SprintPlanner\/SprintPlanner\.node\.json$/,
	/^nodes\/SprintPlanner\/shared\/notes\.[a-z]+\.json$/,
];
const NEEDLES = [BRAND.appId, BRAND.credentialName, BRAND.displayName, new URL(BRAND.docsUrl).host, PKG_NAME].map((s) => s.toLowerCase());
const APP_ID = /\b[a-z]+-sprint-planner\b/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

function walk(dir, rel = '') {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const r = rel ? rel + '/' + e.name : e.name;
		if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(path.join(dir, e.name), r);
		return [r];
	});
}

const leaks = (text) => NEEDLES.some((n) => text.toLowerCase().includes(n)) || APP_ID.test(text);

test('значения брендинга — только в per-fork файлах', () => {
	const found = walk(PKG).filter((f) => !f.endsWith('.tsbuildinfo') && !PER_FORK.some((re) => re.test(f)) && leaks(fs.readFileSync(path.join(PKG, f), 'utf8')));
	assert.deepEqual(found, []);
});

test('детектор способен упасть', () => {
	assert.ok(leaks(`const appId = '${BRAND.appId}';`));
	assert.ok(leaks(`name: '${BRAND.displayName}'`));
	assert.ok(leaks('other' + '-sprint-planner'));
	assert.ok(!leaks('const planner = makeOps();'));
});

test('английская сборка — без кириллицы в словаре и подсказках', { skip: BRAND.lang !== 'en' && 'русская сборка' }, () => {
	for (const f of ['nodes/SprintPlanner/i18n.ts', 'nodes/SprintPlanner/shared/notes.en.json']) {
		assert.ok(!/[А-Яа-яЁё]/.test(fs.readFileSync(path.join(PKG, f), 'utf8')), f);
	}
});
