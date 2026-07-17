/* settings-shared.jsx — общие листовые контролы и хелперы формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx при декомпозиции 7 Section'ов
   по файлам. Контракты компонентов не менялись — чистый перенос. I18nCtx — ЕДИНЫЙ
   инстанс контекста формы (провайдер в SettingsForm, консюмеры в листовых контролах). */

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
export { ADMIN_SECTION_IDS, noop, genZoneUid, I18nCtx, _filterCfg, _btnCls, FieldSelect, NumField, RoleCheck, GrpIcon, LockIcon, GrpMultiSelect, strOrNull, capValues, MultiSelect, RingSelLite, RollupOrderList, TextField };
