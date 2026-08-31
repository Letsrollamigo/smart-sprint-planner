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
   (если сохранённое значение отсутствует в списке) элемент с маркером «(!)», как fillFieldSelect.
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
        {missing ? <option value={value}>{value + ' (!)'}</option> : null}
      </select>
    );
  }
  const data = list.map((n) => ({ key: n, label: n }));
  if (missing) data.push({ key: value, label: value + ' (!)' });
  const selected = data.find((d) => d.key === value) || null;
  return (
    <Select
      className="ssp-form-select" size="FULL"
      data={data} selected={selected}
      clear filter={_filterCfg(tCtx, data, 10)}
      label={placeholder || undefined}
      /* #101 — onChange, а не onSelect: крестик «очистить» у Ring Select зовёт ТОЛЬКО
         onChange(null); на onSelect очистка не доходила до формы и молча не сохранялась.
         Для одиночного селекта onChange — надмножество onSelect (Ring зовёт их парой). */
      onChange={(item) => onChange(item ? String(item.key) : '')}
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
function RoleCheck({ on, disabled, label, onToggle, tooltip, hint, ariaLabel }) {
  const Checkbox = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Checkbox;
  /* #43 W4 (B-5) — tooltip был только hover-title (недоступен SR/клавиатуре):
     дублируем его скрытым описанием через aria-describedby.
     #71 — ariaLabel: ячейка матрицы прав держит чекбокс БЕЗ видимой подписи
     (подпись — заголовок колонки), имя даём читалке явно. */
  const tipId = React.useId();
  const aria = tooltip ? { 'aria-describedby': tipId } : {};
  if (ariaLabel) aria['aria-label'] = ariaLabel;
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

/* v3.24.0 (#69 строка 18) — инлайн Ring-иконка из __SSP_ICONS вместо эмодзи в React-рендерах
   (хинты настроек, стендап, бэклог, предпросмотр релиза). cls — модификаторы (.ssp-icon--inline). */
function RingIcon({ name, cls }) {
  const svg = ((typeof window !== 'undefined' && window.__SSP_ICONS) || {})[name] || '';
  return <span className={'ssp-icon ssp-icon--inline' + (cls ? ' ' + cls : '')} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/* Гейт модуля отчётности. В этой редакции модуль рабочий → строго `false`.
   Единственный потребитель — колонки «Контур A»/«Контур B» матрицы прав
   (settings-permissions.jsx): при `true` они приходят disabled, и выдать группам
   доступ к отчётам через интерфейс становится нечем — отчёты остаются видны
   только менеджеру настроек. Значение пинится tests/unit/fork-constants.test.js:
   в v3.28.0 оно уже переворачивалось молча (#77), и три релиза ушли с
   недоступной пользователям отчётностью. */
const REPORTING_DISABLED = false;

/* #22 — секции admin-тира (workflow-правила + доступ/права). Видны/редактируемы
   только при canEditWorkflow (settings-менеджер). Остальные секции — планировочный тир. */
const ADMIN_SECTION_IDS = { groups: true, dta: true, cascade: true, links: true, displayFields: true, rollup: true, capacity: true, backlog: true, release: true, reporting: true };
const LOCK_ICON_PATH = 'M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z';
function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '4px', opacity: 0.7 }}>
      <path d={LOCK_ICON_PATH} />
    </svg>
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
      /* #101 — onChange вместо onSelect: см. комментарий в FieldSelect. */
      onChange={(item) => onChange(item ? String(item.key) : '')}
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

/* 68-7 — общая таблица «состояние → роль(и)» (вынесена 1:1 из BacklogSection;
   потребители: зоны пайплайна бэклога #21 и маппинг стендапа 68-7). rows =
   [{_uid,state,roles[]}], onChange(rows). labels — уже-резолвнутые t()-строки
   {state, roles, empty, add, remove, up, down, noRoles}; orderable=false прячет
   ↑↓ (порядок секций стендапа диктует бандл, не маппинг). Подсветка дублей
   state — внутри; сводная ошибка дублей — за вызывающим (как было). */
function StateRolesTable(props) {
  const t = props.t;
  const rows = props.rows || [];
  const set = props.onChange || noop;
  const bundleStates = props.bundleStates || [];
  const roleOpts = props.roleOpts || [];
  const orderable = props.orderable !== false;
  const L = props.labels || {};

  const setRow = (i, p) => set(rows.map((z, idx) => (idx === i ? Object.assign({}, z, p) : z)));
  const addRow = () => set(rows.concat([{ _uid: genZoneUid(), state: '', roles: [] }]));
  const delRow = (i) => { const z = rows.slice(); z.splice(i, 1); set(z); };
  function moveRow(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const z = rows.slice(); const tmp = z[i]; z[i] = z[j]; z[j] = tmp;
    set(z);
  }
  function toggleRole(i, rk) {
    const cur = (rows[i] && rows[i].roles) || [];
    const next = cur.indexOf(rk) >= 0 ? cur.filter((k) => k !== rk) : cur.concat([rk]);
    setRow(i, { roles: next });
  }

  const stCounts = {};
  rows.forEach((z) => { const s = (z.state || '').trim(); if (s) stCounts[s] = (stCounts[s] || 0) + 1; });
  const stateOpts = bundleStates.map((s) => ({ key: s, label: s }));
  const roleData = roleOpts.map((r) => ({ key: r.key, label: t('role.' + r.key) }));
  const moveBtnCls = 'ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly';

  return (
    <React.Fragment>
      <table className="ssp-dta-table ssp-backlog-zones" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th scope="col" style={{ width: '30%' }}>{L.state}</th>
            <th scope="col">{L.roles}</th>
            <th scope="col" style={{ width: orderable ? '92px' : '48px' }} aria-label={L.remove}></th>
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr><td colSpan={3} className="empty" style={{ padding: '8px', textAlign: 'center', color: 'var(--muted)' }}>{L.empty}</td></tr>
          ) : rows.map((z, i) => {
            const st = (z.state || '').trim();
            const dup = st && stCounts[st] > 1;
            return (
              <tr key={z._uid}>
                <td style={dup ? { outline: '1px solid var(--error)' } : undefined}>
                  <RingSelLite options={stateOpts} value={z.state || ''} clearable placeholder={t('phNotSelected')} onChange={(val) => setRow(i, { state: val })} />
                </td>
                <td>
                  {roleData.length ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: '4px 8px', maxWidth: '100%' }}>
                      {roleData.map((r) => {
                        const on = (z.roles || []).indexOf(r.key) >= 0;
                        return (
                          <label key={r.key} style={{ display: 'inline-flex', alignItems: 'flex-start', gap: '4px', fontSize: '11px', lineHeight: '1.25', cursor: 'pointer' }}>
                            <input type="checkbox" checked={on} onChange={() => toggleRole(i, r.key)} style={{ marginTop: '1px', flex: '0 0 auto' }} />
                            <span>{r.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : <span className="hint" style={{ fontSize: '12px', color: 'var(--muted)' }}>{L.noRoles}</span>}
                </td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {orderable ? <button type="button" className={moveBtnCls} title={L.up} disabled={i === 0} onClick={() => moveRow(i, -1)}>↑</button> : null}
                  {orderable ? <button type="button" className={moveBtnCls} title={L.down} disabled={i === rows.length - 1} onClick={() => moveRow(i, 1)}>↓</button> : null}
                  <button type="button" className={moveBtnCls} title={L.remove} onClick={() => delRow(i)}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className={_btnCls('secondary')} style={{ marginTop: '10px' }} onClick={addRow}>{L.add}</button>
    </React.Fragment>
  );
}

export { ADMIN_SECTION_IDS, REPORTING_DISABLED, noop, genZoneUid, I18nCtx, _filterCfg, _btnCls, FieldSelect, NumField, RoleCheck, LockIcon, RingIcon, strOrNull, capValues, MultiSelect, RingSelLite, RollupOrderList, TextField, StateRolesTable };
