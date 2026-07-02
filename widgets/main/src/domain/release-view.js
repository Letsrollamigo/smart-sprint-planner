/* release-view.js — #48 вкладки «Релиз-менеджмент» (планируемые / история релизов).
   Domain-модуль (ADR-001): грузит список релизов из backend в RELEASE_STORE, строит view-model
   и монтирует React Ring-презентацию через мост window.__SSP_RELEASE_MOUNT.mountAt(host, vm)
   (канон capacity-view). Рендер/разметка — react/release-view.jsx (строго Ring UI, CLAUDE_SHARED §3).

   STATELESS (C1): только function/const; стейт RM — в release-store.js (deps.state.release.*).
   Star-topology (B1): чужих domain-мостов не зовёт — всё (T/apiGet/onCreate) из deps.

   Точки: loadAndRender(deps, mode) async (apiGet('releases') → RELEASE_STORE → render);
   render(deps, mode) sync (VM из готового стора → mountAt) — из click-handler вкладки и
   _doFullRerender (смена языка). mode: 'planned' | 'history'. */
'use strict';

function _mountBridge() { return (typeof window !== 'undefined' && window.__SSP_RELEASE_MOUNT) || null; }

function _hostId(mode) { return mode === 'history' ? 'tab-release-history' : 'tab-release-planned'; }

/* Разбивка по узлу: терминальные статусы (выпущен/отменён) → «История», прочие → «Планируемые». */
function _filter(releases, mode) {
  var terminal = { released: 1, cancelled: 1 };
  return (releases || []).filter(function (r) {
    var isTerminal = !!(r && terminal[r.status]);
    return mode === 'history' ? isTerminal : !isTerminal;
  });
}

function _z(n) { return n < 10 ? '0' + n : '' + n; }
/* epoch-ms (UTC-полночь, как пишет release-controller _ymdToMs) → DD.MM.YYYY | ''. */
function _fmtDate(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) return '';
  var d = new Date(ms);
  return _z(d.getUTCDate()) + '.' + _z(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
}
/* Момент закрытия (реальный timestamp, не date-only) → DD.MM.YYYY HH:MM в локальном tz | ''. */
function _fmtDateTime(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) return '';
  var d = new Date(ms);
  return _z(d.getDate()) + '.' + _z(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + _z(d.getHours()) + ':' + _z(d.getMinutes());
}

/* R3.1 — зона готовности задачи АВТОМАТОМ по State + маппингу (ревизия владельца 2026-07-01,
   БЕЗ своего поля готовности): 🟢 State.isResolved · 🔴 State == mapping['planned'] (стартовый
   якорь) && !resolved · 🟡 прочее (в работе) · ⚪ нет State. Сравнение — КАНОНИЧЕСКОЕ имя
   (канон _cfState). Pure, test-exported. */
function computeZone(state, resolved, anchor) {
  if (!state) return 'grey';
  if (resolved) return 'green';
  if (anchor && state === anchor) return 'red';
  return 'yellow';
}

/* Стартовый якорь светофора = целевое State статуса «Запланирован» из маппинга (двойная роль
   маппинга: R2 пишет State + R3 якорит красную зону). Пусто → красная зона не детектится. */
function _anchorState(s) {
  var m = (s && s.releaseStatusStateMapping) || {};
  return (typeof m.planned === 'string' && m.planned) || '';
}

/* Счётчики зон по составу: issueIds + карта данных задач → {green,yellow,red,grey}. */
function _countZones(issueIds, data, anchor) {
  var c = { green: 0, yellow: 0, red: 0, grey: 0 };
  (issueIds || []).forEach(function (id) {
    var d = data[id];
    c[d ? computeZone(d.state, d.resolved, anchor) : 'grey']++;
  });
  return c;
}

/* R3.2 — items → строки дерева состава через pure-мост (leaf-слой, легально B1).
   Мост недоступен (deps-friendly деградация) → плоские строки без иерархии. */
function _treeRows(items) {
  var TP = (typeof window !== 'undefined' && window.__SSP_RELEASE_TREE_PURE) || null;
  if (TP && typeof TP.buildReleaseTree === 'function') return TP.buildReleaseTree(items);
  return {
    rows: (items || []).map(function (it) {
      return { id: it.id, summary: it.summary || '', state: it.state || '', zone: it.zone || 'grey', type: it.type || '', depth: 0, hasChildren: false, ancestors: [], orphan: false, agg: null };
    }),
    hasHierarchy: false,
  };
}

/* Полный набор подписей вкладок релизов (планируемые + история) — общий для обоих VM. */
function _labels(T) {
  return {
    readinessTitle: T('relReadinessTitle'),
    zone: { green: T('relZoneGreen'), yellow: T('relZoneYellow'), red: T('relZoneRed'), grey: T('relZoneGrey') },
    treeOrphans: T('relTreeOrphans'), treeAggPrefix: T('relTreeAggPrefix'), treeAggTasks: T('relTreeAggTasks'), // R3.2 — дерево состава
    create: T('relBtnCreate'), addIssues: T('relCardAddIssues'), edit: T('relActEdit'), delete: T('relActDelete'), statusChange: T('relStatusChange'),
    updateStates: T('relCardUpdateStates'),
    freeze: T('relActFreeze'), unfreeze: T('relActUnfreeze'), frozenBadge: T('relFrozenBadge'),
    emptyTitle: T('relEmptyTitle'), emptyHint: T('relEmptyHint'), historyTitle: T('relNodeHistory'),
    planDate: T('relFieldPlanDate'), freezeDate: T('relFieldFreezeDate'), manager: T('relFieldManager'), engineer: T('relFieldEngineer'),
    closedAt: T('relHistClosedAt'), composition: T('relSnapComposition'), wasOverdue: T('relWasOverdue'),
    status: { planned: T('relStatusPlanned'), prep: T('relStatusPrep'), work: T('relStatusWork'), released: T('relStatusReleased'), cancelled: T('relStatusCancelled'), overdue: T('relStatusOverdue') },
    kind: { release: T('relKindRelease'), hotfix: T('relKindHotfix') },
    src: { internal: T('relSrcInternal'), vendor: T('relSrcVendor') },
    /* R4: экспорт .txt (US-R4-01) + архив (US-R4-02) + share (US-R4-03, reuse treeShare) +
       патчноут/заметки в истории (полировка; reuse подписей формы). */
    export: T('relBtnExport'), share: T('treeShare'), archiveNode: T('relArchiveNode'),
    kindLabel: T('relKindLabel'), srcLabel: T('relSrcLabel'),
    patchNote: T('relFieldPatchnote'), notes: T('relFieldNotes'),
  };
}

/* ── R4 (US-R4-01) — экспорт релиза в .txt ─────────────────────────────────────
   Pure-сборка контента (детерминирована при фикс. record+labels — golden):
   название / тип ОБОИМИ измерениями (консистентно чипам истории, §8) / даты /
   патчноут / заметки. Скачивание — Blob+a[download] (канон диаг-лога core.js). */
function buildExportText(rec, labels) {
  var L = labels || {};
  var title = String(rec.name || rec.id || '');
  var out = [title, new Array(title.length + 1).join('=')];
  var type = [];
  if (rec.kind) type.push((L.kindLabel || 'Kind') + ': ' + ((L.kind && L.kind[rec.kind]) || rec.kind));
  if (rec.source) type.push((L.srcLabel || 'Source') + ': ' + ((L.src && L.src[rec.source]) || rec.source));
  if (type.length) out.push(type.join(' · '));
  if (typeof rec.plannedDate === 'number' && isFinite(rec.plannedDate)) out.push((L.planDate || 'Date') + ': ' + _fmtDate(rec.plannedDate));
  var snap = (rec.snapshot && typeof rec.snapshot === 'object') ? rec.snapshot : null;
  if (snap && typeof snap.closedAt === 'number') out.push((L.closedAt || 'Closed') + ': ' + _fmtDateTime(snap.closedAt));
  if (rec.patchNote) { out.push('', (L.patchNote || 'Patch note') + ':', String(rec.patchNote)); }
  if (rec.notes) { out.push('', (L.notes || 'Notes') + ':', String(rec.notes)); }
  return out.join('\n') + '\n';
}

function _downloadTxt(fileName, text) {
  try {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (_) {} }, 500);
    return true;
  } catch (_) { return false; }
}

/* Запись по id среди активных + загруженного архива (экспорт доступен из обоих списков). */
function _findRelease(deps, releaseId) {
  var rel = deps.state.release;
  var lists = [rel.getReleases() || [], (rel.getArchive && rel.getArchive()) || []];
  for (var li = 0; li < lists.length; li++) {
    for (var i = 0; i < lists[li].length; i++) {
      if (lists[li][i] && lists[li][i].id === releaseId) return lists[li][i];
    }
  }
  return null;
}

function exportRelease(deps, releaseId) {
  var rec = _findRelease(deps, releaseId);
  if (!rec) return;
  var text = buildExportText(rec, _labels(deps.T));
  var stem = String(rec.name || rec.id).replace(/[\\/:*?"<>|\s]+/g, '_');
  if (!_downloadTxt('release-' + stem + '.txt', text)) {
    deps.diag('release export download failed', 'err');
    deps.toast(deps.T('relPickerLoadError'), 'err');
  }
}

/* ── R4 (US-R4-03, E-2) — гейт «Поделиться» вендорского ────────────────────────
   Обязателен только п.1 (compat-якорь): на YT 2025.x кнопки НЕТ — host-API ВНЕШНЕЙ
   ссылки не существует (host.navigation НЕ признак: он есть и в 2025.x global-режиме,
   а внешнюю ссылку не отдаёт — гейт по нему засветил бы кнопку). Генерация [deferred]
   до YT 2026.1 (reuse #36). */
var _RELEASE_EXT_SHARE = false; // ponytail: появится 2026.1 host-API внешних ссылок → заменить на capability-детект (канон _navAvailable share-controller)
function canShareRelease(release, extShareAvailable) {
  return !!extShareAvailable && !!release && release.source === 'vendor';
}

/* R4 (US-R4-02) — lazy-загрузка архива по первому раскрытию спойлера «Архив (N)». */
function _loadArchive(deps) {
  deps.apiGet('releases-archive').then(function (r) {
    deps.state.release.setArchive((r && Array.isArray(r.releases)) ? r.releases : []);
    render(deps, 'history');
  }).catch(function (e) {
    deps.diag('release archive load err: ' + e, 'err');
    deps.toast(deps.T('relPickerLoadError'), 'err');
  });
}

function _buildVm(deps, mode, list) {
  var T = deps.T;
  /* «Просрочен» = плановая ДАТА строго раньше сегодняшней (сравнение UTC-дат, не timestamp'ов:
     plannedDate = UTC-полночь, поэтому релиз на сегодня НЕ просрочен весь свой день). */
  var _n = new Date();
  var todayUtc = Date.UTC(_n.getUTCFullYear(), _n.getUTCMonth(), _n.getUTCDate());
  /* R2.4 — гранулярный гейтинг контролов серверными правами (GET /releases → perms):
     canManage (РМ) — создание/правка/удаление/состав/фриз; canAdvance (РМ|РИ) — статус +
     обновление состояний. Наблюдатель — read-only. Deny-by-default до ответа сервера. */
  var perms = (deps.state.release.getPerms && deps.state.release.getPerms()) || {};
  var data = deps.state.release.getIssueData() || {};
  var repNames = deps.state.release.getRepNames() || {};
  var anchor = _anchorState(deps.state.getSettings ? deps.state.getSettings() : null); // R3.1 — якорь красной зоны
  return {
    mode: mode, versionTag: 0, canCreate: !!perms.canManage, canManage: !!perms.canManage, canAdvance: !!perms.canAdvance,
    releases: list.map(function (r) {
      var terminal = (r.status === 'released' || r.status === 'cancelled');
      var overdue = !terminal && typeof r.plannedDate === 'number' && r.plannedDate < todayUtc;
      var reps = r.roleReps || {};
      var issueList = r.issues || [];
      return {
        id: r.id, name: r.name || r.id, kind: r.kind, source: r.source, status: r.status || 'planned',
        overdue: overdue, freezeLocked: !!r.freezeLocked,
        planDateLabel: _fmtDate(r.plannedDate), freezeDateLabel: _fmtDate(r.freezeDate),
        manager: reps.manager || '', managerName: repNames[reps.manager] || '',
        engineer: reps.engineer || '', engineerName: repNames[reps.engineer] || '',
        issuesCount: issueList.length, compositionLabel: T('relCardComposition').replace('{n}', String(issueList.length)),
        patchNote: r.patchNote || '', // R4-ревью владельца: патчноут виден и на планируемой карточке (заметки — только в ✎)
        shareVisible: canShareRelease(r, _RELEASE_EXT_SHARE), // R4 (US-R4-03) — negative-якорь: false до YT 2026.1

        /* R3.2 — live-дерево состава из _issueData (parents/type подтянуты fetchIssueData) */
        tree: _treeRows(issueList.map(function (id) {
          var d = data[id] || {};
          return { id: id, summary: d.summary || '', state: d.state || '', type: d.type || '', parents: d.parents || [], zone: computeZone(d.state, d.resolved, anchor) };
        })),
        readiness: _countZones(issueList, data, anchor), // R3.1 — live-светофор (до фетча данных всё grey)
      };
    }),
    labels: _labels(T),
    onCreate: function () { if (typeof deps.onCreate === 'function') deps.onCreate(); },
    onAddIssues: function (releaseId) { if (typeof deps.onAddIssues === 'function') deps.onAddIssues(releaseId); },
    onEdit: function (releaseId) { if (typeof deps.onEdit === 'function') deps.onEdit(releaseId); },
    onStatusMenu: function (releaseId) { if (typeof deps.onStatusMenu === 'function') deps.onStatusMenu(releaseId); },
    onStatePreview: function (releaseId) { if (typeof deps.onStatePreview === 'function') deps.onStatePreview(releaseId); },
    onToggleFreeze: function (releaseId) { if (typeof deps.onToggleFreeze === 'function') deps.onToggleFreeze(releaseId); },
    onDelete: function (releaseId) { if (typeof deps.onDelete === 'function') deps.onDelete(releaseId); },
    onExport: function (releaseId) { exportRelease(deps, releaseId); },                     // R4 (US-R4-01)
    onShare: function () { deps.diag('release share: deferred until YT 2026.1', 'info'); }, // R4 (US-R4-03 п.2)
  };
}

/* Строка истории из записи — общая для history-вкладки и архива (R4). Всё из r.snapshot,
   БЕЗ обращений к YT (US-R1-14 — network-clean). Легаси-запись без snapshot
   (hasSnapshot=false) → рисуется только шапка. read-only. */
function _histRow(r) {
  var snap = (r.snapshot && typeof r.snapshot === 'object') ? r.snapshot : null;
  var reps = (snap && snap.reps) || {};
  var rows = (snap && Array.isArray(snap.issues)) ? snap.issues : [];
  return {
    id: r.id, name: r.name || r.id, kind: r.kind, source: r.source, status: r.status || 'released',
    planDateLabel: _fmtDate(r.plannedDate),
    closedAtLabel: snap ? _fmtDateTime(snap.closedAt) : '',
    issuesCount: rows.length,
    managerName: (reps.manager && reps.manager.name) || '',
    engineerName: (reps.engineer && reps.engineer.name) || '',
    wasOverdue: !!(snap && snap.wasOverdue),
    hasSnapshot: !!snap,
    patchNote: r.patchNote || '', notes: r.notes || '', // R4 полировка — текст в спойлере (заморожен закрытием: терминальные не редактируются)
    /* R3.1 (US-R3-03) — светофор истории ИЗ СЛЕПКА (network-clean US-R1-14); легаси-слепки
       pre-R3 несут honest-заглушку (всё grey) — рисуем как есть. */
    readiness: (snap && snap.readiness && typeof snap.readiness === 'object') ? snap.readiness : null,
    /* R3.2 — frozen-дерево из parentId слепка; легаси без parentId → плоско (hasHierarchy=false) */
    tree: _treeRows(rows.map(function (t) {
      return { id: t.idReadable || t.issueId || '', summary: t.summary || '', state: t.state || '', zone: t.zone || 'grey', type: t.type || '', parents: t.parentId ? [t.parentId] : [] };
    })),
  };
}

/* VM истории (R1.5b; R4 — + архив US-R4-02 и экспорт US-R4-01). */
function _buildHistoryVm(deps, mode, list) {
  var T = deps.T;
  var rel = deps.state.release;
  var archive = (rel.getArchive && rel.getArchive()) || null; // null → ещё не загружен (lazy)
  return {
    mode: 'history', versionTag: 0, canCreate: false, canManage: false, canAdvance: false,
    releases: list.map(_histRow),
    archive: {
      count: (rel.getArchivedCount && rel.getArchivedCount()) || 0,
      loaded: Array.isArray(archive),
      rows: Array.isArray(archive) ? archive.map(_histRow) : [],
    },
    onLoadArchive: function () { _loadArchive(deps); },
    onExport: function (releaseId) { exportRelease(deps, releaseId); },
    labels: _labels(T),
  };
}

function render(deps, mode) {
  var host = document.getElementById(_hostId(mode));
  var mount = _mountBridge();
  if (!host || !mount) return;
  var list = _filter(deps.state.release.getReleases(), mode);
  var vm = (mode === 'history' ? _buildHistoryVm : _buildVm)(deps, mode, list);
  mount.mountAt(host, vm);
}

/* R2.3 — значение State задачи из customFields (извлечение — канон release-pick._cfVal;
   имя поля из настроек с фолбэком на дефолтные имена бандла). ⚠ Приоритет — КАНОНИЧЕСКОЕ
   v.name (НЕ localizedName, в отличие от display-логики пикера): маппинг настроек и бандл
   field-values хранят канонические имена — сравнение с localizedName давало ложный
   «рассинхрон» на локализованных стендах (пойман live-смоуком R2.3). */
function _cfState(iss, stateNames) {
  var cfs = iss.customFields || [];
  for (var ni = 0; ni < stateNames.length; ni++) {
    for (var ci = 0; ci < cfs.length; ci++) {
      var cf = cfs[ci];
      var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
      if (fn === stateNames[ni] && cf.value != null) {
        var v = cf.value;
        if (typeof v === 'string') return { state: v, resolved: false };
        return { state: v.name || v.localizedName || v.presentation || null, resolved: !!v.isResolved }; // R3.1 — isResolved (StateBundleElement)
      }
    }
  }
  return null;
}

/* R3.2 — тип задачи (бейдж родителя в дереве) из customFields по канону _cfState:
   каноническое v.name; имя поля — настройка fieldType с фолбэком (канон backlog-loader). */
function _cfType(iss, typeNames) {
  var cfs = iss.customFields || [];
  for (var ni = 0; ni < typeNames.length; ni++) {
    for (var ci = 0; ci < cfs.length; ci++) {
      var cf = cfs[ci];
      var fn = (cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name) || cf.name || '';
      if (fn === typeNames[ni] && cf.value != null) {
        var v = cf.value;
        return (typeof v === 'string') ? v : (v.name || v.localizedName || v.presentation || '');
      }
    }
  }
  return '';
}

/* R3.2 — родители задачи из links: linkType Subtask, direction INWARD (issue = target,
   «subtask of» → issues = родители; сверено REST стенда 2026-07-02). Массив: у задачи
   может быть НЕСКОЛЬКО родителей — какой в составе, решает tree-билдер. */
function _linkParents(iss) {
  var out = [];
  (iss.links || []).forEach(function (l) {
    if (!l || l.direction !== 'INWARD' || !l.linkType || l.linkType.name !== 'Subtask') return;
    (l.issues || []).forEach(function (p) { if (p && p.idReadable) out.push(p.idReadable); });
  });
  return out;
}

/* R2.3/R3.1/R3.2 — батч-фетч данных задач (summary + ТЕКУЩЕЕ State + isResolved + тип +
   Subtask-родители) → {id: {summary, state, resolved, type, parents}}. Чанки по 50,
   query 'issue id: X, Y' (канон refresh-controller); ошибка чанка → пропуск (частичные
   данные, риск §10). Потребители: карточка планируемого (титулы+светофор+дерево R3.2),
   предпросмотр состояний, buildSnapshot. */
function fetchIssueData(deps, issueIds) {
  var host = deps.state.getHost();
  var s = deps.state.getSettings() || {};
  var stateNames = s.fieldState ? [s.fieldState, 'State', 'Состояние'] : ['State', 'Состояние'];
  var typeNames = s.fieldType ? [s.fieldType, 'Type', 'Тип'] : ['Type', 'Тип'];
  var seen = Object.create(null), list = [];
  (issueIds || []).forEach(function (id) { if (id && !seen[id]) { seen[id] = 1; list.push(id); } });
  if (!host || !list.length) return Promise.resolve({});
  var chunks = []; for (var i = 0; i < list.length; i += 50) chunks.push(list.slice(i, i + 50));
  var fields = 'idReadable,summary,customFields(name,projectCustomField(field(name)),value(name,localizedName,presentation,isResolved)),links(direction,linkType(name),issues(idReadable))';
  var map = {};
  return Promise.all(chunks.map(function (chunk) {
    return host.fetchYouTrack('issues', { query: { fields: fields, query: 'issue id: ' + chunk.join(', '), $top: chunk.length } })
      .then(function (issues) {
        (issues || []).forEach(function (it) {
          if (!it.idReadable) return;
          var st = _cfState(it, stateNames);
          map[it.idReadable] = {
            summary: (it.summary || '').trim(), state: (st && st.state) || '', resolved: !!(st && st.resolved),
            type: _cfType(it, typeNames), parents: _linkParents(it),
          };
        });
      })
      .catch(function () {});
  })).then(function () { return map; });
}

/* Резолвер login→fullName представителей (roleReps хранит login). Per-login поиск
   `users?query=<login>` + exact-match фильтр (canon _fetchTitles; user-query — search, не id-list). */
function _fetchRepNames(deps, releases) {
  var host = deps.state.getHost();
  var seen = Object.create(null), logins = [];
  (releases || []).forEach(function (r) {
    var reps = (r && r.roleReps) || {};
    ['manager', 'engineer'].forEach(function (k) { var lg = reps[k]; if (lg && !seen[lg]) { seen[lg] = 1; logins.push(lg); } });
  });
  if (!host || !logins.length) return Promise.resolve({});
  var map = {};
  return Promise.all(logins.map(function (login) {
    return host.fetchYouTrack('users', { query: { fields: 'login,fullName', query: login, $top: 20 } })
      .then(function (users) { (users || []).forEach(function (u) { if (u && u.login === login && u.fullName) map[login] = u.fullName; }); })
      .catch(function () {});
  })).then(function () { return map; });
}

/* UTC-полночь дня timestamp'а (сравнение плановой date-only даты с моментом закрытия). */
function _utcMidnight(ms) { var d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }

/* Pure-сборка shape слепка из уже загруженных данных задач — детерминирована, тестируется
   без браузера (R1.5c). issueData: idReadable → {summary,state,resolved,type,parents};
   repNames: login → fullName; closedAtMs — момент закрытия; anchor — State-якорь красной
   зоны (R3.1, US-R3-03: зоны и readiness замораживаются в слепке). R3.2 — структура дерева
   тоже замораживается: parentId = первый родитель В СОСТАВЕ (null — корень/orphan) + type;
   ключи additive (легаси-слепки без них история рисует плоско). */
function assembleSnapshot(release, issueData, repNames, closedAtMs, anchor) {
  var r = release || {}, reps = r.roleReps || {};
  var idata = issueData || {}, rnames = repNames || {};
  var inSet = Object.create(null);
  (Array.isArray(r.issues) ? r.issues : []).forEach(function (id) { inSet[id] = 1; });
  var issues = (Array.isArray(r.issues) ? r.issues : []).map(function (id) {
    var d = idata[id] || {};
    var parentId = null;
    (Array.isArray(d.parents) ? d.parents : []).some(function (p) {
      if (p !== id && inSet[p]) { parentId = p; return true; }
      return false;
    });
    return { issueId: id, idReadable: id, summary: d.summary || '', state: d.state || '', zone: computeZone(d.state, d.resolved, anchor), parentId: parentId, type: d.type || '' };
  });
  function rep(login) { return login ? { login: login, name: rnames[login] || login } : null; }
  var readiness = { green: 0, yellow: 0, red: 0, grey: 0 };
  issues.forEach(function (t) { readiness[t.zone]++; });
  return {
    issues: issues,
    reps: { manager: rep(reps.manager), engineer: rep(reps.engineer) },
    readiness: readiness,
    closedStatus: r.status || 'released',
    wasOverdue: !!(typeof r.plannedDate === 'number' && isFinite(r.plannedDate) && r.plannedDate < _utcMidnight(closedAtMs)),
    closedAt: closedAtMs,
  };
}

/* Async-обёртка (вызов из R2 на закрытии релиза): батч-fetch summary + ЖИВОГО State состава
   (fetchIssueData, R2.3 — закрыл зазор R2.1 «state=''»), graceful-пропуск упавшего чанка =
   частичный снимок (риск §10). Зоны/readiness — реальные, замораживаются (R3.1). → Promise<snapshot>. */
function buildSnapshot(deps, release, closedAtMs) {
  var atMs = (typeof closedAtMs === 'number') ? closedAtMs : Date.now();
  var repNames = (deps.state.release.getRepNames && deps.state.release.getRepNames()) || {};
  var anchor = _anchorState(deps.state.getSettings ? deps.state.getSettings() : null);
  return fetchIssueData(deps, (release && release.issues) || []).then(function (issueData) {
    return assembleSnapshot(release, issueData, repNames, atMs, anchor);
  }).catch(function () { return assembleSnapshot(release, {}, repNames, atMs, anchor); });
}

function loadAndRender(deps, mode) {
  render(deps, mode); // немедленный рендер из текущего стора (может быть пусто до ответа)
  deps.apiGet('releases').then(function (r) {
    var releases = (r && r.releases) ? r.releases : [];
    deps.state.release.setReleases(releases);
    if (deps.state.release.setPerms) deps.state.release.setPerms(r && r.perms); // R2.4 — права релиз-ролей с сервера
    if (deps.state.release.setArchivedCount) deps.state.release.setArchivedCount((r && r.archivedCount) || 0); // R4 — счётчик архива (US-R4-02)
    render(deps, mode);
    if (mode === 'history') return null; // история рисуется только из snapshot — YT-fetch не нужен (US-R1-14)
    var ids = []; releases.forEach(function (r) { (r.issues || []).forEach(function (id) { ids.push(id); }); });
    return Promise.all([fetchIssueData(deps, ids), _fetchRepNames(deps, releases)]); // данные состава (титулы+State+resolved для светофора R3.1) + имена представителей — вторым проходом
  }).then(function (res) {
    if (res) {
      if (res[0]) deps.state.release.setIssueData(res[0]);
      if (res[1]) deps.state.release.setRepNames(res[1]);
      render(deps, mode);
    }
  }).catch(function (e) {
    deps.diag('release loadAndRender err: ' + e, 'err');
    render(deps, mode);
  });
}

const api = { render: render, loadAndRender: loadAndRender, buildSnapshot: buildSnapshot, assembleSnapshot: assembleSnapshot, fetchIssueData: fetchIssueData, computeZone: computeZone, buildExportText: buildExportText, canShareRelease: canShareRelease };

if (typeof window !== 'undefined') {
  try { window.__SSP_RELEASE_VIEW = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
