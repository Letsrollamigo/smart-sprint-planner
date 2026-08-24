/* widgets/main/src/domain/capacity-view.js — #45 R3 вкладка «Управление ёмкостью».
   Domain-модуль: строит view-model (данные + коллбэки) и отдаёт React-мосту
   window.__SSP_CAPACITY_MOUNT.mountAt(host, vm) — канон gantt-view/standup-view.
   Логика (load/persist/carry-forward/csv/ростер/авторитетный расчёт через CAPACITY_PURE,
   range-математика отсутствий) — здесь; презентация — react/capacity-view.jsx. Публикует
   window.__SSP_CAPACITY_VIEW (+ module.exports для golden-host).

   STATELESS (C1): только const + function; стейт — в closure core.js через deps.state
   get/set. Star-topology (B1): только leaf-мосты — window.__SSP_CAPACITY_MOUNT (infra) +
   deps.CAPACITY_PURE (pure); кросс-domain — через deps от core.

   Точки: loadAndRender(deps) async (грузит ростер/calendar/absences/capacity + G1
   carry-forward в стейт, ++dataVersion, → render) — из click-handler вкладки и смены
   спринта; render(deps) sync (строит VM из готового стейта + mountAt) — из _doFullRerender
   (смена языка; dataVersion НЕ меняется → React сохраняет локальные правки). */
'use strict';

/* enum-строки (capacity-pure ABSENCE_TYPES/DAY_TYPES) → i18n-ключи (gotcha #7).
   const (не var/let) — иначе state-localization C1 пометит module-level стейт. */
const ABS_KEY = {
  vacation: 'absVacation', sick: 'absSick', out_of_membership: 'absOutOfMembership',
  regional_holiday: 'absRegionalHoliday', training: 'absTraining', teamleading: 'absTeamLeading', other: 'absOther'
};
const DAY_KEY = { holiday: 'dayHoliday', short: 'dayShort', workday: 'dayWorkday', weekend: 'dayWeekend' };

function _num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

function _mountBridge() { return (typeof window !== 'undefined' && window.__SSP_CAPACITY_MOUNT) || null; }

/* Список логических спринтов: активный (_sprint) + исторические (дедуп по логическому id). */
function _sprintList(deps) {
  var out = [], seen = {};
  var sprint = deps.state.getSprint();
  if (sprint && sprint.sprintId) {
    out.push({ id: sprint.sprintId, name: sprint.name || sprint.sprintId, dateStart: sprint.dateStart, dateEnd: sprint.dateEnd, isActive: true });
    seen[sprint.sprintId] = true;
  }
  (deps.state.getHistory() || []).forEach(function (rec) {
    if (!rec || typeof rec.sprintId !== 'string') return;
    var us = rec.sprintId.indexOf('_');
    var logical = us > 0 ? rec.sprintId.substring(0, us) : rec.sprintId;
    if (seen[logical]) return;
    seen[logical] = true;
    out.push({ id: logical, name: rec.name || logical, dateStart: rec.dateStart, dateEnd: rec.dateEnd, isActive: false });
  });
  return out;
}

function _findSprint(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

function _findRole(list, key) {
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  return null;
}

function _constants(deps) {
  var s = deps.state.getSettings() || {};
  return {
    kpe: (s.kpe && typeof s.kpe === 'object' && !Array.isArray(s.kpe)) ? s.kpe : deps.CAPACITY_PURE.DEFAULT_KPE,
    hoursPerDay: _num(s.hoursPerDay, 8)
  };
}

function _copyAlloc(a) { var o = {}; if (a) Object.keys(a).forEach(function (k) { o[k] = a[k]; }); return o; }

/* Редактируемая модель login→{grade,rate,participation,alloc} из ростера + записи/carry.
   #69 R1 (строка 9) — без записи/carry грейд сидируется из PP-канона (первая роль человека), не хардкодом «Middle». */
function _buildModel(deps, sel, roster, rec, carry, ppMap) {
  var model = {};
  /* #73 — роли-участницы выбранного в ёмкости спринта, не текущие настройки проекта */
  (deps.getSprintRolesFor ? deps.getSprintRolesFor(sel && sel.id) : []).forEach(function (role) {
    (roster[role.key] || []).forEach(function (p) {
      var login = p.login;
      if (!model[login]) {
        var src = (rec && rec.persons && rec.persons[login]) || (carry && carry[login]) || null;
        var ppRba = ppMap && ppMap[role.key] && ppMap[role.key].resourcesByAssignee;
        var ppGrade = ppRba && ppRba[login] && ppRba[login].grade;
        model[login] = src
          ? { grade: src.grade || 'Middle', rate: _num(src.rate, 1), participation: _num(src.participation, 1), alloc: _copyAlloc(src.alloc) }
          : { grade: (typeof deps.CAPACITY_PURE.DEFAULT_KPE[ppGrade] === 'number') ? ppGrade : 'Middle', rate: 1, participation: 1, alloc: {} };
        if (rec && rec.persons && rec.persons[login] && typeof rec.persons[login].base === 'number') model[login].base = rec.persons[login].base;
      }
      if (model[login].alloc[role.key] === undefined) {
        model[login].alloc[role.key] = Object.keys(model[login].alloc).length > 0 ? 0 : 1; // новый: первая роль 1.0, прочие 0 (Σ=1, D1)
      }
    });
  });
  return model;
}

/* Авторитетный расчёт отображаемых чисел (зеркало бэка через CAPACITY_PURE). */
function _computeView(deps, sel, model, absByLogin) {
  var CP = deps.CAPACITY_PURE, c = _constants(deps);
  var out = CP.computeCapacity({ constants: c, persons: model }, deps.state.getCalendar(), absByLogin || {}, sel.dateStart, sel.dateEnd);
  var bases = {}, sigma = {};
  Object.keys(out.persons).forEach(function (l) { bases[l] = out.persons[l].base; });
  Object.keys(model).forEach(function (l) {
    var al = (model[l] && model[l].alloc) || {}, s = 0;
    Object.keys(al).forEach(function (k) { s += _num(al[k], 0); });
    sigma[l] = s;
  });
  return { bases: bases, roleCapacities: out.roleCapacities, sigma: sigma };
}

/* #53 — строка архива ёмкости: дата конца спринта + число людей + Σ base (frozen, read-only). */
function _archiveRow(deps, rec) {
  var persons = (rec && rec.persons) || {};
  var logins = Object.keys(persons), sumBase = 0;
  logins.forEach(function (l) { sumBase += _num(persons[l].base, 0); });
  return {
    sprintId: rec.sprintId || '',
    dateEndLabel: (typeof rec.dateEnd === 'number') ? deps.fmtDate(rec.dateEnd) : '—',
    people: logins.length,
    baseLabel: deps.fmtHoursOnly(sumBase * 60)
  };
}

/* Frozen-числа для read-only исторического (из записи; БЕЗ пересчёта по тек. календарю). */
function _frozenView(rec) {
  var bases = {}, roleCap = {}, sigma = {};
  var persons = (rec && rec.persons) || {};
  Object.keys(persons).forEach(function (l) {
    var p = persons[l]; bases[l] = _num(p.base, 0);
    var al = p.alloc || {}; sigma[l] = 0;
    Object.keys(al).forEach(function (rk) { sigma[l] += _num(al[rk], 0); roleCap[rk] = _num(roleCap[rk], 0) + bases[l] * _num(al[rk], 0); });
  });
  return { bases: bases, roleCapacities: roleCap, sigma: sigma };
}

/* Дни спринта для грида: [{iso,dom,type,weekday}] (UTC). */
function _calendarDays(deps, sel) {
  var CP = deps.CAPACITY_PURE, cal = deps.state.getCalendar();
  var days = CP.dayKeysUTC(sel.dateStart, sel.dateEnd);
  return days.map(function (iso) {
    var entry = CP.calendarLookup(cal, iso);
    var type = entry ? entry.type : (CP.isWeekendUTC(iso) ? 'weekend' : 'workday');
    return { iso: iso, dom: iso.substring(8), type: type, weekday: new Date(CP.isoToUTCms(iso)).getUTCDay() };
  });
}

function _uncoveredYears(deps, sel) {
  var cal = deps.state.getCalendar(), years = (cal && cal.years) || {}, seen = {}, out = [];
  deps.CAPACITY_PURE.dayKeysUTC(sel.dateStart, sel.dateEnd).forEach(function (iso) {
    var y = iso.substring(0, 4); if (!years[y] && !seen[y]) { seen[y] = 1; out.push(y); }
  });
  return out;
}

/* ranges [{from,to,type,hoursDelta?}] → {iso:{type,hoursDelta}} и обратно (range-математика —
   в домене). #53: hoursDelta>0 = частичный день (часы отсутствия); null = полный день. */
function _expandAbs(deps, ranges) {
  var out = {}, CP = deps.CAPACITY_PURE;
  (ranges || []).forEach(function (r) {
    if (!r) return;
    var hd = (typeof r.hoursDelta === 'number' && isFinite(r.hoursDelta) && r.hoursDelta > 0) ? r.hoursDelta : null;
    CP.isoRangeDays(r.from, r.to).forEach(function (d) {
      /* v3.2.1 — overlap-семантика как в расчёте (MAX): полный день (hd=null) сильнее
         частичного, из частичных — больший. Раньше last-wins терял absence при
         пересечении диапазонов на roundtrip'е редактирования. */
      var prev = out[d];
      if (prev && (prev.hoursDelta === null || (hd !== null && prev.hoursDelta >= hd))) return;
      out[d] = { type: r.type || 'other', hoursDelta: hd };
    });
  });
  return out;
}
function _isoNext(iso) {
  var p = iso.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + 86400000);
  function z(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate());
}
function _collapseAbs(dayType) {
  var days = Object.keys(dayType).sort(), out = [], cur = null;
  days.forEach(function (d) {
    var v = dayType[d];
    var t = (v && typeof v === 'object') ? v.type : v;                                    // толерантность к legacy-строке
    var hd = (v && typeof v === 'object' && typeof v.hoursDelta === 'number' && v.hoursDelta > 0) ? v.hoursDelta : null;
    if (cur && cur.type === t && cur._hd === hd && _isoNext(cur.to) === d) cur.to = d;      // #53: рвём диапазон и по hoursDelta
    else { cur = { from: d, to: d, type: t, _hd: hd }; out.push(cur); }
  });
  return out.map(function (r) {
    var o = { from: r.from, to: r.to, type: r.type };
    if (typeof r._hd === 'number' && r._hd > 0) o.hoursDelta = r._hd;                       // частичный день — только при наличии
    return o;
  });
}

function _status(rec) {
  if (!rec) return 'none';
  if (rec.status === 'approved' && rec.dirty) return 'dirty';
  if (rec.status === 'approved') return 'approved';
  return 'draft';
}

function _labels(deps) {
  var T = deps.T;
  var dayType = {}; Object.keys(DAY_KEY).forEach(function (k) { dayType[k] = T(DAY_KEY[k]); });
  return {
    sprintLabel: T('capacitySprintLabel'), activeSuffix: T('capacityActiveSprint'), readOnlyHint: T('capacityReadOnly'),
    notApproved: T('capacityNotApproved'), statusDraft: T('statusDraft'), statusApproved: T('statusApproved'), statusDirty: T('statusDirty'),
    approve: T('btnApprove'), reapprove: T('btnReapprove'), save: T('btnSaveCapacity'),
    roleHeader: T('capacityRoleHeader'), calHeader: T('capacityCalendarHeader'),
    personsHeader: T('capacityPersonsHeader'), viewByRoles: T('capacityViewByRoles'),
    viewByPersons: T('capacityViewByPersons'), thRole: T('capacityThRole'), /* #52 */
    thName: T('lblPersonName'), thGrade: T('lblGrade'), thRate: T('lblRate'), thPart: T('lblParticipation'),
    thAlloc: T('lblAlloc'), thBase: T('lblBase'), thContrib: T('lblContribution'), thSumAlloc: T('sumAllocShort'),
    noRoles: T('capacityNoRoles'), noPeople: T('capacityNoPeople'), pickPerson: T('calendarPickPerson'),
    calFor: T('capacityCalendarFor'), absType: T('capacityAbsenceType'),
    absPartialHours: T('capacityPartialHours'), absFullDay: T('capacityFullDay'), hoursShort: T('capacityHoursShort'), /* #53 */
    archiveNode: T('capacityArchiveNode'), archivePeople: T('capacityArchivePeople'), /* #53 архив */
    dlTemplate: T('btnDownloadTemplate'), upCsv: T('btnUploadCsv'), upCsvGlobal: T('btnUploadCsvGlobal'), saveAbs: T('btnSaveAbsences'),
    sumOver: T('sumAllocOverlimit'), yearFallback: T('calendarYearFallback'), dayType: dayType,
    periodLabel: T('excelPeriod'), rolePickLabel: T('lblPlanningRole'), personPickLabel: T('lblPersonName'),
    viewModeRole: T('capacityViewModeRole'), absentLabel: T('capacityAbsentLabel')
  };
}

/* ───────────────────── persist / actions ───────────────────── */
function _persist(deps, sel, action, model) {
  /* v3.2.1 — ростер не загрузился → модель пуста не по воле пользователя;
     сохранение затёрло бы grade/rate/alloc всех людей спринта. */
  var _uiPersist = deps.state.getCapacityUiState ? (deps.state.getCapacityUiState() || {}) : {};
  if (_uiPersist.rosterLoadFailed) { deps.toast(deps.T('errCapacityLoad'), 'err'); return; }
  var persons = {};
  Object.keys(model || {}).forEach(function (login) {
    var p = model[login] || {}, alloc = {};
    if (p.alloc) Object.keys(p.alloc).forEach(function (rk) { if (_num(p.alloc[rk], 0) > 0) alloc[rk] = _num(p.alloc[rk], 0); });
    persons[login] = { grade: p.grade || 'Middle', rate: _num(p.rate, 1), participation: _num(p.participation, 1), alloc: alloc };
  });
  var check = deps.CAPACITY_PURE.validateAllocSums(persons);
  if ((action === 'approve' || action === 'reapprove') && !check.ok) { deps.toast(deps.T('sumAllocOverlimit'), 'err'); return; }
  deps.apiPost('capacity', { persons: persons }, { action: action, sprintId: sel.id }).then(function (r) {
    if (r && r.success) {
      deps.toast(deps.T(action === 'save' ? 'msgCapacitySaved' : 'msgCapacityApproved'), 'success');
      /* v3.2.1 — сброс _planCap ядра: без него Full-остатки планирования
         считались по устаревшей записи ёмкости до полной перезагрузки. */
      if (typeof deps.invalidatePlanCap === 'function') deps.invalidatePlanCap(sel.id);
      loadAndRender(deps); // перезагрузка → ++dataVersion → React пере-сидит локальный стейт
    } else {
      var reason = (r && r.reason) || 'unknown';
      deps.toast(deps.T(reason === 'alloc_sum_exceeds_100' ? 'sumAllocOverlimit' : 'errCapacitySave'), 'err');
    }
  }).catch(function (e) { deps.diag('persistCapacity err: ' + e, 'err'); deps.toast(deps.T('errCapacitySave'), 'err'); });
}

function _saveAbsences(deps, fullMap) {
  /* #67 H3 — сбой GET absences молча ставил пустой реестр, следующее сохранение его
     персистило: единственная в аудите потеря данных обычным кликом (архива у absences
     нет, baseRev остаётся синхронным с прошлого успешного GET). Гейт по образцу
     rosterLoadFailed; CSV-путь (fullMap) блокируем тоже — full-replace поверх
     незагруженного реестра затирает так же. */
  var _uiAbs = deps.state.getCapacityUiState ? (deps.state.getCapacityUiState() || {}) : {};
  if (_uiAbs.absencesLoadFailed) { deps.toast(deps.T('errCapacityLoad'), 'err'); return; }
  var map = fullMap || deps.state.getAbsences() || {};
  /* v3.2.1 — явная обёртка: backend отличает осознанно-пустую карту от битого тела
     (анти-wipe guard absences_empty_body). */
  deps.apiPost('absences', { absences: map }).then(function (r) {
    if (r && r.success) { deps.state.setAbsences(JSON.parse(JSON.stringify(map))); deps.toast(deps.T('msgAbsencesSaved'), 'success'); loadAndRender(deps); }
    else deps.toast(deps.T('errAbsencesSave'), 'err');
  }).catch(function (e) { deps.diag('saveAbsences err: ' + e, 'err'); deps.toast(deps.T('errAbsencesSave'), 'err'); });
}

function _downloadTemplate() {
  var csv = 'date,type,hoursDelta\n2026-06-12,short,-1\n2026-06-13,holiday,0\n2026-06-14,workday,0\n';
  var blob = new Blob([csv], { type: 'text/csv' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'capacity-calendar-template.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  try { URL.revokeObjectURL(a.href); } catch (_) {}
}

function _parseCsv(text) {
  var years = {}, errors = [], lines = String(text).replace(/\r/g, '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i].trim(); if (!ln) continue;
    if (i === 0 && /date/i.test(ln) && /type/i.test(ln)) continue;
    var cols = ln.split(/[,;]/), date = (cols[0] || '').trim(), type = (cols[1] || '').trim(), delta = parseFloat(cols[2]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push('line ' + (i + 1) + ': bad date'); continue; }
    if (['workday', 'short', 'holiday'].indexOf(type) < 0) { errors.push('line ' + (i + 1) + ': bad type'); continue; }
    var yr = date.substring(0, 4); if (!years[yr]) years[yr] = [];
    years[yr].push({ date: date, type: type, hoursDelta: isFinite(delta) ? delta : 0 });
  }
  return { years: years, errors: errors };
}

function _uploadCsv(deps, file) {
  var reader = new FileReader();
  reader.onload = function () {
    var parsed = _parseCsv(reader.result);
    if (parsed.errors.length) { deps.toast(deps.T('errCalendarParse').replace('{n}', parsed.errors.length), 'err'); deps.diag('calendar csv errors: ' + parsed.errors.join('; '), 'err'); return; }
    deps.apiPost('calendar', { years: parsed.years }).then(function (r) {
      if (r && r.success) { deps.state.setCalendar(r.calendar); deps.toast(deps.T('msgCalendarSaved'), 'success'); loadAndRender(deps); }
      else deps.toast(deps.T('errCalendarSave'), 'err');
    }).catch(function (e) { deps.diag('uploadCalendar err: ' + e, 'err'); deps.toast(deps.T('errCalendarSave'), 'err'); });
  };
  reader.readAsText(file);
}

/* #51 — глобальный пуш календаря: тот же CSV, фан-аут POST calendar по всем
   планер-проектам инстанса (список = filter-planner-projects, уже в стейте
   picker'а; backend-global маршрутизирует по явному projectKey). Только
   global-режим + инстанс-админ (гейт canGlobalCsv). Push-модель: календарь
   каждого проекта перезаписывается целиком, как локальной кнопкой. 2 тоста:
   сводка «X из N» + перечень отказов. Локальный стейт не трогаем по месту —
   loadAndRender в конце перечитает календарь активного проекта. */
function _uploadCsvGlobal(deps, file) {
  var reader = new FileReader();
  reader.onload = function () {
    var parsed = _parseCsv(reader.result);
    if (parsed.errors.length) { deps.toast(deps.T('errCalendarParse').replace('{n}', parsed.errors.length), 'err'); deps.diag('calendar csv errors: ' + parsed.errors.join('; '), 'err'); return; }
    var projs = (deps.state.getGlobalProjects && deps.state.getGlobalProjects()) || [];
    var keys = projs.map(function (p) { return p && p.key; }).filter(Boolean);
    if (!keys.length) { deps.toast(deps.T('errCalendarGlobalNoProjects'), 'err'); return; }
    var failed = [];
    Promise.all(keys.map(function (k) {
      return deps.apiPost('calendar', { years: parsed.years }, { projectKey: k })
        .then(function (r) { if (!(r && r.success)) failed.push(k); })
        .catch(function () { failed.push(k); });
    })).then(function () {
      var okN = keys.length - failed.length;
      deps.toast(deps.T('msgCalendarGlobalSaved').replace('{x}', okN).replace('{n}', keys.length), failed.length ? 'err' : 'success');
      if (failed.length) { deps.toast(deps.T('errCalendarGlobalFailed').replace('{list}', failed.join(', ')), 'err'); deps.diag('global calendar push failed: ' + failed.join(', '), 'err'); }
      loadAndRender(deps);
    });
  };
  reader.readAsText(file);
}

/* G1: последняя approved-запись по dateEnd desc → primitives. */
function _carryForward(deps, cb) {
  var seen = {}, candidates = [];
  (deps.state.getHistory() || []).forEach(function (rec) {
    if (!rec || typeof rec.sprintId !== 'string') return;
    var us = rec.sprintId.indexOf('_'); var logical = us > 0 ? rec.sprintId.substring(0, us) : rec.sprintId;
    if (seen[logical]) return; seen[logical] = 1; candidates.push({ id: logical, dateEnd: _num(rec.dateEnd, 0) });
  });
  candidates.sort(function (a, b) { return b.dateEnd - a.dateEnd; });
  var i = 0;
  (function tryNext() {
    if (i >= candidates.length) { cb({}); return; }
    var c = candidates[i++];
    deps.apiGet('capacity?sprintId=' + encodeURIComponent(c.id)).then(function (r) {
      var rec = r && r.capacity;
      if (rec && rec.status === 'approved' && rec.persons) {
        var carry = {};
        Object.keys(rec.persons).forEach(function (l) { var p = rec.persons[l]; carry[l] = { grade: p.grade, rate: p.rate, participation: p.participation, alloc: p.alloc || {} }; });
        cb(carry);
      } else tryNext();
    }).catch(function () { tryNext(); });
  })();
}

/* ───────────────────── VM + render ───────────────────── */
function _buildVm(deps, sprints, sel, ui) {
  var rec = deps.state.getCapacity();
  var roster = deps.state.getRoster() || {};
  var absMap = deps.state.getAbsences() || {};
  var readOnly = !sel.isActive;
  var ppMap = (typeof deps.buildPPMapFromCanon === 'function') ? deps.buildPPMapFromCanon(sel.id, deps.state.getHistory(), null) : null;
  var model = _buildModel(deps, sel, roster, rec, ui.carry || null, ppMap);
  var computed = readOnly ? _frozenView(rec) : _computeView(deps, sel, model, absMap);
  var roles = (deps.getSprintRolesFor ? deps.getSprintRolesFor(sel && sel.id) : []).map(function (role) {
    return { key: role.key, label: deps.roleLabel(role), people: (roster[role.key] || []).map(function (p) { return { login: p.login, name: p.name || p.login }; }) };
  });
  var absTypes = deps.CAPACITY_PURE.ABSENCE_TYPES.map(function (t) { return { key: t, label: deps.T(ABS_KEY[t] || t) }; });
  var selRole = (ui.selectedRole && _findRole(roles, ui.selectedRole)) ? ui.selectedRole : (roles[0] ? roles[0].key : null);
  var viewMode = (ui.viewMode === 'role') ? 'role' : 'person';
  /* #52 (G3) — альтернативная группировка левой колонки: person top-level, его роли внутри.
     Группировка здесь (domain), React — только представление. */
  var mainView = (ui.mainView === 'persons') ? 'persons' : 'roles';
  var personsByLogin = {}, personsView = [];
  roles.forEach(function (role) {
    role.people.forEach(function (p) {
      var e = personsByLogin[p.login];
      if (!e) { e = personsByLogin[p.login] = { login: p.login, name: p.name, roles: [] }; personsView.push(e); }
      e.roles.push({ key: role.key, label: role.label });
    });
  });
  personsView.sort(function (a, b) { return (a.name || a.login).localeCompare(b.name || b.login); });

  return {
    selectedSprintId: sel.id, versionTag: ui.dataVersion || 0,
    dateStartLabel: (typeof sel.dateStart === 'number') ? deps.fmtDate(sel.dateStart) : '—',
    dateEndLabel: (typeof sel.dateEnd === 'number') ? deps.fmtDate(sel.dateEnd) : '—',
    selectedRole: selRole, viewMode: viewMode,
    mainView: mainView, personsView: personsView, /* #52 */
    sprints: sprints.map(function (s) { return { id: s.id, name: s.name, isActive: s.isActive }; }),
    status: _status(rec), readOnly: readOnly, isReapprove: !!(rec && rec.status === 'approved'),
    grades: Object.keys(deps.CAPACITY_PURE.DEFAULT_KPE),
    roles: roles, persons: model, computed: computed,
    calendarDays: _calendarDays(deps, sel), dows: deps.T('calendarDows').split(','),
    selectedPerson: ui.selectedPerson || null, absencesByLogin: absMap,
    absenceTypes: absTypes, uncoveredYears: _uncoveredYears(deps, sel), canUploadCsv: !!ui.canCsv,
    EPS: deps.CAPACITY_PURE.EPS, labels: _labels(deps),
    fmtH: function (h) { return deps.fmtHoursOnly(_num(h, 0) * 60); },
    compute: function (m, abs) { return _computeView(deps, sel, m, abs); },
    expandAbs: function (ranges) { return _expandAbs(deps, ranges); },
    collapseAbs: function (dayType) { return _collapseAbs(dayType); },
    onSprintChange: function (id) { var u = deps.state.getCapacityUiState() || {}; u.selectedSprintId = id; u.selectedPerson = null; u.carry = null; deps.state.setCapacityUiState(u); loadAndRender(deps); },
    onPersonSelect: function (login, roleKey) { var u = deps.state.getCapacityUiState() || {}; u.selectedPerson = login; if (roleKey) u.selectedRole = roleKey; u.viewMode = 'person'; deps.state.setCapacityUiState(u); render(deps); },
    onRoleSelect: function (rk) { var u = deps.state.getCapacityUiState() || {}; u.selectedRole = rk; u.selectedPerson = null; deps.state.setCapacityUiState(u); render(deps); },
    onViewModeChange: function (mode) { var u = deps.state.getCapacityUiState() || {}; u.viewMode = (mode === 'role') ? 'role' : 'person'; deps.state.setCapacityUiState(u); render(deps); },
    onMainViewChange: function (mode) { var u = deps.state.getCapacityUiState() || {}; u.mainView = (mode === 'persons') ? 'persons' : 'roles'; deps.state.setCapacityUiState(u); render(deps); }, /* #52 */
    onSave: function (m) { _persist(deps, sel, 'save', m); },
    onApprove: function (m) { _persist(deps, sel, 'approve', m); },
    onReapprove: function (m) { _persist(deps, sel, 'reapprove', m); },
    onSaveAbsences: function (fullMap) { _saveAbsences(deps, fullMap); },
    onUploadCsv: function (file) { _uploadCsv(deps, file); },
    canUploadCsvGlobal: !!ui.canGlobalCsv, /* #51 */
    onUploadCsvGlobal: function (file) { _uploadCsvGlobal(deps, file); },
    onDownloadTemplate: function () { _downloadTemplate(); },
    /* #53 — read-only архив ёмкости: count из GET /capacity, строки lazy-fetch по раскрытию спойлера. */
    archive: { count: _num(ui.archivedCount, 0), loaded: Array.isArray(ui.archiveRows), rows: Array.isArray(ui.archiveRows) ? ui.archiveRows : [] },
    onLoadArchive: function () {
      deps.apiGet('capacity-archive').then(function (r) {
        var rows = (r && Array.isArray(r.capacity)) ? r.capacity.map(function (rec) { return _archiveRow(deps, rec); }) : [];
        var u = deps.state.getCapacityUiState() || {}; u.archiveRows = rows; deps.state.setCapacityUiState(u); render(deps);
      }).catch(function (e) { deps.diag('capacity archive load err: ' + e, 'err'); });
    }
  };
}

function render(deps) {
  var host = document.getElementById('tab-capacity');
  var mount = _mountBridge();
  if (!host || !mount) return;
  var settings = deps.state.getSettings() || {};
  if (settings.capacityMode !== 'full') { mount.mountAt(host, { lightHint: deps.T('capacityLightHint') }); return; }
  var ui = deps.state.getCapacityUiState() || {};
  var sprints = _sprintList(deps);
  if (!sprints.length) { mount.mountAt(host, { lightHint: deps.T('capacityNoSprint') }); return; }
  if (!ui.selectedSprintId || !_findSprint(sprints, ui.selectedSprintId)) { ui.selectedSprintId = sprints[0].id; deps.state.setCapacityUiState(ui); }
  var sel = _findSprint(sprints, ui.selectedSprintId);
  if (!sel || typeof sel.dateStart !== 'number' || typeof sel.dateEnd !== 'number') { mount.mountAt(host, { lightHint: deps.T('capacitySprintDatesMissing') }); return; }
  mount.mountAt(host, _buildVm(deps, sprints, sel, ui));
}

function loadAndRender(deps) {
  var settings = deps.state.getSettings() || {};
  if (settings.capacityMode !== 'full') { render(deps); return; }
  var ui = deps.state.getCapacityUiState() || {};
  var sprints = _sprintList(deps);
  if (!ui.selectedSprintId || !_findSprint(sprints, ui.selectedSprintId)) ui.selectedSprintId = sprints.length ? sprints[0].id : null;
  ui.dataVersion = (ui.dataVersion || 0) + 1;
  deps.state.setCapacityUiState(ui);
  var sel = _findSprint(sprints, ui.selectedSprintId);

  var roles = deps.getSprintRolesFor ? deps.getSprintRolesFor(sel && sel.id) : [];   /* #73 */
  var fieldByRole = {}, uniqFields = [];
  roles.forEach(function (role) { var fn = settings[role.userField] || null; fieldByRole[role.key] = fn; if (fn && uniqFields.indexOf(fn) < 0) uniqFields.push(fn); });
  var fieldUsers = {};
  /* v3.2.1 — сбой загрузки ростера раньше глотался молча: вкладка рисовала «нет людей»
     с активной «Сохранить», и POST persons:{} затирал состав ёмкости спринта. Флагаем
     сбой → тост + блок _persist до успешной перезагрузки. */
  var rosterFailed = false;
  var jobs = uniqFields.map(function (fn) {
    return deps.apiGet('get-user-field-values?fieldName=' + encodeURIComponent(fn))
      .then(function (r) { fieldUsers[fn] = (r && r.users) ? r.users : []; })
      .catch(function () { fieldUsers[fn] = []; rosterFailed = true; });
  });
  jobs.push(deps.apiGet('calendar').then(function (r) { deps.state.setCalendar(r && r.calendar ? r.calendar : null); }).catch(function () {}));
  var absFailed = false;   /* #67 H3 — гейт _saveAbsences */
  jobs.push(deps.apiGet('absences').then(function (r) { deps.state.setAbsences(r && r.absences ? r.absences : {}); }).catch(function () { deps.state.setAbsences({}); absFailed = true; }));
  /* admin-гейт CSV — резолвим в общем load-батче (не в render → render остаётся sync,
     без host-prop чтения; capacity-view.js остаётся namespace-sed-идентичным форкам). */
  var canCsvP = (typeof deps.checkSettingsManager === 'function') ? deps.checkSettingsManager() : Promise.resolve(false);
  jobs.push(canCsvP.then(function (can) { var u = deps.state.getCapacityUiState() || {}; u.canCsv = !!can; deps.state.setCapacityUiState(u); }).catch(function () { var u = deps.state.getCapacityUiState() || {}; u.canCsv = false; deps.state.setCapacityUiState(u); }));
  /* #51 — гейт глобального пуша: только global-режим (в project-scope нет
     маршрутизации на чужие проекты) + серверное слово check-instance-admin. */
  var canGlobalP = (deps.state.getMode && deps.state.getMode() === 'global' && typeof deps.checkInstanceAdmin === 'function')
    ? deps.checkInstanceAdmin() : Promise.resolve(false);
  jobs.push(canGlobalP.then(function (can) { var u = deps.state.getCapacityUiState() || {}; u.canGlobalCsv = !!can; deps.state.setCapacityUiState(u); }).catch(function () { var u = deps.state.getCapacityUiState() || {}; u.canGlobalCsv = false; deps.state.setCapacityUiState(u); }));
  var capPromise = sel ? deps.apiGet('capacity?sprintId=' + encodeURIComponent(sel.id)).then(function (r) { return { rec: (r && r.capacity) ? r.capacity : null, archivedCount: (r && r.archivedCount) || 0 }; }).catch(function () { return { rec: null, archivedCount: 0 }; }) : Promise.resolve({ rec: null, archivedCount: 0 });

  Promise.all(jobs).then(function () { return capPromise; }).then(function (capRes) {
    var rec = capRes.rec;
    var roster = {};
    roles.forEach(function (role) { var fn = fieldByRole[role.key]; roster[role.key] = fn ? (fieldUsers[fn] || []).map(function (u) { return { login: u.login, name: u.fullName || u.login }; }) : []; });
    deps.state.setRoster(roster);
    deps.state.setCapacity(rec);
    var u = deps.state.getCapacityUiState() || {};
    u.rosterLoadFailed = rosterFailed;   /* v3.2.1 — гейт _persist */
    u.absencesLoadFailed = absFailed;    /* #67 H3 — гейт _saveAbsences; снимается успешной перезагрузкой */
    if (rosterFailed || absFailed) { try { deps.toast(deps.T('errCapacityLoad'), 'err'); } catch (_) {} }
    u.archivedCount = capRes.archivedCount; u.archiveRows = null; /* #53 — сброс: спойлер перезагрузит по раскрытию */
    if (sel && sel.isActive && !rec) {
      _carryForward(deps, function (carry) { u.carry = carry; deps.state.setCapacityUiState(u); render(deps); });
    } else { u.carry = null; deps.state.setCapacityUiState(u); render(deps); }
  }).catch(function (e) { deps.diag('capacity loadAndRender err: ' + e, 'err'); deps.toast(deps.T('errCapacityLoad'), 'err'); render(deps); });
}

const api = {
  render: render,
  loadAndRender: loadAndRender,
};

if (typeof window !== 'undefined') {
  try { window.__SSP_CAPACITY_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
