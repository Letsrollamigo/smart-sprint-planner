/* #45 R3 — React-презентация вкладки «Управление ёмкостью» (де-гибридизация #32:
   настоящий Ring React, как gantt-view/standup-view). Логика (load/persist/carry-forward/
   csv/ростер/авторитетный расчёт) остаётся в domain/capacity-view.js — он строит view-model
   и зовёт мост mountAt(host, vm). Компонент «тупой»: рендерит готовый vm, держит ЛОКАЛЬНЫЙ
   стейт правок (grade/rate/participation/alloc, выбор дней календаря), live-пересчёт через
   vm.compute (домен дал замыкание над __SSP_CAPACITY_PURE), сохранение — через коллбэки vm.
   Ноль обращений к стейту монолита.

   Ring из vendored-сабсета: Select (дроп-дауны спринта/грейда/типа отсутствия), Collapse
   (спойлеры ролей). Числовые поля — нативный <input type=number> на React-стейте (паттерн
   NumField settings-form). Грид календаря — bespoke (Ring не даёт календаря-выбора по дням;
   шаблон pickPicker, нативные кнопки-ячейки). Статус-бейдж — <span> (Ring Tag вне vendor).

   IIFE-мост: window.__SSP_CAPACITY_MOUNT.mountAt(host, vm) / .unmountAt(host). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();

function _num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

/* Ring Select-обёртка (паттерн RingSelLite settings-form): data=[{key,label}], значение по key. */
function RingSelect({ value, options, onChange, disabled, size }) {
  const Select = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Select;
  const data = (options || []).map((o) => ({ key: String(o.key), label: o.label }));
  const selected = data.find((o) => o.key === String(value)) || null;
  if (!Select) {
    /* без vendored Ring — нативный fallback (тест-среда), не «костыль» для прода */
    return (
      <select className="app-select ring-select-button" value={value} disabled={disabled}
              onChange={(e) => onChange(e.target.value)}>
        {data.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <Select data={data} selected={selected} size={size || 'M'} disabled={disabled}
            label={selected ? undefined : '—'}
            onSelect={(item) => onChange(item ? String(item.key) : '')} />
  );
}

/* Нативный числовой инпут на React-стейте (паттерн NumField settings-form). */
function NumCell({ value, onChange, disabled }) {
  return (
    <input type="number" step="0.05" min="0" className="app-input ssp-capacity-num"
           value={value == null ? '' : value} disabled={disabled}
           onChange={(e) => onChange(e.target.value)} />
  );
}

/* Спойлер роли на Ring Collapse (vendored). */
function RoleSpoiler({ title, capLabel, open, onToggle, children }) {
  const Collapse = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Collapse;
  const CollapseControl = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.CollapseControl;
  const CollapseContent = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.CollapseContent;
  const head = (
    <span className="ssp-capacity-spoiler__head">
      <span className="ssp-capacity-spoiler__titlewrap">
        <span className="ssp-capacity-spoiler__chev">{open ? '▼' : '▶'}</span>
        <span className="ssp-capacity-spoiler__title">{title}</span>
      </span>
      <span className="ssp-capacity-rolecap">{capLabel}</span>
    </span>
  );
  if (!Collapse || !CollapseControl || !CollapseContent) {
    return (
      <details className="ssp-capacity-spoiler" open={open}>
        <summary onClick={(e) => { e.preventDefault(); onToggle(); }}>{head}</summary>
        {open ? children : null}
      </details>
    );
  }
  return (
    <div className="ssp-capacity-spoiler">
      <Collapse collapsed={!open} onChange={onToggle}>
        <CollapseControl>{head}</CollapseControl>
        <CollapseContent>{children}</CollapseContent>
      </Collapse>
    </div>
  );
}

/* Строка человека в спойлере роли. */
function PersonRow({ vm, role, person, model, computed, readOnly, onEdit, onSelectPerson }) {
  const L = vm.labels;
  const login = person.login;
  const pm = model[login] || {};
  const base = computed.bases[login];
  const alloc = (pm.alloc && _num(pm.alloc[role.key], 0)) || 0;
  const sigma = _num(computed.sigma[login], 0);
  const over = sigma > 1 + vm.EPS;
  return (
    <div className="ssp-capacity-row" data-login={login}>
      <span className="ssp-capacity-cell ssp-capacity-cell--name" title={login}
            onClick={() => onSelectPerson(login)}>{person.name || login}</span>
      <RingSelect value={pm.grade || 'Middle'} disabled={readOnly} size="S"
                  options={vm.grades.map((g) => ({ key: g, label: g }))}
                  onChange={(v) => onEdit(login, 'grade', v)} />
      <NumCell value={_num(pm.rate, 1)} disabled={readOnly}
               onChange={(v) => onEdit(login, 'rate', v)} />
      <NumCell value={_num(pm.participation, 1)} disabled={readOnly}
               onChange={(v) => onEdit(login, 'participation', v)} />
      <NumCell value={alloc} disabled={readOnly}
               onChange={(v) => onEdit(login, 'alloc', v, role.key)} />
      <span className="ssp-capacity-cell ssp-capacity-cell--base">{base != null ? vm.fmtH(base) : '—'}</span>
      <span className="ssp-capacity-cell ssp-capacity-cell--contrib">{base != null ? vm.fmtH(base * alloc) : '—'}</span>
      <span className={'ssp-capacity-badge ssp-capacity-badge--sigma' + (over ? ' ssp-capacity-badge--overlimit' : '')}>
        {'Σ ' + Math.round(sigma * 100) + '%'}
      </span>
    </div>
  );
}

/* #52 (G3) — строка роли внутри спойлера человека (вид «по людям»). Те же ячейки, что
   PersonRow: первая колонка = роль; grade/rate/participation — per-person (правка в любой
   строке правит модель человека целиком), alloc — per-role. */
function PersonRoleRow({ vm, role, login, model, computed, readOnly, onEdit }) {
  const pm = model[login] || {};
  const base = computed.bases[login];
  const alloc = (pm.alloc && _num(pm.alloc[role.key], 0)) || 0;
  const sigma = _num(computed.sigma[login], 0);
  const over = sigma > 1 + vm.EPS;
  return (
    <div className="ssp-capacity-row" data-login={login}>
      <span className="ssp-capacity-cell ssp-capacity-cell--name">{role.label}</span>
      <RingSelect value={pm.grade || 'Middle'} disabled={readOnly} size="S"
                  options={vm.grades.map((g) => ({ key: g, label: g }))}
                  onChange={(v) => onEdit(login, 'grade', v)} />
      <NumCell value={_num(pm.rate, 1)} disabled={readOnly}
               onChange={(v) => onEdit(login, 'rate', v)} />
      <NumCell value={_num(pm.participation, 1)} disabled={readOnly}
               onChange={(v) => onEdit(login, 'participation', v)} />
      <NumCell value={alloc} disabled={readOnly}
               onChange={(v) => onEdit(login, 'alloc', v, role.key)} />
      <span className="ssp-capacity-cell ssp-capacity-cell--base">{base != null ? vm.fmtH(base) : '—'}</span>
      <span className="ssp-capacity-cell ssp-capacity-cell--contrib">{base != null ? vm.fmtH(base * alloc) : '—'}</span>
      <span className={'ssp-capacity-badge ssp-capacity-badge--sigma' + (over ? ' ssp-capacity-badge--overlimit' : '')}>
        {'Σ ' + Math.round(sigma * 100) + '%'}
      </span>
    </div>
  );
}

/* Грид календаря (bespoke): дни спринта 7×N. Режим person — клик по дню toggle'ит
   отсутствие выбранного (цвет границы + аббревиатура типа). Режим role (сводно) —
   read-only: счётчик отсутствующих + цветные точки типов, клик открывает панель деталей. */
function CalendarGrid({ vm, absDayType, absLabel, absAbbrev, roleMode, combined, editable, onToggleDay, onDayDetails, detailDay }) {
  const L = vm.labels;
  const dows = vm.dows || [];
  const days = vm.calendarDays || [];
  const cells = [];
  dows.forEach((d, i) => cells.push(<div key={'dow' + i} className="ssp-capacity-grid__dow">{d}</div>));
  if (days.length) {
    const firstDow = (days[0].weekday + 6) % 7; // weekday: 0=Вс..6=Сб → колонка 0=Пн
    for (let p = 0; p < firstDow; p++) cells.push(<div key={'pad' + p} className="ssp-capacity-grid__pad" />);
  }
  days.forEach((day) => {
    let cls = 'ssp-capacity-day ssp-capacity-day--' + day.type;
    let title = day.iso + ' · ' + (L.dayType[day.type] || '');
    if (roleMode) {
      const list = (combined && combined[day.iso]) || [];
      if (list.length) {
        cls += ' ssp-capacity-day--hasabs';
        if (detailDay === day.iso) cls += ' ssp-capacity-day--detailopen';
        const types = []; list.forEach((e) => { if (types.indexOf(e.type) < 0) types.push(e.type); });
        title += '\n' + L.absentLabel + '\n' + list.map((e) => (e.name + ' — ' + (absLabel[e.type] || e.type))).join('\n');
        cells.push(
          <button key={day.iso} type="button" className={cls} title={title}
                  onClick={() => onDayDetails(day.iso)}>
            <span className="ssp-capacity-day__col">
              <span className="ssp-capacity-day__dom">{day.dom}</span>
              <span className="ssp-capacity-day__agg">
                {types.slice(0, 3).map((t) => <span key={t} className={'ssp-capacity-dot ssp-capacity-dot--' + t} />)}
                <span className="ssp-capacity-day__count">{list.length}</span>
              </span>
            </span>
          </button>
        );
      } else {
        cells.push(
          <button key={day.iso} type="button" className={cls} title={title} disabled>
            <span className="ssp-capacity-day__col"><span className="ssp-capacity-day__dom">{day.dom}</span></span>
          </button>
        );
      }
    } else {
      const abs = absDayType[day.iso];
      if (abs) { cls += ' ssp-capacity-day--absent ssp-capacity-day--abs-' + abs; title += ' · ' + (absLabel[abs] || ''); }
      cells.push(
        <button key={day.iso} type="button" className={cls} title={title}
                disabled={!editable} onClick={editable ? () => onToggleDay(day.iso) : undefined}>
          <span className="ssp-capacity-day__col">
            <span className="ssp-capacity-day__dom">{day.dom}</span>
            {abs ? <span className="ssp-capacity-day__abbr">{absAbbrev[abs] || ''}</span> : null}
          </span>
        </button>
      );
    }
  });
  return <div className="ssp-capacity-grid">{cells}</div>;
}

/* Внутренний компонент: ЛОКАЛЬНЫЙ стейт правок; пере-инициализируется при смене спринта/
   версии VM через key (см. CapacityPanel). */
function CapacityInner({ vm }) {
  const L = vm.labels;
  const [model, setModel] = React.useState(() => JSON.parse(JSON.stringify(vm.persons || {})));
  const [absByLogin, setAbsByLogin] = React.useState(() => JSON.parse(JSON.stringify(vm.absencesByLogin || {})));
  const [openRoles, setOpenRoles] = React.useState(() => {
    const o = {}; (vm.roles || []).forEach((r) => { o[r.key] = true; }); return o;
  });
  /* #52 — вид «по людям»: спойлеры людей раскрыты по умолчанию, как ролевые. */
  const [openPersons, setOpenPersons] = React.useState(() => {
    const o = {}; (vm.personsView || []).forEach((p) => { o[p.login] = true; }); return o;
  });
  const [absType, setAbsType] = React.useState(() => (vm.absenceTypes && vm.absenceTypes[0] && vm.absenceTypes[0].key) || 'vacation');
  const [detailDay, setDetailDay] = React.useState(null);

  /* type→label / type→2-3-символьная аббревиатура (из локализованной подписи — без отдельных i18n-ключей). */
  const absLabel = {}; const absAbbrev = {};
  (vm.absenceTypes || []).forEach((a) => { absLabel[a.key] = a.label; absAbbrev[a.key] = (a.label || '').slice(0, 3); });

  const viewMode = vm.viewMode || 'person';
  const roleObj = (vm.roles || []).find((r) => r.key === vm.selectedRole) || null;
  const rolePeople = roleObj ? roleObj.people : [];

  const readOnly = !!vm.readOnly;
  const computed = readOnly
    ? { bases: frozenBases(vm), roleCapacities: (vm.computed && vm.computed.roleCapacities) || {}, sigma: (vm.computed && vm.computed.sigma) || {} }
    : vm.compute(model, absByLogin);

  function onEdit(login, field, value, roleKey) {
    setModel((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const p = next[login] || (next[login] = { grade: 'Middle', rate: 1, participation: 1, alloc: {} });
      if (field === 'grade') p.grade = value;
      else if (field === 'alloc') { if (!p.alloc) p.alloc = {}; p.alloc[roleKey] = _num(parseFloat(value), 0); }
      else p[field] = _num(parseFloat(value), 1);
      return next;
    });
  }
  function onToggleDay(iso) {
    const login = vm.selectedPerson; if (!login) return;
    setAbsByLogin((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const dayType = vm.expandAbs(next[login] || []);
      if (dayType[iso]) delete dayType[iso]; else dayType[iso] = absType;
      next[login] = vm.collapseAbs(dayType);
      return next;
    });
  }

  const anyOver = Object.keys(computed.sigma || {}).some((l) => _num(computed.sigma[l], 0) > 1 + vm.EPS);

  /* шапка */
  const badge = (() => {
    if (vm.status === 'approved') return <span className="ssp-capacity-badge ssp-capacity-badge--ok">{L.statusApproved}</span>;
    if (vm.status === 'dirty') return <span className="ssp-capacity-badge ssp-capacity-badge--warn">{L.statusDirty}</span>;
    if (vm.status === 'draft') return <span className="ssp-capacity-badge ssp-capacity-badge--draft">{L.statusDraft}</span>;
    return <span className="ssp-capacity-badge ssp-capacity-badge--draft">{L.notApproved}</span>;
  })();

  const selLogin = vm.selectedPerson;
  const absDayType = selLogin ? vm.expandAbs(absByLogin[selLogin] || []) : {};

  /* Сводный режим: iso → [{login,name,type}] по всем людям выбранной роли. */
  const combined = {};
  if (viewMode === 'role' && roleObj) {
    roleObj.people.forEach((p) => {
      const dt = vm.expandAbs(absByLogin[p.login] || []);
      Object.keys(dt).forEach((iso) => { (combined[iso] || (combined[iso] = [])).push({ login: p.login, name: p.name || p.login, type: dt[iso] }); });
    });
  }

  const personName = (() => { const p = rolePeople.find((x) => x.login === selLogin); return p ? (p.name || p.login) : selLogin; })();
  const ctxLine = viewMode === 'role'
    ? (roleObj ? (L.calFor + ' ' + roleObj.label) : L.pickPerson)
    : (selLogin ? (L.calFor + ' ' + personName) : L.pickPerson);

  return (
    <div className="ssp-capacity-root">
      <div className="ssp-capacity-head">
        <label className="ssp-capacity-sprintsel">
          {L.sprintLabel + ' '}
          <span className="ssp-capacity-headsel">
            <RingSelect value={vm.selectedSprintId} onChange={(v) => vm.onSprintChange(v)}
                        options={(vm.sprints || []).map((s) => ({ key: s.id, label: s.name + (s.isActive ? ' • ' + L.activeSuffix : '') }))} />
          </span>
        </label>
        <span className="ssp-capacity-period">{L.periodLabel + ': ' + vm.dateStartLabel + ' — ' + vm.dateEndLabel}</span>
        {badge}
        {vm.readOnly
          ? <span className="ssp-capacity-readonly">{L.readOnlyHint}</span>
          : <button type="button" className="ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText"
                    disabled={anyOver} title={anyOver ? L.sumOver : ''}
                    onClick={() => (vm.isReapprove ? vm.onReapprove(model) : vm.onApprove(model))}>
              {vm.isReapprove ? L.reapprove : L.approve}
            </button>}
        {!vm.readOnly
          ? <button type="button" className="ring-button-button ring-button-block ring-button-heightM"
                    onClick={() => vm.onSave(model)}>{L.save}</button>
          : null}
      </div>

      <div className="ssp-capacity-body">
        <div className="ssp-capacity-col ssp-capacity-left">
          <h3 className="ssp-capacity-colhead">{vm.mainView === 'persons' ? L.personsHeader : L.roleHeader}</h3>
          {/* #52 — переключатель группировки левой колонки (Ring-кнопки, паттерн viewtoggle) */}
          <div className="ssp-capacity-viewtoggle ssp-capacity-mainviewtoggle" role="group">
            <button type="button"
                    className={'ring-button-button ring-button-block ring-button-heightS' + (vm.mainView !== 'persons' ? ' ring-button-primaryBlock ring-button-flat ring-button-whiteText' : '')}
                    onClick={() => vm.onMainViewChange('roles')}>{L.viewByRoles}</button>
            <button type="button"
                    className={'ring-button-button ring-button-block ring-button-heightS' + (vm.mainView === 'persons' ? ' ring-button-primaryBlock ring-button-flat ring-button-whiteText' : '')}
                    onClick={() => vm.onMainViewChange('persons')}>{L.viewByPersons}</button>
          </div>
          {vm.mainView === 'persons'
            ? ((vm.personsView || []).length === 0
              ? <div className="empty">{L.noPeople}</div>
              : vm.personsView.map((p) => {
                const base = computed.bases[p.login];
                const sigma = _num(computed.sigma[p.login], 0);
                return (
                  <RoleSpoiler key={p.login} title={p.name}
                               capLabel={(base != null ? vm.fmtH(base) : '—') + ' · Σ ' + Math.round(sigma * 100) + '%'}
                               open={!!openPersons[p.login]} onToggle={() => setOpenPersons((o) => Object.assign({}, o, { [p.login]: !o[p.login] }))}>
                    <div className="ssp-capacity-rows">
                      <div className="ssp-capacity-row ssp-capacity-row--head">
                        {[L.thRole, L.thGrade, L.thRate, L.thPart, L.thAlloc, L.thBase, L.thContrib, L.thSumAlloc].map((t, i) =>
                          <span key={i} className="ssp-capacity-cell ssp-capacity-cell--th">{t}</span>)}
                      </div>
                      {p.roles.map((role) => (
                        <PersonRoleRow key={role.key} vm={vm} role={role} login={p.login}
                                       model={model} computed={computed} readOnly={readOnly} onEdit={onEdit} />
                      ))}
                    </div>
                  </RoleSpoiler>
                );
              }))
            : ((vm.roles || []).length === 0
              ? <div className="empty">{L.noRoles}</div>
              : vm.roles.map((role) => (
                <RoleSpoiler key={role.key} title={role.label}
                             capLabel={computed.roleCapacities[role.key] != null ? vm.fmtH(computed.roleCapacities[role.key]) : '—'}
                             open={!!openRoles[role.key]} onToggle={() => setOpenRoles((o) => Object.assign({}, o, { [role.key]: !o[role.key] }))}>
                  {role.people.length === 0
                    ? <div className="empty ssp-capacity-rowsempty">{L.noPeople}</div>
                    : (
                      <div className="ssp-capacity-rows">
                        <div className="ssp-capacity-row ssp-capacity-row--head">
                          {[L.thName, L.thGrade, L.thRate, L.thPart, L.thAlloc, L.thBase, L.thContrib, L.thSumAlloc].map((t, i) =>
                            <span key={i} className="ssp-capacity-cell ssp-capacity-cell--th">{t}</span>)}
                        </div>
                        {role.people.map((person) => (
                          <PersonRow key={person.login} vm={vm} role={role} person={person}
                                     model={model} computed={computed} readOnly={readOnly}
                                     onEdit={onEdit} onSelectPerson={(login) => vm.onPersonSelect(login, role.key)} />
                        ))}
                      </div>
                    )}
                </RoleSpoiler>
              )))}
        </div>

        <div className="ssp-capacity-col ssp-capacity-right">
          <h3 className="ssp-capacity-colhead">{L.calHeader}</h3>
          {vm.canUploadCsv
            ? <div className="ssp-capacity-calbar">
                <button type="button" className="ring-button-button ring-button-block ring-button-heightS"
                        onClick={() => vm.onDownloadTemplate()}>{L.dlTemplate}</button>
                <label className="ring-button-button ring-button-block ring-button-heightS ssp-capacity-uplabel">
                  {L.upCsv}
                  <input type="file" accept=".csv" style={{ display: 'none' }}
                         onChange={(e) => { if (e.target.files && e.target.files[0]) vm.onUploadCsv(e.target.files[0]); }} />
                </label>
                {vm.canUploadCsvGlobal
                  ? <label className="ring-button-button ring-button-block ring-button-heightS ssp-capacity-uplabel">
                      {L.upCsvGlobal}
                      <input type="file" accept=".csv" style={{ display: 'none' }}
                             onChange={(e) => { if (e.target.files && e.target.files[0]) vm.onUploadCsvGlobal(e.target.files[0]); }} />
                    </label>
                  : null}
              </div>
            : null}
          {/* выбор «для кого»: режим (сотрудник / по роли) + каскад роль→сотрудник */}
          <div className="ssp-capacity-calpick">
            <div className="ssp-capacity-viewtoggle" role="group">
              <button type="button"
                      className={'ring-button-button ring-button-block ring-button-heightS' + (viewMode === 'person' ? ' ring-button-primaryBlock ring-button-flat ring-button-whiteText' : '')}
                      onClick={() => vm.onViewModeChange('person')}>{L.personPickLabel}</button>
              <button type="button"
                      className={'ring-button-button ring-button-block ring-button-heightS' + (viewMode === 'role' ? ' ring-button-primaryBlock ring-button-flat ring-button-whiteText' : '')}
                      onClick={() => vm.onViewModeChange('role')}>{L.viewModeRole}</button>
            </div>
            <label className="ssp-capacity-abstype">{L.rolePickLabel + ' '}
              <span className="ssp-capacity-headsel">
                <RingSelect value={vm.selectedRole || ''} size="S"
                            options={(vm.roles || []).map((r) => ({ key: r.key, label: r.label }))}
                            onChange={(v) => vm.onRoleSelect(v)} />
              </span>
            </label>
            {viewMode === 'person'
              ? <label className="ssp-capacity-abstype">{L.personPickLabel + ' '}
                  <span className="ssp-capacity-headsel">
                    <RingSelect value={selLogin || ''} size="S" label={selLogin ? undefined : L.pickPerson}
                                options={rolePeople.map((p) => ({ key: p.login, label: p.name || p.login }))}
                                onChange={(v) => vm.onPersonSelect(v, vm.selectedRole)} />
                  </span>
                </label>
              : null}
          </div>

          <div className="ssp-capacity-calctx">{ctxLine}</div>
          {viewMode === 'person' && selLogin && !readOnly
            ? <label className="ssp-capacity-abstype">{L.absType + ' '}
                <span className="ssp-capacity-headsel">
                  <RingSelect value={absType} onChange={setAbsType} size="S"
                              options={(vm.absenceTypes || []).map((a) => ({ key: a.key, label: a.label }))} />
                </span>
              </label>
            : null}
          <CalendarGrid vm={vm} absDayType={absDayType} absLabel={absLabel} absAbbrev={absAbbrev}
                        roleMode={viewMode === 'role'} combined={combined}
                        editable={!!(viewMode === 'person' && selLogin && !readOnly)} onToggleDay={onToggleDay}
                        onDayDetails={(iso) => setDetailDay((d) => (d === iso ? null : iso))} detailDay={detailDay} />

          {viewMode === 'role' && detailDay && combined[detailDay]
            ? <div className="ssp-capacity-details">
                <div className="ssp-capacity-details__head">
                  <span>{detailDay} · {L.absentLabel} ({combined[detailDay].length})</span>
                  <button type="button" className="ssp-capacity-details__close" title="×" onClick={() => setDetailDay(null)}>×</button>
                </div>
                <ul className="ssp-capacity-details__list">
                  {combined[detailDay].map((e, i) => (
                    <li key={i}><span className={'ssp-capacity-dot ssp-capacity-dot--' + e.type} />{' ' + e.name + ' — ' + (absLabel[e.type] || e.type)}</li>
                  ))}
                </ul>
              </div>
            : null}

          <div className="ssp-capacity-legend">
            {['workday', 'short', 'holiday', 'weekend'].map((t) =>
              <span key={t} className={'ssp-capacity-legend__item ssp-capacity-day--' + t}>{L.dayType[t]}</span>)}
          </div>
          <div className="ssp-capacity-legend ssp-capacity-legend--abs">
            {(vm.absenceTypes || []).map((a) =>
              <span key={a.key} className={'ssp-capacity-legend__item ssp-capacity-legend__abs ssp-capacity-legend__abs--' + a.key}>{a.label}</span>)}
          </div>
          {(vm.uncoveredYears || []).length
            ? <div className="banner banner--warn ssp-capacity-calwarn">{L.yearFallback.replace('{years}', vm.uncoveredYears.join(', '))}</div>
            : null}
          {viewMode === 'person' && selLogin && !readOnly
            ? <button type="button" className="ring-button-button ring-button-block ring-button-heightS ssp-capacity-saveabs"
                      onClick={() => vm.onSaveAbsences(absByLogin)}>{L.saveAbs}</button>
            : null}
        </div>
      </div>
    </div>
  );
}

function frozenBases(vm) {
  const out = {};
  const p = vm.persons || {};
  Object.keys(p).forEach((l) => { out[l] = _num(p[l].base, 0); });
  return out;
}

/* Внешний компонент, привязанный к host: ре-рендер на бамп data-vm-key; внутренний
   инстанс пере-монтируется по key при смене спринта/версии VM (сброс локальных правок). */
function CapacityPanel({ host }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, { attributes: true, attributeFilter: ['data-vm-key'] });
    return () => obs.disconnect();
  }, [host]);
  const vm = host.__sspCapacityVm;
  if (!vm) return null;
  if (vm.lightHint) return <div className="empty">{vm.lightHint}</div>;
  return <CapacityInner key={String(vm.selectedSprintId) + ':' + String(vm.versionTag)} vm={vm} />;
}

window.__SSP_CAPACITY_MOUNT = {
  mountAt(host, vm) {
    if (!host) return;
    host.__sspCapacityVm = vm || null;
    if (_mounted.has(host)) {
      host.dataset.vmKey = String((parseInt(host.dataset.vmKey || '0', 10) || 0) + 1);
      return;
    }
    const root = ReactDOMClient.createRoot(host);
    root.render(<CapacityPanel host={host} />);
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* noop */ }
    _mounted.delete(host);
    try { delete host.__sspCapacityVm; } catch (_) { /* noop */ }
  },
};
