/* v2.2.0 Phase 5 #32 — bespoke SettingsForm для openModal(body.kind:'component').
   Полная де-гибридизация settingsOverlay: вся форма настроек рендерится настоящим
   React внутри Ring Dialog (вместо vanilla .settings-overlay + applySettingsUI/
   collectSettings из DOM). Компонент изолирован от IIFE core.js — ВСЁ
   приходит через body.props (initial-настройки, списки полей, i18n-функция t,
   колбэки onSave/onClose). Регистрируется в реестре modal-mount.jsx.

   Суб-фазы (все собраны):
     5a — каркас + роли + поля-маппинги + нормы + режимы + прочее.
     5b — 4 группы-мультиселекта.
     5c — DTA + каскад + state-rollup + стендап (async bundle-данные через
          props.loadFieldValues/stateFieldName/enumFields).
   Раскладка — two-pane (nav-список секций слева + активная секция справа).
   Passthrough: collect() стартует с {...initial}, поэтому неизвестные ключи
   (savedAt, rescan-маркеры и т.п.) переносятся as-is и save их не теряет. */

import * as React from 'react';

const noop = () => {};

/* #21 — стабильный per-зона id для React key: reorder/delete не должны переносить
   транзиентное UI-состояние per-row Ring Select (открытый dropdown/текст фильтра) на
   соседнюю строку (review: minor). collect() строит зоны заново → _uid не персистится. */
let _zoneUidSeq = 0;
const genZoneUid = () => 'z' + (++_zoneUidSeq);

/* #43 W4 — i18n-контекст формы: даёт листовым контролам (FieldSelect/MultiSelect/
   RingSelLite) доступ к t без прокидывания через ~40 колсайтов. Используется для
   локализации placeholder'а поиска в попапах Ring Select (была en-заглушка
   «Filter items» — known limitation W3). */
const I18nCtx = React.createContext(null);
function _filterCfg(t, data, threshold) {
  if (data.length <= threshold) return false;
  return t ? { placeholder: t('phFilterList') } : true;
}

function _btnCls(variant) {
  const b = 'ring-button-button ring-button-block ring-button-heightS';
  if (variant === 'primary') return b + ' ring-button-primaryBlock ring-button-flat ring-button-whiteText';
  if (variant === 'danger')  return b + ' ring-button-danger';
  if (variant === 'flat')    return b + ' ring-button-ghost ring-button-flat';
  return b; /* secondary */
}

/* Один селект поля проекта: placeholder + список доступных имён по типу +
   (если сохранённое значение отсутствует в списке) `⚠`-элемент, как fillFieldSelect.
   #43 W3 — Ring Select (вендорный, как RingCheckbox в W1); пустой выбор — крестик
   clear + placeholder; поиск при длинных списках. Фоллбек — прежний нативный. */
function FieldSelect({ value, onChange, names, placeholder }) {
  const Select = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Select;
  const tCtx = React.useContext(I18nCtx);
  const list = Array.isArray(names) ? names : [];
  const missing = value && list.indexOf(value) < 0;
  if (!Select) {
    return (
      <select className="app-select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {list.map((n) => <option key={n} value={n}>{n}</option>)}
        {missing ? <option value={value}>{value + ' ⚠'}</option> : null}
      </select>
    );
  }
  const data = list.map((n) => ({ key: n, label: n }));
  if (missing) data.push({ key: value, label: value + ' ⚠' });
  const selected = data.find((d) => d.key === value) || null;
  return (
    <Select
      className="ssp-form-select" size="FULL"
      data={data} selected={selected}
      clear filter={_filterCfg(tCtx, data, 10)}
      label={placeholder || undefined}
      onSelect={(item) => onChange(item ? String(item.key) : '')}
    />
  );
}

/* Числовой инпут нормы (нативный, на React-стейте; пустую строку допускаем при правке). */
function NumField({ id, label, value, onChange, min, max, step }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} type="number" min={min} max={max} step={step}
        value={value == null ? '' : value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* #43 W1 (C-1, Path B) — семантический чекбокс роли: Ring <Checkbox> вместо
   <div onClick> (нет role/aria-checked/tabIndex/keyboard у старого). Ring даёт
   нативную a11y из коробки; визуал — стандартный Ring-чекбокс (осознанный Path B).
   guard-fallback на прежний .role-check div, если вендор не загрузился. */
function RoleCheck({ on, disabled, label, onToggle, tooltip, hint }) {
  const Checkbox = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Checkbox;
  /* #43 W4 (B-5) — tooltip был только hover-title (недоступен SR/клавиатуре):
     дублируем его скрытым описанием через aria-describedby. */
  const tipId = React.useId();
  const aria = tooltip ? { 'aria-describedby': tipId } : {};
  const box = Checkbox
    ? <Checkbox checked={!!on} disabled={!!disabled} label={label}
                onChange={() => { if (!disabled) onToggle(); }} {...aria} />
    : (
      <div
        className={'role-check' + (on ? ' active' : '') + (disabled ? ' role-check--disabled' : '')}
        onClick={() => { if (!disabled) onToggle(); }}
        {...aria}
      >
        <span className="role-check__cb"></span>
        <span className="role-check__label">{label}</span>
      </div>
    );
  return (
    <div className="ssp-role-toggle" title={tooltip || undefined}>
      {box}
      {tooltip ? <span id={tipId} className="ssp-sr-only">{tooltip}</span> : null}
      {hint ? <p className="hint" style={{ fontSize: '12px', color: 'var(--muted)', margin: '4px 0 0' }}>{hint}</p> : null}
    </div>
  );
}

const GRP_ICON_PATH = 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z';
function GrpIcon() {
  return (
    <svg className="grp-ms__item-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={GRP_ICON_PATH} />
    </svg>
  );
}

/* #22 — секции admin-тира (workflow-правила + доступ/права). Видны/редактируемы
   только при canEditWorkflow (settings-менеджер). Остальные секции — планировочный тир. */
const ADMIN_SECTION_IDS = { groups: true, dta: true, cascade: true, rollup: true, capacity: true, backlog: true, release: true, reporting: true };
const LOCK_ICON_PATH = 'M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z';
function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '4px', opacity: 0.7 }}>
      <path d={LOCK_ICON_PATH} />
    </svg>
  );
}

/* Группа-мультиселект (зеркалит renderGrpMultiselect): tags + input-фильтр + dropdown.
   value = {ids:[], names:[]}; onChange(nextValue). Список групп грузится лениво при
   открытии dropdown через loadGroups()→Promise<[{id,name}]>. Макс 100 групп. */
function GrpMultiSelect(props) {
  const t = props.t || ((k) => k);
  const value = props.value || { ids: [], names: [] };
  const onChange = props.onChange || noop;
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [groups, setGroups] = React.useState(() => props.initialGroups || []);
  const rootRef = React.useRef(null);

  /* Закрытие dropdown по клику вне (как document-listener в legacy). */
  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  function openDropdown() {
    setOpen(true);
    if (props.loadGroups) {
      Promise.resolve(props.loadGroups()).then((gs) => { if (Array.isArray(gs)) setGroups(gs); }).catch(noop);
    }
  }

  function removeTag(gid) {
    const i = value.ids.indexOf(gid);
    if (i < 0) return;
    const ids = value.ids.slice(); const names = value.names.slice();
    ids.splice(i, 1); names.splice(i, 1);
    onChange({ ids: ids, names: names });
  }
  function toggleItem(gid, gname) {
    const i = value.ids.indexOf(gid);
    if (i >= 0) { removeTag(gid); return; }
    if (value.ids.length >= 100) { if (props.onMax) props.onMax(); return; }
    onChange({ ids: value.ids.concat([gid]), names: value.names.concat([gname]) });
  }
  function reset() { onChange({ ids: [], names: [] }); }

  const q = (filter || '').trim().toLowerCase();
  const matches = groups.filter((g) => !q || (g.name || '').toLowerCase().indexOf(q) >= 0).slice(0, 200);

  return (
    <div className="grp-ms" ref={rootRef}>
      <div className="grp-ms__control" onClick={(e) => {
        if (e.target && e.target.classList && e.target.classList.contains('grp-ms__tag-rm')) return;
        openDropdown();
      }}>
        {value.ids.map((gid, i) => (
          <span className="grp-ms__tag" key={gid}>
            <GrpIcon />
            <span>{value.names[i] || gid}</span>
            <button type="button" className="grp-ms__tag-rm" title={t('btnResetGroup')} onClick={(e) => { e.stopPropagation(); removeTag(gid); }}>×</button>
          </span>
        ))}
        {/* #43 W4 (G-2) — combobox/listbox-семантика кастомного мультиселекта групп */}
        <input
          type="text" className="grp-ms__input" autoComplete="off"
          role="combobox" aria-expanded={open} aria-autocomplete="list"
          placeholder={t('phFilterGroups')} value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onFocus={openDropdown}
        />
      </div>
      <div className={'grp-ms__dropdown' + (open ? ' open' : '')}>
        <div className="grp-ms__section-label">{t('grpTeams')}</div>
        <div role="listbox" aria-multiselectable="true" aria-label={t('grpTeams')}>
          {!groups.length
            ? <div className="grp-ms__empty">{t('grpsNotLoaded')}</div>
            : (!matches.length
              ? <div className="grp-ms__empty">{t('grpsNotFound')}</div>
              : matches.map((g) => {
                const checked = value.ids.indexOf(g.id) >= 0;
                return (
                  <div key={g.id} className={'grp-ms__item' + (checked ? ' grp-ms__item--checked' : '')}
                       role="option" aria-selected={checked}
                       onClick={(e) => { e.stopPropagation(); toggleItem(g.id, g.name); }}>
                    <span className="grp-ms__item-cb"></span>
                    <GrpIcon />
                    <span className="grp-ms__item-name">{g.name}</span>
                  </div>
                );
              }))}
        </div>
        <button type="button" className="grp-ms__reset" onClick={(e) => { e.stopPropagation(); reset(); }}>{t('btnResetGroup')}</button>
      </div>
    </div>
  );
}

/* ── 5c helpers ── */

/* trim/cap (зеркалят _cascadeStrOrNull / _cascadeMultiSelectValues). */
function strOrNull(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > 200 ? s.slice(0, 200) : s;
}
function capValues(arr) {
  const out = []; const seen = {};
  (arr || []).forEach((raw) => {
    if (out.length >= 50) return;
    let v = String(raw || '').trim();
    if (!v) return;
    if (v.length > 200) v = v.slice(0, 200);
    if (seen[v]) return;
    seen[v] = true; out.push(v);
  });
  return out;
}

/* Мульти-выбор. options дополняется значениями из selected, которых в нём нет
   (поле сменилось — не теряем сохранённый выбор, как _fillCascadeBundleSelect).
   #43 W3 — Ring Select multiple с поиском (выбранное — в кнопке селекта).
   Фоллбек — прежний нативный <select multiple> с адаптивным size (W2 A-5). */
function MultiSelect(props) {
  const Select = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Select;
  const tCtx = React.useContext(I18nCtx);
  const selected = props.selected || [];
  const opts = (props.options || []).slice();
  selected.forEach((v) => { if (opts.indexOf(v) < 0) opts.push(v); });
  if (!Select) {
    return (
      <select
        multiple
        size={props.size || Math.min(Math.max(opts.length, 3), 6)}
        className="app-select ssp-multiselect"
        value={selected}
        onChange={(e) => props.onChange(Array.prototype.slice.call(e.target.selectedOptions).map((o) => o.value))}
      >
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  const data = opts.map((o) => ({ key: o, label: o }));
  const sel = data.filter((d) => selected.indexOf(d.key) >= 0);
  return (
    <Select
      className="ssp-form-select" size="FULL"
      multiple filter={_filterCfg(tCtx, data, 0) || true}
      data={data} selected={sel}
      label={props.placeholder || undefined}
      onChange={(arr) => props.onChange((Array.isArray(arr) ? arr : []).map((x) => String(x.key)))}
    />
  );
}

/* #43 W3 — одиночный Ring Select по парам {key,label} (роль DTA-маппинга, floor
   rollup, стратегия, языки). clearable — пустой выбор крестиком + placeholder.
   Фоллбек — нативный <select>. */
function RingSelLite({ options, value, onChange, placeholder, clearable, disabled }) {
  const Select = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Select;
  const tCtx = React.useContext(I18nCtx);
  const opts = options || [];
  if (!Select) {
    return (
      <select className="app-select" value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {(clearable || !value) ? <option value="">{placeholder || ''}</option> : null}
        {opts.map((o) => <option key={o.key} value={o.key} disabled={!!o.disabled}>{o.label}</option>)}
      </select>
    );
  }
  const data = opts.map((o) => ({ key: o.key, label: o.label, disabled: !!o.disabled }));
  const selected = data.find((d) => d.key === value) || null;
  return (
    <Select
      className="ssp-form-select" size="FULL"
      data={data} selected={selected}
      clear={!!clearable} disabled={!!disabled}
      filter={_filterCfg(tCtx, data, 10)}
      label={placeholder || undefined}
      onSelect={(item) => onChange(item ? String(item.key) : '')}
    />
  );
}

/* #43 W3 — листбокс порядка состояний rollup (замена нативного <select size>):
   порядок должен быть постоянно видим, dropdown не подходит. Клик/стрелки —
   выбор активного элемента для кнопок Вверх/Вниз/Убрать. */
function RollupOrderList({ items, selectedIdx, onSelect }) {
  const list = items || [];
  const onKey = (e) => {
    if (!list.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); onSelect(Math.min((selectedIdx < 0 ? -1 : selectedIdx) + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); onSelect(Math.max((selectedIdx < 0 ? list.length : selectedIdx) - 1, 0)); }
  };
  return (
    <div
      className="ssp-rollup-order" role="listbox" tabIndex={0}
      aria-activedescendant={selectedIdx >= 0 ? 'sspRollupOrd' + selectedIdx : undefined}
      onKeyDown={onKey}
    >
      {list.map((s, i) => (
        <div
          key={i} id={'sspRollupOrd' + i} role="option" aria-selected={i === selectedIdx}
          className={'ssp-rollup-order__item' + (i === selectedIdx ? ' active' : '')}
          onClick={() => onSelect(i)}
        >{s}</div>
      ))}
      {!list.length ? <div className="ssp-rollup-order__empty">—</div> : null}
    </div>
  );
}

/* Текстовый инпут (cascade link inward/outward — legacy plain input). */
function TextField(props) {
  return (
    <input
      type="text" className="app-select" autoComplete="off"
      value={props.value || ''} maxLength={props.maxLength || 200}
      placeholder={props.placeholder || ''}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

/* ── Секция: DTA (дифференцированный учёт трудозатрат) ── */
function DtaSection(props) {
  const t = props.t;
  const v = props.value; // { enabled, warnings, rows:[{type,role}] }
  const set = props.onChange;
  const roleOpts = props.activeRoles || [];
  const uiLang = props.uiLang;

  const counts = {};
  v.rows.forEach((r) => { const tt = (r.type || '').trim(); if (tt) counts[tt] = (counts[tt] || 0) + 1; });

  const patch = (p) => set(Object.assign({}, v, p));
  function setRow(i, p) { patch({ rows: v.rows.map((r, idx) => (idx === i ? Object.assign({}, r, p) : r)) }); }
  function addRow() { patch({ rows: v.rows.concat([{ type: '', role: '' }]) }); }
  function delRow(i) { const rows = v.rows.slice(); rows.splice(i, 1); patch({ rows: rows }); }

  return (
    <React.Fragment>
      <RoleCheck on={v.enabled} label={t('lblDtaEnabled')} hint={t('hintDta')} onToggle={() => patch({ enabled: !v.enabled })} />
      <div style={{ marginTop: '12px' }}>
        <RoleCheck on={v.warnings} label={t('lblDtaWarnings')} hint={t('hintDtaWarnings')} onToggle={() => patch({ warnings: !v.warnings })} />
      </div>
      <table className="ssp-dta-table" style={{ marginTop: '14px', width: '100%', borderCollapse: 'collapse' }}>
        {/* #43 W4 (G-1) — scope=col связывает ячейки с заголовками для SR */}
        <thead>
          <tr>
            <th scope="col">{t('dtaColType')}</th>
            <th scope="col">{t('dtaColRole')}</th>
            <th scope="col" style={{ width: '34px' }} aria-label={t('btnDtaRemoveRow')}></th>
          </tr>
        </thead>
        <tbody>
          {!v.rows.length ? (
            <tr><td colSpan={3} className="empty" style={{ padding: '8px', textAlign: 'center', color: 'var(--muted)' }}>{t('dtaEmptyTable')}</td></tr>
          ) : v.rows.map((r, i) => {
            const tt = (r.type || '').trim();
            const dup = tt && counts[tt] > 1;
            return (
              <tr key={i}>
                <td>
                  {/* #43 W4 (G-3) — дубль типа: aria-invalid + связь с текстом ошибки */}
                  <input
                    type="text" className="app-select" maxLength={200}
                    value={r.type || ''} placeholder={t('dtaTypePlaceholder')}
                    style={dup ? { borderColor: 'var(--error)' } : undefined}
                    aria-invalid={dup ? 'true' : undefined}
                    aria-describedby={dup ? 'sspDtaDupErr' : undefined}
                    onChange={(e) => setRow(i, { type: e.target.value })}
                  />
                </td>
                <td>
                  <RingSelLite
                    options={roleOpts.map((ro) => ({ key: ro.key, label: uiLang === 'en' ? (ro.labelEn || ro.label) : ro.label }))}
                    value={r.role || ''} clearable placeholder={t('phNotSelected')}
                    onChange={(val) => setRow(i, { role: val })}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly"
                    title={t('btnDtaRemoveRow')} onClick={() => delRow(i)}
                  >×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className={_btnCls('secondary')} style={{ marginTop: '10px' }} onClick={addRow}>{t('btnDtaAddRow')}</button>
      {props.hasDup ? <div id="sspDtaDupErr" role="alert" className="hint" style={{ fontSize: '12px', color: 'var(--error)', marginTop: '8px', fontWeight: 500 }}>{t('dtaErrDuplicate')}</div> : null}
    </React.Fragment>
  );
}

/* ── Секция: каскадная агрегация ── */
function CascadeSection(props) {
  const t = props.t;
  const v = props.value; // { agg, forbid, kindField, level2, level3, linkIn, linkOut }
  const set = props.onChange;
  const enumFields = props.enumFields || [];
  const [bundle, setBundle] = React.useState([]);

  React.useEffect(() => {
    let alive = true;
    if (v.kindField && props.loadFieldValues) {
      Promise.resolve(props.loadFieldValues(v.kindField)).then((vals) => { if (alive && Array.isArray(vals)) setBundle(vals); }).catch(noop);
    } else { setBundle([]); }
    return () => { alive = false; };
  }, [v.kindField]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => set(Object.assign({}, v, p));
  const dangerous = v.agg && !v.forbid;
  const overlap = v.level2.some((x) => v.level3.indexOf(x) >= 0);
  /* Смена kind-field → значения из старого bundle невалидны, чистим level2/3. */
  function changeKind(fname) { patch({ kindField: fname, level2: [], level3: [] }); }

  return (
    <React.Fragment>
      <RoleCheck on={v.agg} label={t('lblCascadeEnabled')} hint={t('hintCascade')} onToggle={() => patch({ agg: !v.agg })} />
      <div style={{ marginTop: '12px' }}>
        <RoleCheck on={v.forbid} label={t('lblForbidContainer')} hint={t('hintForbidContainer')} onToggle={() => patch({ forbid: !v.forbid })} />
        {dangerous ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', fontWeight: 500, marginTop: '6px' }}>{t('warnCascadeWithoutForbid')}</div> : null}
      </div>
      <div className="form-grid form-grid--2" style={{ marginTop: '14px' }}>
        <div className="field">
          <label>{t('lblCascadeKindField')}</label>
          <FieldSelect value={v.kindField || ''} onChange={changeKind} names={enumFields} placeholder={t('phNotSelected')} />
        </div>
      </div>
      <div className="field" style={{ marginTop: '12px' }}>
        <label>{t('lblCascadeLevel2')}</label>
        <MultiSelect options={bundle} selected={v.level2} placeholder={t('phNotSelected')} onChange={(vals) => patch({ level2: vals })} />
      </div>
      <div className="field" style={{ marginTop: '12px' }}>
        <label>{t('lblCascadeLevel3')}</label>
        <MultiSelect options={bundle} selected={v.level3} placeholder={t('phNotSelected')} onChange={(vals) => patch({ level3: vals })} />
        <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintCascadeLevel3Optional')}</div>
        {overlap ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', fontWeight: 500, marginTop: '4px' }}>{t('warnCascadeLevelsOverlap')}</div> : null}
      </div>
      <div className="form-grid form-grid--2" style={{ marginTop: '12px' }}>
        <div className="field">
          <label>{t('lblCascadeLinkInward')}</label>
          <TextField value={v.linkIn} onChange={(val) => patch({ linkIn: val })} placeholder={t('phCascadeLinkInward')} />
        </div>
        <div className="field">
          <label>{t('lblCascadeLinkOutward')}</label>
          <TextField value={v.linkOut} onChange={(val) => patch({ linkOut: val })} placeholder={t('phCascadeLinkOutward')} />
        </div>
      </div>
      <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>{t('hintCascadeLinks')}</div>
    </React.Fragment>
  );
}

/* ── Секция: state rollup (parent ← min(children)) ── */
function StateRollupSection(props) {
  const t = props.t;
  const v = props.value; // { enabled, order, resolved, floor }
  const set = props.onChange;
  const bundle = props.bundleStates || [];
  const [bundleSel, setBundleSel] = React.useState([]);
  const [orderIdx, setOrderIdx] = React.useState(-1);

  const patch = (p) => set(Object.assign({}, v, p));
  const available = bundle.filter((s) => v.order.indexOf(s) < 0);
  const orderShort = v.order.length > 0 && v.order.length < 2;
  const noHierarchy = v.enabled && !props.cascadeHasHierarchy;

  function addToOrder() {
    const add = bundleSel.filter((s) => v.order.indexOf(s) < 0);
    if (!add.length) return;
    setBundleSel([]);
    patch({ order: v.order.concat(add) });
  }
  function move(dir) {
    if (orderIdx < 0) return;
    const j = orderIdx + dir;
    if (j < 0 || j >= v.order.length) return;
    const order = v.order.slice();
    const tmp = order[orderIdx]; order[orderIdx] = order[j]; order[j] = tmp;
    setOrderIdx(j);
    patch({ order: order });
  }
  function removeFromOrder() {
    if (orderIdx < 0 || orderIdx >= v.order.length) return;
    const order = v.order.slice();
    const removed = order.splice(orderIdx, 1)[0];
    setOrderIdx(-1);
    patch({ order: order, floor: (v.floor === removed ? '' : v.floor) });
  }

  return (
    <React.Fragment>
      <RoleCheck on={v.enabled} label={t('lblStateRollupEnabled')} hint={t('hintStateRollup')} onToggle={() => patch({ enabled: !v.enabled })} />
      {noHierarchy ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', fontWeight: 500, marginTop: '6px' }}>{t('hintStateRollupNoHierarchy')}</div> : null}

      <div className="field" style={{ marginTop: '14px' }}>
        <label>{t('lblStateRollupOrder')}</label>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('lblStateRollupBundle')}</label>
            <MultiSelect options={available} selected={bundleSel} placeholder={t('phNotSelected')} onChange={setBundleSel} size={6} />
            <button type="button" className={_btnCls('secondary')} style={{ marginTop: '4px' }} onClick={addToOrder}>{t('btnStateRollupAdd')}</button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('lblStateRollupOrderList')}</label>
            <RollupOrderList items={v.order} selectedIdx={orderIdx} onSelect={(i) => setOrderIdx(i)} />
            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
              <button type="button" className={_btnCls('secondary')} onClick={() => move(-1)}>{t('btnStateRollupUp')}</button>
              <button type="button" className={_btnCls('secondary')} onClick={() => move(1)}>{t('btnStateRollupDown')}</button>
              <button type="button" className={_btnCls('secondary')} onClick={removeFromOrder}>{t('btnStateRollupRemove')}</button>
            </div>
          </div>
        </div>
        <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStateRollupOrder')}</div>
        {orderShort ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', fontWeight: 500, marginTop: '4px' }}>{t('warnStateRollupOrderShort')}</div> : null}
      </div>

      <div className="field" style={{ marginTop: '12px' }}>
        <label>{t('lblStateRollupResolved')}</label>
        <MultiSelect options={bundle} selected={v.resolved} placeholder={t('phNotSelected')} onChange={(vals) => patch({ resolved: vals })} size={4} />
        <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStateRollupResolved')}</div>
      </div>

      <div className="form-grid form-grid--2" style={{ marginTop: '12px' }}>
        <div className="field">
          <label>{t('lblStateRollupFloor')}</label>
          <RingSelLite
            options={v.order.map((s) => ({ key: s, label: s }))}
            value={v.floor || ''} clearable placeholder={t('optStateRollupFloorNone')}
            onChange={(val) => patch({ floor: val })}
          />
          <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStateRollupFloor')}</div>
        </div>
        <div className="field">
          <label>{t('lblStateRollupStrategy')}</label>
          <RingSelLite options={[{ key: 'min', label: 'min' }]} value="min" disabled onChange={noop} />
          <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStateRollupStrategy')}</div>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ── Секция: Stand-up assist (done-состояния) ── */
function StandupSection(props) {
  const t = props.t;
  return (
    <div className="field">
      <label>{t('lblStandupDoneStates')}</label>
      <MultiSelect options={props.bundleStates || []} selected={props.value || []} placeholder={props.t('phNotSelected')} onChange={props.onChange} />
      <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStandupDoneStates')}</div>
    </div>
  );
}

/* ── Секция: #21 «Работа с бэклогом» ──
   Зоны пайплайна (состояние→роль(и), MANY, упорядочены) + стартовый пул + фильтр по
   типу + источник паузы. Контракт — backend-core.js validateSettings (state unique,
   roles⊆ROLE_KEYS, max 50). Шаблоны: таблица строк = DtaSection; reorder = StateRollupSection;
   роли per-row = inline-чекбоксы (активных ролей ≤9; MultiSelect не несёт label≠key). */
function BacklogSection(props) {
  const t = props.t;
  const v = props.value; // { zones:[{state,roles[]}], startStates, typeFilter, pauseTags, pauseStates }
  const set = props.onChange;
  const bundleStates = props.bundleStates || [];
  const roleOpts = props.activeRoles || [];
  const uiLang = props.uiLang;
  const [typeBundle, setTypeBundle] = React.useState([]);
  /* v2.15.3 — pauseTags: searchable picker по ВСЕМ тегам инстанса (loadTags форсит
     $top, обходя дефолтный кап ~42). Раньше — свободный ввод через запятую. */
  const [tagBundle, setTagBundle] = React.useState([]);

  React.useEffect(() => {
    let alive = true;
    if (props.fieldTypeName && props.loadFieldValues) {
      Promise.resolve(props.loadFieldValues(props.fieldTypeName))
        .then((vals) => { if (alive && Array.isArray(vals)) setTypeBundle(vals); }).catch(noop);
    } else { setTypeBundle([]); }
    return () => { alive = false; };
  }, [props.fieldTypeName]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    let alive = true;
    if (props.loadTags) {
      Promise.resolve(props.loadTags())
        .then((tags) => { if (alive && Array.isArray(tags)) setTagBundle(tags); }).catch(noop);
    }
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => set(Object.assign({}, v, p));
  const setZone = (i, p) => patch({ zones: v.zones.map((z, idx) => (idx === i ? Object.assign({}, z, p) : z)) });
  const addZone = () => patch({ zones: v.zones.concat([{ _uid: genZoneUid(), state: '', roles: [] }]) });
  const delZone = (i) => { const z = v.zones.slice(); z.splice(i, 1); patch({ zones: z }); };
  function moveZone(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= v.zones.length) return;
    const z = v.zones.slice(); const tmp = z[i]; z[i] = z[j]; z[j] = tmp;
    patch({ zones: z });
  }
  function toggleZoneRole(i, rk) {
    const cur = (v.zones[i] && v.zones[i].roles) || [];
    const next = cur.indexOf(rk) >= 0 ? cur.filter((k) => k !== rk) : cur.concat([rk]);
    setZone(i, { roles: next });
  }

  const stCounts = {};
  v.zones.forEach((z) => { const s = (z.state || '').trim(); if (s) stCounts[s] = (stCounts[s] || 0) + 1; });
  const stateOpts = bundleStates.map((s) => ({ key: s, label: s }));
  const roleData = roleOpts.map((r) => ({ key: r.key, label: uiLang === 'en' ? (r.labelEn || r.label) : r.label }));
  const moveBtnCls = 'ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly';

  return (
    <React.Fragment>
      {/* Зоны: состояние → роль(и) (MANY, упорядочены) */}
      <div className="field">
        <label>{t('lblBacklogZones')}</label>
        <table className="ssp-dta-table ssp-backlog-zones" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th scope="col" style={{ width: '30%' }}>{t('lblBacklogZoneState')}</th>
              <th scope="col">{t('lblBacklogZoneRoles')}</th>
              <th scope="col" style={{ width: '92px' }} aria-label={t('btnBacklogRemoveZone')}></th>
            </tr>
          </thead>
          <tbody>
            {!v.zones.length ? (
              <tr><td colSpan={3} className="empty" style={{ padding: '8px', textAlign: 'center', color: 'var(--muted)' }}>{t('backlogZonesEmpty')}</td></tr>
            ) : v.zones.map((z, i) => {
              const st = (z.state || '').trim();
              const dup = st && stCounts[st] > 1;
              return (
                <tr key={z._uid}>
                  <td style={dup ? { outline: '1px solid var(--error)' } : undefined}>
                    <RingSelLite options={stateOpts} value={z.state || ''} clearable placeholder={t('phNotSelected')} onChange={(val) => setZone(i, { state: val })} />
                  </td>
                  <td>
                    {roleData.length ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: '4px 8px', maxWidth: '100%' }}>
                        {roleData.map((r) => {
                          const on = (z.roles || []).indexOf(r.key) >= 0;
                          return (
                            <label key={r.key} style={{ display: 'inline-flex', alignItems: 'flex-start', gap: '4px', fontSize: '11px', lineHeight: '1.25', cursor: 'pointer' }}>
                              <input type="checkbox" checked={on} onChange={() => toggleZoneRole(i, r.key)} style={{ marginTop: '1px', flex: '0 0 auto' }} />
                              <span>{r.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : <span className="hint" style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('backlogNoActiveRoles')}</span>}
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button type="button" className={moveBtnCls} title={t('btnStateRollupUp')} disabled={i === 0} onClick={() => moveZone(i, -1)}>↑</button>
                    <button type="button" className={moveBtnCls} title={t('btnStateRollupDown')} disabled={i === v.zones.length - 1} onClick={() => moveZone(i, 1)}>↓</button>
                    <button type="button" className={moveBtnCls} title={t('btnBacklogRemoveZone')} onClick={() => delZone(i)}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" className={_btnCls('secondary')} style={{ marginTop: '10px' }} onClick={addZone}>{t('btnBacklogAddZone')}</button>
        {props.hasDup ? <div role="alert" className="hint" style={{ fontSize: '12px', color: 'var(--error)', marginTop: '8px', fontWeight: 500 }}>{t('backlogErrDupState')}</div> : null}
      </div>

      {/* Стартовый пул заказчика */}
      <div className="field" style={{ marginTop: '14px' }}>
        <label>{t('lblBacklogStartStates')}</label>
        <MultiSelect options={bundleStates} selected={v.startStates} placeholder={t('phNotSelected')} onChange={(vals) => patch({ startStates: vals })} />
      </div>

      {/* Фильтр по типу (значения fieldType) */}
      <div className="field" style={{ marginTop: '12px' }}>
        <label>{t('lblBacklogTypeFilter')}</label>
        <MultiSelect options={typeBundle} selected={v.typeFilter} placeholder={t('phNotSelected')} onChange={(vals) => patch({ typeFilter: vals })} />
      </div>

      {/* Источник паузы: состояния и/или теги */}
      <div className="form-grid form-grid--2" style={{ marginTop: '12px' }}>
        <div className="field">
          <label>{t('lblBacklogPauseStates')}</label>
          <MultiSelect options={bundleStates} selected={v.pauseStates} placeholder={t('phNotSelected')} onChange={(vals) => patch({ pauseStates: vals })} />
        </div>
        <div className="field">
          <label>{t('lblBacklogPauseTags')}</label>
          <MultiSelect options={tagBundle} selected={v.pauseTags} placeholder={t('phNotSelected')} onChange={(vals) => patch({ pauseTags: vals })} />
        </div>
      </div>
    </React.Fragment>
  );
}

/* #48 R1 — раздел настроек «Релиз-менеджмент» (admin-тир, нейтральная терминология).
   value = { enabled, candMgr/candEng/rightsMgr/rightsEng:{ids,names}, mapping:{status→state} }.
   Светофор R3 настроек НЕ имеет (ревизия владельца 2026-07-01): зоны — автоматом по State
   задачи + маппингу (mapping.planned = стартовый якорь красной зоны). Тип релиза —
   фиксированная таксономия 2×2, только инфо. */
function ReleaseSection(props) {
  const t = props.t;
  const v = props.value;
  const set = props.onChange;
  const bundleStates = props.bundleStates || [];
  const patch = (p) => set(Object.assign({}, v, p));
  const setGrp = (k, val) => patch({ [k]: val });
  const setMap = (status, val) => patch({ mapping: Object.assign({}, v.mapping, { [status]: val }) });
  const setTagMap = (status, val) => patch({ tagMapping: Object.assign({}, v.tagMapping, { [status]: val }) });

  /* #55 — теги инстанса для колонки «Тег задач» (кэш сессии формы — props.loadTags). */
  const [tagOpts, setTagOpts] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    if (props.loadTags) {
      Promise.resolve(props.loadTags())
        .then((tags) => { if (alive && Array.isArray(tags)) setTagOpts(tags.map((name) => ({ key: name, label: name }))); }) /* loadProjectTags → массив ИМЁН */
        .catch(noop);
    }
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stateOpts = bundleStates.map((s) => ({ key: s, label: s }));
  const STATUS_ROWS = [
    { k: 'planned',   lbl: t('relStatusPlanned') },
    { k: 'prep',      lbl: t('relStatusPrep') },
    { k: 'work',      lbl: t('relStatusWork') },
    { k: 'released',  lbl: t('relStatusReleased') },
    { k: 'cancelled', lbl: t('relStatusCancelled') },
  ];
  const subCls = { fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' };
  const hintCls = { fontSize: '12px', color: 'var(--muted)', marginTop: '6px', display: 'block' };
  const grpRow = (key, label) => (
    <div className="field" style={{ marginBottom: '12px' }} key={key}>
      <label>{label}</label>
      <GrpMultiSelect t={t} value={v[key]} onChange={(val) => setGrp(key, val)}
        initialGroups={props.initialGroups} loadGroups={props.loadGroups} onMax={props.onMax} />
    </div>
  );

  return (
    <React.Fragment>
      <RoleCheck on={v.enabled} label={t('relSetEnable')} onToggle={() => patch({ enabled: !v.enabled })} />

      {/* Пул кандидатов представителей (D-D2 — отдельно от групп прав) */}
      <div className="card-subtitle" style={subCls}>{t('relSetCandGroups')}</div>
      {grpRow('candMgr', t('relSetCandManagers'))}
      {grpRow('candEng', t('relSetCandEngineers'))}

      {/* Группы прав */}
      <div className="card-subtitle" style={subCls}>{t('relSetRightsGroups')}</div>
      {grpRow('rightsMgr', t('relSetRightsManagers'))}
      {grpRow('rightsEng', t('relSetRightsEngineers'))}

      {/* Маппинг «статус релиза → целевое состояние задач» (применение — R2) */}
      <div className="card-subtitle" style={subCls}>{t('relSetMappingTitle')}</div>
      <table className="ssp-dta-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th scope="col" style={{ width: '32%' }}>{t('relSetMappingColStatus')}</th>
          <th scope="col">{t('relSetMappingColState')}</th>
          {/* #55 — авто-тег задач при входе в статус */}
          <th scope="col">{t('relSetMappingColTag')}</th>
        </tr></thead>
        <tbody>
          {STATUS_ROWS.map((r) => (
            <tr key={r.k}>
              <td>{r.lbl}</td>
              <td>
                <RingSelLite options={stateOpts} value={v.mapping[r.k] || ''} clearable
                  placeholder={t('relSetMappingNoChange')} onChange={(val) => setMap(r.k, val)} />
              </td>
              <td>
                <RingSelLite options={tagOpts} value={(v.tagMapping && v.tagMapping[r.k]) || ''} clearable
                  placeholder={t('relSetTagNone')} onChange={(val) => setTagMap(r.k, val)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* R3.1 — двойная роль маппинга: R2 пишет State, строка «Запланирован» якорит красную зону светофора */}
      <span className="hint" style={hintCls}>{t('relSetMappingAnchorNote')}</span>
      {/* #55 — семантика авто-тегов: снимается тег предыдущего статуса, ставится нового; только существующие теги */}
      <span className="hint" style={hintCls}>{t('relSetTagMappingNote')}</span>

      {/* Тип релиза — фиксированная таксономия 2×2 (инфо, не настраивается) */}
      <div className="card-subtitle" style={subCls}>{t('relSetTypeTitle')}</div>
      <div className="form-grid form-grid--2">
        <div><b>{t('relKindLabel')}:</b> {t('relKindRelease')} · {t('relKindHotfix')}</div>
        <div><b>{t('relSrcLabel')}:</b> {t('relSrcInternal')} · {t('relSrcVendor')}</div>
      </div>
      <span className="hint" style={hintCls}>{t('relSetTypeFixedNote')}</span>
    </React.Fragment>
  );
}

/* #50 — «Отчётность» (admin-тир). S1: мастер-тумблер + reporting-access группы контуров
   A (лиды) / B (руководство, B⊇A). Данные чувствительны → доступ по членству, не опционален.
   Пороги/паузы/сегментация — со своими вью (S1c+), здесь пока нет.
   value = { enabled, groupsA:{ids,names}, groupsB:{ids,names} }. */
/* #50 — статусные секции отчётности: конвертеры каноническая-модель ↔ строки-редактора.
   UI = список строк [{_uid, state, …сателлит}] (пикер из бандла + добавить/удалить, как зоны
   бэклога #21); хранимая модель прежняя (пороги-объект / цели-массив+ярлыки / поток-массив). */
function _repThToRows(obj) {
  const o = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  return Object.keys(o).map((s) => ({ _uid: genZoneUid(), state: s,
    yellow: (o[s] && o[s].yellow != null) ? o[s].yellow : '',
    red: (o[s] && o[s].red != null) ? o[s].red : '' }));
}
function _repA1ToRows(arr, lbls) {
  const a = Array.isArray(arr) ? arr : [];
  const L = (lbls && typeof lbls === 'object' && !Array.isArray(lbls)) ? lbls : {};
  return a.filter(Boolean).map((s) => ({ _uid: genZoneUid(), state: s, label: (typeof L[s] === 'string') ? L[s] : '' }));
}
function _repFlowToRows(arr) {
  return (Array.isArray(arr) ? arr : []).filter(Boolean).map((s) => ({ _uid: genZoneUid(), state: s }));
}
function _repNumOrNull(v) { const s = String(v == null ? '' : v).trim(); if (s === '') return null; const n = Number(s); return (isFinite(n) && n >= 0) ? n : null; }
function _repRowsToTh(rows) {
  const o = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => { const s = (r.state || '').trim(); if (!s) return;
    const y = _repNumOrNull(r.yellow), rd = _repNumOrNull(r.red);
    if (y == null && rd == null) return;   /* пустые бэнды → статус не мониторится */
    o[s] = { yellow: y, red: rd }; });
  return o;
}
function _repRowsToA1(rows) {
  const states = [], labels = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => { const s = (r.state || '').trim(); if (!s || states.indexOf(s) >= 0) return;
    states.push(s); if (typeof r.label === 'string' && r.label.trim() !== '') labels[s] = r.label; });
  return { states: states, labels: labels };
}
function _repRowsToFlow(rows) {
  const out = [];
  (Array.isArray(rows) ? rows : []).forEach((r) => { const s = (r.state || '').trim(); if (s && out.indexOf(s) < 0) out.push(s); });
  return out;
}

function ReportingSection(props) {
  const t = props.t;
  const v = props.value;
  const set = props.onChange;
  const patch = (p) => set(Object.assign({}, v, p));
  const setGrp = (k, val) => patch({ [k]: val });
  /* #50 S3a — теги инстанса для маркеров-пауз A2 (реюз props.loadTags, как BacklogSection/#55). */
  const [pauseTagBundle, setPauseTagBundle] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    if (props.loadTags) {
      Promise.resolve(props.loadTags())
        .then((tags) => { if (alive && Array.isArray(tags)) setPauseTagBundle(tags); }).catch(noop);
    }
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const subCls = { fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' };
  const hintCls = { fontSize: '12px', color: 'var(--muted)', marginTop: '6px', display: 'block' };
  const grpRow = (key, label) => (
    <div className="field" style={{ marginBottom: '12px' }} key={key}>
      <label>{label}</label>
      <GrpMultiSelect t={t} value={v[key]} onChange={(val) => setGrp(key, val)}
        initialGroups={props.initialGroups} loadGroups={props.loadGroups} onMax={props.onMax} />
    </div>
  );
  /* #50 — пороги aging (A7) / цели A1 / поток A8-A9: строка = пикер состояния из бандла State-поля
     + сателлит-поля + добавить/удалить (паттерн зон бэклога #21; НЕ фикс-строка на КАЖДОЕ значение
     бандла — на корп-инстансе бандл длинный). bundleStates реактивно из fields.fieldState. */
  const bundleStates = props.bundleStates || [];
  const numCell = { width: '80px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box' };
  const txtCell = { width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box' };
  const moveBtnCls = 'ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly';
  const _stCount = (rows) => { const c = {}; (rows || []).forEach((r) => { const s = (r.state || '').trim(); if (s) c[s] = (c[s] || 0) + 1; }); return c; };
  /* Пороги aging (A7): [{_uid, state, yellow, red}] */
  const thRows = Array.isArray(v.thRows) ? v.thRows : [];
  const setThRow = (i, p) => patch({ thRows: thRows.map((r, idx) => (idx === i ? Object.assign({}, r, p) : r)) });
  const addThRow = () => patch({ thRows: thRows.concat([{ _uid: genZoneUid(), state: '', yellow: '', red: '' }]) });
  const delThRow = (i) => { const a = thRows.slice(); a.splice(i, 1); patch({ thRows: a }); };
  const thDup = _stCount(thRows);
  /* A1 цели: [{_uid, state, label}] — присутствие в списке = «целевой» (вход = движение). */
  const a1Rows = Array.isArray(v.a1Rows) ? v.a1Rows : [];
  const setA1Row = (i, p) => patch({ a1Rows: a1Rows.map((r, idx) => (idx === i ? Object.assign({}, r, p) : r)) });
  const addA1Row = () => patch({ a1Rows: a1Rows.concat([{ _uid: genZoneUid(), state: '', label: '' }]) });
  const delA1Row = (i) => { const a = a1Rows.slice(); a.splice(i, 1); patch({ a1Rows: a }); };
  const a1Dup = _stCount(a1Rows);
  /* Поток A8/A9 (упорядочен, порядок = порядок строк): [{_uid, state}] */
  const flowRows = Array.isArray(v.flowRows) ? v.flowRows : [];
  const setFlowRow = (i, val) => patch({ flowRows: flowRows.map((r, idx) => (idx === i ? Object.assign({}, r, { state: val }) : r)) });
  const addFlowRow = () => patch({ flowRows: flowRows.concat([{ _uid: genZoneUid(), state: '' }]) });
  const delFlowRow = (i) => { const a = flowRows.slice(); a.splice(i, 1); patch({ flowRows: a }); };
  const moveFlowRow = (i, dir) => { const j = i + dir; if (j < 0 || j >= flowRows.length) return; const a = flowRows.slice(); const tmp = a[i]; a[i] = a[j]; a[j] = tmp; patch({ flowRows: a }); };
  const flowDup = _stCount(flowRows);
  /* #50 S3a — A2 TTM. Якоря: фикс-метрики lead/team/cycle → { start, end } (имена статусов,
     опциональны; пустой конец → метрика не считается, пустая пара → метрика выпадает).
     Нормативы: раб.дн, int[0..10000] | null (только lead/team; cycle норматива не имеет).
     Маркеры пауз: { states:[…], tags:[…] }. */
  const stateOpts = bundleStates.map((s) => ({ key: s, label: s }));
  const anchors = v.anchors || {};
  const anchorVal = (metric, edge) => (anchors[metric] && anchors[metric][edge] != null ? anchors[metric][edge] : '');
  const setAnchor = (metric, edge, raw) => {
    const s = String(raw || '').trim();
    const cur = Object.assign({}, anchors[metric] || {});
    if (s === '') delete cur[edge]; else cur[edge] = s.length > 200 ? s.slice(0, 200) : s;
    const next = Object.assign({}, anchors);
    if (cur.start == null && cur.end == null) delete next[metric]; else next[metric] = cur;
    patch({ anchors: next });
  };
  const ttmNorms = v.ttmNorms || {};
  const normVal = (metric) => (ttmNorms[metric] != null ? ttmNorms[metric] : '');
  const setNorm = (metric, raw) => {
    const s = String(raw).trim();
    let val = null;
    if (s !== '') {
      const num = Math.round(Number(s));
      if (isFinite(num) && num >= 0) val = num > 10000 ? 10000 : num;
    }
    patch({ ttmNorms: Object.assign({}, ttmNorms, { [metric]: val }) });
  };
  /* #50 S7a — A10 Spillover: пороги «возраста хвоста» { warm|hot → int 1..1000|null } (бэйджи зомби). */
  const ageBands = v.ageBands || {};
  const ageVal = (band) => (ageBands[band] != null ? ageBands[band] : '');
  const setAge = (band, raw) => {
    const s = String(raw).trim();
    let val = null;
    if (s !== '') { const num = Math.round(Number(s)); if (isFinite(num) && num >= 1) val = num > 1000 ? 1000 : num; }
    patch({ ageBands: Object.assign({}, ageBands, { [band]: val }) });
  };
  /* #50 S5b — A5 План-факт: порог |расхождения| (%). Дефолт 20; пусто/<1 → 20 (движок трактует ≤0 как unset). */
  const varianceVal = (v.variancePct != null ? v.variancePct : 20);
  const setVariance = (raw) => {
    const s = String(raw).trim();
    let val = 20;
    if (s !== '') { const num = Math.round(Number(s)); if (isFinite(num) && num >= 1) val = num > 10000 ? 10000 : num; }
    patch({ variancePct: val });
  };
  /* #50 D10 — таймаут-бэкстоп прогона отчёта (сек). Дефолт 90; пусто/<5 → 90; кламп 5..3600.
     Сырая строка в локальном стейте, кламп на blur (ревью #50): кламп на keystroke — input-trap
     («3» мгновенно → 90 → дописанный «0» → 900; значения с первой цифрой 1–4 недостижимы). */
  const [timeoutRaw, setTimeoutRaw] = React.useState(null);   /* null = не редактируется → показываем стор */
  const timeoutVal = (v.timeoutSec != null ? v.timeoutSec : 90);
  const commitTimeoutSec = () => {
    const s = String(timeoutRaw == null ? '' : timeoutRaw).trim();
    let val = 90;
    if (s !== '') { const num = Math.round(Number(s)); if (isFinite(num) && num >= 5) val = num > 3600 ? 3600 : num; }
    patch({ timeoutSec: val });
    setTimeoutRaw(null);
  };
  const pauseMarkers = (v.pauseMarkers && typeof v.pauseMarkers === 'object') ? v.pauseMarkers : { states: [], tags: [] };
  const pauseStates = Array.isArray(pauseMarkers.states) ? pauseMarkers.states : [];
  const pauseTags = Array.isArray(pauseMarkers.tags) ? pauseMarkers.tags : [];
  const setPause = (p) => patch({ pauseMarkers: Object.assign({}, pauseMarkers, p) });
  const anchorRows = [['lead', t('repSetA2Lead')], ['team', t('repSetA2Team')], ['cycle', t('repSetA2Cycle')]];
  return (
    <React.Fragment>
      <RoleCheck on={v.enabled} label={t('repSetEnable')} onToggle={() => patch({ enabled: !v.enabled })} />
      {/* v3.9.0 — «Система» в отчётах: колонка в A-таблицах + группировка B-отчётов + экспорт. */}
      <RoleCheck on={v.showSystem !== false} label={t('repSetShowSystem')} onToggle={() => patch({ showSystem: v.showSystem === false })} />
      <span className="hint" style={hintCls}>{t('repSetShowSystemHint')}</span>
      <div className="card-subtitle" style={subCls}>{t('repSetAccessGroups')}</div>
      <span className="hint" style={hintCls}>{t('repSetAccessNote')}</span>
      {grpRow('groupsA', t('repSetGroupsA'))}
      {grpRow('groupsB', t('repSetGroupsB'))}

      {/* #50 D10 — таймаут-бэкстоп прогона отчёта: страховка «не завесить систему». */}
      <div className="card-subtitle" style={subCls}>{t('repSetTimeout')}</div>
      <span className="hint" style={hintCls}>{t('repSetTimeoutHint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetTimeoutSec')}</label>
          <input type="number" min="5" step="5" style={numCell}
            value={timeoutRaw != null ? timeoutRaw : timeoutVal}
            onChange={(e) => setTimeoutRaw(e.target.value)} onBlur={commitTimeoutSec} />
        </div>
      </div>

      <div className="card-subtitle" style={subCls}>{t('repSetThresholds')}</div>
      <span className="hint" style={hintCls}>{t('repSetThHint')}</span>
      {bundleStates.length ? (
        <React.Fragment>
          <table className="ssp-dta-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
            <thead><tr>
              <th scope="col" style={{ width: '54%' }}>{t('repSetThColState')}</th>
              <th scope="col">{t('repSetThColYellow')}</th>
              <th scope="col">{t('repSetThColRed')}</th>
              <th scope="col" style={{ width: '44px' }} aria-label={t('repSetRemoveState')}></th>
            </tr></thead>
            <tbody>
              {!thRows.length ? (
                <tr><td colSpan={4} className="empty" style={{ padding: '8px', textAlign: 'center', color: 'var(--muted)' }}>{t('repSetStatesEmpty')}</td></tr>
              ) : thRows.map((r, i) => {
                const dup = r.state && thDup[r.state] > 1;
                /* ревью #50: yellow ≥ red — противоречивая пара (agingLevel проверяет red первым →
                   уровень «warn» недостижим); подсветка, save не блокируем (не порча данных). */
                const inv = r.yellow !== '' && r.yellow != null && r.red !== '' && r.red != null
                  && isFinite(Number(r.yellow)) && isFinite(Number(r.red)) && Number(r.yellow) >= Number(r.red);
                const invS = inv ? { outline: '1px solid var(--error)' } : undefined;
                return (
                  <tr key={r._uid}>
                    <td style={dup ? { outline: '1px solid var(--error)' } : undefined}>
                      <RingSelLite options={stateOpts} value={r.state || ''} clearable placeholder={t('phNotSelected')} onChange={(val) => setThRow(i, { state: val })} />
                    </td>
                    <td style={invS}><input type="number" min="0" step="1" style={numCell} value={r.yellow != null ? r.yellow : ''} onChange={(e) => setThRow(i, { yellow: e.target.value })} /></td>
                    <td style={invS}><input type="number" min="0" step="1" style={numCell} value={r.red != null ? r.red : ''} onChange={(e) => setThRow(i, { red: e.target.value })} /></td>
                    <td style={{ textAlign: 'center' }}><button type="button" className={moveBtnCls} title={t('repSetRemoveState')} onClick={() => delThRow(i)}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" className={_btnCls('secondary')} style={{ marginTop: '10px' }} onClick={addThRow}>{t('repSetAddState')}</button>
        </React.Fragment>
      ) : <span className="hint" style={hintCls}>{t('repSetThEmpty')}</span>}

      <div className="card-subtitle" style={subCls}>{t('repSetA1Targets')}</div>
      <span className="hint" style={hintCls}>{t('repSetA1Hint')}</span>
      {bundleStates.length ? (
        <React.Fragment>
          <table className="ssp-dta-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
            <thead><tr>
              <th scope="col" style={{ width: '42%' }}>{t('repSetThColState')}</th>
              <th scope="col">{t('repSetA1ColLabel')}</th>
              <th scope="col" style={{ width: '44px' }} aria-label={t('repSetRemoveState')}></th>
            </tr></thead>
            <tbody>
              {!a1Rows.length ? (
                <tr><td colSpan={3} className="empty" style={{ padding: '8px', textAlign: 'center', color: 'var(--muted)' }}>{t('repSetStatesEmpty')}</td></tr>
              ) : a1Rows.map((r, i) => {
                const dup = r.state && a1Dup[r.state] > 1;
                return (
                  <tr key={r._uid}>
                    <td style={dup ? { outline: '1px solid var(--error)' } : undefined}>
                      <RingSelLite options={stateOpts} value={r.state || ''} clearable placeholder={t('phNotSelected')} onChange={(val) => setA1Row(i, { state: val })} />
                    </td>
                    <td><input type="text" maxLength={200} style={txtCell} placeholder={r.state || ''} value={r.label || ''} onChange={(e) => setA1Row(i, { label: e.target.value })} /></td>
                    <td style={{ textAlign: 'center' }}><button type="button" className={moveBtnCls} title={t('repSetRemoveState')} onClick={() => delA1Row(i)}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" className={_btnCls('secondary')} style={{ marginTop: '10px' }} onClick={addA1Row}>{t('repSetAddState')}</button>
        </React.Fragment>
      ) : <span className="hint" style={hintCls}>{t('repSetThEmpty')}</span>}

      {/* #50 S3a — A2 TTM: якоря (метрика → старт/конец), нормативы (раб.дн), маркеры пауз. */}
      <div className="card-subtitle" style={subCls}>{t('repSetA2Anchors')}</div>
      <span className="hint" style={hintCls}>{t('repSetA2AnchorsHint')}</span>
      {bundleStates.length ? (
        <table className="ssp-dta-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
          <thead><tr>
            <th scope="col" style={{ width: '34%' }}>{t('repSetA2ColMetric')}</th>
            <th scope="col">{t('repSetA2ColStart')}</th>
            <th scope="col">{t('repSetA2ColEnd')}</th>
          </tr></thead>
          <tbody>
            {anchorRows.map(([m, label]) => (
              <tr key={m}>
                <td>{label}</td>
                <td><RingSelLite options={stateOpts} value={anchorVal(m, 'start')} clearable
                  placeholder={t('phNotSelected')} onChange={(val) => setAnchor(m, 'start', val)} /></td>
                <td><RingSelLite options={stateOpts} value={anchorVal(m, 'end')} clearable
                  placeholder={t('phNotSelected')} onChange={(val) => setAnchor(m, 'end', val)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <span className="hint" style={hintCls}>{t('repSetThEmpty')}</span>}

      <div className="card-subtitle" style={subCls}>{t('repSetA2Norms')}</div>
      <span className="hint" style={hintCls}>{t('repSetA2NormsHint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetA2NormLead')}</label>
          <input type="number" min="0" step="1" style={numCell}
            value={normVal('lead')} onChange={(e) => setNorm('lead', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('repSetA2NormTeam')}</label>
          <input type="number" min="0" step="1" style={numCell}
            value={normVal('team')} onChange={(e) => setNorm('team', e.target.value)} />
        </div>
      </div>

      {/* #50 v3.2.0 — A2 терминальная политика при reopen (US-A2-02): enum-селект. */}
      <div className="card-subtitle" style={subCls}>{t('repSetA2Tp')}</div>
      <span className="hint" style={hintCls}>{t('repSetA2TpHint')}</span>
      <div className="field" style={{ marginTop: '8px', maxWidth: '360px' }}>
        <RingSelLite
          options={[{ key: 'first-close', label: t('repSetA2TpFirst') }, { key: 'last-stable-close', label: t('repSetA2TpLast') }]}
          value={v.terminalPolicy === 'last-stable-close' ? 'last-stable-close' : 'first-close'}
          onChange={(val) => patch({ terminalPolicy: val === 'last-stable-close' ? 'last-stable-close' : 'first-close' })} />
      </div>

      <div className="card-subtitle" style={subCls}>{t('repSetA5')}</div>
      <span className="hint" style={hintCls}>{t('repSetA5Hint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetA5Variance')}</label>
          <input type="number" min="1" step="1" style={numCell}
            value={varianceVal} onChange={(e) => setVariance(e.target.value)} />
        </div>
      </div>

      {/* #50 S6a — A3 срез: имена YT-полей бизнес-колонок (пусто = колонка скрыта). */}
      <div className="card-subtitle" style={subCls}>{t('repSetA3')}</div>
      <span className="hint" style={hintCls}>{t('repSetA3Hint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetA3Stage')}</label>
          <input type="text" style={txtCell} value={v.a3StageField || ''}
            placeholder={t('phNotSelected')} onChange={(e) => patch({ a3StageField: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('repSetA3Org')}</label>
          <input type="text" style={txtCell} value={v.a3OrgField || ''}
            placeholder={t('phNotSelected')} onChange={(e) => patch({ a3OrgField: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('repSetA3Priority')}</label>
          <input type="text" style={txtCell} value={v.a3PriorityField || ''}
            placeholder={t('phNotSelected')} onChange={(e) => patch({ a3PriorityField: e.target.value })} />
        </div>
      </div>

      {/* #50 S6b — A6 Бэклог в ЧЧ: месячная ёмкость роли (ч/мес) — знаменатель «месяцев бэклога». */}
      <div className="card-subtitle" style={subCls}>{t('repSetA6')}</div>
      <span className="hint" style={hintCls}>{t('repSetA6Hint')}</span>
      {(props.activeRoles || []).length ? (
        <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
          {(props.activeRoles || []).map((r) => (
            <div className="field" key={r.key}>
              <label>{(props.uiLang === 'en' ? (r.labelEn || r.label) : r.label) || r.key}</label>
              <input type="number" min="0" step="1" style={numCell}
                value={(v.a6Capacity && v.a6Capacity[r.key] != null) ? v.a6Capacity[r.key] : ''}
                onChange={(e) => {
                  const raw = String(e.target.value).trim();
                  const next = Object.assign({}, v.a6Capacity);
                  if (raw === '') delete next[r.key];
                  else { const n = Math.round(Number(raw)); if (isFinite(n) && n >= 0) next[r.key] = n > 100000 ? 100000 : n; }
                  patch({ a6Capacity: next });
                }} />
            </div>
          ))}
        </div>
      ) : <span className="hint" style={hintCls}>{t('repSetThEmpty')}</span>}

      {/* #50 S7a — A10 Spillover: пороги «возраста хвоста» (подряд спринтов не-done) — жёлтый/красный бэйдж зомби. */}
      <div className="card-subtitle" style={subCls}>{t('repSetA10Age')}</div>
      <span className="hint" style={hintCls}>{t('repSetA10AgeHint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetA10AgeWarm')}</label>
          <input type="number" min="1" step="1" style={numCell}
            value={ageVal('warm')} onChange={(e) => setAge('warm', e.target.value)} />
        </div>
        <div className="field">
          <label>{t('repSetA10AgeHot')}</label>
          <input type="number" min="1" step="1" style={numCell}
            value={ageVal('hot')} onChange={(e) => setAge('hot', e.target.value)} />
        </div>
      </div>

      {/* #50 S8b — B1 Техдолг (контур B): отбор техдолга = тип задачи ИЛИ тег (одно из двух, тип имеет приоритет). */}
      <div className="card-subtitle" style={subCls}>{t('repSetB1')}</div>
      <span className="hint" style={hintCls}>{t('repSetB1Hint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetB1Type')}</label>
          <input type="text" style={txtCell} value={v.techDebtType || ''}
            placeholder={t('phNotSelected')} onChange={(e) => patch({ techDebtType: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('repSetB1Tag')}</label>
          <input type="text" style={txtCell} value={v.techDebtTag || ''}
            placeholder={t('phNotSelected')} onChange={(e) => patch({ techDebtTag: e.target.value })} />
        </div>
      </div>

      {/* #50 S8c — B2 «Налог на баги» (контур B): тип задачи-бага + типы связей баг→фича (CSV). */}
      <div className="card-subtitle" style={subCls}>{t('repSetB2')}</div>
      <span className="hint" style={hintCls}>{t('repSetB2Hint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetB2Type')}</label>
          <input type="text" style={txtCell} value={v.bugType || ''}
            placeholder={t('phNotSelected')} onChange={(e) => patch({ bugType: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('repSetB2Links')}</label>
          <input type="text" style={txtCell} value={v.linkTypes || ''}
            placeholder={t('repSetB2LinksPh')} onChange={(e) => patch({ linkTypes: e.target.value })} />
        </div>
      </div>

      {/* #50 S8a — B3 «1000 мелочей» (контур B): тег YT мелких задач (счётчик за период / темп YTD). */}
      <div className="card-subtitle" style={subCls}>{t('repSetB3')}</div>
      <span className="hint" style={hintCls}>{t('repSetB3TagHint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetB3Tag')}</label>
          <input type="text" style={txtCell} value={v.thousandTag || ''}
            placeholder={t('phNotSelected')} onChange={(e) => patch({ thousandTag: e.target.value })} />
        </div>
      </div>

      <div className="card-subtitle" style={subCls}>{t('repSetA2Pauses')}</div>
      <span className="hint" style={hintCls}>{t('repSetA2PausesHint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetA2PauseStates')}</label>
          <MultiSelect options={bundleStates} selected={pauseStates} placeholder={t('phNotSelected')}
            onChange={(vals) => setPause({ states: vals })} />
        </div>
        <div className="field">
          <label>{t('repSetA2PauseTags')}</label>
          <MultiSelect options={pauseTagBundle} selected={pauseTags} placeholder={t('phNotSelected')}
            onChange={(vals) => setPause({ tags: vals })} />
        </div>
      </div>

      {/* #50 S4 — A8/A9: упорядоченный поток статусов (порядок = последовательность потока). */}
      <div className="card-subtitle" style={subCls}>{t('repSetA8Flow')}</div>
      <span className="hint" style={hintCls}>{t('repSetA8FlowHint')}</span>
      {bundleStates.length ? (
        <React.Fragment>
          <table className="ssp-dta-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
            <thead><tr>
              <th scope="col">{t('repSetThColState')}</th>
              <th scope="col" style={{ width: '116px' }} aria-label={t('repSetA8ColOrder')}></th>
            </tr></thead>
            <tbody>
              {!flowRows.length ? (
                <tr><td colSpan={2} className="empty" style={{ padding: '8px', textAlign: 'center', color: 'var(--muted)' }}>{t('repSetStatesEmpty')}</td></tr>
              ) : flowRows.map((r, i) => {
                const dup = r.state && flowDup[r.state] > 1;
                return (
                  <tr key={r._uid}>
                    <td style={dup ? { outline: '1px solid var(--error)' } : undefined}>
                      <RingSelLite options={stateOpts} value={r.state || ''} clearable placeholder={t('phNotSelected')} onChange={(val) => setFlowRow(i, val)} />
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button type="button" className={moveBtnCls} title={t('btnStateRollupUp')} disabled={i === 0} onClick={() => moveFlowRow(i, -1)}>↑</button>
                      <button type="button" className={moveBtnCls} title={t('btnStateRollupDown')} disabled={i === flowRows.length - 1} onClick={() => moveFlowRow(i, 1)}>↓</button>
                      <button type="button" className={moveBtnCls} title={t('repSetRemoveState')} onClick={() => delFlowRow(i)}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" className={_btnCls('secondary')} style={{ marginTop: '10px' }} onClick={addFlowRow}>{t('repSetAddState')}</button>
        </React.Fragment>
      ) : <span className="hint" style={hintCls}>{t('repSetThEmpty')}</span>}
    </React.Fragment>
  );
}

function SettingsForm(props) {
  const t = props.t || ((k) => k);
  const initial = props.initial || {};
  const roles = props.roles || [];
  const fieldsByType = props.fieldsByType || {};
  const onSave = props.onSave || (() => Promise.resolve({ success: true }));
  const onClose = props.onClose || noop;
  const onUiLangChange = props.onUiLangChange || noop;
  /* #22 — admin-тир (workflow-правила + доступ/права) рендерится только при true. */
  const canEditWorkflow = !!props.canEditWorkflow;

  /* ── Состояние формы (React source-of-truth; collect = сериализация этого) ── */
  const [activeRoles, setActiveRoles] = React.useState(() => (initial.activeRoles || []).slice());

  /* Поля-маппинги (7 одиночных селектов) */
  const [fields, setFields] = React.useState(() => ({
    fieldPriority: initial.fieldPriority || '',
    fieldXPriority: initial.fieldXPriority || '',
    fieldState: initial.fieldState || '',
    fieldSystem: initial.fieldSystem || '',
    fieldExternalTicketId: initial.fieldExternalTicketId || '',
    fieldSprint: initial.fieldSprint || '',
    fieldVersion: initial.fieldVersion || '',
    /* #21 — тип-назначение (Фича/Баг/…) для фильтра модуля «Работа с бэклогом». */
    fieldType: initial.fieldType || '',
  }));
  const setField = (k, v) => setFields((p) => Object.assign({}, p, { [k]: v }));

  /* Per-role est/fact/user (динамические ключи role.fieldEst/fieldFact/userField). */
  const [roleFields, setRoleFields] = React.useState(() => {
    const o = {};
    roles.forEach((r) => {
      o[r.key] = {
        est: (initial[r.fieldEst] || ''),
        fact: (initial[r.fieldFact] || ''),
        user: (initial[r.userField] || ''),
      };
    });
    return o;
  });
  const setRoleField = (rk, slot, v) =>
    setRoleFields((p) => Object.assign({}, p, { [rk]: Object.assign({}, p[rk], { [slot]: v }) }));

  /* Режимы (parent-child).
     v2.14.0 — «Модель планирования»: planningModel (simple|light|full) + lightSub
     (auto|manual) — источник правды UI. Тройка legacy-флагов больше не редактируется
     напрямую; пишется derived-зеркалом в collect (см. PLANNING_MODEL_SHIM). */
  const [modes, setModes] = React.useState(() => {
    const PM = globalThis.__SSP_PLANNING_MODEL_PURE;
    const pm = PM.planningModelFromSettings(initial);
    return {
      planningModel: pm.model,
      lightSub: pm.lightSub,
      /* PLANNING_MODEL_SHIM — фиксируем legacy-гибрид (PP on + useRes off) из исходных
         настроек один раз: пересохранение не должно насильно включать авто-перенос суммы. */
      legacyHybrid: PM.isLegacyHybrid(initial),
      dynEditEnabled: !!initial.dynEditEnabled,
      allowOverlimitPlanning: !!initial.allowOverlimitPlanning,
      /* #40 — авто-прогноз дат (кнопка + очередь на уровне «Люди»); планировочный тир. */
      autoForecastEnabled: !!initial.autoForecastEnabled,
    };
  });
  const toggleMode = (k) => setModes((p) => Object.assign({}, p, { [k]: !p[k] }));
  const setMode = (k, v) => setModes((p) => Object.assign({}, p, { [k]: v }));

  /* Нормы */
  const [nums, setNums] = React.useState(() => {
    const kpe = initial.kpe || {};
    return {
      nkcJanuary: initial.nkcJanuary != null ? initial.nkcJanuary : 105,
      nkcMay: initial.nkcMay != null ? initial.nkcMay : 119,
      nkcOther: initial.nkcOther != null ? initial.nkcOther : 145,
      rate: initial.rate != null ? initial.rate : 1,
      participation: initial.participation != null ? initial.participation : 1,
      kpeIntern: kpe.Intern != null ? kpe.Intern : 0,
      kpeJun: kpe.Junior != null ? kpe.Junior : 0.5,
      kpeMid: kpe.Middle != null ? kpe.Middle : 0.65,
      kpeSenior: kpe.Senior != null ? kpe.Senior : 0.75,
    };
  });
  const setNum = (k, v) => setNums((p) => Object.assign({}, p, { [k]: v }));

  /* Группы-мультиселекты (5b): val / edit / histClear / assigner. */
  const [groups, setGroups] = React.useState(() => ({
    val: { ids: (initial.validationGroups || []).slice(), names: (initial.validationGroupNames || []).slice() },
    edit: { ids: (initial.editGroups || []).slice(), names: (initial.editGroupNames || []).slice() },
    histClear: { ids: (initial.historyClearGroups || []).slice(), names: (initial.historyClearGroupNames || []).slice() },
    assigner: { ids: (initial.assignerGroups || []).slice(), names: (initial.assignerGroupNames || []).slice() },
    /* #22 — планировочный тир (Вариант C). */
    planning: { ids: (initial.planningManagerGroups || []).slice(), names: (initial.planningManagerGroupNames || []).slice() },
  }));
  const setGroup = (k, v) => setGroups((p) => Object.assign({}, p, { [k]: v }));

  /* Прочее */
  /* #56-5 — showDiagLogUi заменил инверсный hideDiagLogUi (лог скрыт по умолчанию). */
  const [showDiagLogUi, setShowDiagLogUi] = React.useState(initial.showDiagLogUi === true);
  const [defaultLang, setDefaultLang] = React.useState(initial.defaultLang || '');
  const [uiLang, setUiLang] = React.useState(props.uiLang || 'ru');

  /* ── 5c: DTA / каскад / state-rollup / стендап ── */
  const [dta, setDta] = React.useState(() => {
    const mapping = initial.workItemTypeMapping || {};
    return {
      enabled: !!initial.dtaEnabled,
      warnings: !!initial.dtaWarningsEnabled,
      rows: Object.keys(mapping).map((tp) => ({ type: tp, role: mapping[tp] || '' })),
    };
  });
  const [cascade, setCascade] = React.useState(() => ({
    agg: !!initial.cascadeAggregationEnabled,
    forbid: !!initial.forbidContainerWorkItems,
    kindField: (typeof initial.cascadeKindField === 'string') ? initial.cascadeKindField : '',
    level2: Array.isArray(initial.cascadeLevel2Values) ? initial.cascadeLevel2Values.slice() : [],
    level3: Array.isArray(initial.cascadeLevel3Values) ? initial.cascadeLevel3Values.slice() : [],
    linkIn: (typeof initial.cascadeParentLinkInward === 'string') ? initial.cascadeParentLinkInward : '',
    linkOut: (typeof initial.cascadeParentLinkOutward === 'string') ? initial.cascadeParentLinkOutward : '',
  }));
  const [rollup, setRollup] = React.useState(() => ({
    enabled: !!initial.stateRollupEnabled,
    order: Array.isArray(initial.stateRollupOrder) ? initial.stateRollupOrder.slice() : [],
    resolved: Array.isArray(initial.stateRollupResolvedStates) ? initial.stateRollupResolvedStates.slice() : [],
    floor: (typeof initial.stateRollupFloor === 'string') ? initial.stateRollupFloor : '',
  }));
  const [standupDone, setStandupDone] = React.useState(() =>
    Array.isArray(initial.standupDoneStates) ? initial.standupDoneStates.slice() : []);
  /* #21 — «Работа с бэклогом»: зоны (состояние→роль(и), MANY) + старт-пул + фильтр по типу
     + источник паузы. Дефолты — пустые ([] = «не размечено» → fail-loud во вкладке, §8 спеки). */
  const [backlog, setBacklog] = React.useState(() => ({
    zones: Array.isArray(initial.backlogZones)
      ? initial.backlogZones.map((z) => ({ _uid: genZoneUid(), state: (z && z.state) || '', roles: (z && Array.isArray(z.roles)) ? z.roles.slice() : [] }))
      : [],
    startStates: Array.isArray(initial.backlogStartStates) ? initial.backlogStartStates.slice() : [],
    typeFilter: Array.isArray(initial.backlogTypeFilter) ? initial.backlogTypeFilter.slice() : [],
    pauseTags: Array.isArray(initial.backlogPauseTags) ? initial.backlogPauseTags.slice() : [],
    pauseStates: Array.isArray(initial.backlogPauseStates) ? initial.backlogPauseStates.slice() : [],
  }));
  /* #48 R1 — «Релиз-менеджмент»: тумблер + пул кандидатов + группы прав + маппинг
     статус→состояние (R3: зоны светофора — авто по State, своих настроек нет).
     Все дефолты пустые/выключены. */
  const [release, setRelease] = React.useState(() => ({
    enabled: !!initial.releaseEnabled,
    candMgr:   { ids: (initial.releaseCandidateManagerGroups || []).slice(),  names: (initial.releaseCandidateManagerGroupNames || []).slice() },
    candEng:   { ids: (initial.releaseCandidateEngineerGroups || []).slice(), names: (initial.releaseCandidateEngineerGroupNames || []).slice() },
    rightsMgr: { ids: (initial.releaseManagerGroups || []).slice(),           names: (initial.releaseManagerGroupNames || []).slice() },
    rightsEng: { ids: (initial.releaseEngineerGroups || []).slice(),          names: (initial.releaseEngineerGroupNames || []).slice() },
    mapping: Object.assign({ planned: '', prep: '', work: '', released: '', cancelled: '' },
      (initial.releaseStatusStateMapping && typeof initial.releaseStatusStateMapping === 'object') ? initial.releaseStatusStateMapping : {}),
    /* #55 — маппинг «статус → тег задач» (имена СУЩЕСТВУЮЩИХ тегов; пусто = без тега). */
    tagMapping: Object.assign({ planned: '', prep: '', work: '', released: '', cancelled: '' },
      (initial.releaseTagMapping && typeof initial.releaseTagMapping === 'object') ? initial.releaseTagMapping : {}),
  }));

  /* #50 — «Отчётность» (admin-тир). enabled + reporting-access группы A/B + пороги aging (S1c)
     + целевые статусы/ярлыки A1 (S2). */
  const [reporting, setReporting] = React.useState(() => ({
    enabled: !!initial.reportingEnabled,
    groupsA: { ids: (initial.reportingGroupsA || []).slice(), names: (initial.reportingGroupsANames || []).slice() },
    groupsB: { ids: (initial.reportingGroupsB || []).slice(), names: (initial.reportingGroupsBNames || []).slice() },
    /* #50 — статусные секции как строки-редактора (пикер+добавить); каноническая модель прежняя,
       конвертеры _rep*ToRows / _repRowsTo* (пороги-объект / цели-массив+ярлыки / поток-массив). */
    thRows: _repThToRows(initial.reportingThresholds),
    a1Rows: _repA1ToRows(initial.reportingTargetStatuses, initial.reportingStatusLabels),
    flowRows: _repFlowToRows(initial.reportingFlowStates),
    /* #50 S3a — A2 TTM: якоря / нормативы / маркеры пауз (аддитивно, defensive type-guards). */
    anchors: (initial.reportingAnchors && typeof initial.reportingAnchors === 'object'
      && !Array.isArray(initial.reportingAnchors)) ? initial.reportingAnchors : {},
    ttmNorms: (function () {
      const n = initial.reportingTtmNorms;
      const ok = n && typeof n === 'object' && !Array.isArray(n);
      return { lead: ok && n.lead !== undefined ? n.lead : 21, team: ok && n.team !== undefined ? n.team : 15 };
    })(),
    /* #50 v3.2.0 — A2 терминальная политика reopen: enum, всё кроме 'last-stable-close' → дефолт. */
    terminalPolicy: (initial.reportingTerminalPolicy === 'last-stable-close') ? 'last-stable-close' : 'first-close',
    variancePct: (typeof initial.reportingVariancePct === 'number' && isFinite(initial.reportingVariancePct)) ? initial.reportingVariancePct : 20,
    timeoutSec: (typeof initial.reportingTimeoutSec === 'number' && isFinite(initial.reportingTimeoutSec)) ? initial.reportingTimeoutSec : 90,   /* #50 D10 таймаут-бэкстоп */
    showSystem: initial.reportingShowSystem !== false,   /* v3.9.0 — «Система» в отчётах (дефолт ON) */
    /* #50 S6a — A3 : имена YT-полей бизнес-колонок среза (пусто = колонка скрыта). */
    a3StageField: (typeof initial.reportingA3StageField === 'string') ? initial.reportingA3StageField : '',
    a3OrgField: (typeof initial.reportingA3OrgField === 'string') ? initial.reportingA3OrgField : '',
    a3PriorityField: (typeof initial.reportingA3PriorityField === 'string') ? initial.reportingA3PriorityField : '',
    /* #50 S6b — A6: месячная ёмкость роли { roleKey → ч/мес } (знаменатель «месяцев бэклога»). */
    a6Capacity: (initial.reportingRoleMonthlyCapacity && typeof initial.reportingRoleMonthlyCapacity === 'object'
      && !Array.isArray(initial.reportingRoleMonthlyCapacity)) ? Object.assign({}, initial.reportingRoleMonthlyCapacity) : {},
    /* #50 S7a — A10: пороги «возраста хвоста» { warm|hot → int спринтов }. Дефолт {warm:2, hot:5} (мокап). */
    ageBands: (initial.reportingSpilloverAgeBands && typeof initial.reportingSpilloverAgeBands === 'object'
      && !Array.isArray(initial.reportingSpilloverAgeBands)) ? Object.assign({}, initial.reportingSpilloverAgeBands) : { warm: 2, hot: 5 },
    thousandTag: (typeof initial.reportingThousandTag === 'string') ? initial.reportingThousandTag : '',   /* #50 S8a — B3 тег */
    techDebtType: (typeof initial.reportingTechDebtType === 'string') ? initial.reportingTechDebtType : '',   /* #50 S8b — B1 отбор техдолга */
    techDebtTag: (typeof initial.reportingTechDebtTag === 'string') ? initial.reportingTechDebtTag : '',
    bugType: (typeof initial.reportingBugType === 'string') ? initial.reportingBugType : '',   /* #50 S8c — B2 тип-баг */
    linkTypes: Array.isArray(initial.reportingLinkTypes) ? initial.reportingLinkTypes.join(', ') : '',   /* #50 S8c — B2 типы связей баг→фича (CSV в форме) */
    pauseMarkers: (function () {
      const m = initial.reportingPauseMarkers;
      const ok = m && typeof m === 'object' && !Array.isArray(m);
      return {
        states: ok && Array.isArray(m.states) ? m.states.slice() : [],
        tags: ok && Array.isArray(m.tags) ? m.tags.slice() : [],
      };
    })(),
  }));

  /* Bundle-состояния state-поля проекта — общий источник для rollup + standup + backlog.
     Реактивно перезагружаются при смене ЖИВОГО выбора State-поля (fields.fieldState),
     а не один раз на mount по сохранённому props.stateFieldName — иначе выбор/смена
     поля состояния не подтягивала бандл (пустой пикер). Паттерн — как cascade.kindField. */
  const [bundleStates, setBundleStates] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    if (props.loadFieldValues) {
      Promise.resolve(props.loadFieldValues(fields.fieldState || props.stateFieldName || 'State'))
        .then((vals) => { if (alive && Array.isArray(vals)) setBundleStates(vals); })
        .catch(noop);
    }
    return () => { alive = false; };
  }, [fields.fieldState]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Two-pane: активная секция (левый nav → правый pane). Дефолт — первая секция.
     Заменяет прежний аккордеон (openCard/toggleCard) — плотные секции не тянулись
     одной колонкой в модалке ограниченной высоты (см. NEXT_SESSION_PROMPT §3). */
  const [activeSection, setActiveSection] = React.useState('roles');

  /* Save UX */
  const [saving, setSaving] = React.useState(false);
  const [hint, setHint] = React.useState(null); // {cls,text}

  const activeRoleList = roles.filter((r) => activeRoles.indexOf(r.key) >= 0);

  /* Валидация дублей est/fact (как _recomputeSaveBtnState): одно period-поле
     нельзя назначить двум ролям. Блокирует save. */
  function dupKeys(slot) {
    const seen = {}; const dups = {};
    activeRoleList.forEach((r) => {
      const v = roleFields[r.key] && roleFields[r.key][slot];
      if (!v) return;
      if (seen[v]) dups[v] = true; else seen[v] = true;
    });
    return dups;
  }
  const estDups = dupKeys('est');
  const factDups = dupKeys('fact');
  const hasEstDup = Object.keys(estDups).length > 0;
  const hasFactDup = Object.keys(factDups).length > 0;

  /* DTA: один work-item-type нельзя замаппить на 2 роли (дубль type-name блокирует save). */
  const dtaCounts = {};
  dta.rows.forEach((r) => { const tp = (r.type || '').trim(); if (tp) dtaCounts[tp] = (dtaCounts[tp] || 0) + 1; });
  const hasDtaDup = Object.keys(dtaCounts).some((k) => dtaCounts[k] > 1);
  /* rollup noHierarchy-подсказка: каскад задаёт иерархию (level2/level3). */
  const cascadeHasHierarchy = cascade.level2.length > 0 || cascade.level3.length > 0;

  /* #21 — дубль состояния в зонах бэклога блокирует save (бэкенд требует unique state). */
  const backlogStateCounts = {};
  backlog.zones.forEach((z) => { const s = (z.state || '').trim(); if (s) backlogStateCounts[s] = (backlogStateCounts[s] || 0) + 1; });
  const hasBacklogDup = Object.keys(backlogStateCounts).some((k) => backlogStateCounts[k] > 1);

  /* #50 (ревью) — дубли статусов в секциях отчётности блокируют save (иначе молчаливый
     last-wins/first-wins при проекции rows→объект), паттерн hasBacklogDup. */
  const _repDupIn = (rows) => {
    const c = {};
    (rows || []).forEach((r) => { const s = ((r && r.state) || '').trim(); if (s) c[s] = (c[s] || 0) + 1; });
    return Object.keys(c).some((k) => c[k] > 1);
  };
  const hasReportingDup = _repDupIn(reporting.thRows) || _repDupIn(reporting.a1Rows) || _repDupIn(reporting.flowRows);

  const blocked = hasEstDup || hasFactDup || hasDtaDup || hasBacklogDup || hasReportingDup;

  function toggleRole(rk) {
    setActiveRoles((prev) => {
      const i = prev.indexOf(rk);
      if (i >= 0) { const n = prev.slice(); n.splice(i, 1); return n; }
      return prev.concat([rk]);
    });
  }

  /* ── Сборка settings-объекта (passthrough из initial + реализованные секции) ── */
  function collect() {
    const data = Object.assign({}, initial); // passthrough нереализованных секций (5b/5c)

    data.activeRoles = activeRoles.slice();
    data.dynEditEnabled = modes.dynEditEnabled;
    /* v2.14.0 — planningModel = источник правды; legacy-флаги пишутся derived-зеркалом
       (расчёты/super-light читают их). PLANNING_MODEL_SHIM — derived-блок снять, когда
       расчёты переведут на planningModel (см. PLANNING_MODEL_DROPDOWN_SPEC §10). */
    data.planningModel = modes.planningModel;
    const _ppFlags = globalThis.__SSP_PLANNING_MODEL_PURE.planningModelToFlags(
      modes.planningModel, modes.lightSub, { legacyHybrid: modes.legacyHybrid });
    data.personalPlanningEnabled = _ppFlags.personalPlanningEnabled;
    data.usePersonalForResource = _ppFlags.usePersonalForResource;
    data.manualPersonalResource = _ppFlags.manualPersonalResource;
    data.allowOverlimitPlanning = modes.allowOverlimitPlanning;
    data.autoForecastEnabled = modes.autoForecastEnabled;   /* #40 */
    data.showDiagLogUi = showDiagLogUi;   /* #56-5 — hideDiagLogUi больше не пишем (soft-deprecated) */

    const num = (v, d) => { const f = parseFloat(v); return isFinite(f) ? f : d; };
    data.nkcJanuary = num(nums.nkcJanuary, 105);
    data.nkcMay = num(nums.nkcMay, 119);
    data.nkcOther = num(nums.nkcOther, 145);
    data.rate = num(nums.rate, 1);
    data.participation = num(nums.participation, 1);
    data.kpe = {
      Intern: num(nums.kpeIntern, 0),
      Junior: num(nums.kpeJun, 0.5),
      Middle: num(nums.kpeMid, 0.65),
      Senior: num(nums.kpeSenior, 0.75),
    };

    /* #45 R4 — capacityMode деривируется из planningModel: 'full' → модуль ёмкости вкл
       (вкладка Capacity + остаток планирования из утверждённой ёмкости), иначе 'light'.
       hoursPerDay/usefulHoursPerDay — константы Full-расчёта: passthrough из stored, дефолты
       (8/7) при первом включении Full. Все — admin-тир (preserve-merge для не-админа). */
    data.capacityMode = (modes.planningModel === 'full') ? 'full' : 'light';
    if (initial.hoursPerDay != null) data.hoursPerDay = initial.hoursPerDay;
    else if (data.capacityMode === 'full') data.hoursPerDay = 8;
    if (initial.usefulHoursPerDay != null) data.usefulHoursPerDay = initial.usefulHoursPerDay;
    else if (data.capacityMode === 'full') data.usefulHoursPerDay = 7;

    data.fieldPriority = fields.fieldPriority || null;
    data.fieldXPriority = fields.fieldXPriority || null;
    data.fieldState = fields.fieldState || null;
    data.fieldSystem = fields.fieldSystem || null;
    data.fieldExternalTicketId = fields.fieldExternalTicketId || null;
    data.fieldSprint = fields.fieldSprint || null;
    data.fieldVersion = fields.fieldVersion || null;
    data.fieldType = fields.fieldType || null;

    data.defaultLang = defaultLang || undefined;

    /* Группы (5b) */
    data.validationGroups = groups.val.ids.slice();
    data.validationGroupNames = groups.val.names.slice();
    data.editGroups = groups.edit.ids.slice();
    data.editGroupNames = groups.edit.names.slice();
    data.historyClearGroups = groups.histClear.ids.slice();
    data.historyClearGroupNames = groups.histClear.names.slice();
    data.assignerGroups = groups.assigner.ids.slice();
    data.assignerGroupNames = groups.assigner.names.slice();
    /* #22 — планировочный тир (Вариант C). */
    data.planningManagerGroups = groups.planning.ids.slice();
    data.planningManagerGroupNames = groups.planning.names.slice();

    /* DTA (5c): mapping из строк (пустой type/role скипается; дубль блокирует save выше). */
    data.dtaEnabled = dta.enabled;
    data.dtaWarningsEnabled = dta.warnings;
    data.workItemTypeMapping = (function () {
      const out = {};
      dta.rows.forEach((r) => {
        const tp = (r.type || '').trim();
        if (!tp || !r.role) return;
        out[tp] = r.role;
      });
      return out;
    })();

    /* Каскад (5c): 7 ключей. Пустые kind-field/links → null (backend допускает). */
    data.cascadeAggregationEnabled = cascade.agg;
    data.forbidContainerWorkItems = cascade.forbid;
    data.cascadeKindField = strOrNull(cascade.kindField);
    data.cascadeLevel2Values = capValues(cascade.level2);
    data.cascadeLevel3Values = capValues(cascade.level3);
    data.cascadeParentLinkInward = strOrNull(cascade.linkIn);
    data.cascadeParentLinkOutward = strOrNull(cascade.linkOut);

    /* State rollup (5c): strategy всегда 'min' (enum пока только min). */
    data.stateRollupEnabled = rollup.enabled;
    data.stateRollupOrder = rollup.order.slice();
    data.stateRollupResolvedStates = rollup.resolved.slice();
    data.stateRollupFloor = rollup.floor || null;
    data.stateRollupStrategy = 'min';

    /* Стендап (5c): done-состояния. */
    data.standupDoneStates = standupDone.slice();

    /* #21 — «Работа с бэклогом». Зоны: пустой state скипается, dedup по state,
       roles ∩ role keys (бэкенд: unique state, roles⊆ROLE_KEYS). Остальные — capValues.
       valid берётся из ВСЕХ ролей (не activeRoleList) НАМЕРЕННО: роль, размеченную при
       активной роли и позже деактивированную в «Составе», не теряем (паритет с DtaSection
       workItemTypeMapping; admin-конфиг переживает временную деактивацию). */
    data.backlogZones = (function () {
      const valid = {}; roles.forEach((r) => { valid[r.key] = true; });
      const out = []; const seen = {};
      backlog.zones.forEach((z) => {
        let st = String((z && z.state) || '').trim();
        if (!st || seen[st]) return;
        if (st.length > 200) st = st.slice(0, 200);
        seen[st] = true;
        const rls = []; const seenR = {};
        ((z && z.roles) || []).forEach((rk) => { if (valid[rk] && !seenR[rk]) { seenR[rk] = true; rls.push(rk); } });
        out.push({ state: st, roles: rls });
      });
      return out;
    })();
    data.backlogStartStates = capValues(backlog.startStates);
    data.backlogTypeFilter = capValues(backlog.typeFilter);
    data.backlogPauseTags = capValues(backlog.pauseTags);
    data.backlogPauseStates = capValues(backlog.pauseStates);

    /* #48 R1 — «Релиз-менеджмент». Группы — {ids,names}; маппинг — только непустые статусы;
       поле готовности — strOrNull; зоны — capValues. Все admin-тир (preserve-merge на бэке). */
    data.releaseEnabled = release.enabled;
    data.releaseCandidateManagerGroups = release.candMgr.ids.slice();
    data.releaseCandidateManagerGroupNames = release.candMgr.names.slice();
    data.releaseCandidateEngineerGroups = release.candEng.ids.slice();
    data.releaseCandidateEngineerGroupNames = release.candEng.names.slice();
    data.releaseManagerGroups = release.rightsMgr.ids.slice();
    data.releaseManagerGroupNames = release.rightsMgr.names.slice();
    data.releaseEngineerGroups = release.rightsEng.ids.slice();
    data.releaseEngineerGroupNames = release.rightsEng.names.slice();
    data.releaseStatusStateMapping = (function () {
      const out = {};
      ['planned', 'prep', 'work', 'released', 'cancelled'].forEach((k) => {
        const val = String((release.mapping && release.mapping[k]) || '').trim();
        if (val) out[k] = val.length > 200 ? val.slice(0, 200) : val;
      });
      return out;
    })();
    /* #55 — маппинг статус → тег (форма идентична state-маппингу). */
    data.releaseTagMapping = (function () {
      const out = {};
      ['planned', 'prep', 'work', 'released', 'cancelled'].forEach((k) => {
        const val = String((release.tagMapping && release.tagMapping[k]) || '').trim();
        if (val) out[k] = val.length > 200 ? val.slice(0, 200) : val;
      });
      return out;
    })();

    /* #50 — «Отчётность». enabled + reporting-access группы + пороги aging (admin-тир,
       preserve-merge на бэке). */
    data.reportingEnabled = reporting.enabled;
    data.reportingGroupsA = reporting.groupsA.ids.slice();
    data.reportingGroupsANames = reporting.groupsA.names.slice();
    data.reportingGroupsB = reporting.groupsB.ids.slice();
    data.reportingGroupsBNames = reporting.groupsB.names.slice();
    data.reportingThresholds = _repRowsToTh(reporting.thRows);
    const _repA1 = _repRowsToA1(reporting.a1Rows);
    data.reportingTargetStatuses = _repA1.states;
    data.reportingStatusLabels = _repA1.labels;
    data.reportingFlowStates = _repRowsToFlow(reporting.flowRows); /* #50 S4 — порядок = порядок строк */
    /* #50 S3a — A2 TTM: якоря / нормативы / маркеры пауз (admin-тир, preserve-merge на бэке). */
    data.reportingAnchors = reporting.anchors || {};
    data.reportingTtmNorms = reporting.ttmNorms || { lead: 21, team: 15 };
    data.reportingTerminalPolicy = (reporting.terminalPolicy === 'last-stable-close') ? 'last-stable-close' : 'first-close'; /* #50 v3.2.0 — A2 политика reopen */
    data.reportingVariancePct = (typeof reporting.variancePct === 'number' && isFinite(reporting.variancePct)) ? reporting.variancePct : 20; /* #50 S5b A5 */
    data.reportingTimeoutSec = (typeof reporting.timeoutSec === 'number' && isFinite(reporting.timeoutSec)) ? reporting.timeoutSec : 90; /* #50 D10 таймаут */
    data.reportingShowSystem = reporting.showSystem !== false; /* v3.9.0 — «Система» в отчётах (bool, дефолт ON) */
    data.reportingPauseMarkers = reporting.pauseMarkers || { states: [], tags: [] };
    /* #50 S6a — A3 срез: имена YT-полей бизнес-колонок (пусто → null = колонка скрыта). */
    data.reportingA3StageField = reporting.a3StageField || null;
    data.reportingA3OrgField = reporting.a3OrgField || null;
    data.reportingA3PriorityField = reporting.a3PriorityField || null;
    data.reportingRoleMonthlyCapacity = reporting.a6Capacity || {}; /* #50 S6b — A6 месячная ёмкость роли */
    data.reportingSpilloverAgeBands = (reporting.ageBands && typeof reporting.ageBands === 'object' && !Array.isArray(reporting.ageBands)) ? reporting.ageBands : { warm: 2, hot: 5 }; /* #50 S7a — A10 пороги возраста хвоста */
    data.reportingThousandTag = reporting.thousandTag || null; /* #50 S8a — B3 тег «1000 мелочей» (контур B) */
    data.reportingTechDebtType = reporting.techDebtType || null; /* #50 S8b — B1 отбор техдолга (контур B) */
    data.reportingTechDebtTag = reporting.techDebtTag || null;
    data.reportingBugType = reporting.bugType || null; /* #50 S8c — B2 тип-баг (контур B) */
    data.reportingLinkTypes = (function () {   /* #50 S8c — B2 типы связей баг→фича: CSV → уникальный str[] */
      const seen = {}, out = [];
      String(reporting.linkTypes || '').split(',').forEach((s) => { const t = s.trim(); if (t && !seen[t]) { seen[t] = true; out.push(t); } });
      return out;
    })();

    /* Per-role: для ВСЕХ ролей (как legacy) — null для неактивных/неназначенных. */
    roles.forEach((r) => {
      const rf = (activeRoles.indexOf(r.key) >= 0) ? (roleFields[r.key] || {}) : {};
      data[r.fieldEst] = rf.est || null;
      data[r.fieldFact] = rf.fact || null;
      data[r.userField] = rf.user || null;
    });

    return data; // savedAt проставит легаси-колбэк onSave.
  }

  function doSave() {
    if (blocked || saving) return;
    setSaving(true);
    setHint({ cls: 'save-hint', text: t('toastSaving') });
    Promise.resolve(onSave(collect())).then((resp) => {
      setSaving(false);
      if (resp && resp.success === false) {
        setHint({ cls: 'save-err', text: t('toastSettingsErr') + (resp.reason ? ': ' + resp.reason : '') });
        return;
      }
      setHint({ cls: 'save-ok', text: t('toastSettingsSaved') });
    }).catch((e) => {
      setSaving(false);
      setHint({ cls: 'save-err', text: t('toastSettingsErr') + ': ' + (e && e.message ? e.message : String(e)) });
    });
  }

  function changeUiLang(lang) {
    setUiLang(lang);
    onUiLangChange(lang); // легаси меняет глобальный _lang + applyI18N остального UI; t() ниже читает новый язык
  }

  /* #43 W1 (C-1, Path B) — вендорный Ring Checkbox для сетки выбора ролей. */
  const RingCheckbox = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Checkbox;

  /* ── Конфиг секций (two-pane): id → title → node. Контент идентичен прежним
     Card-блокам; меняется только обёртка (nav-список слева + активная секция справа).
     node вычисляется каждый рендер (дёшево) — все секции в одном scope.
     nav (#43 W2, B-3) — короткий label левого списка (один ряд, ровный ритм);
     полное название остаётся в pane__title. Без nav — в списке title. ── */
  const SECTIONS = [
    {
      id: 'roles', title: t('cardRoles'), nav: t('navRoles'),
      node: (
        <div className="roles-grid">
          {roles.map((r) => {
            const on = activeRoles.indexOf(r.key) >= 0;
            const lbl = uiLang === 'en' ? (r.labelEn || r.label) : r.label;
            return RingCheckbox
              ? <RingCheckbox key={r.key} checked={on} label={lbl} onChange={() => toggleRole(r.key)} />
              : (
                <div
                  key={r.key}
                  className={'role-check' + (on ? ' active' : '')}
                  onClick={() => toggleRole(r.key)}
                >
                  <span className="role-check__cb"></span>
                  <span className="role-check__label">{lbl}</span>
                </div>
              );
          })}
        </div>
      ),
    },
    {
      id: 'groups', title: t('cardGroups'),
      node: (
        <React.Fragment>
          {[
            { key: 'planning', label: t('lblPlanningManagerGroup'), hint: t('hintPlanningManagerGroup') },
            { key: 'val', label: t('lblValGroup') },
            { key: 'edit', label: t('lblEditGroup') },
            { key: 'histClear', label: t('lblHistClearGroup'), hint: t('hintHistClearGroup') },
            { key: 'assigner', label: t('lblAssignerGroup'), hint: t('hintAssignerGroup') },
          ].map((g) => (
            <div className="field" key={g.key} style={{ marginBottom: '12px' }}>
              <label>{g.label}</label>
              <GrpMultiSelect
                t={t}
                value={groups[g.key]}
                onChange={(v) => setGroup(g.key, v)}
                initialGroups={props.initialGroups}
                loadGroups={props.loadGroups}
                onMax={() => setHint({ cls: 'save-err', text: t('toastMaxGroupsReached') })}
              />
              {g.hint ? <span className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>{g.hint}</span> : null}
            </div>
          ))}
        </React.Fragment>
      ),
    },
    {
      id: 'fields', title: t('cardOtherFields'),
      node: (
        <React.Fragment>
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '8px' }}>
            {t('cardOtherFieldsRequired')}
          </div>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label>{t('fldPriority')}</label>
              <FieldSelect value={fields.fieldPriority} onChange={(v) => setField('fieldPriority', v)} names={fieldsByType.priority} placeholder={t('phNotSelected')} />
            </div>
            <div className="field">
              <label>{t('fldState')}</label>
              <FieldSelect value={fields.fieldState} onChange={(v) => setField('fieldState', v)} names={fieldsByType.state} placeholder={t('phNotSelected')} />
            </div>
          </div>
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' }}>
            {t('cardOtherFieldsOptional')}
          </div>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label>{t('fldXpriority')}</label>
              <FieldSelect value={fields.fieldXPriority} onChange={(v) => setField('fieldXPriority', v)} names={fieldsByType.xpriority} placeholder={t('phNotSelected')} />
            </div>
            <div className="field">
              <label>{t('fldSystem')}</label>
              <FieldSelect value={fields.fieldSystem} onChange={(v) => setField('fieldSystem', v)} names={fieldsByType.system} placeholder={t('phNotSelected')} />
            </div>
            <div className="field">
              <label>{t('fldExternalTicketId')}</label>
              <FieldSelect value={fields.fieldExternalTicketId} onChange={(v) => setField('fieldExternalTicketId', v)} names={fieldsByType.externalTicketId} placeholder={t('phNotSelected')} />
            </div>
            <div className="field">
              <label>{t('fldSprint')}</label>
              <FieldSelect value={fields.fieldSprint} onChange={(v) => setField('fieldSprint', v)} names={fieldsByType.sprint} placeholder={t('phNotSelected')} />
            </div>
            <div className="field">
              <label>{t('fldVersion')}</label>
              <FieldSelect value={fields.fieldVersion} onChange={(v) => setField('fieldVersion', v)} names={fieldsByType.version} placeholder={t('phNotSelected')} />
            </div>
            {/* #21 — поле типа-назначения (Фича/Баг/…) для фильтра модуля «Работа с бэклогом». */}
            <div className="field">
              <label>{t('fldType')}</label>
              <FieldSelect value={fields.fieldType} onChange={(v) => { if (v !== fields.fieldType) setBacklog((b) => Object.assign({}, b, { typeFilter: [] })); setField('fieldType', v); }} names={fieldsByType.enumFields} placeholder={t('phNotSelected')} />
            </div>
          </div>
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' }}>
            {t('cardUserFields')}
          </div>
          <div className="form-grid ssp-role-grid">
            {activeRoleList.map((r) => (
              <div className="field" key={r.key}>
                <label>{uiLang === 'en' ? (r.labelEn || r.label) : r.label}</label>
                <FieldSelect value={roleFields[r.key] ? roleFields[r.key].user : ''} onChange={(v) => setRoleField(r.key, 'user', v)} names={fieldsByType.user} placeholder={t('phNotSelected')} />
              </div>
            ))}
          </div>
        </React.Fragment>
      ),
    },
    {
      id: 'est', title: t('cardFieldEst'), error: hasEstDup,
      node: (
        <React.Fragment>
          <div className="form-grid ssp-role-grid">
            {activeRoleList.map((r) => (
              <div className="field" key={r.key}>
                <label>{uiLang === 'en' ? (r.labelEn || r.label) : r.label}</label>
                <FieldSelect value={roleFields[r.key] ? roleFields[r.key].est : ''} onChange={(v) => setRoleField(r.key, 'est', v)} names={fieldsByType.period} placeholder={t('phNotSelected')} />
              </div>
            ))}
          </div>
          {hasEstDup ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', marginTop: '8px', fontWeight: 500 }}>{t('errDuplicateEstField')}</div> : null}
        </React.Fragment>
      ),
    },
    {
      id: 'fact', title: t('cardFieldFact'), nav: t('navFieldFact'), error: hasFactDup,
      node: (
        <React.Fragment>
          <div className="form-grid ssp-role-grid">
            {activeRoleList.map((r) => (
              <div className="field" key={r.key}>
                <label>{uiLang === 'en' ? (r.labelEn || r.label) : r.label}</label>
                <FieldSelect value={roleFields[r.key] ? roleFields[r.key].fact : ''} onChange={(v) => setRoleField(r.key, 'fact', v)} names={fieldsByType.period} placeholder={t('phNotSelected')} />
              </div>
            ))}
          </div>
          {hasFactDup ? <div className="hint" style={{ fontSize: '12px', color: 'var(--error)', marginTop: '8px', fontWeight: 500 }}>{t('errDuplicateFactField')}</div> : null}
        </React.Fragment>
      ),
    },
    {
      /* #45 (b) — секция оставлена только с чисто-планировочными режимами.
         Нормы/КПЕ (бывшая «Учёт ёмкости») и personalPlanning-кластер (мастер + источник
         ресурса) переехали в admin-секцию «Управление ёмкостью». dynEdit + allowOverlimit
         намеренно ОСТАЮТСЯ здесь (планировочный тир). */
      id: 'modes', title: t('cardModes'),
      node: (
        <React.Fragment>
          <RoleCheck on={modes.dynEditEnabled} label={t('lblDynEdit')} hint={t('descDynEdit')} tooltip={t('tooltipDynEdit')} onToggle={() => toggleMode('dynEditEnabled')} />
          <div style={{ marginTop: '12px' }}>
            <RoleCheck on={modes.allowOverlimitPlanning} label={t('lblAllowOverlimit')} hint={t('descAllowOverlimit')} onToggle={() => toggleMode('allowOverlimitPlanning')} />
          </div>
          <div style={{ marginTop: '12px' }}>
            <RoleCheck on={modes.autoForecastEnabled} label={t('lblAutoForecast')} hint={t('descAutoForecast')} onToggle={() => toggleMode('autoForecastEnabled')} />
          </div>
        </React.Fragment>
      ),
    },
    {
      id: 'dta', title: t('cardDta'), nav: t('navDta'), error: hasDtaDup,
      node: (
        <DtaSection t={t} value={dta} onChange={setDta} activeRoles={activeRoleList} uiLang={uiLang} hasDup={hasDtaDup} />
      ),
    },
    {
      id: 'cascade', title: t('cardCascade'), nav: t('navCascade'),
      node: (
        <CascadeSection t={t} value={cascade} onChange={setCascade} enumFields={props.enumFields || []} loadFieldValues={props.loadFieldValues} />
      ),
    },
    {
      id: 'rollup', title: t('cardStateRollup'), nav: t('navStateRollup'), error: rollup.order.length === 1,
      node: (
        <StateRollupSection t={t} value={rollup} onChange={setRollup} bundleStates={bundleStates} cascadeHasHierarchy={cascadeHasHierarchy} />
      ),
    },
    {
      id: 'standup', title: t('cardStandupSettings'),
      node: (
        <StandupSection t={t} value={standupDone} onChange={setStandupDone} bundleStates={bundleStates} />
      ),
    },
    {
      /* #21 — модуль «Работа с бэклогом» (admin-тир, §9 спеки: настройки = admin). */
      id: 'backlog', title: t('cardBacklog'), nav: t('navBacklog'), error: hasBacklogDup,
      node: (
        <BacklogSection
          t={t} value={backlog} onChange={setBacklog}
          bundleStates={bundleStates} activeRoles={activeRoleList} uiLang={uiLang}
          fieldTypeName={fields.fieldType} loadFieldValues={props.loadFieldValues} loadTags={props.loadTags}
          hasDup={hasBacklogDup}
        />
      ),
    },
    {
      /* #45 (b) — admin-секция «Управление ёмкостью»: нормы/КПЕ (бывшая «Учёт ёмкости»)
         + источник ресурса исполнителей (бывший personalPlanning-кластер из «Режимов»).
         Все ключи — admin-тир (см. backend ADMIN_TIER_SETTINGS_KEYS).
         L2: ввод Full-модели (capacityMode/hoursPerDay/usefulHoursPerDay) на main НЕ
         показываем — заглушка; значения сохраняются из stored в collect(). */
      id: 'capacity', title: t('cardCapacity'), nav: t('navCapacity'),
      node: (
        <React.Fragment>
          {/* Нормы расчёта ёмкости (бывшая секция «Учёт ёмкости»). */}
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '8px' }}>
            {t('cardWorkloadSettings')}
          </div>
          <div className="form-grid form-grid--3">
            <NumField id="s_nkc_january" label={t('lblNkcJanuary')} value={nums.nkcJanuary} onChange={(v) => setNum('nkcJanuary', v)} min={0} step={0.5} />
            <NumField id="s_nkc_may" label={t('lblNkcMay')} value={nums.nkcMay} onChange={(v) => setNum('nkcMay', v)} min={0} step={0.5} />
            <NumField id="s_nkc_other" label={t('lblNkcOther')} value={nums.nkcOther} onChange={(v) => setNum('nkcOther', v)} min={0} step={0.5} />
            <NumField id="s_rate" label={t('lblRate')} value={nums.rate} onChange={(v) => setNum('rate', v)} min={0} max={2} step={0.01} />
            <NumField id="s_participation" label={t('lblParticipation')} value={nums.participation} onChange={(v) => setNum('participation', v)} min={0} max={1} step={0.01} />
          </div>

          {/* КПЕ по грейдам. */}
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' }}>
            {t('cardKpe')}
          </div>
          <div className="form-grid form-grid--3">
            <NumField id="s_kpe_intern" label={t('lblKpeIntern')} value={nums.kpeIntern} onChange={(v) => setNum('kpeIntern', v)} min={0} max={2} step={0.01} />
            <NumField id="s_kpe_jun" label={t('lblKpeJun')} value={nums.kpeJun} onChange={(v) => setNum('kpeJun', v)} min={0} max={2} step={0.01} />
            <NumField id="s_kpe_mid" label={t('lblKpeMid')} value={nums.kpeMid} onChange={(v) => setNum('kpeMid', v)} min={0} max={2} step={0.01} />
            <NumField id="s_kpe_senior" label={t('lblKpeSenior')} value={nums.kpeSenior} onChange={(v) => setNum('kpeSenior', v)} min={0} max={2} step={0.01} />
          </div>

          {/* v2.14.0 — «Модель планирования»: один dropdown (simple|light|full) заменяет
              тройку тогглов (PLANNING_MODEL_DROPDOWN_SPEC). Full (#45 R4) — модуль ёмкости:
              ресурс ролей из утверждённой ёмкости спринта, capacityMode='full' деривируется в collect.
              При light — radio способа расчёта ресурса (авто по формуле / ручной ввод). */}
          <div className="card-subtitle" style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' }}>
            {t('capGroupResource')}
          </div>
          <div className="field">
            <label htmlFor="s_planning_model">{t('lblPlanningModel')}</label>
            <RingSelLite
              options={[
                { key: 'simple', label: t('optModelSimple') },
                { key: 'light', label: t('optModelLight') },
                { key: 'full', label: t('optModelFull') },
              ]}
              value={modes.planningModel}
              onChange={(v) => setMode('planningModel', v)}
            />
            <div className="field-hint" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
              {t(modes.planningModel === 'full' ? 'descCapacityMode' : modes.planningModel === 'light' ? 'descModelLight' : 'descModelSimple')}
            </div>
          </div>
          {modes.planningModel === 'light' ? (
            <div className="field" style={{ marginTop: '12px' }} role="radiogroup" aria-label={t('lblLightCalcMethod')}>
              <label style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px', display: 'block' }}>
                {t('lblLightCalcMethod')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer' }}>
                <input type="radio" name="ssp-light-sub" checked={modes.lightSub === 'auto'} onChange={() => setMode('lightSub', 'auto')} />
                <span>{t('lblLightAuto')}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="radio" name="ssp-light-sub" checked={modes.lightSub === 'manual'} onChange={() => setMode('lightSub', 'manual')} />
                <span>{t('lblLightManual')}</span>
              </label>
            </div>
          ) : null}
        </React.Fragment>
      ),
    },
    {
      id: 'misc', title: t('cardMisc'),
      node: (
        <React.Fragment>
          <div className="form-grid form-grid--2">
            <div className="field">
              <label>{t('lblLang')}</label>
              <RingSelLite
                options={[{ key: 'ru', label: '🇷🇺 RU' }, { key: 'en', label: '🇬🇧 EN' }]}
                value={uiLang} onChange={changeUiLang}
              />
            </div>
            <div className="field">
              <label>{t('lblDefaultLang')}</label>
              <RingSelLite
                options={(props.defaultLangOptions || [{ value: 'ru', label: 'RU' }, { value: 'en', label: 'EN' }]).map((o) => ({ key: o.value, label: o.label }))}
                value={defaultLang} clearable
                placeholder={t('optInheritFromUser') !== 'optInheritFromUser' ? t('optInheritFromUser') : '— inherit from user —'}
                onChange={setDefaultLang}
              />
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <RoleCheck on={showDiagLogUi} label={t('lblShowDiagLogUi')} hint={t('hintShowDiagLogUi')} onToggle={() => setShowDiagLogUi((v) => !v)} />
          </div>
        </React.Fragment>
      ),
    },
    {
      /* #48 R1 — «Релиз-менеджмент» (admin-тир; риск §8 обследования). */
      id: 'release', title: t('relTabTitle'), nav: t('relNavSettings'),
      node: (
        <ReleaseSection
          t={t} value={release} onChange={setRelease}
          bundleStates={bundleStates}
          loadTags={props.loadTags} /* #55 — опции колонки «Тег задач» */
          loadGroups={props.loadGroups} initialGroups={props.initialGroups}
          onMax={() => setHint({ cls: 'save-err', text: t('toastMaxGroupsReached') })}
        />
      ),
    },
    {
      /* #50 — «Отчётность» (admin-тир; данные чувствительны — доступ по reporting-группам). */
      id: 'reporting', title: t('repNavSettings'), nav: t('repNavSettings'), error: hasReportingDup,
      node: (
        <ReportingSection
          t={t} value={reporting} onChange={setReporting} activeRoles={activeRoleList} uiLang={uiLang}
          bundleStates={bundleStates} loadTags={props.loadTags}
          loadGroups={props.loadGroups} initialGroups={props.initialGroups}
          onMax={() => setHint({ cls: 'save-err', text: t('toastMaxGroupsReached') })}
        />
      ),
    },
  ];

  /* #22 — фильтр nav по тиру: не-админ (canEditWorkflow=false) не видит admin-секции. */
  const visibleSections = canEditWorkflow
    ? SECTIONS
    : SECTIONS.filter((s) => !ADMIN_SECTION_IDS[s.id]);
  const active = visibleSections.filter((s) => s.id === activeSection)[0] || visibleSections[0];

  return (
    <I18nCtx.Provider value={t}>
    <div className="ssp-settings-form">
      {/* Явный × закрытия в правом верхнем углу (Ring showCloseButton отключён в
         openSettingsModal — был бледным и у самого края island, неинтуитивен). */}
      <button
        type="button" className="ssp-settings-close"
        title={t('btnCloseSettingsTitle')} aria-label={t('btnCloseSettings')}
        onClick={() => onClose()}
      >×</button>
      <div className="ssp-settings-main">
        {/* ── Левый nav: список секций (кнопки → @ref в OOPIF, тестируемы agent-browser) ── */}
        {/* #22 — nav сгруппирован по тиру: «Планирование» (всегда) + «Администрирование»
            (workflow + доступ/права, с замком; только при canEditWorkflow). */}
        <nav className="ssp-settings-nav" aria-label={t('appTitleSettings')}>
          {[
            { tier: 'planning', label: t('navGroupPlanning'), lock: false },
            { tier: 'admin', label: t('navGroupAdmin'), lock: true },
          ].map((grp) => {
            const items = visibleSections.filter((s) => (ADMIN_SECTION_IDS[s.id] ? 'admin' : 'planning') === grp.tier);
            if (!items.length) return null;
            return (
              <React.Fragment key={grp.tier}>
                <div className="ssp-settings-nav__grouptitle" style={{ fontSize: '11px', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 10px 4px', fontWeight: 500 }}>
                  {grp.lock ? <LockIcon /> : null}{grp.label}
                </div>
                {items.map((s) => (
                  <button
                    key={s.id} type="button"
                    className={'ssp-settings-nav__item' + (s.id === active.id ? ' active' : '') + (s.error ? ' has-error' : '')}
                    aria-current={s.id === active.id ? 'true' : undefined}
                    onClick={() => setActiveSection(s.id)}
                  >
                    <span className="ssp-settings-nav__label">{s.nav || s.title}</span>
                    {s.error ? <span className="ssp-settings-nav__dot" aria-hidden="true">●</span> : null}
                  </button>
                ))}
              </React.Fragment>
            );
          })}
        </nav>

        {/* ── Правый pane: только активная секция (свой скролл) ── */}
        <div className="ssp-settings-pane">
          <div className="ssp-settings-pane__title">{active.title}</div>
          {active.node}
        </div>
      </div>

      {/* ── Footer: save + hint (flex-child снизу обеих панелей, всегда виден) ── */}
      <div className="ssp-modal-footer" style={{ alignItems: 'center' }}>
        <button type="button" className={_btnCls('secondary')} onClick={() => onClose()}>{t('btnCancel')}</button>
        <button type="button" className={_btnCls('primary')} disabled={blocked || saving} onClick={doSave}>{t('btnSaveSettings')}</button>
        {hint ? <span className={hint.cls} style={{ marginLeft: '10px', fontSize: '12px' }}>{hint.text}</span> : null}
      </div>
    </div>
    </I18nCtx.Provider>
  );
}

if (window.__SSP_RING_MODAL && typeof window.__SSP_RING_MODAL.registerBody === 'function') {
  window.__SSP_RING_MODAL.registerBody('settingsForm', SettingsForm);
}

export { SettingsForm };
