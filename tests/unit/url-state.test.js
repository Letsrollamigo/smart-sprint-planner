'use strict';
// Unit tests for widgets/main/src/pure/share-url-pure.js — #36 (deep-link share-URL).
// parseShareSearch / buildShareSearch / parseFocus: URL search ↔ planner state,
// node mapping (URL dotted ↔ internal tree id), focus validation, round-trips.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseShareSearch, buildShareSearch, parseFocus, buildProjectSettingsHref } =
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

describe('buildProjectSettingsHref (#109 — ссылка «открыть планер в проекте»)', () => {
  const TAB = 'smart-sprint-planner:Smart Sprint Planner';

  it('#111 — одна форма на все линейки: без /settings, ключ и tab закодированы', () => {
    const legacy = 'https://yt.example.com/projects/DEMO?tab=' + encodeURIComponent(TAB);
    assert.equal(buildProjectSettingsHref('https://yt.example.com', 'DEMO', TAB), legacy);
    /* бывший флаг «2026.x → /settings» игнорируется: на 2026.1 та форма отдаёт 404 */
    assert.equal(buildProjectSettingsHref('https://yt.example.com', 'DEMO', TAB, true), legacy);
    assert.ok(!legacy.includes('/settings'), legacy);
  });

  it('хвостовые слэши базы срезаются (двойной слэш ломает роутинг YT)', () => {
    const href = buildProjectSettingsHref('https://yt.example.com///', 'DEMO', TAB);
    assert.ok(href.startsWith('https://yt.example.com/projects/DEMO?'), href);
    assert.ok(!href.includes('.com//projects'), href);
  });

  it('ключ проекта кодируется (пробелы/кириллица не рвут адрес)', () => {
    const href = buildProjectSettingsHref('https://yt.example.com', 'ПРО ЕКТ', TAB);
    assert.ok(href.includes('/projects/' + encodeURIComponent('ПРО ЕКТ') + '?tab='), href);
  });

  it('без базы, ключа или tab → null (кнопку не рисуем)', () => {
    assert.equal(buildProjectSettingsHref('', 'DEMO', TAB), null);
    assert.equal(buildProjectSettingsHref('https://yt.example.com', '', TAB), null);
    assert.equal(buildProjectSettingsHref('https://yt.example.com', 'DEMO', ''), null);
    assert.equal(buildProjectSettingsHref(null, null, null, true), null);
  });
});

describe('#124 — node releases.history; ссылки ёмкости с фокусом; старые ссылки как раньше', () => {
  it('node=releases.history ↔ release-history в обе стороны', () => {
    assert.equal(parseShareSearch('node=releases.history').node, 'release-history');
    const s = buildShareSearch({ projectKey: 'DEMO', node: 'release-history', focus: 'release:rel-abc12-x9' });
    assert.ok(s.includes('node=releases.history'), s);
    assert.equal(parseShareSearch(s).focus, 'release:rel-abc12-x9');
  });
  it('round-trip: ёмкость (человек / роль) и история релизов', () => {
    [
      { projectKey: 'D', sprintId: 's', node: 'capacity', focus: 'user:jdoe' },
      { projectKey: 'D', sprintId: 's', node: 'capacity', focus: 'role:analysis' },
      { projectKey: 'D', sprintId: 's', node: 'release-history', focus: 'release:rel-1' },
    ].forEach((state) => assert.deepEqual(parseShareSearch(buildShareSearch(state)), state));
  });
  it('старые ссылки #36/#112 разбираются как раньше', () => {
    assert.deepEqual(parseShareSearch('projectKey=D&sprintId=s&node=planning.roles&focus=role:dev'),
      { projectKey: 'D', sprintId: 's', node: 'planning-roles', focus: 'role:dev' });
    assert.deepEqual(parseShareSearch('node=history&focus=hist:3f1c-uuid_devBack'), { node: 'history', focus: 'hist:3f1c-uuid_devBack' });
    assert.equal(parseShareSearch('node=releases&focus=release:rel-1').node, 'release-planned');
  });
});

describe('#112 — node releases, focus hist:/release: (аддитивно к #36)', () => {
  it('node=releases ↔ release-planned в обе стороны', () => {
    assert.equal(parseShareSearch('node=releases').node, 'release-planned');
    assert.equal(buildShareSearch({ projectKey: 'DEMO', node: 'release-planned' }), 'projectKey=DEMO&node=releases');
  });
  it('focus hist:<uuid>_<roleKey> и release:<rel-…> парсятся и собираются', () => {
    assert.equal(parseShareSearch('focus=hist:3f1c-uuid_devBack').focus, 'hist:3f1c-uuid_devBack');
    assert.equal(parseShareSearch('focus=release:rel-abc12-x9').focus, 'release:rel-abc12-x9');
    assert.deepEqual(parseFocus('hist:3f1c-uuid_devBack'), { kind: 'hist', value: '3f1c-uuid_devBack' });
    assert.deepEqual(parseFocus('release:rel-abc12-x9'), { kind: 'release', value: 'rel-abc12-x9' });
    assert.equal(buildShareSearch({ node: 'release-planned', focus: 'release:rel-abc12-x9' }), 'node=releases&focus=release%3Arel-abc12-x9');
  });
  it('deep-link ?node=releases&focus=release:<id> — полный разбор', () => {
    assert.deepEqual(parseShareSearch('projectKey=DEMO&node=releases&focus=release:rel-1-2'),
      { projectKey: 'DEMO', node: 'release-planned', focus: 'release:rel-1-2' });
  });
  it('прежний формат не расширился сверх четырёх видов: пустое значение и чужой вид отбрасываются', () => {
    assert.equal('focus' in parseShareSearch('focus=hist:'), false);
    assert.equal('focus' in parseShareSearch('focus=journal:abc'), false);
  });
});
