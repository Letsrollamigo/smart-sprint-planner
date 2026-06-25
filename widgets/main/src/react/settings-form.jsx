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
const ADMIN_SECTION_IDS = { groups: true, dta: true, cascade: true, rollup: true, capacity: true, backlog: true };
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
  /* ponytail: pauseTags — свободный ввод через запятую (у тегов нет бандла, в отличие
     от состояний). Апгрейд до picker'а тегов — когда появится loadTags-источник. */
  const [pauseTagsRaw, setPauseTagsRaw] = React.useState(() => (v.pauseTags || []).join(', '));

  React.useEffect(() => {
    let alive = true;
    if (props.fieldTypeName && props.loadFieldValues) {
      Promise.resolve(props.loadFieldValues(props.fieldTypeName))
        .then((vals) => { if (alive && Array.isArray(vals)) setTypeBundle(vals); }).catch(noop);
    } else { setTypeBundle([]); }
    return () => { alive = false; };
  }, [props.fieldTypeName]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <table className="ssp-dta-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th scope="col" style={{ width: '38%' }}>{t('lblBacklogZoneState')}</th>
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
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                        {roleData.map((r) => {
                          const on = (z.roles || []).indexOf(r.key) >= 0;
                          return (
                            <label key={r.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={on} onChange={() => toggleZoneRole(i, r.key)} />
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
          <TextField value={pauseTagsRaw} maxLength={500} placeholder={t('phBacklogPauseTags')} onChange={(s) => { setPauseTagsRaw(s); patch({ pauseTags: s.split(',').map((x) => x.trim()).filter(Boolean) }); }} />
        </div>
      </div>
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
  const [hideDiagLogUi, setHideDiagLogUi] = React.useState(!!initial.hideDiagLogUi);
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

  const blocked = hasEstDup || hasFactDup || hasDtaDup || hasBacklogDup;

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
    data.hideDiagLogUi = hideDiagLogUi;

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

    /* #45 L2 — Full-модель ёмкости на main НЕ вводится (заглушка): capacityMode/
       hoursPerDay/usefulHoursPerDay СОХРАНЯЕМ из stored (initial), чтобы не затереть
       значение, выставленное под epic-сборкой; UI ввода Full на main отсутствует.
       Все три — admin-тир (см. backend ADMIN_TIER_SETTINGS_KEYS). */
    if (initial.capacityMode != null) data.capacityMode = initial.capacityMode;
    if (initial.hoursPerDay != null) data.hoursPerDay = initial.hoursPerDay;
    if (initial.usefulHoursPerDay != null) data.usefulHoursPerDay = initial.usefulHoursPerDay;

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
          fieldTypeName={fields.fieldType} loadFieldValues={props.loadFieldValues}
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
              тройку тогглов (PLANNING_MODEL_DROPDOWN_SPEC). Full — disabled (заглушка).
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
                { key: 'full', label: t('optModelFull'), disabled: true },
              ]}
              value={modes.planningModel}
              onChange={(v) => setMode('planningModel', v)}
            />
            <div className="field-hint" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
              {t(modes.planningModel === 'light' ? 'descModelLight' : 'descModelSimple')}
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
            <RoleCheck on={hideDiagLogUi} label={t('lblHideDiagLogUi')} hint={t('hintHideDiagLogUi')} onToggle={() => setHideDiagLogUi((v) => !v)} />
          </div>
        </React.Fragment>
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
