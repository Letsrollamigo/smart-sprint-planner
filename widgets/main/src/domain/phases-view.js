/**
 * phases-view.js — #120 «Фазы работ внутри спринта»: блок «Фазы работ» в карточке «Вводные данные
 * по спринту» (ниже кнопки «Сохранить параметры спринта», со своей кнопкой «Сохранить фазы работ»).
 * Мост window.__SSP_PHASES_VIEW.
 *
 *   • renderPhasesBlock(rk, deps) — перерисовка блока по состоянию: тумблер выключен → контейнер скрыт;
 *     строка на фазу (название [+ чип роли] → дорожка-отрезок → пикер «с» → «→» → пикер «по» → пометки);
 *     шкала спринта одна на все строки (понедельники + последний день); тон по маппингу «фаза → роли»
 *     из настроек (правило одного тона — pure/phases-pure.js tone); предупреждения (сломанный порядок,
 *     «вне диапазона» после сдвига спринта) — оранжевые, Ring Tooltip через мост __SSP_TOOLTIP;
 *     права/завершённость/отсутствие дат спринта — пикеры data-disabled + кнопка приглушена. Класс прав
 *     кнопки ставит сам рендер (шапка перерисовывается на каждой смене спринта/роли, а
 *     applyEditorRightsToUI зовётся не после каждого рендера); блок в permissions.js — только
 *     асинхронный переворот на старте.
 *   • bindPhasesBlock(deps) — один раз: делегированный click кнопки на контейнере (innerHTML
 *     перерисовывается, контейнер живёт).
 *   • readForm(block) → phases из хостов пикеров (data-value → fromDateIn; половинка пары остаётся —
 *     её ловит rowErrors).
 *   • applySaved(resp, deps) — единственное место мутации модели: _sprint (если держит спринт) и все
 *     записи _history базового id получают phases/phasesUpdatedAt/phasesUpdatedBy из ответа сервера
 *     (правило #100: до ответа ничего не менялось — откатывать нечего).
 *
 * Источник данных — тот же объект, что у имени/дат вводных (deps.getIntroSource: активный _sprint,
 * если он и есть выбранный, иначе первый снимок истории базового id); фазы — из носителя: intro,
 * если несёт ключ phases, иначе первый снимок базового id с phases, иначе «не заданы». Состояние
 * правок — DOM хостов (data-value); module-level стейта нет (гейт C).
 * Все даты — только через dayMs pure-модуля (голден renderRolePlannerHeader под TZ=America/Los_Angeles).
 */
(function () {
  'use strict';

  var PURE = (typeof window !== 'undefined' && window.__SSP_PHASES_PURE)
    || (typeof require === 'function' ? require('../pure/phases-pure.js') : null);
  var KNOWN_REFUSALS = { phases_out_of_sprint: 'phasesErrOutOfSprint', invalid_phases_structure: 'phasesErrHalfPair',
    sprint_finished: 'phasesFinished', sprint_dates_missing: 'phasesNeedSprintDates', phases_disabled: 'phasesNotSaved' };

  function _block() { return document.getElementById('sprintPhasesBlock'); }
  function _baseId(id) { return String(id || '').split('_')[0]; }

  /* Носитель фаз для выбранного спринта: intro (если несёт ключ), иначе первый снимок базового id с phases. */
  function _carrier(intro, deps) {
    if (!intro) return null;
    if (intro.phases !== undefined) return intro;
    var sid = _baseId(intro.sprintId);
    var hist = deps.state.getHistory();
    if (Array.isArray(hist)) {
      for (var i = 0; i < hist.length; i++) {
        var r = hist[i];
        if (r && typeof r.sprintId === 'string' && _baseId(r.sprintId) === sid && r.phases !== undefined) return r;
      }
    }
    return null;
  }

  /* Завершён — слот не держит спринт И все его снимки FINISHED (смешанный статус — не завершён, ⚖3). */
  function _isFinished(intro, deps) {
    if (!intro || !intro.sprintId) return false;
    var sid = _baseId(intro.sprintId);
    var slot = deps.state.getSprint();
    if (slot && slot.sprintId === sid) return false;
    var hist = deps.state.getHistory();
    var snaps = Array.isArray(hist) ? hist.filter(function (r) { return r && typeof r.sprintId === 'string' && _baseId(r.sprintId) === sid; }) : [];
    return snaps.length > 0 && snaps.every(function (s) { return s.status === deps.STATUS.FINISHED; });
  }

  function _canEdit(deps) { return !!(deps.state.getIsEditor() || deps.state.getIsValidator()); }

  function _tickLabel(ts, deps) {
    try { return new Date(ts).toLocaleDateString(deps.getLang() || 'en', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
    catch (_) { return deps.fmtDay(ts); }
  }
  function _warnIcon(deps) {
    var svg = (deps.ICONS && deps.ICONS.warning) || '';
    return svg ? '<span class="ssp-icon" aria-hidden="true">' + svg + '</span>' : '';
  }
  function _host(key, edge, ymd, min, max, disabled, err) {
    return '<span data-ssp-datepicker-host data-ssp-phase="' + key + '" data-ssp-edge="' + edge + '"'
      + ' data-value="' + (ymd || '') + '"' + (min ? ' data-min="' + min + '"' : '') + (max ? ' data-max="' + max + '"' : '')
      + (disabled ? ' data-disabled="1"' : '') + ' class="' + (err ? 'is-err' : '') + '"></span>';
  }

  function renderPhasesBlock(rk, deps) {
    var block = _block();
    if (!block) return;
    var T = deps.T, esc = deps.esc, P = PURE;
    var settings = deps.state.getSettings();
    if (!settings || settings.phasesEnabled !== true || !P) {
      if (deps.unmountDatepickers) deps.unmountDatepickers(block);
      if (deps.unmountTooltips) deps.unmountTooltips(block);
      block.innerHTML = '';
      block.classList.add('hidden');
      return;
    }
    var intro = deps.getIntroSource();
    if (!intro || !intro.sprintId) {
      if (deps.unmountDatepickers) deps.unmountDatepickers(block);
      if (deps.unmountTooltips) deps.unmountTooltips(block);
      block.innerHTML = '';
      block.classList.add('hidden');
      return;
    }
    rk = rk || block.dataset.sspRk || null;               /* смена спринта без роли — тон прежней роли рельса */
    block.dataset.sspRk = rk || '';
    var carrier = _carrier(intro, deps);
    var phases = P.normalize(carrier ? carrier.phases : null);
    var updatedAt = carrier && typeof carrier.phasesUpdatedAt === 'number' ? carrier.phasesUpdatedAt : null;
    var updatedBy = carrier ? (carrier.phasesUpdatedBy || '') : '';
    var sc = P.scale(intro);
    var finished = _isFinished(intro, deps);
    var canEdit = _canEdit(deps);
    var disabled = !canEdit || finished || !sc;
    var warns = P.orderWarnings(phases);
    var oor = P.outOfRange(phases, intro);
    var minYmd = sc ? deps.toDateIn(intro.dateStart) : '', maxYmd = sc ? deps.toDateIn(intro.dateEnd) : '';
    var roleObj = (deps.ALL_ROLES || []).filter(function (r) { return r.key === rk; })[0];
    var roleName = roleObj ? deps.roleLabel(roleObj) : '';
    var fromLbl = sc ? deps.fmtDay(intro.dateStart) : '', toLbl = sc ? deps.fmtDay(intro.dateEnd) : '';

    var h = '<div class="ssp-phases__title">' + esc(T('phasesTitle'));
    if (updatedAt !== null) {
      h += '<span class="ssp-phases__stamp">' + esc(T('phasesStamp').replace('{who}', updatedBy).replace('{when}', deps.fmtDT(updatedAt))) + '</span>';
    }
    h += '</div><div class="ssp-phases">';
    h += '<div class="ssp-phases__h">' + esc(T('phasesColPhase')) + '</div><div class="ssp-phases__axis">';
    if (sc) sc.ticks.forEach(function (t) {
      h += '<span class="ssp-phases__tick"' + (t.last ? ' style="right:0"' : ' style="left:' + t.pct.toFixed(3) + '%"') + '>' + esc(_tickLabel(t.ts, deps)) + '</span>';
    });
    h += '</div><div class="ssp-phases__h">' + esc(T('phasesColFrom')) + '</div><div></div><div class="ssp-phases__h">' + esc(T('phasesColTo')) + '</div><div></div>';
    var laneStyle = sc ? ' style="background-size:' + sc.weekPct.toFixed(3) + '% 100%"' : '';
    P.PHASE_KEYS.forEach(function (k) {
      var p = phases[k];
      var tn = P.tone(k, rk, settings.phaseRoles);
      var nameCls = 'ssp-phases__name' + (tn !== 'other' ? ' is-mine' : '') + (!p ? ' is-empty' : '');
      h += '<div class="' + nameCls + '">' + esc(T(P.LABEL_KEYS[k]));
      if (tn === 'mine' && roleName) h += '<span class="ssp-phases__role">' + esc(roleName) + '</span>';
      h += '</div>';
      var seg = P.segment(p, intro);
      h += '<div class="ssp-phases__lane"' + laneStyle + '>';
      if (seg) {
        var isOor = oor.indexOf(k) >= 0, isWarn = !!warns[k];
        var segCls = 'ssp-phases__seg' + (tn !== 'other' ? ' is-mine' : '') + (isWarn ? ' is-warn' : '') + (isOor ? ' is-oor' : '');
        var tail = seg.clipRight ? ' data-tail="right"' : (seg.clipLeft ? ' data-tail="left"' : '');
        h += '<span class="' + segCls + '"' + tail + ' style="left:' + seg.leftPct.toFixed(2) + '%;width:' + seg.widthPct.toFixed(2) + '%"></span>';
      }
      h += '</div>';
      h += _host(k, 'start', p ? deps.toDateIn(p.dateStart) : '', minYmd, maxYmd, disabled, false);
      h += '<div class="ssp-phases__arrow">→</div>';
      h += _host(k, 'end', p ? deps.toDateIn(p.dateEnd) : '', minYmd, maxYmd, disabled, false);
      var status = '';
      if (!p) status = '<em>' + esc(T('phasesNotPlanned')) + '</em>';
      else if (warns[k]) {
        var prevLbl = T(P.LABEL_KEYS[warns[k]]);
        var tip = T('phasesWarnOrderTip').replace('{date}', deps.fmtDay(p.dateStart)).replace('{phase}', prevLbl).replace('{prevDate}', deps.fmtDay(phases[warns[k]].dateStart));
        status = '<span class="ssp-phases__warn" data-ssp-tooltip="' + esc(tip) + '">' + _warnIcon(deps) + esc(T('phasesWarnOrder').replace('{phase}', prevLbl)) + '</span>';
      } else if (oor.indexOf(k) >= 0) {
        var tip2 = T('phasesWarnOutOfRangeTip').replace('{from}', fromLbl).replace('{to}', toLbl);
        status = '<span class="ssp-phases__warn" data-ssp-tooltip="' + esc(tip2) + '">' + _warnIcon(deps) + esc(T('outOfRangeWarn')) + '</span>';
      }
      h += '<div class="ssp-phases__status' + (!p ? ' is-empty' : '') + '" data-ssp-phase="' + k + '">' + status + '</div>';
    });
    h += '</div><div class="ssp-phases__actions">';
    var btnCls = 'ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText phases-btn' + (!canEdit ? ' btn--disabled-rights' : '');
    var btnAttrs = !canEdit ? ' data-tooltip="' + esc(T('tooltipNoRightsPhases')) + '"'
      : (finished ? ' disabled title="' + esc(T('phasesFinished')) + '"' : (!sc ? ' disabled title="' + esc(T('phasesNeedSprintDates')) + '"' : ''));
    h += '<button id="savePhasesBtn" type="button" class="' + btnCls + '"' + btnAttrs + '>' + esc(T('btnSavePhases')) + '</button>';
    h += '<span class="ssp-phases__errline" id="errPhases"></span></div>';

    if (deps.unmountDatepickers) deps.unmountDatepickers(block);
    if (deps.unmountTooltips) deps.unmountTooltips(block);
    block.innerHTML = h;
    block.classList.remove('hidden');
    if (deps.mountDatepickers) deps.mountDatepickers(block);
    if (deps.mountTooltips) deps.mountTooltips(block);
    bindPhasesBlock(deps);
  }

  function readForm(block) {
    var out = {};
    PURE.PHASE_KEYS.forEach(function (k) {
      var s = block.querySelector('[data-ssp-datepicker-host][data-ssp-phase="' + k + '"][data-ssp-edge="start"]');
      var e = block.querySelector('[data-ssp-datepicker-host][data-ssp-phase="' + k + '"][data-ssp-edge="end"]');
      var sv = s && s.dataset.value ? PURE.dayMs(_fromYmd(s.dataset.value)) : null;
      var ev = e && e.dataset.value ? PURE.dayMs(_fromYmd(e.dataset.value)) : null;
      out[k] = (sv === null && ev === null) ? null : { dateStart: sv, dateEnd: ev };
    });
    return out;
  }
  function _fromYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : new Date(s).getTime();
  }

  /* Пометки отказа по строкам (in place, без перерисовки: ввод пользователя остаётся в пикерах). */
  function _markErrors(block, errors, deps, ctx) {
    var T = deps.T, esc = deps.esc, any = false;
    PURE.PHASE_KEYS.forEach(function (k) {
      var code = errors[k];
      var hosts = block.querySelectorAll('[data-ssp-datepicker-host][data-ssp-phase="' + k + '"]');
      var st = block.querySelector('.ssp-phases__status[data-ssp-phase="' + k + '"]');
      Array.prototype.forEach.call(hosts, function (hh) { hh.classList.toggle('is-err', !!code); });
      if (!code || !st) return;
      any = true;
      var msgKey = code === 'half' ? 'phasesErrHalfPair' : (code === 'endBeforeStart' ? 'phasesErrEndBeforeStart' : (code === 'outOfSprint' ? 'phasesErrOutOfSprint' : code));
      var msg = T(msgKey).replace('{from}', ctx.from).replace('{to}', ctx.to);
      st.innerHTML = '<span class="ssp-phases__err">' + _warnIcon(deps) + esc(msg) + '</span>';
    });
    var line = block.querySelector('#errPhases');
    if (line) line.textContent = any ? T('phasesNotSaved') : '';
    return any;
  }

  function applySaved(resp, deps) {
    if (!resp || !resp.sprintId) return;
    var sid = _baseId(resp.sprintId);
    var stamp = { phases: resp.phases, phasesUpdatedAt: resp.phasesUpdatedAt, phasesUpdatedBy: resp.phasesUpdatedBy };
    var slot = deps.state.getSprint();
    if (slot && slot.sprintId === sid) { slot.phases = stamp.phases; slot.phasesUpdatedAt = stamp.phasesUpdatedAt; slot.phasesUpdatedBy = stamp.phasesUpdatedBy; }
    var hist = deps.state.getHistory();
    if (Array.isArray(hist)) hist.forEach(function (r) {
      if (r && typeof r.sprintId === 'string' && _baseId(r.sprintId) === sid) { r.phases = stamp.phases; r.phasesUpdatedAt = stamp.phasesUpdatedAt; r.phasesUpdatedBy = stamp.phasesUpdatedBy; }
    });
  }

  function onSave(deps) {
    var block = _block();
    if (!block || !PURE) return;
    var T = deps.T;
    var intro = deps.getIntroSource();
    if (!intro || !intro.sprintId) return;
    var carrier = _carrier(intro, deps);
    var stored = PURE.normalize(carrier ? carrier.phases : null);
    var form = readForm(block);
    var ctx = { from: deps.fmtDay(intro.dateStart), to: deps.fmtDay(intro.dateEnd) };
    var errors = PURE.rowErrors(form, stored, intro);
    if (_markErrors(block, errors, deps, ctx)) return;
    if (PURE.isSame(form, stored)) return;                        /* ничего не изменилось — не делаем вид, что сохранили */
    var btn = block.querySelector('#savePhasesBtn');
    var orig = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = T('toastSaving'); }
    var sid = _baseId(intro.sprintId);
    var rk = block.dataset.sspRk || null;
    deps.apiPost('sprint-data', { sprint: { sprintId: sid, phases: PURE.normalize(form) } }, { action: 'phases' })
      .then(function (resp) {
        applySaved(resp, deps);
        renderPhasesBlock(rk, deps);
        deps.toast(T('toastPhasesSaved'), 'success');
      })
      .catch(function (err) {
        if (btn) { btn.disabled = false; btn.textContent = orig || T('btnSavePhases'); }
        var msg = (err && err.message) ? String(err.message) : String(err);
        var m = /^([a-z_]+)(?::([A-Za-z]+))?/.exec(msg);
        var code = m ? m[1] : '';
        if (code === 'rev_conflict') return;                       /* отказ и заморозка — в apiPost (#100) */
        if (KNOWN_REFUSALS[code]) {
          var errs = {};
          if (m && m[2] && PURE.PHASE_KEYS.indexOf(m[2]) >= 0) errs[m[2]] = (code === 'phases_out_of_sprint') ? 'outOfSprint' : 'half';
          _markErrors(block, errs, deps, ctx);
          var line = block.querySelector('#errPhases');
          if (line) line.textContent = (code === 'phases_out_of_sprint' || code === 'invalid_phases_structure') ? T('phasesNotSaved') : T(KNOWN_REFUSALS[code]);
          return;
        }
        deps.toast(T('toastSaveError') + ': ' + msg, 'err');
      });
  }

  function bindPhasesBlock(deps) {
    var block = _block();
    if (!block || block.__sspPhasesBound) return;
    block.__sspPhasesBound = true;
    block.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('#savePhasesBtn') : null;
      if (!btn || btn.disabled || btn.classList.contains('btn--disabled-rights')) return;
      ev.preventDefault();
      onSave(deps);
    });
  }

  var api = {
    renderPhasesBlock: renderPhasesBlock,
    bindPhasesBlock: bindPhasesBlock,
    readForm: readForm,
    applySaved: applySaved,
  };
  if (typeof window !== 'undefined') window.__SSP_PHASES_VIEW = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
