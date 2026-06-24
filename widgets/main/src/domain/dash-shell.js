/**
 * dash-shell.js — global-рельс + дерево навигации (#25 Ф2 Этап 3+4+7, Фаза 5 слайс 13,
 * домен E6 — выносимый подкластер init/bootstrap). Мост window.__SSP_DASH_SHELL.
 *
 * Узлы дерева: sprint-params (D6) · planning-{roles,people,standup} (D5) · gantt ·
 * history · share (#36 — copy deep-link URL). Клик по дереву → программно дёргаем
 * существующие tracker-узлы (.tab-btn / .planning-level-btn), callsite'ы целы.
 * Состояние в _draft.ui.dashNode + body-класс ssp-dashnode-<id>.
 *   • _buildDashTree — собирает DOM-дерево навигации (нативные Ring-иконки через icon());
 *   • _deriveDashNodeFromTabLevel — маппинг устаревшего activeTab/planningLevel → dashNode;
 *   • _setDashNode — подсветка дерева + body-класс + делегация на скрытые tracker-узлы +
 *     persist ui.dashNode + #36-синк URL; share/не-член — no-op;
 *   • _buildGlobalDashShell — единожды на init (_mode==='global') строит .ssp-dash (grid):
 *     захватывает chrome/контекст/навигацию (.page-header/picker/widgetHeader/links/
 *     statusBar/tabs) в рельс (move, не recreate), остаток .page → пейн.
 *
 * Паттерн (слайсы 2–12): deps-фабрика per-call (_dashDeps в монолите). const
 * SSP_DASH_NODES остаётся в ядре (его читает init-зона _loadAndRenderProject) —
 * приходит депом. Стейт-var _planningLevel — в стейт-ядре за deps.state-аксессором.
 * Кросс-кластерные хуки (setDashNode/onShareClick/syncStateToUrl/draftGet/draftSet/
 * rail-collapsed/updateRailSprintName/updateShareBtnState/diag) — через deps (роутятся
 * через core-делегаторы → golden-стабы их перехватывают; в т.ч. _buildDashTree-клики
 * зовут deps.setDashNode, а не модуль-внутренний _setDashNode). Делегаторы выживают у
 * всех 4 (внешние callers: _buildGlobalDashShell/_setDashNode/_deriveDashNodeFromTabLevel —
 * init-оркестровка ядра; _buildDashTree — golden-вход + внутренний вызов из шелла).
 *
 * Контракты — dash-shell.golden.test.js (через делегаторы + стаб setDashNode/onShareClick/
 * syncStateToUrl/_planningLevel + gm.call изолированно, init заморожен в host).
 */
(function () {
  'use strict';

  function _buildDashTree(deps) {
    var T = deps.T, icon = deps.icon;
    var tree = document.createElement('div');
    tree.className = 'ssp-tree'; tree.setAttribute('role','tree');

    /* нативная Ring-иконка (SVG из __SSP_ICONS через icon()), а не emoji */
    function _treeIcon(iconName) {
      var ic = (typeof icon === 'function') ? icon(iconName) : document.createElement('span');
      ic.classList.add('ssp-tree__icon');
      return ic;
    }
    function mkItem(nodeId, labelKey, iconName, extraClass) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ssp-tree__item' + (extraClass ? ' ' + extraClass : '');
      b.dataset.node = nodeId;
      if (iconName) b.appendChild(_treeIcon(iconName));
      var t = document.createElement('span'); t.setAttribute('data-i18n', labelKey); t.textContent = T(labelKey);
      b.appendChild(t);
      b.addEventListener('click', function(){ if (!b.classList.contains('ssp-tree__item--disabled')) deps.setDashNode(nodeId); });
      return b;
    }
    function mkChild(nodeId, labelKey, iconName) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ssp-tree__child'; b.dataset.node = nodeId;
      if (iconName) b.appendChild(_treeIcon(iconName));
      var t = document.createElement('span'); t.setAttribute('data-i18n', labelKey); t.textContent = T(labelKey);
      b.appendChild(t);
      b.addEventListener('click', function(){ deps.setDashNode(nodeId); });
      return b;
    }

    /* 1. Параметры спринта (D6) */
    tree.appendChild(mkItem('sprint-params', 'treeSprintParams', 'settings'));

    /* 1b. Работа с бэклогом (#21 — funnel «что делать» перед планированием).
       Иконка 'folder' (пул/коллекция), не 'task' — чтобы не дублировать группу «Планирование». */
    tree.appendChild(mkItem('backlog', 'tabBacklog', 'folder'));

    /* 2. Планирование (раскрывающаяся группа с детьми Роли/Люди/Stand-up) */
    var grp = document.createElement('details'); grp.className = 'ssp-tree__group'; grp.open = true;
    var sum = document.createElement('summary'); sum.className = 'ssp-tree__group-summary';
    sum.appendChild(_treeIcon('task'));
    var sumTxt = document.createElement('span'); sumTxt.setAttribute('data-i18n','tabPlanning'); sumTxt.textContent = T('tabPlanning');
    sum.appendChild(sumTxt); grp.appendChild(sum);
    var kids = document.createElement('div'); kids.className = 'ssp-tree__children';
    kids.appendChild(mkChild('planning-roles',   'planningLevelRoles',   'group'));
    kids.appendChild(mkChild('planning-people',  'planningLevelPeople',  'user'));
    kids.appendChild(mkChild('planning-standup', 'planningLevelStandup', 'comment'));
    grp.appendChild(kids);
    tree.appendChild(grp);

    /* 3. Гант / История */
    tree.appendChild(mkItem('gantt',   'tabGantt',   'bars'));
    tree.appendChild(mkItem('history', 'tabHistory', 'history'));

    /* 4. Поделиться (#36) — копирует текущий deep-link URL; enable/disable по наличию спринта.
       mkItem-клик зовёт _setDashNode('share') (no-op, не в SSP_DASH_NODES); добавляем copy-handler. */
    var share = mkItem('share', 'treeShare', 'share', 'ssp-tree__item--share ssp-tree__item--disabled');
    share.addEventListener('click', function(){
      if (!share.classList.contains('ssp-tree__item--disabled')) deps.onShareClick();
    });
    tree.appendChild(share);

    return tree;
  }

  function _deriveDashNodeFromTabLevel(deps) {
    /* Маппинг устаревшего состояния (activeTab/planningLevel) в новое dashNode. */
    var ui = deps.draftGet('ui') || {};
    var t = ui.activeTab || 'planning';
    if (t === 'backlog') return 'backlog';
    if (t === 'gantt')   return 'gantt';
    if (t === 'history') return 'history';
    var lvl = ui.planningLevel || deps.state.getPlanningLevel() || 'roles';
    if (lvl === 'people')  return 'planning-people';
    if (lvl === 'standup') return 'planning-standup';
    return 'planning-roles';
  }

  function _setDashNode(deps, nodeId) {
    if (deps.SSP_DASH_NODES.indexOf(nodeId) < 0) return;   /* share/disabled — no-op */
    /* подсветка дерева */
    document.querySelectorAll('.ssp-tree [data-node]').forEach(function(n){
      n.classList.toggle('active', n.dataset.node === nodeId);
    });
    /* body-класс для CSS-стейта (для #sprintIntroCard и др.) */
    var cls = document.body.className.replace(/\bssp-dashnode-\S+/g, '').replace(/\s+/g,' ').trim();
    document.body.className = cls + ' ssp-dashnode-' + nodeId;
    /* делегирование на скрытые tracker-узлы (callsite'ы целы) */
    function _clickTab(t) { var el = document.querySelector('.tab-btn[data-tab="'+t+'"]'); if (el && !el.classList.contains('active')) el.click(); }
    function _clickLevel(l){ var el = document.querySelector('.planning-level-btn[data-level="'+l+'"]'); if (el && !el.classList.contains('active')) el.click(); }
    if (nodeId === 'sprint-params')    { _clickTab('planning'); }
    else if (nodeId === 'backlog')          { _clickTab('backlog'); }
    else if (nodeId === 'planning-roles')   { _clickTab('planning'); _clickLevel('roles'); }
    else if (nodeId === 'planning-people')  { _clickTab('planning'); _clickLevel('people'); }
    else if (nodeId === 'planning-standup') { _clickTab('planning'); _clickLevel('standup'); }
    else if (nodeId === 'gantt')            { _clickTab('gantt'); }
    else if (nodeId === 'history')          { _clickTab('history'); }
    /* persist */
    try { var ui = deps.draftGet('ui') || {}; ui.dashNode = nodeId; deps.draftSet('ui', ui); } catch(_){}
    /* #36 — отразить узел в URL (no-op до _urlSyncEnabled / вне global) */
    try { deps.syncStateToUrl(); } catch(_){}
  }

  function _buildGlobalDashShell(deps) {
    var page = document.querySelector('.page');
    if (!page || document.querySelector('.ssp-dash')) return;   /* идемпотентно */
    function _el(cls) { var d = document.createElement('div'); if (cls) d.className = cls; return d; }

    var dash = _el('ssp-dash');
    var rail = _el('ssp-rail'); rail.id = 'sspRail';
    var pane = _el('ssp-pane'); pane.id = 'sspPane';

    /* Этап 2 — захватываем существующие узлы chrome/контекста/навигации (move, не recreate:
       id/классы/обработчики и серверная видимость #openSettingsBtn сохраняются). */
    var pageHeader  = page.querySelector('.page-header');          /* иконка/title/версия (+ picker/links внутри) */
    var picker      = document.getElementById('globalProjectPicker');
    var headerLinks = page.querySelector('.page-header__links');   /* Настройки/Руководство/Обр.связь/язык/Очистить */
    var widgetHdr   = document.getElementById('widgetHeader');     /* спринт-селектор/бейдж/WC/новый */
    var statusBar   = document.getElementById('widgetStatusBarSpoiler')  /* спойлер «Статус активности модулей» */
                    || document.getElementById('widgetStatusBar');       /* fallback, если обёртки нет */
    var tabs        = page.querySelector('.tabs');                 /* tracker-табы + Ring-Tabs host #sspTabsHost */

    /* ── Голова рельса: кнопка «свернуть» + бренд (.page-header) ── */
    var head = _el('ssp-rail__head');
    var tgl = document.createElement('button');
    tgl.type = 'button'; tgl.className = 'ssp-rail__toggle'; tgl.id = 'sspRailToggle';
    head.appendChild(tgl);
    /* picker и links вытаскиваем из .page-header ДО переноса бренда (иначе уедут вместе с ним) */
    if (pageHeader)  head.appendChild(pageHeader);
    /* утилиты — компактной группой сразу под брендом. В auto-grow iframe нет
       фиксированного «дна экрана», поэтому классический «низ сайдбара» не прижать —
       наверху аккуратнее (см. правку 2026-06-06 по фидбэку владельца). */
    var utils = _el('ssp-rail__utils');
    if (headerLinks) utils.appendChild(headerLinks);
    /* спойлер «Статус активности модулей» — под пикером языка (в utils-зоне, по фидбэку) */
    if (statusBar) utils.appendChild(statusBar);
    /* контекст: проект-пикер + логические карточки спринта */
    var ctx = _el('ssp-rail__context');
    if (picker)      ctx.appendChild(picker);
    if (widgetHdr) {
      var _sprintBox = widgetHdr.querySelector('.widget-header__sprint');  /* селектор + имя спринта */
      var _badge     = widgetHdr.querySelector('.widget-header__badge');   /* #widgetSprintBadge — статусы ролей */
      var _wc        = widgetHdr.querySelector('.widget-header__wc');       /* #widgetWcIndicator — рабочая копия */
      var _newBtn    = widgetHdr.querySelector('.widget-header__new');      /* #widgetNewSprintBtn */
      /* п.6 — подпись полного имени спринта внутри спринт-блока (под селектором) */
      if (_sprintBox && !document.getElementById('sspRailSprintName')) {
        var _nm = document.createElement('div');
        _nm.id = 'sspRailSprintName'; _nm.className = 'ssp-rail-sprint-name';
        _sprintBox.appendChild(_nm);
      }
      /* Карточка 1 = сам #widgetHeader (renderWidgetHeader проверяет его наличие):
         имя спринта + рабочая копия (WC над статусами ролей). */
      if (_sprintBox) widgetHdr.appendChild(_sprintBox);   /* порядок: спринт первым */
      if (_wc)        widgetHdr.appendChild(_wc);            /* WC сразу под спринтом */
      /* Карточка 2 = статусы ролей спринта (отдельный блок). */
      var _card2 = _el('ssp-rail-card ssp-rail-card--badges');
      if (_badge) _card2.appendChild(_badge);

      ctx.appendChild(widgetHdr);                /* блок 1: спринт + WC */
      ctx.appendChild(_card2);                   /* блок 2: статусы ролей */
      if (_newBtn) ctx.appendChild(_newBtn);     /* «Новый спринт» — отдельной строкой */
    }
    /* ── Навигация (Этап 3+4+7 — дерево D5/D6/Ф2.5) ── */
    var nav = _el('ssp-rail__nav');
    if (tabs) nav.appendChild(tabs);            /* tracker-узлы сохраняются для callsite'ов (скрыты CSS) */
    nav.appendChild(_buildDashTree(deps));

    rail.appendChild(head);
    rail.appendChild(utils);
    rail.appendChild(ctx);
    rail.appendChild(nav);

    /* Остаток .page (баннеры, projectSettings*, tab-panel'ы, #diagWrap) → пейн. */
    while (page.firstChild) { pane.appendChild(page.firstChild); }

    dash.appendChild(rail); dash.appendChild(pane);
    page.appendChild(dash);

    tgl.addEventListener('click', function() {
      deps.setRailCollapsed(!dash.classList.contains('ssp-rail-collapsed'));
      deps.applyRailCollapsed(deps.getRailCollapsed());
    });
    deps.applyRailCollapsed(deps.getRailCollapsed());
    deps.updateRailSprintName();
    /* #36 v2.5.2 — сразу выставить видимость кнопки «Поделиться» по наличию host.navigation
       (на YT<2026.1 спрятать немедленно, не дожидаясь выбора проекта). */
    try { deps.updateShareBtnState(); } catch (_) {}
    deps.diag('#25 Ф2 dash shell built (global): chrome/context/nav → rail', 'ok');
  }

  window.__SSP_DASH_SHELL = {
    _buildDashTree: _buildDashTree,
    _deriveDashNodeFromTabLevel: _deriveDashNodeFromTabLevel,
    _setDashNode: _setDashNode,
    _buildGlobalDashShell: _buildGlobalDashShell,
  };
})();
