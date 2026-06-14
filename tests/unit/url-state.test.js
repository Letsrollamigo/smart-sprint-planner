'use strict';
// Unit tests for widgets/main/src/pure/share-url-pure.js — #36 (deep-link share-URL).
// parseShareSearch / buildShareSearch / parseFocus: URL search ↔ planner state,
// node mapping (URL dotted ↔ internal tree id), focus validation, round-trips.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseShareSearch, buildShareSearch, parseFocus } =
  require('../../widgets/main/src/pure/share-url-pure.js');

describe('parseShareSearch', () => {
  it('полный набор параметров → объект (node маппится во внутренний id)', () => {
    const r = parseShareSearch('projectKey=DEMO&sprintId=abc-123&node=planning.people&focus=user:jdoe');
    assert.deepEqual(r, { projectKey: 'DEMO', sprintId: 'abc-123', node: 'planning-people', focus: 'user:jdoe' });
  });

  it('только ядро projectKey+sprintId', () => {
    assert.deepEqual(parseShareSearch('projectKey=DEMO&sprintId=u1'), { projectKey: 'DEMO', sprintId: 'u1' });
  });

  it('ведущий "?" игнорируется', () => {
    assert.deepEqual(parseShareSearch('?projectKey=DEMO'), { projectKey: 'DEMO' });
  });

  it('node=params → sprint-params', () => {
    assert.equal(parseShareSearch('node=params').node, 'sprint-params');
  });

  it('node=planning.roles / gantt / history маппятся корректно', () => {
    assert.equal(parseShareSearch('node=planning.roles').node, 'planning-roles');
    assert.equal(parseShareSearch('node=gantt').node, 'gantt');
    assert.equal(parseShareSearch('node=history').node, 'history');
  });

  it('неизвестный node опускается', () => {
    assert.equal('node' in parseShareSearch('node=bogus'), false);
  });

  it('валидный focus=role:analysis сохраняется', () => {
    assert.equal(parseShareSearch('focus=role:analysis').focus, 'role:analysis');
  });

  it('невалидный focus опускается (нет префикса / пустое значение)', () => {
    assert.equal('focus' in parseShareSearch('focus=foo:bar'), false);
    assert.equal('focus' in parseShareSearch('focus=role:'), false);
  });

  it('URL-кодированный focus (%3A) декодируется', () => {
    assert.equal(parseShareSearch('focus=role%3Aanalysis').focus, 'role:analysis');
  });

  it('пустой / null / не-строка → {}', () => {
    assert.deepEqual(parseShareSearch(''), {});
    assert.deepEqual(parseShareSearch(null), {});
    assert.deepEqual(parseShareSearch(undefined), {});
    assert.deepEqual(parseShareSearch(42), {});
  });
});

describe('buildShareSearch', () => {
  it('node переводится во внешний dotted-формат (точка не кодируется)', () => {
    assert.ok(buildShareSearch({ node: 'sprint-params' }).includes('node=params'));
    assert.ok(buildShareSearch({ node: 'planning-people' }).includes('node=planning.people'));
  });

  it('пустые поля опускаются', () => {
    const s = buildShareSearch({ projectKey: 'DEMO' });
    assert.ok(s.includes('projectKey=DEMO'));
    assert.equal(s.includes('sprintId'), false);
    assert.equal(s.includes('node'), false);
    assert.equal(s.includes('focus'), false);
  });

  it('невалидный focus / node не включаются', () => {
    const s = buildShareSearch({ projectKey: 'D', focus: 'bad', node: 'bogus' });
    assert.equal(s.includes('focus'), false);
    assert.equal(s.includes('node'), false);
  });

  it('пустое состояние → пустая строка', () => {
    assert.equal(buildShareSearch({}), '');
    assert.equal(buildShareSearch(), '');
  });
});

describe('round-trip build → parse', () => {
  it('полное состояние сохраняется через сборку и разбор', () => {
    const state = { projectKey: 'DEMO', sprintId: 'abc-123', node: 'planning-people', focus: 'role:development' };
    assert.deepEqual(parseShareSearch(buildShareSearch(state)), state);
  });

  it('focus с двоеточием выживает кодирование', () => {
    const state = { projectKey: 'D', sprintId: 's', focus: 'user:jdoe' };
    assert.equal(parseShareSearch(buildShareSearch(state)).focus, 'user:jdoe');
  });
});

describe('parseFocus', () => {
  it('role:analysis → {kind, value}', () => {
    assert.deepEqual(parseFocus('role:analysis'), { kind: 'role', value: 'analysis' });
  });
  it('user:jdoe → {kind, value}', () => {
    assert.deepEqual(parseFocus('user:jdoe'), { kind: 'user', value: 'jdoe' });
  });
  it('мусор → null', () => {
    assert.equal(parseFocus('bad'), null);
    assert.equal(parseFocus(''), null);
    assert.equal(parseFocus(null), null);
  });
});
