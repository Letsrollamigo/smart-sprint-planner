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
 *       _getLastProjectKey / _setLastProjectKey — safeLs last-used (ключ per-fork);
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
      var canManage  = !!(r && r.canManage);
      var configured = !!(r && r.configured);

      document.body.classList.add('ssp-project-settings-mode');

      var banner = document.getElementById('projectSettingsBanner');
      if (banner) { banner.textContent = deps.T('projectMovedToMenu'); banner.classList.remove('hidden'); }

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

      _mountProjectSettings(deps, canManage, configured);
      deps.diag('project settings page rendered (canManage=' + canManage + ', configured=' + configured + ')', 'info');
    });
  }

  /* Inline-маунт формы настроек в страницу. Read-only (CSS) для не-менеджера / не-настроенного. */
  function _mountProjectSettings(deps, canManage, configured) {
    var host = document.getElementById('projectSettingsHost');
    if (!host) return;
    var ro = !canManage || !configured;
    host.classList.toggle('ssp-settings-readonly', ro);
    if (!window.__SSP_RING_MODAL || typeof window.__SSP_RING_MODAL.mountInline !== 'function') {
      host.textContent = deps.T('settingsNotConfiguredHint');
      return;
    }
    /* inline «отмена/закрыть» = перезагрузить страницу (сброс несохранённых правок). */
    var props = deps.buildSettingsFormProps(function () { _renderProjectSettingsPage(deps); });
    window.__SSP_RING_MODAL.mountInline(host, 'settingsForm', props);
  }

  /* ═══ global-режим: picker проекта + смена проекта ═══ */

  /* Зеркалит settingsManagerGroup → ssp_acl (project-mode, fire-and-forget). */
  function _syncAclFireAndForget(deps) {
    try { deps.apiPost('sync-acl', {}).then(function(){}, function(){}); } catch (_) {}
  }

  function _getLastProjectKey(deps) { try { return deps.safeLs.get(deps.lastProjectLsKey) || null; } catch (_) { return null; } }
  function _setLastProjectKey(deps, k) { try { if (k) deps.safeLs.set(deps.lastProjectLsKey, k); } catch (_) {} }

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
        return deps.apiPost('filter-planner-projects', { keys: keys }).then(function (r) {
          return (r && r.projects) || [];
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
      o.textContent = p.name + ' (' + p.key + ')';
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
      if (sub != null) txt = txt.replace('{key}', String(sub));   /* #36 — noAccessToProject {key} */
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
      return _loadGlobalProjectList(deps);
    }).then(function (projects) {
      deps.state.setGlobalProjects(projects || []);
      _renderProjectPicker(deps);
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
        else if (globalProjects.length === 1) initKey = globalProjects[0].key;
      }
      if (!initKey) {
        _setGlobalBanner(deps, 'globalPickPrompt');
        throw deps.NO_PROJECT_SENTINEL;
      }
      _applyActiveProject(deps, initKey);
      _setGlobalBanner(deps, null);
      return deps.loadAndRenderProject();
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
    _setGlobalBanner(deps, null);
    deps.loadAndRenderProject().catch(function (e) {
      deps.diag('switch load ERR: ' + (e && e.message ? e.message : e), 'err');
    });
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
