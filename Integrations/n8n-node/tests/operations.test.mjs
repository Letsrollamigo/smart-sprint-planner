// Инварианты формы: 26 операций = 26 файлов, у каждой описание и обработчик, у записи с ревизией — «Ревизия»,
// у чтений — «Вывод»; свойства операции показываются только для своих ресурса и операции.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dist, SprintPlanner } from './_mock.mjs';

const ACTIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'nodes', 'SprintPlanner', 'actions');
const { RESOURCES } = dist('actions/router.js');
const { BRAND } = dist('branding.js');

const WITH_REVISION = [
	'sprint.uploadDraft', 'sprint.update', 'sprintItem.createOrUpdate', 'sprintItem.remove', 'sprintItem.assign',
	'absence.createOrUpdate', 'absence.delete', 'release.createOrUpdate', 'release.setStatus', 'release.updateIssues', 'release.delete',
];
const WITH_OUTPUT = ['sprint.get', 'history.getMany', 'capacity.get', 'calendar.get', 'absence.getMany', 'reminder.getMany', 'release.getMany', 'issue.search'];
const FLAGGED = { issueSearch: 'issue.search', issueSetField: 'issue.setField' };

const files = fs.readdirSync(ACTIONS, { recursive: true }).filter((f) => String(f).endsWith('.operation.ts'));
const ops = Object.entries(RESOURCES).flatMap(([r, res]) => Object.entries(res.operations).map(([o, op]) => ({ key: `${r}.${o}`, r, o, op })));
const disabled = Object.entries(FLAGGED).filter(([flag]) => !BRAND.features[flag]).map(([, key]) => key);

test('26 файлов операций; в роутере — все, кроме выключенных флагами сборки', () => {
	assert.equal(files.length, 26);
	assert.equal(ops.length, 26 - disabled.length);
	for (const f of files) {
		const [r, name] = String(f).split(path.sep);
		const o = name.replace('.operation.ts', '');
		if (!disabled.includes(`${r}.${o}`)) assert.ok(ops.find((x) => x.r === r && x.o === o), `${r}.${o} нет в роутере`);
	}
});

test('у каждой операции описание и обработчик; свойства видны только своей операции', () => {
	for (const { key, r, o, op } of ops) {
		assert.equal(typeof op.execute, 'function', key);
		assert.ok(Array.isArray(op.description) && op.description.length, key);
		for (const p of op.description) {
			assert.deepEqual(p.displayOptions?.show?.resource, [r], `${key}.${p.name}`);
			assert.deepEqual(p.displayOptions?.show?.operation, [o], `${key}.${p.name}`);
			assert.ok(p.displayName && p.default !== undefined, `${key}.${p.name}`);
		}
	}
});

const optionNames = (op) => (op.description.find((p) => p.name === 'options')?.options ?? []).map((x) => x.name);

test('запись с ревизией — параметр «Ревизия»; чтения — «Вывод»; прочие без них', () => {
	for (const { key, op } of ops) {
		assert.equal(optionNames(op).includes('revision'), WITH_REVISION.includes(key), key + ' revision');
		assert.equal(optionNames(op).includes('output'), WITH_OUTPUT.includes(key), key + ' output');
	}
});

test('описание ноды: ресурсы и операции с подписями, action и описанием; subtitle и usableAsTool', () => {
	const d = new SprintPlanner().description;
	assert.ok(d.subtitle);
	assert.equal(d.usableAsTool, true);
	assert.equal(d.credentials[0].name, BRAND.credentialName);
	const res = d.properties.find((p) => p.name === 'resource');
	assert.equal(res.options.length, 11);
	for (const p of d.properties.filter((x) => x.name === 'operation')) {
		for (const opt of p.options) assert.ok(opt.name && opt.action && opt.description, `${p.displayOptions.show.resource}.${opt.value}`);
	}
});
