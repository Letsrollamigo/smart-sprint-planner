/**
 * excluded-view.js — #121 «Исключённые задачи с причиной» (v3.46.0): блок «Исключённые из спринта (N)» под
 * таблицей состава роли (хост #exclHost_<rk> в карточке «Состав спринта — роль», спойлер .ssp-excluded,
 * по умолчанию свёрнут, раскрытость держится на сессию), исключение с причиной из селекта статуса и два
 * действия блока. Мост window.__SSP_EXCLUDED_VIEW; deps — _roleCompDeps ядра (та же фабрика, что у состава).
 *
 *   • renderExcludedBlock(rk, deps) — строки = состав роли, как его показывает таблица (живой _roleItems или
 *     снимок истории в историческом виде), только INC_EXCLUDED, в порядке хранения. N = 0 → хост пуст.
 *     Кнопок нет при isLocked (исторический вид / ALLOCATED без рабочей копии — как у селекта таблицы);
 *     без прав — btn--disabled-rights + подсказка (права резолвятся позже первого рендера — прятать нельзя,
 *     асинхронный переворот делает permissions.js по классу .excluded-btn). Подсказка полного текста — только
 *     на обрезанных строках; свёрнутый спойлер display:none → детект при раскрытии.
 *   • excludeWithReason(rk, iid, prevStatus, selectEl, deps) — окно причины; «Отмена» → селект назад, модель
 *     не тронута (черновик и dirty тоже). «Исключить» → undo-снимок ДО мутации (источник + цели каскада #59),
 *     статус + причина + отметки, каскад с тем же payload, один POST sprint-data; отказ сервера откатывает
 *     всё (правило #100) — кроме editor_rights_required у валидатора: его правка живёт локально и уезжает
 *     под ?action=validate (путь #67 H5), тоста нет.
 *   • returnToSprint(rk, iid, deps) — «Включена планово», три ключа стираются, каскада нет (#59 односторонний).
 *   • editReason(rk, iid, deps) — только причина; отметки «кто/когда» не переставляются (⚖12).
 *
 * Отметки на клиенте оптимистичные (форма как у addedBy); сервер переопределяет на записи и до следующего
 * GET sprint-data блок показывает клиентские. Состояние модуля — только _open (раскрытость по роли, реестр §11).
 */
(function () {
  'use strict';

  var _open = {};   /* раскрытость блока по роли — на сессию, без персиста (⚖13) */
  var KEYS = ['excludeReason', 'excludedAt', 'excludedBy'];

  function _host(rk) { return document.getElementById('exclHost_' + rk); }
  function _findIdx(arr, iid) {
    for (var i = 0; i < (arr || []).length; i++) { if (arr[i] && arr[i].issueId === iid) return i; }
    return -1;
  }
  function _isHistorical(deps) {
    var sid = deps.state.getCurrentSprintId(), sp = deps.state.getSprint();
    return !!(sid && sp && sid !== sp.sprintId);
  }
  /* Состав роли, как его показывает таблица (_viewItems состава): снимок истории в историческом виде. */
  function _viewItems(rk, deps) {
    if (_isHistorical(deps)) {
      var sid = deps.state.getCurrentSprintId(), hist = deps.state.getHistory();
      var snap = (Array.isArray(hist) ? hist : []).find(function (h) { return h && h.sprintId === sid + '_' + rk; });
      return (snap && Array.isArray(snap.items)) ? snap.items : [];
    }
    return deps.getRoleItemsArr(rk) || [];
  }
  /* Лок — как у контролов таблицы (rolecomposition-view isLocked). */
  function _isLocked(rk, deps) {
    var sp = deps.state.getSprint();
    var wcKey = sp ? (sp.sprintId + '_' + rk) : null;
    var wcActive = !!(wcKey && deps.state.getActiveWorkingDraftKey && deps.state.getActiveWorkingDraftKey() === wcKey);
    return _isHistorical(deps) || !!(sp && deps.statusForRole(rk) === deps.STATUS.ALLOCATED && !wcActive);
  }
  function _me(deps) {
    var u = deps.state.getCurrentUser ? deps.state.getCurrentUser() : null;
    return u ? String(u.fullName || u.login || '') : '';
  }
  function _roleObj(rk, deps) {
    var all = deps.ALL_ROLES || [];
    for (var i = 0; i < all.length; i++) { if (all[i] && all[i].key === rk) return all[i]; }
    return { key: rk, label: rk };
  }
  function _roleLine(rk, deps) {
    var sp = deps.state.getSprint();
    return deps.T('excludeReasonContext').replace('{role}', deps.roleLabel(_roleObj(rk, deps))).replace('{sprint}', (sp && sp.name) || '');
  }
  function _stampText(it, deps) {
    if (typeof it.excludedAt !== 'number' && !it.excludedBy) return '';
    return deps.T('excludedStamp')
      .replace('{date}', typeof it.excludedAt === 'number' ? deps.fmtDT(it.excludedAt) : '—')
      .replace('{user}', it.excludedBy || '—');
  }
  function _snapOf(it) { return { inclusionStatus: it.inclusionStatus, excludeReason: it.excludeReason, excludedAt: it.excludedAt, excludedBy: it.excludedBy }; }
  function _restore(undo, deps) {
    undo.forEach(function (u) {
      var arr = deps.getRoleItemsArr(u.rk), i = _findIdx(arr, u.iid);
      if (i < 0) return;
      arr[i].inclusionStatus = u.prev.inclusionStatus;
      KEYS.forEach(function (k) { if (u.prev[k] === undefined) delete arr[i][k]; else arr[i][k] = u.prev[k]; });
    });
  }
  /* Правило #100 с одним исключением: 403 editor_rights_required у валидатора — правка остаётся (путь validate). */
  function _keepLocal(e, deps) {
    var msg = (e && e.message) ? e.message : String(e);
    return /^editor_rights_required/.test(msg) && !!deps.state.getIsValidator();
  }
  function _rerender(rks, deps) {
    rks.forEach(function (rk) { deps.updateRoleRemaining(rk); deps.renderRoleComposition(rk); });
  }
  function _afterMutation(rks, deps) {
    _rerender(rks, deps);
    deps.markDirty('roleItems');
    deps.draftSaveDebounced('roleItems', function () { return deps.state.getRoleItems(); });
  }
  function _persist(undo, rks, deps) {
    return deps.apiPost('sprint-data', { roleItems: deps.state.getRoleItems() }).catch(function (e) {
      var msg = (e && e.message) ? e.message : String(e);
      if (_keepLocal(e, deps)) { deps.diag('#121 persist 403 у валидатора — правка остаётся локально (уедет под validate): ' + msg, 'info'); return; }
      deps.diag('#121 persist ERR → откат: ' + msg, 'err');
      _restore(undo, deps);
      _rerender(rks, deps);
      deps.draftSaveDebounced('roleItems', function () { return deps.state.getRoleItems(); });
      if (/^reason_required/.test(msg)) deps.toast(deps.T('toastExcludeReasonRequired'), 'err');
      else if (!/^rev_conflict/.test(msg)) deps.toast(deps.T('toastError') + msg, 'err');   /* rev_conflict тостит apiPost */
    });
  }
  /* Гейт действий на момент события — защита в глубину поверх отсутствующих кнопок. */
  function _blocked(rk, deps) { return _isLocked(rk, deps); }

  function _btn(action, label, extra, canAct, deps) {
    return '<button type="button" class="ring-button-button ring-button-block ring-button-heightS' + extra + ' excluded-btn' +
      (canAct ? '' : ' btn--disabled-rights') + '" data-action="' + action + '"' +
      (canAct ? '' : ' data-tooltip="' + deps.esc(deps.T('tooltipNoRightsPhases')) + '"') + '>' + deps.esc(label) + '</button>';
  }

  function renderExcludedBlock(rk, deps) {
    var host = _host(rk);
    if (!host) return;
    var T = deps.T, esc = deps.esc;
    if (typeof deps.unmountTooltips === 'function') deps.unmountTooltips(host);
    var items = _viewItems(rk, deps).filter(function (it) { return it && it.inclusionStatus === deps.INC.EXCLUDED; });
    host.__sspExclTips = {};
    if (!items.length) { host.innerHTML = ''; return; }
    var locked = _isLocked(rk, deps);
    var canAct = !!(deps.state.getIsEditor() || deps.state.getIsValidator());
    var titleParts = T('excludedBlockTitle').split('{n}');
    var h = '<div class="spoiler ssp-excluded' + (_open[rk] ? ' open' : '') + (locked ? ' is-readonly' : '') + '">' +
      '<div class="spoiler__head"><span class="spoiler__arrow">▶</span><span class="ssp-excluded__title">' +
      esc(titleParts[0]) + '<span class="ssp-excluded__count">' + items.length + '</span>' + esc(titleParts[1] || '') + '</span></div>' +
      '<div class="spoiler__body">' +
      '<div class="ssp-excluded__row ssp-excluded__row--head"><div>' + esc(T('excludedColTask')) + '</div><div>' + esc(T('excludedColReason')) + '</div><div>' + esc(T('excludedColBy')) + '</div>' + (locked ? '' : '<div></div>') + '</div>';
    items.forEach(function (it) {
      var reason = (typeof it.excludeReason === 'string') ? it.excludeReason : '';
      var stamp = _stampText(it, deps);
      host.__sspExclTips[it.issueId] = reason + (stamp ? '\n' + stamp : '');
      h += '<div class="ssp-excluded__row" data-iid="' + esc(it.issueId) + '">' +
        '<div class="ssp-excluded__task"><a class="ssp-excluded__key link" href="' + deps.safeUrl(it.url) + '" target="_blank" rel="noopener noreferrer">' + esc(it.issueId) + '</a> <span class="ssp-excluded__name">' + esc(it.title || '') + '</span></div>' +
        '<div class="ssp-excluded__reason"><div class="ssp-excluded__reason-text">' + (reason ? esc(reason) : '—') + '</div></div>' +
        '<div class="ssp-excluded__stamp">' + (stamp ? esc(stamp) : '—') + '</div>' +
        (locked ? '' : '<div class="ssp-excluded__actions">' + _btn('return', T('btnReturnToSprint'), '', canAct, deps) + _btn('edit', T('btnEditReason'), ' ring-button-ghost ring-button-flat', canAct, deps) + '</div>') +
        '</div>';
    });
    host.innerHTML = h + '</div></div>';
    _bind(rk, host, deps);
    if (_open[rk]) _applyTooltips(rk, deps);
  }

  /* Подсказка полного текста — только на обрезанных строках (детект после раскрытия: свёрнутый
     спойлер display:none даёт нули). Атрибут на внутреннем __reason-text: мост переносит узел в обёртку,
     grid-ячейка должна остаться на месте. */
  function _applyTooltips(rk, deps) {
    var host = _host(rk);
    if (!host || !_open[rk]) return;
    var isTrunc = (typeof deps.isTruncated === 'function') ? deps.isTruncated : function (el) { return el.scrollHeight > el.clientHeight; };
    var n = 0;
    host.querySelectorAll('.ssp-excluded__row[data-iid]').forEach(function (row) {
      var el = row.querySelector('.ssp-excluded__reason-text');
      if (!el || el.__sspTipWrap || el.hasAttribute('data-ssp-tooltip') || !isTrunc(el)) return;
      el.setAttribute('data-ssp-tooltip', (host.__sspExclTips || {})[row.getAttribute('data-iid')] || '');
      n++;
    });
    if (n && typeof deps.mountTooltips === 'function') deps.mountTooltips(host);
  }

  function _bind(rk, host, deps) {
    if (host.__sspExclBound) return;
    host.__sspExclBound = true;
    /* DOM свой, не Ring Table — обычный click (перехвата фокуса строки нет). Deps захвачены при биндинге:
       сервисы стабильны, аксессоры live (тот же контракт, что у делегатов таблицы состава). */
    host.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('.spoiler__head')) {
        _open[rk] = !_open[rk];
        var box = host.querySelector('.ssp-excluded');
        if (box) box.classList.toggle('open', !!_open[rk]);
        if (_open[rk]) _applyTooltips(rk, deps);
        return;
      }
      var btn = t.closest('button.excluded-btn[data-action]');
      if (!btn || btn.disabled || btn.classList.contains('btn--disabled-rights')) return;
      var row = btn.closest('.ssp-excluded__row[data-iid]');
      var iid = row ? row.getAttribute('data-iid') : null;
      if (!iid) return;
      if (btn.getAttribute('data-action') === 'return') returnToSprint(rk, iid, deps);
      else editReason(rk, iid, deps);
    });
  }

  function excludeWithReason(rk, iid, prevStatus, selectEl, deps) {
    var T = deps.T;
    var reset = function () { if (selectEl) { try { selectEl.value = prevStatus; } catch (_) {} } };
    var arr = deps.getRoleItemsArr(rk), idx = _findIdx(arr, iid);
    if (idx < 0 || (deps.isModalOpen && deps.isModalOpen('excludeReason'))) { reset(); return; }   /* гард второго окна (#127) */
    var it = arr[idx];
    var s = deps.state.getSettings();
    var cascadeOn = !(s && s.crossRoleExcludeEnabled === false);
    /* строка каскада — «на сухую», модель не трогаем до «Исключить» (§О2) */
    var targets = cascadeOn ? deps.cascadeTargets(deps.state.getRoleItems(), rk, iid, deps.INC.EXCLUDED) : [];
    var names = targets.map(function (t) { return '«' + deps.roleLabel(_roleObj(t.rk, deps)) + '»'; });
    return deps.openExcludeReasonDialog({
      mode: 'exclude', issueKey: it.issueId, issueTitle: it.title || '', roleLine: _roleLine(rk, deps),
      cascadeText: names.length ? T('excludeReasonCascade').replace('{roles}', names.join(', ')) : null,
      existingReason: '',
    }).then(function (reason) {
      if (reason === null || reason === undefined) { reset(); return; }
      var undo = [{ rk: rk, iid: iid, prev: _snapOf(it) }].concat(targets.map(function (t) {
        var ti = _findIdx(deps.getRoleItemsArr(t.rk), iid);
        return { rk: t.rk, iid: iid, prev: _snapOf(ti >= 0 ? deps.getRoleItemsArr(t.rk)[ti] : {}) };
      }));
      var payload = { excludeReason: reason, excludedAt: Date.now(), excludedBy: _me(deps) };
      it.inclusionStatus = deps.INC.EXCLUDED;
      KEYS.forEach(function (k) { it[k] = payload[k]; });
      var touched = cascadeOn ? deps.cascadeExcludeAcrossRoles(deps.state.getRoleItems(), rk, iid, 'exclude', deps.INC.EXCLUDED, payload) : [];
      if (touched.length) deps.toast(T('toastCrossRoleExcluded').replace('{n}', String(touched.length)), 'success');
      _afterMutation([rk].concat(touched), deps);
      return _persist(undo, [rk].concat(touched), deps);
    });
  }

  function returnToSprint(rk, iid, deps) {
    if (_blocked(rk, deps)) return;
    var arr = deps.getRoleItemsArr(rk), idx = _findIdx(arr, iid);
    if (idx < 0) return;
    var it = arr[idx], undo = [{ rk: rk, iid: iid, prev: _snapOf(it) }];
    it.inclusionStatus = deps.INC.PLANNED;   /* §О7 — возврат = новое решение о включении */
    KEYS.forEach(function (k) { delete it[k]; });
    _afterMutation([rk], deps);
    return _persist(undo, [rk], deps);
  }

  function editReason(rk, iid, deps) {
    if (_blocked(rk, deps)) return;
    var arr = deps.getRoleItemsArr(rk), idx = _findIdx(arr, iid);
    if (idx < 0 || (deps.isModalOpen && deps.isModalOpen('excludeReason'))) return;
    var it = arr[idx];
    return deps.openExcludeReasonDialog({
      mode: 'edit', issueKey: it.issueId, issueTitle: it.title || '', roleLine: _roleLine(rk, deps),
      stampText: _stampText(it, deps) || null,
      existingReason: (typeof it.excludeReason === 'string') ? it.excludeReason : '',
    }).then(function (reason) {
      if (reason === null || reason === undefined) return;
      var i2 = _findIdx(deps.getRoleItemsArr(rk), iid);
      if (i2 < 0) return;
      var cur = deps.getRoleItemsArr(rk)[i2], undo = [{ rk: rk, iid: iid, prev: _snapOf(cur) }];
      cur.excludeReason = reason;   /* отметки не трогаем (⚖12) */
      _afterMutation([rk], deps);
      return _persist(undo, [rk], deps);
    });
  }

  var api = {
    renderExcludedBlock: renderExcludedBlock,
    excludeWithReason: excludeWithReason,
    returnToSprint: returnToSprint,
    editReason: editReason,
  };
  if (typeof window !== 'undefined') window.__SSP_EXCLUDED_VIEW = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
