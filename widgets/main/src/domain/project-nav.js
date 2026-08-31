/**
 * project-nav.js — global-picker проектов + project-mode страница настроек (#25 Ф1,
 * Фаза 5 слайс 14, домен E6 — выносимый подкластер init/bootstrap). Мост
 * window.__SSP_PROJECT_NAV.
 *
 * Две подсистемы #25 Ф1:
 *   • global-режим — picker проекта в шапке + смена проекта:
 *       _loadGlobalProjectList — admin/projects ∩ filter-planner-projects (read-gate);
 *       _renderProjectPicker / _setPickerValue — <select> в #globalProjectPicker;
 *       _setGlobalBanner — #globalNoProjectBanner (текст + {key}-подстановка #36);
 *       _initGlobalProjectSelection — init-вход: резолв стартового проекта
 *         (share-ссылка #36 → last-used → единственный → prompt), бросает
 *         _NO_PROJECT_SENTINEL, если проект не выбран;
 *       _applyActiveProject — применить ключ к стейту (label/picker/last-used + #36 URL);
 *       _onProjectPicked / _switchToProject / _confirmDiscardAndSwitch — смена проекта
 *         с guard'ом несохранённого черновика (класс visibility/stale-багов B9);
 *       _getLastProjectKey / _setLastProjectKey — last-used: safeLs + серверное зеркало
 *         backend-global/last-project (#58-10, переживает полный reload страницы);
 *       _syncAclFireAndForget — зеркало settingsManagerGroup → ssp_acl.
 *   • project-режим — проектный виджет = страница настроек (планер уехал в меню, Ф1-A):
 *       _loadSettingsOnly / _renderProjectSettingsPage / _mountProjectSettings.
 *
 * Паттерн (слайсы 2–13): deps-фабрика per-call (_projectNavDeps в монолите). Стейт-резет
 * ядра (_resetProjectStateCaches, 22 var) и оркестратор старта (_loadAndRenderProject)
 * ОСТАЮТСЯ в ядре — приходят late-binding deps (resetProjectStateCaches/loadAndRenderProject),
 * прецедент refresh→saveCurrentRoleState (слайс 5), dash→setDashNode (слайс 13). Стейт-var'ы
 * (_settings/_activeProjectKey/_projectDisplayName/_globalProjects/_pendingShareParams/
 * _urlSyncEnabled/_lang/_host) — в стейт-ядре за deps.state-аксессорами (их трогают
 * init-restore/detect-режима и share-deps). _NO_PROJECT_SENTINEL — object-ref ядра (init-
 * catch сверяет идентичность). LS-ключ last-used per-fork → core-dep литерал
 * lastProjectLsKey (модуль форк-идентичен). Кросс-кластерные хуки (share/draft/i18n/
 * loaders/settings + chrome) — через core-делегаторы (golden-стабы их перехватывают).
 * Делегаторы выживают у внешне-вызываемых init (_initGlobalProjectSelection/
 * _renderProjectSettingsPage/_syncAclFireAndForget) + golden-входов.
 *
 * Контракты — project-nav.golden.test.js (через делегаторы + стаб share/draft/loaders/
 * reset/load + gm.call изолированно, init заморожен в host).
 */
(function () {
  'use strict';

  /* ═══ project-режим: проектный виджет = страница настроек (Ф1-A) ═══ */

  /* Лёгкая загрузка только настроек (без планера). */
  function _loadSettingsOnly(deps) {
    return deps.apiGet('sprint-data').then(function (r) {
      deps.state.setSettings((r && r.settings) || null);
    }).catch(function () { /* оставляем _settings как есть */ });
  }

  /* Рендер проектного виджета как страницы настроек. Заменяет планер в project-режиме. */
  function _renderProjectSettingsPage(deps) {
    deps.diag('project mode → settings page', 'info');
    return Promise.all([
      deps.loadProjectFields(),
      _loadSettingsOnly(deps),
      (typeof deps.loadProjectGroups === 'function' ? deps.loadProjectGroups().catch(function () {}) : Promise.resolve())
    ]).then(function () {
      return deps.apiGet('check-settings-manager').catch(function () { return null; });
    }).then(function (r) {
      var canManage         = !!(r && r.canManage);
      // #22 — планировочный менеджер: editable планировочный тир; admin-тир скрыт. Fallback на canManage.
      var canManagePlanning = !!(r && (r.canManagePlanning || r.canManage));
      var canEditWorkflow   = (r && r.canEditWorkflow !== undefined) ? !!r.canEditWorkflow : canManage;
      var configured = !!(r && r.configured);

      document.body.classList.add('ssp-project-settings-mode');

      var banner = document.getElementById('projectSettingsBanner');
      if (banner) { banner.textContent = deps.T('projectMovedToMenu'); banner.classList.remove('hidden'); }
      /* #29 — онбординг-тупик: без группы управления настройками форма read-only
         (.ssp-modal-footer скрыт CSS'ом), а объяснение жило только в мёртвом фоллбеке
         mountInline. Показываем настоящую причину и следующий шаг видимым баннером. */
      var roBanner = document.getElementById('projectSettingsRoBanner');
      if (roBanner) {
        roBanner.textContent = deps.T('settingsNotConfiguredHint');
        roBanner.classList.toggle('hidden', configured);
      }

      /* #80 — планер отключён: баннер всем, кнопка-переключатель настройщику. */
      _renderPlannerToggleProject(deps, canManage);

      /* header chrome (lang/icons/theme/version) — нужный подмножество init-цепочки */
      try { deps.populateLangSelect(document.getElementById('langSel')); } catch (_) {}
      var langSelEl = document.getElementById('langSel');
      if (langSelEl) {
        langSelEl.value = deps.state.getLang();
        if (!langSelEl._sspBound) { langSelEl.addEventListener('change', function () { deps.setLang(langSelEl.value); }); langSelEl._sspBound = true; }
      }
      deps.applyI18N();
      try { deps.applyIcons(); } catch (_) {}
      try { deps.applyRingTheme(); } catch (_) {}
      try { deps.loadAppVersion(); } catch (_) {}

      _mountProjectSettings(deps, canManagePlanning, configured, canEditWorkflow, (r && r.groupName) || '');
      deps.diag('project settings page rendered (canManagePlanning=' + canManagePlanning + ', canEditWorkflow=' + canEditWorkflow + ', configured=' + configured + ')', 'info');
    });
  }

  /* Inline-маунт формы настроек в страницу. Read-only (CSS) для не-менеджера / не-настроенного.
     #22 — canManagePlanning гейтит редактируемость (планировочный менеджер editable),
     canEditWorkflow прокидывается в форму (admin-тир рендерится только при true). */
  function _mountProjectSettings(deps, canManagePlanning, configured, canEditWorkflow, settingsManagerGroupName) {
    var host = document.getElementById('projectSettingsHost');
    if (!host) return;
    var ro = !canManagePlanning || !configured;
    host.classList.toggle('ssp-settings-readonly', ro);
    if (!window.__SSP_RING_MODAL || typeof window.__SSP_RING_MODAL.mountInline !== 'function') {
      host.textContent = deps.T('settingsNotConfiguredHint');
      return;
    }
    /* inline «отмена/закрыть» = перезагрузить страницу (сброс несохранённых правок).
       v3.2.1 — реюз inline-root реконсилировал ТОТ ЖЕ компонент: useState-инициализаторы
       не перезапускались, свежий initial игнорировался — «Отмена» была no-op, а юзер,
       считая правки сброшенными, мог позже сохранить нежелательное. Демонтируем дерево
       перед свежим маунтом — стейт формы гарантированно пересоздаётся. */
    var props = deps.buildSettingsFormProps(function () {
      try { window.__SSP_RING_MODAL.unmountInline(host); } catch (_) {}
      _renderProjectSettingsPage(deps);
    }, { canEditWorkflow: !!canEditWorkflow, settingsManagerGroupName: settingsManagerGroupName || '' });
    window.__SSP_RING_MODAL.mountInline(host, 'settingsForm', props);
  }

  /* ═══ global-режим: picker проекта + смена проекта ═══ */

  /* Зеркалит settingsManagerGroup → ssp_acl (project-mode, fire-and-forget). */
  function _syncAclFireAndForget(deps) {
    try { deps.apiPost('sync-acl', {}).then(function(){}, function(){}); } catch (_) {}
  }

  function _getLastProjectKey(deps) { try { return deps.safeLs.get(deps.lastProjectLsKey) || null; } catch (_) { return null; } }

  /* #58-10 — серверный last-used (backend-global/last-project, User.extensionProperties):
     в srcdoc-песочнице localStorage мёртв (SecurityError), а host.navigation на YT 2025.3
     отсутствует целиком → полную перезагрузку страницы переживает ТОЛЬКО бэкенд.
     safeLs остаётся быстрым первым кандидатом (жив вне песочницы: dev/тест-харнесс). */
  var _serverLastSynced = null;   // последнее известное серверу значение (гейт лишних POST)

  function _fetchServerLastProject(deps) {
    return deps.apiGet('last-project').then(function (r) {
      var k = (r && r.success !== false && r.projectKey) || null;
      if (k) _serverLastSynced = k;
      return k;
    }).catch(function () { return null; });
  }

  function _setLastProjectKey(deps, k) {
    try { if (k) deps.safeLs.set(deps.lastProjectLsKey, k); } catch (_) {}
    /* #58-10 — fire-and-forget зеркало в бэкенд (гейт от повторной записи того же ключа) */
    if (k && k !== _serverLastSynced) {
      _serverLastSynced = k;
      try { deps.apiPost('last-project', { projectKey: k }).then(function () {}, function () {}); } catch (_) {}
    }
  }

  /* Список проектов для picker'а = видимые юзеру (admin/projects под его токеном) ∩
     «планер прикреплён» + read-gate (backend filter-planner-projects — авторитетный арбитр). */
  function _loadGlobalProjectList(deps) {
    return deps.state.getHost().fetchYouTrack('admin/projects', { query: { fields: 'id,name,shortName,archived', '$top': 5000 } })
      .then(function (list) {
        var keys = [];
        (list || []).forEach(function (p) {
          if (p && p.shortName && !p.archived) keys.push(p.shortName);
        });
        if (!keys.length) return [];
        /* id проекта (folders-скоуп search/assist) теряется в filter-planner-projects —
           подмешиваем обратно из admin/projects по shortName (без правок бэкенда). */
        var idByKey = {};
        (list || []).forEach(function (p) { if (p && p.shortName) idByKey[p.shortName] = p.id; });
        return deps.apiPost('filter-planner-projects', { keys: keys }).then(function (r) {
          var projs = (r && r.projects) || [];
          projs.forEach(function (p) { if (p && p.key && idByKey[p.key]) p.id = idByKey[p.key]; });
          return projs;
        });
      }).catch(function (e) {
        deps.diag('loadGlobalProjectList ERR: ' + (e && e.message ? e.message : e), 'err');
        return [];
      });
  }

  /* Строит picker в шапке. Источник истины списка — _globalProjects. */
  function _renderProjectPicker(deps) {
    var wrap = document.getElementById('globalProjectPicker');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    var sel = document.getElementById('globalProjectSelect');
    if (!sel) {
      var label = document.createElement('span');
      label.className = 'ssp-global-project-label';
      label.setAttribute('data-i18n', 'globalProjectLabel');
      label.textContent = deps.T('globalProjectLabel');
      sel = document.createElement('select');
      sel.id = 'globalProjectSelect';
      sel.className = 'ssp-global-project-select';
      sel.addEventListener('change', function () { _onProjectPicked(deps, sel.value); });
      wrap.appendChild(label);
      wrap.appendChild(sel);
    }
    sel.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = '';
    /* data-i18n → applyI18N перелокализует плейсхолдер при смене языка (option.textContent). */
    ph.setAttribute('data-i18n', 'globalProjectPlaceholder');
    ph.textContent = deps.T('globalProjectPlaceholder');
    sel.appendChild(ph);
    deps.state.getGlobalProjects().forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.key;
      /* #80 — отключённый проект в пикере видят только настройщики/админ (фильтр бэкенда),
         с пометкой — иначе строка неотличима от рабочей. */
      o.textContent = p.name + ' (' + p.key + ')' + (p.disabled ? ' — ' + deps.T('plannerDisabledMark') : '');
      sel.appendChild(o);
    });
    var activeKey = deps.state.getActiveProjectKey();
    if (activeKey) sel.value = activeKey;
  }

  function _setPickerValue(deps, k) {
    var sel = document.getElementById('globalProjectSelect');
    if (sel) sel.value = k || '';
  }

  function _setGlobalBanner(deps, textKey, sub) {
    var b = document.getElementById('globalNoProjectBanner');
    if (!b) return;
    if (textKey) {
      var txt = deps.T(textKey);
      if (sub != null) txt = txt.replace('{key}', String(sub)).replace('{reason}', String(sub));   /* #36 — {key}; #97 — {reason} */
      b.textContent = txt;
      b.classList.remove('hidden');
    } else b.classList.add('hidden');
  }

  /* init выбора проекта в global-режиме. Резолвит стартовый проект (last-used →
     единственный → prompt). Бросает _NO_PROJECT_SENTINEL, если проект не выбран. */
  function _initGlobalProjectSelection(deps) {
    deps.state.setUrlSyncEnabled(false);   /* #36 — не синкать URL во время init-restore (иначе затрём sprintId) */
    return deps.readShareParams().then(function (share) {
      /* #36 — restore триггерится только при наличии projectKey (ядро ссылки); иначе игнор. */
      deps.state.setPendingShareParams((share && share.projectKey) ? share : null);
      /* #58-10 — серверный last-used тянем параллельно списку проектов */
      return Promise.all([_loadGlobalProjectList(deps), _fetchServerLastProject(deps)]);
    }).then(function (res) {
      var projects = res[0], serverLast = res[1];
      deps.state.setGlobalProjects(projects || []);
      _renderProjectPicker(deps);
      /* issue #28 — в global-режиме статические [data-i18n] шапки/сайдбара (ссылки
         «Руководство»/«Обратная связь», спойлер статуса, диаг-панель, лейбл и кнопка
         «Текущий/Новый спринт») локализуются только в _loadAndRenderProject (applyI18N
         там же). Без выбранного проекта (нет проектов / prompt / no-access) тот путь не
         достигается — throw NO_PROJECT_SENTINEL ниже — и статика оставалась на RU-дефолтах
         из index.html, а язык-селектор шапки был без обработчика (баг «Setting EN has no
         effect»). Локализуем и биндим селектор ЗДЕСЬ, до любого выхода из init. */
      try { deps.populateLangSelect(document.getElementById('langSel')); } catch (_) {}
      var _langSelG = document.getElementById('langSel');
      if (_langSelG) {
        _langSelG.value = deps.state.getLang();
        if (!_langSelG._sspBound) { _langSelG.addEventListener('change', function () { deps.setLang(_langSelG.value); }); _langSelG._sspBound = true; }
      }
      deps.applyI18N();
      var globalProjects = deps.state.getGlobalProjects();
      if (!globalProjects.length) {
        _setGlobalBanner(deps, 'globalNoProjects');
        throw deps.NO_PROJECT_SENTINEL;
      }
      var share = deps.state.getPendingShareParams() || {};
      var initKey = null;
      /* #36 — projectKey из ссылки приоритетнее last-used */
      if (share.projectKey) {
        if (globalProjects.some(function (p) { return p.key === share.projectKey; })) {
          initKey = share.projectKey;
        } else {
          /* проект из ссылки недоступен/планер не подключён — banner, остаёмся на picker'е (D6) */
          _setGlobalBanner(deps, 'noAccessToProject', share.projectKey);
          deps.state.setPendingShareParams(null);
          throw deps.NO_PROJECT_SENTINEL;
        }
      }
      if (!initKey) {
        var last = _getLastProjectKey(deps);
        if (last && globalProjects.some(function (p) { return p.key === last; })) initKey = last;
        /* #58-10 — серверный last (единственный канал, переживающий reload в песочнице) */
        else if (serverLast && globalProjects.some(function (p) { return p.key === serverLast; })) initKey = serverLast;
        else if (globalProjects.length === 1) initKey = globalProjects[0].key;
      }
      if (!initKey) {
        _setGlobalBanner(deps, 'globalPickPrompt');
        throw deps.NO_PROJECT_SENTINEL;
      }
      _applyActiveProject(deps, initKey);
      _setGlobalBanner(deps, null);
      return _startProjectLoad(deps);   /* #80 — отключённый проект: баннер вместо загрузки */
    });
  }

  /* Применить выбранный проект к состоянию (ключ, label, picker, last-used). */
  function _applyActiveProject(deps, key) {
    deps.state.setActiveProjectKey(key);
    _setPickerValue(deps, key);
    _setLastProjectKey(deps, key);
    var p = deps.state.getGlobalProjects().filter(function (x) { return x.key === key; })[0];
    deps.state.setProjectDisplayName((p && p.name) ? p.name : key);
    try { deps.updateProjectNameLabel(); } catch (_) {}
    try { deps.syncStateToUrl(); } catch (_) {}   /* #36 — авто-синк state→URL (no-op до _urlSyncEnabled) */
  }

  /* Обработчик выбора в picker'е. При несохранённом черновике — модалка-предупреждение. */
  function _onProjectPicked(deps, newKey) {
    if (!newKey || newKey === deps.state.getActiveProjectKey()) return;
    if (deps.draftIsDirty()) {
      /* #97 — пока висит вопрос, селектор не должен врать: нативный <select> уже
         переключился сам, но проект ещё прежний. Откатываем сразу; новое значение
         поставит _applyActiveProject после подтверждения. */
      _setPickerValue(deps, deps.state.getActiveProjectKey());
      _confirmDiscardAndSwitch(deps,
        function onConfirm() { _switchToProject(deps, newKey); },
        function onCancel()  { _setPickerValue(deps, deps.state.getActiveProjectKey()); }
      );
    } else {
      _switchToProject(deps, newKey);
    }
  }

  /* Сброс per-project кэшей + загрузка нового проекта (класс visibility/stale-багов B9). */
  function _switchToProject(deps, newKey) {
    deps.diag('switch project → ' + newKey, 'info');
    deps.resetProjectStateCaches();
    _applyActiveProject(deps, newKey);
    /* Явный выбор проекта в пикере → открыть «Параметры спринта», не последний открытый узел. */
    try { deps.state.setForceSprintParamsOnLoad(true); } catch (_) {}
    _setGlobalBanner(deps, null);
    /* #97 — .catch снят как мёртвый: терминальный обработчик _loadAndRenderProject
       всегда резолвит цепочку, сюда отказ не доходил ни разу. Сбой теперь виден
       полосой из _reportLoadFailure (data-loaders), а не молчаливым пустым экраном. */
    _startProjectLoad(deps);   /* #80 — отключённый проект: баннер вместо загрузки */
  }

  /* ═══ #80 — «Отключить планер в этом проекте» ═══
     Флаг plannerDisabled (ssp_settings) пишет ТОЛЬКО эндпоинт planner-disabled.
     Global: отключённый проект в пикере видят лишь те, кто может включить (фильтр
     бэкенда), его выбор рисует баннер+кнопку вместо загрузки (эндпоинты всё равно
     ответят 403 planner_disabled). Project-виджет: баннер всем + кнопка настройщику. */

  /* Старт загрузки активного проекта с гейтом «планер отключён». */
  function _startProjectLoad(deps) {
    var key = deps.state.getActiveProjectKey();
    var entry = (deps.state.getGlobalProjects() || []).filter(function (p) { return p && p.key === key; })[0];
    if (entry && entry.disabled) { _renderPlannerDisabledState(deps); return Promise.resolve(); }
    return deps.loadAndRenderProject();
  }

  /* Экран «планер отключён» (global). Load пропущен → сайдбарные кнопки прошлого
     проекта прячем здесь же (refreshOpenSettingsBtn в этой ветке не зовётся). */
  function _renderPlannerDisabledState(deps) {
    var sBtn = document.getElementById('openSettingsBtn');
    if (sBtn) sBtn.style.display = 'none';
    var dBtn = document.getElementById('plannerDisableBtn');
    if (dBtn) dBtn.classList.add('hidden');
    var el = document.getElementById('globalNoProjectBanner');
    if (!el) return;
    el.textContent = '';
    el.appendChild(document.createTextNode(deps.T('plannerDisabledBanner') + ' '));
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ring-button-button ring-button-heightS';
    btn.textContent = deps.T('btnPlannerEnable');
    btn.addEventListener('click', function () {
      _togglePlannerDisabled(deps, false, function () { _afterPlannerToggleGlobal(deps, false); });
    });
    el.appendChild(btn);
    el.classList.remove('hidden');
  }

  /* Переключение флага. Выключение — через confirm (риск 2 карточки #80 проговаривается
     в теле: данные целы, включит настройщик, workflow-правила продолжают работать). */
  function _togglePlannerDisabled(deps, disable, onDone) {
    if (!disable) { _postPlannerDisabled(deps, false, onDone); return; }
    deps.openModal({
      id: 'plannerDisableConfirm',
      type: 'destructive',
      title: deps.T('plannerDisableConfirmTitle'),
      body: { kind: 'text', text: deps.T('plannerDisableConfirmBody') },
      buttons: [
        { id: 'confirm', text: deps.T('btnPlannerDisableConfirm'), variant: 'danger',
          onClick: function (h) { h.close(); _postPlannerDisabled(deps, true, onDone); } },
        { id: 'cancel', text: deps.T('btnCancel'), variant: 'primary',
          onClick: function (h) { h.close(); } },
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: false,
    });
  }

  function _postPlannerDisabled(deps, disable, onDone) {
    return deps.apiPost('planner-disabled', { disabled: !!disable }).then(function (r) {
      if (!r || r.success === false) throw new Error((r && r.reason) || 'unknown_error');
      deps.toast(deps.T(disable ? 'toastPlannerDisabled' : 'toastPlannerEnabled'), 'success');
      if (onDone) onDone();
    }).catch(function (e) {
      deps.diag('planner-disabled POST ERR: ' + (e && e.message ? e.message : e), 'err');
      deps.toast(deps.T('toastSaveError'), 'err');
    });
  }

  /* Пост-обработка в global: пометка в списке пикера + пере-рендер + экран. */
  function _afterPlannerToggleGlobal(deps, disable) {
    var key = deps.state.getActiveProjectKey();
    var entry = (deps.state.getGlobalProjects() || []).filter(function (p) { return p && p.key === key; })[0];
    if (entry) { if (disable) entry.disabled = true; else delete entry.disabled; }
    _renderProjectPicker(deps);
    _setGlobalBanner(deps, null);   /* при включении баннер «отключён» обязан уйти; при выключении его перерисует _renderPlannerDisabledState */
    if (disable) deps.resetProjectStateCaches();   /* стейт прошлого проекта не должен пережить выключение */
    _startProjectLoad(deps);
  }

  /* Вход сайдбарной кнопки «Отключить планер в этом проекте» (global, canManage). */
  function _disablePlannerFromSidebar(deps) {
    _togglePlannerDisabled(deps, true, function () { _afterPlannerToggleGlobal(deps, true); });
  }

  /* Project-виджет (страница настроек): баннер «отключён» всем + кнопка настройщику. */
  function _renderPlannerToggleProject(deps, canManage) {
    var off = false;
    try { off = ((deps.state.getSettings() || {}).plannerDisabled === true); } catch (_) { off = false; }
    var banner = document.getElementById('plannerDisabledBanner');
    if (banner) {
      banner.textContent = deps.T('plannerDisabledBanner');
      banner.classList.toggle('hidden', !off);
    }
    var host = document.getElementById('plannerToggleHost');
    if (!host) return;
    host.textContent = '';
    if (!canManage) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ring-button-button ring-button-heightS';
    if (!off) {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'var(--warn)';
      btn.style.color = 'var(--warn)';
    }
    btn.textContent = deps.T(off ? 'btnPlannerEnable' : 'btnPlannerDisable');
    btn.addEventListener('click', function () {
      _togglePlannerDisabled(deps, !off, function () {
        var s = deps.state.getSettings() || {};
        if (!off) s.plannerDisabled = true; else delete s.plannerDisabled;
        deps.state.setSettings(s);
        _renderPlannerToggleProject(deps, canManage);
      });
    });
    host.appendChild(btn);
  }

  /* Модалка-предупреждение «черновик будет очищен» (Ring; fallback — нативный confirm). */
  function _confirmDiscardAndSwitch(deps, onConfirm, onCancel) {
    if (!window.__SSP_RING_MODAL) {
      var ok = true;
      try { ok = window.confirm(deps.T('globalSwitchDiscardMsg')); } catch (_) { ok = true; }
      if (ok) onConfirm(); else onCancel();
      return;
    }
    var decided = false;
    deps.openModal({
      id: 'globalSwitchConfirm',
      type: 'confirm',
      title: deps.T('globalSwitchDiscardTitle'),
      body: { kind: 'text', text: deps.T('globalSwitchDiscardMsg') },
      buttons: [
        { id: 'cancel', text: deps.T('globalSwitchCancel'), variant: 'secondary',
          onClick: function (api) { decided = true; onCancel(); api.close(); } },
        { id: 'ok', text: deps.T('globalSwitchDiscardConfirm'), variant: 'primary',
          onClick: function (api) { decided = true; onConfirm(); api.close(); } }
      ],
      dismissOnBackdrop: false,
      blockEscape: false,
      showCloseButton: true,
      onClose: function () { if (!decided) onCancel(); }
    });
  }

  window.__SSP_PROJECT_NAV = {
    _loadSettingsOnly: _loadSettingsOnly,
    _renderProjectSettingsPage: _renderProjectSettingsPage,
    _mountProjectSettings: _mountProjectSettings,
    _disablePlannerFromSidebar: _disablePlannerFromSidebar,   /* #80 — вход сайдбарной кнопки */
    _syncAclFireAndForget: _syncAclFireAndForget,
    _getLastProjectKey: _getLastProjectKey,
    _setLastProjectKey: _setLastProjectKey,
    _loadGlobalProjectList: _loadGlobalProjectList,
    _renderProjectPicker: _renderProjectPicker,
    _setPickerValue: _setPickerValue,
    _setGlobalBanner: _setGlobalBanner,
    _initGlobalProjectSelection: _initGlobalProjectSelection,
    _applyActiveProject: _applyActiveProject,
    _onProjectPicked: _onProjectPicked,
    _switchToProject: _switchToProject,
    _confirmDiscardAndSwitch: _confirmDiscardAndSwitch,
  };
})();
