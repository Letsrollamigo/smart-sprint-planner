/**
 * settings-controller.js — обвязка формы настроек проекта (Фаза 5, зачистка
 * «прочих» — слайс 11). Мост window.__SSP_SETTINGS_CTRL.
 *
 * Живое ядро React-формы настроек (зона A; vanilla-форма зоны B снесена в том же
 * слайсе как мёртвый код). 0 cross-module callers — все вызовы внутри монолита
 * (init-bind openSettingsBtn → openSettingsModal; project-mode _mountProjectSettings →
 * buildSettingsFormProps):
 *   • openSettingsModal() — серверный гейт apiGet('check-settings-manager') →
 *     not-configured / no-access info-модал, либо form-модал с settingsForm;
 *     lazy-load групп (5b multi-select);
 *   • buildSettingsFormProps(onClose) — сборка props формы (initial/roles/
 *     fieldsByType/defaultLangOptions/loadFieldValues/onSave/onClose); общая для
 *     модалки (global) и inline-страницы проектного виджета;
 *   • _saveSettingsData(data) — persist apiPost('sprint-data') + post-save хвост
 *     (cache-invalidate при смене field-Sprint/Version, _settings, project-default
 *     lang, feature-bar, soft-warn required, права/видимость, re-render);
 *   • _buildFieldsByType() — категоризация _projectFields по типам YouTrack.
 *
 * Паттерн (слайсы 2–10): deps-фабрика per-call (_settingsDeps в монолите). Стейт
 * (_settings/_projectFields/_projectGroups/_lang) ОСТАЁТСЯ в стейт-ядре за
 * deps.state-аксессорами (читается/пишется повсеместно). _fieldValuesCache —
 * shared-стейт ядра (общий с intro-view) — приходит object-ref'ом через
 * deps.fieldValuesCache (модуль мутирует общий объект). Делегаторы в монолите:
 * openSettingsModal/_buildSettingsFormProps (реальные callers) + _saveSettingsData/
 * _buildFieldsByType (golden-входы; внутри модуля зовутся свои функции напрямую).
 *
 * Контракты — settings.golden.test.js.
 */
(function () {
  'use strict';

  /** Категоризация полей проекта (_projectFields) по типам YouTrack. */
  function _buildFieldsByType(deps) {
    var projectFields = deps.state.getProjectFields();
    function ofTypes(allowed) {
      var out = [];
      (projectFields || []).forEach(function (f) {
        var ty = (f.type || '').toLowerCase();
        if (allowed.some(function (at) { return ty.indexOf((at || '').toLowerCase()) >= 0; })) out.push(f.name);
      });
      return out;
    }
    return {
      priority:         ofTypes(['enum']),
      xpriority:        ofTypes(['enum']),
      state:            ofTypes(['state', 'enum']),
      system:           ofTypes(['enum', 'owned']),
      externalTicketId: ofTypes(['string']),
      sprint:           ofTypes(['enum']),
      version:          ofTypes(['version', 'build']),
      period:           ofTypes(['period']),
      user:             ofTypes(['user']),
      /* 5c — cascade kind-field (enum-поля проекта). */
      enumFields:       ofTypes(['enum']),
    };
  }

  /* Сохранение settings из bespoke-формы. Возвращает Promise<{success}|{success:false,reason}>.
     Дословно зеркалит post-save хвост doSaveSettings (cache-invalidate, _settings,
     project-default lang, feature-bar, soft-warn, права/видимость, re-render). */
  function _saveSettingsData(data, deps) {
    var T = deps.T;
    data.savedAt = Date.now();
    return deps.apiPost('sprint-data', { settings: data }).then(function (resp) {
      if (!resp || !resp.success) {
        var reason = (resp && resp.reason) || (resp && resp.error) || 'unknown';
        deps.toast(T('toastSettingsErr'), 'err');
        return { success: false, reason: reason };
      }
      try {
        var cur = deps.state.getSettings();
        if (cur && (cur.fieldSprint  !== data.fieldSprint))  deps.invalidateFieldValuesCache(cur.fieldSprint);
        if (cur && (cur.fieldVersion !== data.fieldVersion)) deps.invalidateFieldValuesCache(cur.fieldVersion);
      } catch (_) {}
      deps.state.setSettings(data);
      deps.syncProjectDefaultLang();
      deps.refreshFeatureStatusBar();
      var bc = document.getElementById('bannerCfg');
      if (bc) bc.classList.add('hidden');
      deps.toast(T('toastSettingsSaved'), 'success');
      var missingRequired = [];
      if (!data.fieldPriority) missingRequired.push(T('fldPriority'));
      if (!data.fieldState)    missingRequired.push(T('fldState'));
      if (missingRequired.length) {
        setTimeout(function () {
          deps.toast(T('toastRequiredFieldsMissing') + ': ' + missingRequired.join(', '), 'warn');
        }, 400);
      }
      deps.checkValidator();
      deps.checkEditorRights();
      deps.checkAssignerRights();
      deps.applyPersonalPlanningVisibility();
      deps.refreshClearHistoryBtn();
      deps.renderPlannerRoles();
      try { deps.applyDiagLogVisibility(); } catch (_) {}
      return { success: true };
    });
  }

  /* #25 Ф1-A — сборка props формы настроек. Переиспользуется модалкой (global)
     и inline-страницей проектного виджета (_renderProjectSettingsPage). */
  function buildSettingsFormProps(onCloseFn, deps, opts) {
    var st = deps.state;
    var langs = (typeof window !== 'undefined' && window.__SSP_I18N_LANGS__) || [];
    var defaultLangOptions = langs.map(function (l) {
      return { value: l.code, label: (l.flag ? l.flag + ' ' : '') + l.native + ' (' + l.code + ')' };
    });
    var settings = st.getSettings();
    return {
      initial:            settings || {},
      roles:              deps.ALL_ROLES,
      fieldsByType:       _buildFieldsByType(deps),
      defaultLangOptions: defaultLangOptions,
      uiLang:             st.getLang(),
      t:                  deps.T,
      initialGroups:      st.getProjectGroups() || [],
      loadGroups:         function () { return deps.loadProjectGroups().then(function () { return st.getProjectGroups(); }); },
      /* v2.15.3 — теги для picker'а «Теги паузы» (#21): кэш на сессию формы. */
      loadTags:           function () {
        if (deps._tagsCache) return Promise.resolve(deps._tagsCache);
        return deps.loadProjectTags().then(function (tags) { deps._tagsCache = tags; return tags; });
      },
      enumFields:         (_buildFieldsByType(deps).enumFields) || [],
      stateFieldName:     (settings && typeof settings.fieldState === 'string' && settings.fieldState) ? settings.fieldState : 'State',
      loadFieldValues:    function (fieldName) {
        if (!fieldName) return Promise.resolve([]);
        var cache = deps.fieldValuesCache;
        if (cache[fieldName]) return Promise.resolve(cache[fieldName].values || []);
        return deps.apiGet('field-values?fieldName=' + encodeURIComponent(fieldName)).then(function (r) {
          if (r && r.success && r.values) cache[fieldName] = r;
          return (r && r.values) || [];
        }).catch(function () { return []; });
      },
      onUiLangChange:     function (lang) { deps.setLang(lang); },
      onSave:             function (data) { return _saveSettingsData(data, deps); },
      /* #22 — admin-тир (workflow + доступ/права) рендерится только при true. */
      canEditWorkflow:    !!(opts && opts.canEditWorkflow),
      onClose:            onCloseFn,
    };
  }

  function openSettingsModal(deps) {
    var T = deps.T;
    deps.apiGet('check-settings-manager').then(function (r) {
      deps.diag('settingsModal open: configured=' + (r && r.configured) + ' canManage=' + (r && r.canManage), 'info');

      if (!r || !r.configured) {
        deps.openModal({
          id: 'settingsAccess', type: 'info', title: T('appTitleSettings'),
          body: { kind: 'text', text: T('settingsNotConfiguredHint') },
          buttons: [{ id: 'ok', text: T('btnCancel'), variant: 'primary', onClick: function (h) { h.close(); } }],
          dismissOnBackdrop: true, showCloseButton: true,
        });
        return;
      }
      /* #22 — открываем форму settings-менеджеру ИЛИ планировочному менеджеру
         (canManagePlanning). Fallback на canManage для старого backend. */
      var canManagePlanning = !!(r.canManagePlanning || r.canManage);
      var canEditWorkflow   = (r.canEditWorkflow !== undefined) ? !!r.canEditWorkflow : !!r.canManage;
      if (!canManagePlanning) {
        var txt = T('settingsNoAccessHint');
        if (r.groupName) txt += ' (' + T('settingsNoAccessGroup').replace('{group}', r.groupName) + ')';
        deps.openModal({
          id: 'settingsAccess', type: 'info', title: T('appTitleSettings'),
          body: { kind: 'text', text: txt },
          buttons: [{ id: 'ok', text: T('btnCancel'), variant: 'primary', onClick: function (h) { h.close(); } }],
          dismissOnBackdrop: true, showCloseButton: true,
        });
        return;
      }

      /* canManage → форма. Lazy-load групп (для 5b multi-select). */
      if (typeof deps.loadProjectGroups === 'function' && !window._sspGroupsLoaded) {
        window._sspGroupsLoaded = true;
        deps.loadProjectGroups().catch(function (e) { deps.diag('lazy loadProjectGroups err: ' + e, 'err'); });
      }

      var handle = deps.openModal({
        id: 'settings', type: 'form', title: T('appTitleSettings'),
        dialogClass: 'ssp-ring-modal--wide ssp-ring-modal--settings',
        body: { kind: 'component', name: 'settingsForm',
          props: buildSettingsFormProps(function () { if (handle) handle.close(); }, deps, { canEditWorkflow: canEditWorkflow }) },
        buttons: [],
        dismissOnBackdrop: false,
        blockEscape: false,
        /* showCloseButton:false — форма рисует свой явный × (ssp-settings-close). */
        showCloseButton: false,
        onClose: function () { /* idемпотентный close из foundation */ },
      });
    }).catch(function (e) {
      deps.diag('openSettingsModal check ERR: ' + String(e), 'err');
      deps.toast(T('toastInitError') + (e && e.message ? e.message : String(e)), 'err');
    });
  }

  var api = {
    openSettingsModal: openSettingsModal,
    buildSettingsFormProps: buildSettingsFormProps,
    _saveSettingsData: _saveSettingsData,
    _buildFieldsByType: _buildFieldsByType,
  };
  if (typeof window !== 'undefined') window.__SSP_SETTINGS_CTRL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
