'use strict';
// Tab-router — вкладки первого уровня, вынос из core.js (аудит 2026-07-12, R2/v3.4.0).
// Browser bridge: window.__SSP_TAB_ROUTER. Faithful extraction: тело клик-хендлера
// зеркалит IIFE-оригинал 1:1 modulo доступ к стейту ядра через deps (ядро передаёт
// live-значения геттерами — _mode/_settings/_planningLevel читаются В МОМЕНТ клика):
//   hideAllOverlays?               — скрыть overlay'и до переключения (v5.8.0 A.5 D56)
//   draftGet/draftSet              — ui-state в localStorage (v5.0.3)
//   getMode                        — 'global' | project — на момент клика
//   apiGet, diag, toast, t         — сервисы ядра
//   setHistory/renderHistory/renderWidgetHeader? — вкладка history (v5.4.0 ресинк шапки)
//   renderPlanningLevel            — диспетчер уровня (уровень замкнут в ядре, v5.5.0)
//   populateGanttRoleSel?/refreshGantt — вкладка gantt (rkG-резолв замкнут в ядре, D76)
//   hasBacklogZones/renderBacklog/loadBacklogPool/loadBacklogSchemaWarn — #21 слайс 3
//   capacityLoadAndRender          — #45 R3 (CAPACITY_VIEW замкнут в ядре — B1-топология)
//   releaseLoadAndRender(mode)     — #48 R1.2b (RELEASE_VIEW замкнут в ядре)
//   loadReportingView(contour)     — #50 S1c
// DOM-манипуляции (active-классы, planner-wide, dashnode-класс, подсветка дерева) —
// зона ответственности роутера, живут здесь.

function init(deps) {
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (typeof deps.hideAllOverlays === 'function') deps.hideAllOverlays();
      document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});
      document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});
      btn.classList.add('active');
      document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
      /* v5.6.0 — Этап 4: planner-wide на всё, что не settings-overlay. */
      document.body.classList.toggle('planner-wide',
        btn.dataset.tab === 'planning' || btn.dataset.tab === 'gantt' ||
        btn.dataset.tab === 'history'  || btn.dataset.tab === 'backlog'  ||
        btn.dataset.tab === 'capacity' ||
        btn.dataset.tab === 'release-planned' || btn.dataset.tab === 'release-history' ||
        btn.dataset.tab === 'reporting-a' || btn.dataset.tab === 'reporting-b');
      var ui = deps.draftGet('ui') || {}; ui.activeTab = btn.dataset.tab; deps.draftSet('ui', ui);
      /* #25 Ф2 Этап 3+4 — подсветка дерева + body-dashNode-класс (для tab=planning
         подсветку выставляет renderPlanningLevel по уровню). */
      if (deps.getMode() === 'global') {
        var _t = btn.dataset.tab;
        if (_t === 'gantt' || _t === 'history' || _t === 'backlog' || _t === 'capacity' ||
            _t === 'release-planned' || _t === 'release-history' ||
            _t === 'reporting-a' || _t === 'reporting-b') {
          document.body.className = document.body.className.replace(/\bssp-dashnode-\S+/g,'').replace(/\s+/g,' ').trim() + ' ssp-dashnode-' + _t;
          document.querySelectorAll('.ssp-tree [data-node]').forEach(function(n){ n.classList.toggle('active', n.dataset.node === _t); });
          try { var _ui2 = deps.draftGet('ui') || {}; _ui2.dashNode = _t; deps.draftSet('ui', _ui2); } catch(_){}
        }
      }
      var tabsHost = document.getElementById('sspTabsHost');
      if (tabsHost && tabsHost.dataset.selected !== btn.dataset.tab) { tabsHost.dataset.selected = btn.dataset.tab; }
      if (btn.dataset.tab === 'history') {
        deps.apiGet('history').then(function(r){
          if(r && r.history) {
            deps.setHistory(r.history);
            deps.renderHistory();
            /* v5.4.0 — ресинк шапки после reload истории */
            if (typeof deps.renderWidgetHeader === 'function') {
              try { deps.renderWidgetHeader(); } catch(_){}
            }
          }
        }).catch(function(e){ deps.diag('history reload err: '+String(e),'err'); });
      }
      if (btn.dataset.tab === 'planning') {
        try { deps.renderPlanningLevel(); }
        catch(e){ deps.diag('planning render err: '+e,'err'); }
      }
      /* v6.1.0 D76 — populate явно ПЕРЕД refresh (dropdown не пустой, даже если refresh бросит). */
      if (btn.dataset.tab === 'gantt') {
        try { if (typeof deps.populateGanttRoleSel === 'function') deps.populateGanttRoleSel(); }
        catch(e){ deps.diag('populateGanttRoleSel on tab switch err: '+e,'err'); }
        try { deps.refreshGantt(); }
        catch(e){ deps.diag('gantt render on tab switch err: '+e,'err'); }
      }
      /* #21 слайс 3 — transient-пул бэклога грузится при открытии вкладки. */
      if (btn.dataset.tab === 'backlog') {
        if (!deps.hasBacklogZones()) {
          deps.renderBacklog(); /* зоны не настроены → empty-баннер, без бесполезного fetch */
        } else {
          var blLoad = document.getElementById('backlogLoading');
          if (blLoad) blLoad.classList.remove('hidden');
          Promise.all([deps.loadBacklogPool(), deps.loadBacklogSchemaWarn()])
            .then(function(){ deps.renderBacklog(); })
            .catch(function(e){
              if (blLoad) blLoad.classList.add('hidden');
              deps.diag('backlog load err: '+e,'err');
              try { deps.toast(deps.t('backlogLoadErr'), 'err'); } catch(_){}
            });
        }
      }
      if (btn.dataset.tab === 'capacity') {
        try { deps.capacityLoadAndRender(); }
        catch(e){ deps.diag('capacity render err: '+e,'err'); }
      }
      if (btn.dataset.tab === 'release-planned' || btn.dataset.tab === 'release-history') {
        try { deps.releaseLoadAndRender(btn.dataset.tab === 'release-history' ? 'history' : 'planned'); }
        catch(e){ deps.diag('release render err: '+e,'err'); }
      }
      if (btn.dataset.tab === 'reporting-a' || btn.dataset.tab === 'reporting-b') {
        try { deps.loadReportingView(btn.dataset.tab === 'reporting-b' ? 'b' : 'a'); }
        catch(e){ deps.diag('reporting render err: '+e,'err'); }
      }
    });
  });
}

var api = { init: init };

if (typeof window !== 'undefined') {
  try { window.__SSP_TAB_ROUTER = api; } catch (_) { /* sandboxed write may throw */ }
}

module.exports = api;
