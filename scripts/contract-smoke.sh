#!/usr/bin/env bash
# contract-smoke.sh — проверка внешнего REST планера на тест-стенде (#113 1в).
#
# Идёт по основному адресу интеграций (глобальный, по ключу проекта):
#   1. GET-операции контракта отвечают success:true; my-roles и filter-planner-projects (3.51.0);
#   2. отказы: 401 (плохой токен), 404 (неверное имя приложения), invalid_project_key и
#      project_unavailable с cid, base_rev_required у записи слота без ревизии,
#      mixed_settings_write у смешанного тела, calendar_invalid у записи календаря без years
#      (#134), invalid_history_structure у записи истории без history (#135);
#   3. круг мелких операций с проверкой, что rev слота растёт на 1 за операцию:
#      upsertItem → GET → removeItem; upsertAbsence → removeAbsence;
#      upsertRelease → addReleaseIssues → setReleaseStatus → removeReleaseIssues → removeRelease (3.51.0).
# После прогона состояние возвращается (созданное удаляется).
#
# Использование:  bash scripts/contract-smoke.sh <base-url> <app> <projectKey>
#   напр.         bash scripts/contract-smoke.sh http://localhost:8080 smart-sprint-planner DEMO
# Токен: env YT_TOKEN либо Keychain (service из env YT_TOKEN_SERVICE, account api-token).
# Значение токена никуда не выводится; годность проверяется только по ответу сервера.
set -euo pipefail

BASE="${1:?usage: contract-smoke.sh <base-url> <app> <projectKey>}"
APP="${2:?usage: contract-smoke.sh <base-url> <app> <projectKey>}"
KEY="${3:?usage: contract-smoke.sh <base-url> <app> <projectKey>}"
# Предохранитель «только локальный стенд» — как у stand-deploy.sh (#86): скрипт пишет данные.
if ! [[ "$BASE" =~ ^https?://(localhost|127\.0\.0\.1|\[::1\]|[A-Za-z0-9._-]+\.local)(:[0-9]+)?/?$ ]]; then
  echo "contract-smoke: ОТКАЗ — цель «$BASE» не локальный тест-стенд." >&2
  exit 2
fi
if [ -z "${YT_TOKEN:-}" ]; then
  YT_TOKEN="$(security find-generic-password -s "${YT_TOKEN_SERVICE:?задайте YT_TOKEN либо YT_TOKEN_SERVICE}" -a api-token -w)"
fi
export YT_TOKEN SMOKE_BASE="${BASE%/}" SMOKE_APP="$APP" SMOKE_KEY="$KEY"

python3 - <<'PY'
import json, os, sys, urllib.error, urllib.parse, urllib.request

BASE, APP, KEY, TOKEN = (os.environ[k] for k in ('SMOKE_BASE', 'SMOKE_APP', 'SMOKE_KEY', 'YT_TOKEN'))
failed = []

def call(method, path, body=None, params=None, app=APP, token=TOKEN, key=KEY):
    q = dict(params or {})
    if key is not None:
        q['projectKey'] = key
    url = '%s/api/extensionEndpoints/%s/backend-global/%s?%s' % (BASE, app, path, urllib.parse.urlencode(q))
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or '{}')
        except ValueError:
            return e.code, {'raw': raw[:200]}

def check(name, ok, detail=''):
    print(('PASS  ' if ok else 'FAIL  ') + name + ('' if ok else '  → ' + str(detail)[:300]))
    if not ok:
        failed.append(name)

def refusal(name, resp, reason):
    st, b = resp
    check(name, b.get('success') is False and b.get('reason') == reason and str(b.get('cid', '')).startswith('cid-'), b)

def ok(name, resp):
    st, b = resp
    check(name, b.get('success') is True, b)
    return b

# ── 1. GET-операции ──────────────────────────────────────────────────────────
sd = ok('GET sprint-data', call('GET', 'sprint-data'))
sprint = sd.get('sprint') or {}
for p in ('history', 'capacity-archive', 'calendar', 'absences', 'releases', 'releases-archive', 'reminders', 'reminders-journal', 'sprint-lock'):
    ok('GET ' + p, call('GET', p))
ok('GET app-version', call('GET', 'app-version', key=None))
mr = ok('GET my-roles', call('GET', 'my-roles'))
check('my-roles: девять ролей-флагов и configured', isinstance(mr.get('configured'), bool) and len(mr.get('roles') or {}) == 9
      and all(isinstance(v, bool) for v in (mr.get('roles') or {}).values()), mr)
fp = ok('POST filter-planner-projects', call('POST', 'filter-planner-projects', {'keys': [KEY, 'NoSuchProject113', KEY]}, key=None))
check('filter-planner-projects: свой проект один раз, чужой ключ пропущен', [p.get('key') for p in fp.get('projects', [])] == [KEY], fp)
refusal('filter-planner-projects: keys не массив → invalid_keys', call('POST', 'filter-planner-projects', {'keys': KEY}, key=None), 'invalid_keys')
if sprint.get('sprintId'):
    ok('GET capacity', call('GET', 'capacity', params={'sprintId': sprint['sprintId']}))

# ── 2. Отказы ────────────────────────────────────────────────────────────────
st, _ = call('GET', 'sprint-data', token='perm:bad.token')
check('401 на плохом токене', st == 401, st)
st, _ = call('GET', 'sprint-data', app=APP + '-nope')
check('404 на неверном имени приложения', st == 404, st)
refusal('invalid_project_key + cid', call('GET', 'sprint-data', key='a b'), 'invalid_project_key')
refusal('project_unavailable + cid', call('GET', 'sprint-data', key='NoSuchProject113'), 'project_unavailable')
refusal('смешанное тело → mixed_settings_write', call('POST', 'sprint-data', {'sprint': {}, 'settings': {}, 'baseRev': 0}), 'mixed_settings_write')
rel = ok('GET releases (для отказа без baseRev)', call('GET', 'releases'))
refusal('POST releases без baseRev → base_rev_required', call('POST', 'releases', {'releases': rel.get('releases', [])}), 'base_rev_required')
refusal('POST absences «сырой» формой → base_rev_required', call('POST', 'absences', {}), 'base_rev_required')
refusal('неизвестное действие → invalid_action', call('POST', 'releases', {'baseRev': 0}, {'action': 'noSuchAction'}), 'invalid_action')
# #134 — тело без years не стирает календарь. На сборке без правки запрос прошёл бы — возвращаем календарь.
cal_before = call('GET', 'calendar')[1].get('calendar')
st, b = call('POST', 'calendar', {})
if b.get('success') is True and cal_before:
    call('POST', 'calendar', {'years': cal_before.get('years') or {}})
check('POST calendar без years → calendar_invalid (years: not_object)',
      b.get('reason') == 'calendar_invalid' and b.get('errors') == [{'field': 'years', 'code': 'not_object'}], b)
check('POST calendar без years: календарь не тронут', call('GET', 'calendar')[1].get('calendar') == cal_before)
# #135 — запись истории без history: отказ, ревизия на месте.
hist_rev = call('GET', 'history')[1].get('rev', 0)
refusal('POST history без history → invalid_history_structure: missing', call('POST', 'history', {'baseRev': hist_rev}), 'invalid_history_structure: missing')
check('POST history без history: rev не сдвинут', call('GET', 'history')[1].get('rev', 0) == hist_rev)

# ── 3. Круг мелких операций ─────────────────────────────────────────────────
def step(name, resp, want_rev=None, applied=None):
    b = ok(name, resp)
    if want_rev is not None:
        check(name + ': rev +1', b.get('rev') == want_rev, 'rev=%s, ждали %s' % (b.get('rev'), want_rev))
    if applied is not None:
        check(name + ': applied', all(b.get('applied', {}).get(k) == v for k, v in applied.items()), b.get('applied'))
    return b

SMOKE_ISSUE = KEY + '-999113'
if sprint.get('sprintId'):
    rev = sprint.get('_rev', 0)
    item = {'issueId': SMOKE_ISSUE, 'title': 'contract-smoke', 'inclusionStatus': 'INC_PLANNED'}
    step('upsertItem', call('POST', 'sprint-data', {'roleKey': 'analysis', 'item': item, 'baseRev': rev}, {'action': 'upsertItem'}),
         rev + 1, {'issueId': SMOKE_ISSUE, 'created': True})
    got = call('GET', 'sprint-data')[1]
    check('GET после upsertItem видит задачу', any(i.get('issueId') == SMOKE_ISSUE for i in (got.get('roleItems') or {}).get('analysis', [])))
    refusal('upsertItem с устаревшим baseRev → rev_conflict', call('POST', 'sprint-data', {'roleKey': 'analysis', 'item': item, 'baseRev': rev}, {'action': 'upsertItem'}), 'rev_conflict')
    step('removeItem', call('POST', 'sprint-data', {'roleKey': 'analysis', 'issueId': SMOKE_ISSUE, 'baseRev': rev + 1}, {'action': 'removeItem'}), rev + 2)
    # то же имя: операция проходит весь путь полной записи, а состояние спринта не меняется
    step('patchSprint', call('POST', 'sprint-data', {'sprint': {'name': sprint.get('name')}, 'baseRev': rev + 2}, {'action': 'patchSprint'}), rev + 3, {'keys': ['name']})
    refusal('removeItem несуществующей → item_not_found', call('POST', 'sprint-data', {'roleKey': 'analysis', 'issueId': SMOKE_ISSUE, 'baseRev': rev + 3}, {'action': 'removeItem'}), 'item_not_found')

    # assignPerson тем же исполнителем: проходит обе полные записи (зеркало в спринте + канон в истории)
    hist = call('GET', 'history')[1]
    role_rec = next((r for r in hist.get('history', []) if r.get('sprintId') == sprint['sprintId'] + '_analysis'), None)
    ta = ((role_rec or {}).get('personalPlanning') or {}).get('taskAssignments') or {}
    pick = next(((i, e.get('assignee')) for i, e in ta.items() if e.get('assignee')), None)
    if not pick:
        print('SKIP  assignPerson — у роли analysis нет записи истории с назначениями')
    else:
        b = step('assignPerson (тот же исполнитель)', call('POST', 'sprint-data', {'roleKey': 'analysis', 'issueId': pick[0], 'login': pick[1], 'baseRev': rev + 3},
                 {'action': 'assignPerson'}), rev + 4, {'issueId': pick[0], 'assignee': pick[1]})
        check('assignPerson: rev истории +1', b.get('historyRev') == hist.get('rev', 0) + 1, b.get('historyRev'))
    refusal('assignPerson роли без записи истории → role_record_not_found', call('POST', 'sprint-data',
            {'roleKey': 'devDb', 'issueId': SMOKE_ISSUE, 'login': 'contract-smoke', 'baseRev': -1}, {'action': 'assignPerson'}), 'role_record_not_found')
    # путь upsertPerson без записи: чужой спринт отклоняет сама полная запись (отказ наследуется)
    refusal('upsertPerson чужого спринта → sprint_not_current', call('POST', 'capacity', {'login': 'contract-smoke', 'person': {'rate': 1}},
            {'action': 'upsertPerson', 'sprintId': 'no-such-sprint-113'}), 'sprint_not_current')
    cap = call('GET', 'capacity', params={'sprintId': sprint['sprintId']})[1]
    if not (cap.get('capacity') or {}).get('persons'):
        print('SKIP  upsertPerson — у спринта нет записи ёмкости (операция создала бы её, возврата нет)')
    else:
        login, person = next(iter(cap['capacity']['persons'].items()))
        step('upsertPerson (то же значение rate)', call('POST', 'capacity', {'login': login, 'person': {'rate': person.get('rate', 1)}},
             {'action': 'upsertPerson', 'sprintId': sprint['sprintId']}), None, {'login': login, 'created': False})
else:
    print('SKIP  операции sprint-data/capacity — слот спринта пуст')

arev = call('GET', 'absences')[1].get('rev', 0)
entry = {'from': '2031-01-13', 'to': '2031-01-14', 'type': 'vacation'}
step('upsertAbsence', call('POST', 'absences', {'login': 'contract-smoke', 'entry': entry, 'baseRev': arev}, {'action': 'upsertAbsence'}), arev + 1, {'created': True})
step('removeAbsence', call('POST', 'absences', {'login': 'contract-smoke', 'from': entry['from'], 'to': entry['to'], 'baseRev': arev + 1}, {'action': 'removeAbsence'}), arev + 2)
check('absences: после круга записи нет', 'contract-smoke' not in (call('GET', 'absences')[1].get('absences') or {}))

rrev = rel.get('rev', 0)
rec = {'id': 'contract-smoke-113', 'name': 'contract-smoke', 'kind': 'release', 'source': 'internal', 'status': 'planned',
       'plannedDate': 1924992000000, 'freezeLocked': False, 'roleReps': {}, 'issues': []}
step('upsertRelease', call('POST', 'releases', {'release': rec, 'baseRev': rrev}, {'action': 'upsertRelease'}), rrev + 1, {'created': True})
step('addReleaseIssues', call('POST', 'releases', {'id': rec['id'], 'issues': [KEY + '-1', KEY + '-2'], 'baseRev': rrev + 1}, {'action': 'addReleaseIssues'}), rrev + 2)
step('setReleaseStatus', call('POST', 'releases', {'id': rec['id'], 'status': 'prep', 'baseRev': rrev + 2}, {'action': 'setReleaseStatus'}), rrev + 3, {'status': 'prep'})
step('removeReleaseIssues', call('POST', 'releases', {'id': rec['id'], 'issues': [KEY + '-1'], 'baseRev': rrev + 3}, {'action': 'removeReleaseIssues'}), rrev + 4)
cur = call('GET', 'releases')[1]
mine = [r for r in cur.get('releases', []) if r.get('id') == rec['id']]
check('releases: статус и состав записаны', bool(mine) and mine[0].get('status') == 'prep' and mine[0].get('issues') == [KEY + '-2'], mine)
# возврат состояния — точечным удалением релиза (#138, 3.51.0)
step('removeRelease', call('POST', 'releases', {'id': rec['id'], 'baseRev': rrev + 4}, {'action': 'removeRelease'}), rrev + 5, {'id': rec['id']})
check('removeRelease: релиза больше нет', not [r for r in call('GET', 'releases')[1].get('releases', []) if r.get('id') == rec['id']])
refusal('removeRelease повторно → release_not_found', call('POST', 'releases', {'id': rec['id'], 'baseRev': rrev + 5}, {'action': 'removeRelease'}), 'release_not_found')

print()
print('ИТОГ: ' + ('PASS' if not failed else 'FAIL (%d): %s' % (len(failed), '; '.join(failed))))
sys.exit(0 if not failed else 1)
PY
