/**
 * data-loaders.js — загрузчики данных проекта (Фаза 5 слайс 12, домен E6 —
 * первый выносимый подкластер init/bootstrap). Мост window.__SSP_DATA_LOADERS.
 *
 * Leaf-загрузчики: REST (apiGet / _host.fetchYouTrack) → стейт-vars ядра. Сами
 * порядок старта НЕ держат — их дёргает оркестровка (_loadAndRenderProject /
 * _renderProjectSettingsPage / _switchToProject / bindClearDraftHandlers),
 * которая остаётся в ядре (будущий core.js):
 *   • loadMe — fetchYouTrack('users/me') → _currentUser; catch → {login:'unknown'};
 *   • loadProjectFields — apiGet('project-fields') → _projectFields + projectName
 *     (кэш _projectDisplayName + _updateProjectNameLabel + _ytBaseFromProject);
 *   • loadProjectGroups — fetchYouTrack('groups') → _projectGroups (фильтр no-id,
 *     name-trim с fallback на id); reject → []. Справочник имён групп для баннеров;
 *   • _refreshFeatureStatusBar — 6 chip'ов #widgetStatusBar по флагам _settings
 *     (зов после load _settings и после applyI18N);
 *   • loadAllData — apiGet('sprint-data') → _settings/_sprint/_roleItems/
 *     _enableDebugLog (defensive-миграция статусов/inclusion, url-репэйр /null/ →
 *     _ytBase, strip item.sprintId, синтез пустого _sprint через uid, legacy
 *     items[] → _roleItems.analysis, orphanGanttIssues), затем apiGet('history')
 *     → _history (миграция + orphanGanttBySprintId), затем working-drafts
 *     (reconcile/gc/migrateEditing-хвост).
 *
 * Паттерн (слайсы 2–11): deps-фабрика per-call (_loadersDeps в монолите). Стейт
 * (_currentUser/_projectFields/_projectDisplayName/_projectGroups/_settings/
 * _sprint/_roleItems/_history/_enableDebugLog + читаемые _host/_ytBase) ОСТАЁТСЯ
 * в стейт-ядре за get/set-аксессорами deps.state. Cross-кластерные хуки
 * (syncProjectDefaultLang/refreshFeatureStatusBar/applyDiagLogVisibility/
 * draft-store-хвост/migrate*) — через deps (роутятся через core-делегаторы →
 * golden-стабы их перехватывают). Делегаторы выживают у всех 5 (внешние callers:
 * loadProjectGroups/refreshFeatureStatusBar → settings-controller; остальные →
 * init/bind-оркестровка ядра).
 *
 * Контракты — data-loaders.golden.test.js (через делегаторы + стаб apiGet/_host).
 */
(function () {
  'use strict';

  /* ── loadMe — текущий пользователь (user-scoped, один раз на init) ── */
  function loadMe(deps) {
    return deps.state.getHost().fetchYouTrack('users/me', { query: { fields: 'id,login,fullName' } })
      .then(function (u) { deps.state.setCurrentUser(u); deps.diag('me=' + (u && u.login ? u.login : '?'), 'ok'); })
      .catch(function (e) { deps.state.setCurrentUser({ login: 'unknown' }); deps.diag('me ERR: ' + String(e), 'err'); });
  }

  /* ── loadProjectFields — кастомные поля проекта + имя проекта ── */
  function loadProjectFields(deps) {
    return deps.apiGet('project-fields').then(function (r) {
      if (r && r.success) {
        var fields = r.fields || [];
        deps.state.setProjectFields(fields);
        deps.diag('Fields loaded: ' + fields.length, 'ok');
        if (r.projectName) {
          /* v1.4.1 — всегда обновляем кэш и пере-применяем helper, чтобы
             projectNameLabel корректно перерисовывался при последующих setLang(). */
          deps.state.setProjectDisplayName(r.projectName);
          deps.updateProjectNameLabel();
        }
        deps.ytBaseFromProject();
      }
    }).catch(function () {});
  }

  /* ── loadProjectGroups — справочник групп (для баннеров прав / настроек) ── */
  function loadProjectGroups(deps) {
    return deps.state.getHost().fetchYouTrack('groups', {
      query: { fields: 'id,name', $top: 5000 }
    }).then(function (g) {
      var raw = Array.isArray(g) ? g : [];
      var groups = raw
        .filter(function (gr) { return !!gr.id; })
        .map(function (gr) {
          var name = (gr.name && gr.name.trim()) ? gr.name.trim() : gr.id;
          return { id: gr.id, name: name };
        });
      deps.state.setProjectGroups(groups);
      deps.diag('Groups loaded: ' + groups.length, 'ok');
      // v5.0: рендер multi-select групп выполняется в виджете настроек.
      // _projectGroups держится только как справочник для отображения имён групп.
    }).catch(function (e) { deps.state.setProjectGroups([]); deps.diag('Groups ERR: ' + String(e), 'err'); });
  }

  /* ── _refreshFeatureStatusBar — статус-бар активных функциональных модулей
     (зелёная/красная точка + локализованный on/off для 6 chip'ов). Вызывается
     после каждого обновления _settings (initial load, save) и после applyI18N. ── */
  function _refreshFeatureStatusBar(deps) {
    var bar = document.getElementById('widgetStatusBar');
    if (!bar) return;
    var T = deps.T;
    /* Если _settings ещё не загружено (init не закончен) — оставляем все
       chip'ы в нейтральном состоянии. */
    var s = deps.state.getSettings() || {};
    var modules = [
      { id: 'ssbInline',   on: !!s.dynEditEnabled },
      { id: 'ssbPersonal', on: !!s.personalPlanningEnabled },
      { id: 'ssbDta',         on: !!s.dtaEnabled },
      { id: 'ssbCascade',     on: !!s.cascadeAggregationEnabled },
      { id: 'ssbStateRollup', on: !!s.stateRollupEnabled }, /* v1.7.0 D128 */
      { id: 'ssbOverlimit', on: !!s.allowOverlimitPlanning } /* #38 */
    ];
    modules.forEach(function (m) {
      var el = document.getElementById(m.id);
      if (!el) return;
      el.classList.toggle('ssb-on',  m.on);
      el.classList.toggle('ssb-off', !m.on);
      var stateEl = el.querySelector('.ssb-chip__state');
      if (stateEl) {
        var key = m.on ? 'ssbOn' : 'ssbOff';
        stateEl.setAttribute('data-i18n', key);
        stateEl.textContent = T(key);
      }
    });
  }

  /* ── loadAllData — основной батч данных проекта (sprint-data → history →
     working-drafts). Defensive-миграция дублирует backend-нормализацию как
     защиту от стэйла кэшей. ── */
  function loadAllData(deps) {
    var st = deps.state;
    return deps.apiGet('sprint-data').then(function (r) {
      if (r && r.success) {
        st.setSettings(r.settings || null);
        /* v1.1.0 — после загрузки _settings подтянуть project-default язык в loader. */
        deps.syncProjectDefaultLang();
        /* v1.3.1 — обновить status-bar активных модулей сразу после load. */
        deps.refreshFeatureStatusBar();
        st.setSprint(r.sprint || null);
        // roleItems хранится в r.roleItems (новый формат)
        if (r.roleItems) {
          st.setRoleItems(r.roleItems);
        } else if (r.items && Array.isArray(r.items)) {
          // Обратная совместимость: все items попадают в 'analysis' (первая роль)
          st.setRoleItems({ analysis: r.items });
        } else {
          st.setRoleItems({});
        }
        /* v5.0.3 диагностика — структура _roleItems после load */
        try {
          var ri = st.getRoleItems();
          var sp0 = st.getSprint();
          var rkSummary = Object.keys(ri).map(function (rk) {
            return rk + '=' + (ri[rk] ? ri[rk].length : 'null');
          }).join(', ');
          deps.diag('loadAllData: _sprint=' + (sp0 ? sp0.sprintId : 'null') + ' _roleItems={' + rkSummary + '}', 'info');
        } catch (_) {}
        if (!st.getSprint()) {
          st.setSprint({ sprintId: deps.uid(), dateStart: null, dateEnd: null, status: deps.STATUS.PLANNING });
        }
        // v5.0 — defensive миграция статусов и inclusion-статусов:
        // backend нормализует на чтении, но мы дублируем как защиту от стэйла кэшей.
        var sp = st.getSprint();
        if (sp.status) sp.status = deps.migrateStatus(sp.status);
        var ytBase = st.getYtBase();
        var roleItems = st.getRoleItems();
        deps.ALL_ROLES.forEach(function (role) {
          var items = roleItems[role.key] || [];
          items.forEach(function (item) {
            if (item.inclusionStatus) item.inclusionStatus = deps.migrateInc(item.inclusionStatus);
            if (!item.url || item.url.indexOf('/null/') >= 0 || item.url.indexOf('/undefined/') >= 0) {
              item.url = ytBase + '/issue/' + item.issueId;
            }
            /* v5.0.3 — defensive: strip sprintId, который раньше клиент клал на items.
               backend `ALLOWED_ITEM_KEYS` не содержит этот ключ → следующий POST бы валился. */
            if (item.sprintId !== undefined) delete item.sprintId;
          });
        });
        st.setEnableDebugLog(!!(r.enableDebugLog));
        /* v5.9.0 — D59: backend централизованно вычисляет orphan-задачи и кладёт
           массив issueId в r.orphanGanttIssues; баннер рендерится через _renderOrphanGanttBanner. */
        if (sp && Array.isArray(r.orphanGanttIssues) && r.orphanGanttIssues.length) {
          sp._orphanGanttIssues = r.orphanGanttIssues;
        }
        /* v5.0.3 — diag panel ВСЕГДА видна (collapsed по умолчанию). */
        var diagWrap = document.getElementById('diagWrap');
        if (diagWrap) diagWrap.style.display = '';
        try { deps.applyDiagLogVisibility(); } catch (_) {}
        deps.diag('Data loaded. settings=' + (!!st.getSettings()) + ' debugLog=' + st.getEnableDebugLog(), 'ok');
      }
    }).then(function () {
      return deps.apiGet('history').then(function (r) {
        if (r && r.success) {
          var hist = (r.history || []).sort(function (a, b) { return (b.confirmedAt || 0) - (a.confirmedAt || 0); });
          st.setHistory(hist);
          // v5.0 — defensive миграция истории
          var ogMap = (r.orphanGanttBySprintId && typeof r.orphanGanttBySprintId === 'object')
                      ? r.orphanGanttBySprintId : null;
          hist.forEach(function (rec) {
            if (rec.status) rec.status = deps.migrateStatus(rec.status);
            if (Array.isArray(rec.items)) {
              rec.items.forEach(function (it) {
                if (it.inclusionStatus) it.inclusionStatus = deps.migrateInc(it.inclusionStatus);
              });
            }
            /* v5.9.0 — D59: per-snapshot orphan-флаг из backend response. */
            if (ogMap && rec && rec.sprintId && Array.isArray(ogMap[rec.sprintId]) && ogMap[rec.sprintId].length) {
              rec._orphanGanttIssues = ogMap[rec.sprintId];
            }
          });
          /* #49 — канонизация personalPlanning: (1) backfill канона из legacy keyed-кэша
             _sprint.personalPlanning (роли с пустым/отсутствующим каноном), затем
             (2) нормализовать кэш в derived keyed-map из канона. После этого
             `_sprint.personalPlanning` — лишь serialization-зеркало (getPP читает только канон). */
          try {
            var spPP = st.getSprint();
            if (spPP && spPP.sprintId && typeof deps.buildPPMapFromCanon === 'function') {
              deps.backfillCanonFromSprintPP(spPP, hist, deps.deepClone);
              spPP.personalPlanning = deps.buildPPMapFromCanon(spPP.sprintId, hist, deps.deepClone);
            }
          } catch (e) { deps.diag('loadAllData: pp-canon normalize failed: ' + e, 'err'); }
        }
      });
    }).then(function () {
      /* v5.3.0 — параллельно с историей: working copies (immutable snapshots model). */
      return deps.workingDraftsLoadFromBackend().then(function () {
        /* После загрузки и _history, и _workingDrafts — выровнять флаги hasWorkingCopy
           и удалить orphan/stale (>30 дней) drafts. Идёт ДО миграции v5.2→v5.3. */
        try { deps.reconcileHasWorkingCopyFlag(); } catch (e) { deps.diag('reconcile failed: ' + e, 'err'); }
        try { deps.gcWorkingDrafts(); }            catch (e) { deps.diag('gc failed: ' + e, 'err'); }
        try { deps.migrateEditingFromHistoryV52(); } catch (e) { deps.diag('v5.2 migration failed: ' + e, 'err'); }
      });
    }).catch(function (e) { deps.diag('loadAllData ERR: ' + e, 'err'); });
  }

  var api = {
    loadMe: loadMe,
    loadProjectFields: loadProjectFields,
    loadProjectGroups: loadProjectGroups,
    _refreshFeatureStatusBar: _refreshFeatureStatusBar,
    loadAllData: loadAllData,
  };
  if (typeof window !== 'undefined') window.__SSP_DATA_LOADERS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
