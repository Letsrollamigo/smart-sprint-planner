/* reporting-view.jsx — #50 React-презентация вкладок отчётности (строго Ring UI).
   Контур A: общий chrome (QueryAssist + период + пикер вида A7/A1 + «Обновить») над телом
   отчёта. A7 Aging — Ring-таблица (дней в статусе + SVG-полоса + флаг порога). A1 Прогресс —
   Ring-таблица (перешла в статус · дата ↓ · ярлык). Контур B — плейсхолдер.
   Доменная логика (fetch/примитив/период/compute) — domain/reporting-view.js; мост mountAt(host, vm).

   🔴 Правило проекта (CLAUDE_SHARED §3): контролы Ring (Select/кнопки); бейджи/полосы — span/svg
   с инлайн-стилем (в vendored-сабсете нет Tag/Badge — как капасити/релизы). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap();
const PERIOD_KEYS = ['today', 'yesterday', 'last7', 'last30', 'lastMonth', 'lastQuarter', 'currentQuarter', 'ytd', 'calendarYear', 'custom'];

/* Ring Select-обёртка (паттерн RingSelect capacity-view): data=[{key,label}], значение по key. */
function RingSelect({ value, options, onChange, size, label, minWidth }) {
  const Select = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Select;
  const data = (options || []).map((o) => ({ key: String(o.key), label: o.label }));
  const selected = data.find((o) => o.key === String(value)) || null;
  if (!Select) {
    return (
      <select className="app-select ring-select-button" value={value}
              onChange={(e) => onChange(e.target.value)}>
        {data.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <Select data={data} selected={selected} size={size || 'M'} minWidth={minWidth}
            label={selected ? undefined : (label || '—')}
            onSelect={(item) => onChange(item ? String(item.key) : '')} />
  );
}

/* Дата перехода: epoch-ms → локальная дата (display-only). */
function _fmtDate(ms) { return (typeof ms === 'number' && isFinite(ms)) ? new Date(ms).toLocaleDateString() : ''; }

/* v3.9.0 — кликабельный ID задачи (паттерн бэклога: ytBase + '/issue/' + id, новая вкладка).
   nowrap чинит перенос «DEMO-16» на две строки; без ytBase — просто nowrap-текст. */
function IssueLink({ id, ytBase }) {
  if (!ytBase) return <span style={{ whiteSpace: 'nowrap' }}>{id}</span>;
  return <a className="link" style={{ whiteSpace: 'nowrap' }} href={ytBase + '/issue/' + id}
    target="_blank" rel="noopener noreferrer">{id}</a>;
}

/* Минуты → часы, 1 знак (display-only): 90 → «1.5». */
function _fmtHours(minutes) { return (Math.round(((Number(minutes) || 0) / 60) * 10) / 10).toString(); }

/* Inline-SVG полоса aging: ширина ∝ дней (визуальный потолок), цвет по уровню порога. */
function AgingBar({ days, level }) {
  const max = 40;
  const pct = Math.max(2, Math.min(100, (Number(days) || 0) / max * 100));
  const color = level === 'over' ? '#c62828' : level === 'warn' ? '#c98a00' : level === 'ok' ? '#1b7a43' : '#9aa5b1';
  return (
    <svg width="100%" height="10" viewBox="0 0 100 10" preserveAspectRatio="none" style={{ display: 'block', minWidth: '56px' }} aria-hidden="true">
      <rect x="0" y="2" width="100" height="6" rx="3" fill="var(--surface2, #eef0f3)" />
      <rect x="0" y="2" width={pct} height="6" rx="3" fill={color} />
    </svg>
  );
}

function FlagBadge({ level, L }) {
  const map = {
    over: { t: L.flagOver, bg: '#fdecea', c: '#c62828', b: '#f5c6c2' },
    warn: { t: L.flagWarn, bg: '#fff6e5', c: '#8a5a00', b: '#f5d99a' },
    ok: { t: L.flagOk, bg: '#e9f7ef', c: '#1b7a43', b: '#bfe6cd' },
    none: { t: L.flagNone, bg: 'transparent', c: 'var(--muted,#6b7785)', b: 'var(--border,#dfe3e8)' },
  };
  const m = map[level] || map.none;
  return <span style={{ display: 'inline-block', whiteSpace: 'nowrap', padding: '1px 8px', borderRadius: '4px', fontSize: '12px',
    background: m.bg, color: m.c, border: '1px solid ' + m.b }}>{m.t}</span>;
}

/* Ярлык A1 — нейтральный pill (в сабсете нет Tag). nowrap — строки таблиц однострочные (v3.9.0). */
function LabelPill({ text }) {
  if (!text) return null;
  return <span style={{ display: 'inline-block', whiteSpace: 'nowrap', padding: '1px 8px', borderRadius: '4px', fontSize: '12px',
    background: 'var(--surface2,#eef0f3)', color: 'var(--text,#20303c)', border: '1px solid var(--border,#dfe3e8)' }}>{text}</span>;
}

function Banner({ kind, children }) {
  const c = kind === 'warn'
    ? { bg: '#fff6e5', bd: '#f5d99a', fg: '#8a5a00' }
    : { bg: '#fdecea', bd: '#f5c6c2', fg: '#c62828' };
  return <div style={{ margin: '8px 0', padding: '8px 12px', borderRadius: '6px', fontSize: '13px',
    background: c.bg, border: '1px solid ' + c.bd, color: c.fg }}>{children}</div>;
}

const _mutedS = { fontSize: '12px', color: 'var(--muted,#6b7785)' };
const _dateInput = { padding: '4px 8px', border: '1px solid var(--border,#dfe3e8)', borderRadius: '6px' };

/* Общий chrome: строка 1 = QueryAssist + период (для a1); строка 2 = пикер вида + «Обновить».
   Живёт над телом (key=contour стабилен) → ввод query/диапазона переживает смену вида/данных. */
function Chrome({ vm, L }) {
  const [q, setQ] = React.useState(vm.query || '');
  const opts = vm.periodOpts || {};
  const [cf, setCf] = React.useState(opts.from || '');
  const [ct, setCt] = React.useState(opts.to || '');
  const apply = () => { if (typeof vm.onRefresh === 'function') vm.onRefresh(q); };
  const setPreset = (p) => {
    if (typeof vm.onSetPeriod !== 'function') return;
    let o = vm.periodOpts || {};
    if (p === 'calendarYear' && o.year == null) o = { year: (vm.years || [])[0] };  /* сеем показанный год по умолчанию */
    vm.onSetPeriod(p, o);
  };
  const applyRange = (from, to) => { if (from && to && typeof vm.onSetPeriod === 'function') vm.onSetPeriod('custom', { from: from, to: to }); };
  const isWindowed = vm.report === 'a1' || vm.report === 'a2' || vm.report === 'flow' || vm.report === 'a4' || vm.report === 'a5' || vm.report === 'b3' || vm.report === 'b2';  /* оконные (период): A1, A2 TTM, Поток A8/A9, A4 Трудозатраты, A5 План-факт, B3 «1000 мелочей», B2 «Налог на баги» */
  const periodData = PERIOD_KEYS.map((k) => ({ key: k, label: (L.period || {})[k] }));
  return (
    <div style={{ margin: '4px 0 10px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
        {vm.report === 'a10' ? (
          /* #50 S7c — A10: пикер закрытого спринта N (сравнение с N+1), период по спринтам — не date-окно */
          <React.Fragment>
            <span style={_mutedS}>{L.a10PickSprint}</span>
            {(vm.sprints || []).length ? (
              <RingSelect value={vm.spillSprint} options={vm.sprints} size="AUTO" minWidth={240}
                onChange={(s) => { if (typeof vm.onSetSprintN === 'function') vm.onSetSprintN(s); }} />
            ) : null}
          </React.Fragment>
        ) : vm.contour === 'b' ? null : (   /* #50 S8a — контур B (B3): свободного фильтра нет, только период+пикер */
          <React.Fragment>
            <span style={_mutedS}>{L.filterLabel}</span>
            {(globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.QueryAssist && typeof vm.onAssist === 'function') ? (
              (() => {
                const QAssist = globalThis.SSP_VENDORED.QueryAssist;   /* вендоренный RingUI QueryAssist (как пул бэклога) */
                return (
                  <div style={{ flex: '1 1 220px', minWidth: '160px' }}>
                    <QAssist huge glass clear placeholder={L.filterPh} query={q}
                      dataSource={vm.onAssist}
                      onChange={(ch) => setQ((ch && ch.query) || '')}
                      onApply={(ch) => { const nq = (ch && ch.query) || ''; setQ(nq); if (typeof vm.onRefresh === 'function') vm.onRefresh(nq); }}
                      onClear={() => { setQ(''); if (typeof vm.onRefresh === 'function') vm.onRefresh(''); }} />
                  </div>
                );
              })()
            ) : (
              <input type="text" value={q} placeholder={L.filterPh}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
                style={{ flex: '1 1 220px', minWidth: '160px', padding: '5px 9px', border: '1px solid var(--border,#dfe3e8)', borderRadius: '6px', boxSizing: 'border-box' }} />
            )}
          </React.Fragment>
        )}
        {isWindowed ? (
          <React.Fragment>
            <span style={_mutedS}>{L.periodLabel}</span>
            <RingSelect value={vm.period} options={periodData} size="S" onChange={setPreset} />
            {vm.period === 'calendarYear' ? (
              <RingSelect value={String((opts.year != null) ? opts.year : (vm.years || [])[0])} size="S"
                options={(vm.years || []).map((y) => ({ key: String(y), label: String(y) }))}
                onChange={(y) => { if (typeof vm.onSetPeriod === 'function') vm.onSetPeriod('calendarYear', { year: parseInt(y, 10) }); }} />
            ) : null}
            {vm.period === 'custom' ? (
              <React.Fragment>
                <span style={_mutedS}>{L.rangeFrom}</span>
                <input type="date" value={cf} aria-label={L.rangeFrom} style={_dateInput}
                  onChange={(e) => { setCf(e.target.value); applyRange(e.target.value, ct); }} />
                <span style={_mutedS}>{L.rangeTo}</span>
                <input type="date" value={ct} aria-label={L.rangeTo} style={_dateInput}
                  onChange={(e) => { setCt(e.target.value); applyRange(cf, e.target.value); }} />
              </React.Fragment>
            ) : null}
          </React.Fragment>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={_mutedS}>{L.pickReport}</span>
        {/* ponytail: minWidth фиксирует ширину попапа под самую длинную опцию (~383px it.repA5Menu) — иначе Ring-попап уже AUTO-кнопки и эллипсит длинные пункты; поднять, если добавится длиннее */}
        <RingSelect value={vm.report} size="AUTO" minWidth={480}
          options={vm.contour === 'b'
            ? [{ key: 'b1', label: L.b1Menu }, { key: 'b2', label: L.b2Menu }, { key: 'b3', label: L.b3Menu }, { key: 'b0', label: L.b0Menu }]   /* #50 S8/B0 — контур B: B1 Техдолг, B2 «Налог на баги», B3 «1000 мелочей», B0 Свод */
            : [{ key: 'a7', label: L.a7Menu }, { key: 'a1', label: L.a1Menu }, { key: 'a3', label: L.a3Menu }, { key: 'a2', label: L.a2Menu }, { key: 'flow', label: L.flowMenu }, { key: 'a4', label: L.a4Menu }, { key: 'a5', label: L.a5Menu }, { key: 'a6', label: L.a6Menu }, { key: 'a10', label: L.a10Menu }, { key: 'a11', label: L.a11Menu }]}
          onChange={(r) => { if (typeof vm.onSwitchReport === 'function') vm.onSwitchReport(r); }} />
        <button type="button" className="ring-button-button ring-button-block ring-button-heightS" onClick={apply}>↻ {L.refresh}</button>
        {/* #50 S9-EXP — экспорт текущего отчёта (снимок точки во времени): Excel + PDF. */}
        <button type="button" className="ring-button-button ring-button-heightS" title={L.exportLabel}
          disabled={!!vm.loading}
          onClick={() => { if (typeof vm.onExport === 'function') vm.onExport('xlsx', vm); }}>⭳ Excel</button>
        <button type="button" className="ring-button-button ring-button-heightS" title={L.exportLabel}
          disabled={!!vm.loading}
          onClick={() => { if (typeof vm.onExport === 'function') vm.onExport('pdf', vm); }}>⭳ PDF</button>
        {/* #50 D10 — «Прервать выполнение отчёта»: видна только при загрузке; останавливает сбор данных + откат. */}
        {vm.loading ? (
          <button type="button" className="ring-button-button ring-button-heightS" style={{ color: '#c62828' }}
            title={L.cancelReportHint}
            onClick={() => { if (typeof vm.onCancel === 'function') vm.onCancel(); }}>⏹ {L.cancelReport}</button>
        ) : null}
      </div>
    </div>
  );
}

function LimitBanners({ vm, L }) {
  return (
    <React.Fragment>
      {vm.limitHit ? <Banner kind="warn">{String(L.limitHit || '').replace('{n}', String(vm.limit))}</Banner> : null}
      {vm.incompleteCount > 0 ? <Banner kind="warn">{String(L.incomplete || '').replace('{n}', String(vm.incompleteCount))}</Banner> : null}
    </React.Fragment>
  );
}

function A7Table({ rows, L, vm }) {
  return (
    <div className="ring-table-tableWrapper" style={{ overflowX: 'auto' }}>
      <table className="ring-table-table">
        <thead className="ring-table-tableHead"><tr>
          <th className="ring-table-headerCell">{L.colId}</th>
          <th className="ring-table-headerCell ring-table-cellUnlimited">{L.colTask}</th>
          <th className="ring-table-headerCell">{L.colStatus}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.colDays}</th>
          <th className="ring-table-headerCell" style={{ minWidth: '120px' }}>{L.colFlag}</th>
          {vm.hasSystem ? <th className="ring-table-headerCell">{L.colSystem}</th> : null}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr className="ring-table-row" key={r.id}>
              <td className="ring-table-cell"><IssueLink id={r.id} ytBase={vm.ytBase} /></td>
              <td className="ring-table-cell">{r.summary}</td>
              <td className="ring-table-cell">{r.state}</td>
              <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>
                <b>{r.days}</b> <span style={{ color: 'var(--muted,#6b7785)', fontSize: '11px' }}>{L.daysUnit}</span>
              </td>
              <td className="ring-table-cell">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: '1 1 auto' }}><AgingBar days={r.days} level={r.level} /></div>
                  <FlagBadge level={r.level} L={L} />
                </div>
              </td>
              {vm.hasSystem ? <td className="ring-table-cell" style={_mutedS}>{r.system || '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function A1Table({ rows, L, vm }) {
  return (
    <div className="ring-table-tableWrapper" style={{ overflowX: 'auto' }}>
      <table className="ring-table-table">
        <thead className="ring-table-tableHead"><tr>
          <th className="ring-table-headerCell">{L.colId}</th>
          <th className="ring-table-headerCell ring-table-cellUnlimited">{L.colTask}</th>
          <th className="ring-table-headerCell">{L.colEnteredStatus}</th>
          <th className="ring-table-headerCell">{L.colEnteredDate} ↓</th>
          <th className="ring-table-headerCell">{L.colLabel}</th>
          {vm.hasSystem ? <th className="ring-table-headerCell">{L.colSystem}</th> : null}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr className="ring-table-row" key={r.id}>
              <td className="ring-table-cell"><IssueLink id={r.id} ytBase={vm.ytBase} /></td>
              <td className="ring-table-cell">{r.summary}</td>
              <td className="ring-table-cell">{r.state}</td>
              <td className="ring-table-cell" style={{ whiteSpace: 'nowrap' }}>{_fmtDate(r.enteredAt)}</td>
              <td className="ring-table-cell"><LabelPill text={r.label} /></td>
              {vm.hasSystem ? <td className="ring-table-cell" style={_mutedS}>{r.system || '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Точка-светофор A2 (тайл/таблица): цвет по уровню норматива (over/warn/ok/none). */
function TrafficDot({ level }) {
  const c = level === 'over' ? '#c62828' : level === 'warn' ? '#c98a00' : level === 'ok' ? '#1b7a43' : '#9aa5b1';
  return <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: c, marginRight: '6px', verticalAlign: 'middle', flex: '0 0 auto' }} aria-hidden="true" />;
}

/* Тайл метрики TTM: медиана (раб. дн) + светофор (FlagBadge) + строка норматива. median=null → «—». */
function StatTile({ metricLabel, median, unit, normLine, level, L }) {
  return (
    <div style={{ flex: '1 1 160px', minWidth: '150px', padding: '12px 14px', border: '1px solid var(--border,#dfe3e8)', borderRadius: '8px', background: 'var(--surface,#fff)', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted,#6b7785)' }}>{metricLabel}</span>
        <FlagBadge level={level} L={L} />
      </div>
      <div style={{ fontSize: '26px', fontWeight: 600, lineHeight: 1.1 }}>
        {median == null ? '—' : median}
        {median == null ? null : <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--muted,#6b7785)', marginLeft: '5px' }}>{unit}</span>}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--muted,#6b7785)', marginTop: '7px' }}>{normLine}</div>
    </div>
  );
}

/* Медианы TTM раздельно по типу единицы (эпик / сольная стори). Светофор — на ячейке Lead. */
function A2TypeTable({ typeRows, leadLevel, L }) {
  const fmt = (v) => (v == null ? '—' : v);
  return (
    <div className="ring-table-tableWrapper" style={{ overflowX: 'auto', marginTop: '4px' }}>
      <table className="ring-table-table">
        <thead className="ring-table-tableHead"><tr>
          <th className="ring-table-headerCell ring-table-cellUnlimited">{L.colUnitType}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.colCount}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.metricLead}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.metricTeam}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.metricCycle}</th>
        </tr></thead>
        <tbody>
          {typeRows.map((r) => (
            <tr className="ring-table-row" key={r.unitType}>
              <td className="ring-table-cell">{r.unitType === 'epic' ? L.unitEpic : L.unitStory}</td>
              <td className="ring-table-cell ring-table-cellRight">{fmt(r.count)}</td>
              <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}><TrafficDot level={leadLevel} />{fmt(r.lead)}</td>
              <td className="ring-table-cell ring-table-cellRight">{fmt(r.team)}</td>
              <td className="ring-table-cell ring-table-cellRight">{fmt(r.cycle)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* #50 S9-VIZ — единый стиль Recharts-графиков модуля (реюз всеми чартами + будущий Гант #20).
   Цвета светофора = как в SVG-вью (см. _lvlColor); оси/грид/тултип на --ring-переменных темы. */
const CHART = {
  green: '#1b7a43', amber: '#c98a00', red: '#c62828', neutral: '#7c93a8',
  axisTick: { fontSize: 11, fill: 'var(--muted,#6b7785)' },
  gridStroke: 'var(--border,#eef1f4)',
  tooltipCursor: { fill: 'rgba(0,0,0,0.04)' },
};

/* R4 (v3.8.0, аудит D5) — ChartFrame: общий шелл Recharts-чарта. RC-гейт (вендор-чанк
   globalThis.SSP_VENDORED.Recharts, gate — ключевой компонент 'BarChart'|'LineChart'),
   сайзинг-контейнер и ResponsiveContainer — единой точкой вместо копии в каждой обвязке.
   children — render-prop (RC)=>чарт (компоненты живут в RC, статически не импортируются);
   fallback — render-prop без RC (SVG-полосы/таблица; ленивый — не собирается при живой либе).
   Оси/грид/тултип/серии и сами фолбэки остаются bespoke у вызывающих (разные типы чартов;
   фолбэки — тестовая поверхность jsdom). */
function ChartFrame({ gate, maxWidth, height, style, fallback, children }) {
  const RC = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Recharts;
  if (!RC || !RC[gate || 'BarChart']) return fallback ? fallback() : null;
  const { ResponsiveContainer } = RC;
  const s = Object.assign({ width: '100%', height: height + 'px' }, maxWidth ? { maxWidth } : {}, style || {});
  return (
    <div style={s}>
      <ResponsiveContainer width="100%" height="100%">{children(RC)}</ResponsiveContainer>
    </div>
  );
}

/* Распределение Lead Time по бакетам (A2). Recharts-бары через ChartFrame (D5);
   фолбэк — inline-SVG-полосы (тесты / нет Recharts). Стиль — CHART. */
function BucketBars({ buckets, L }) {
  const items = [
    { key: 'le40', label: L.bucketLe40, count: (buckets && buckets.le40) || 0, color: '#1b7a43' },
    { key: 'mid', label: L.bucketMid, count: (buckets && buckets.mid) || 0, color: '#c98a00' },
    { key: 'gt120', label: L.bucketGt120, count: (buckets && buckets.gt120) || 0, color: '#c62828' },
  ];
  const fallback = () => {
    const max = Math.max(1, items[0].count, items[1].count, items[2].count);
    return (
      <React.Fragment>
        {items.map((it) => (
          <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '5px 0' }}>
            <span style={{ flex: '0 0 118px', fontSize: '12px', color: 'var(--muted,#6b7785)' }}>{it.label}</span>
            <span style={{ flex: '1 1 auto', height: '10px', borderRadius: '5px', background: 'var(--surface2,#eef0f3)', overflow: 'hidden' }}>
              <i style={{ display: 'block', height: '100%', width: (it.count / max * 100) + '%', background: it.color, borderRadius: '5px' }} />
            </span>
            <span style={{ flex: '0 0 auto', minWidth: '22px', textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{it.count}</span>
          </div>
        ))}
      </React.Fragment>
    );
  };
  const data = items.map((it) => ({ name: it.label, count: it.count, color: it.color }));
  return (
    <div style={{ marginTop: '18px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 8px' }}>{L.bucketTitle}</div>
      <ChartFrame gate="BarChart" maxWidth="520px" height={200} fallback={fallback}>
        {(RC) => {
          const { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } = RC;
          return (
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.gridStroke} />
              <XAxis dataKey="name" tick={CHART.axisTick} />
              <YAxis allowDecimals={false} tick={CHART.axisTick} />
              <Tooltip cursor={CHART.tooltipCursor} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          );
        }}
      </ChartFrame>
    </div>
  );
}

/* #50 v3.2.0 — универсальный категорийный бар-чарт каталога (A1/A4/A5/A7/B1/B2): Recharts из
   SSP_VENDORED; либы нет (jsdom/тест) → полосный SVG-фолбэк (паттерн BucketBars).
   items: [{label, value, color?}]. horizontal → бары-строки (роли/люди, длинные подписи);
   вертикальные столбцы — временные бакеты (A1) и зоны (A7). unitLabel — суффикс значений;
   valueName — имя ряда в тултипе. Отрицательные значения (A5) — ReferenceLine на нуле. */
function RepCatBars({ title, sub, items, horizontal, unitLabel, valueName, L }) {
  const data = (items || []).filter((it) => it && typeof it.value === 'number' && isFinite(it.value));
  if (!data.length) return null;
  const head = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '0 0 8px' }}>
      <span style={{ fontSize: '13px', fontWeight: 600 }}>{title}</span>
      {sub ? <span style={{ fontSize: '11px', color: 'var(--muted,#6b7785)' }}>{sub}</span> : null}
    </div>
  );
  const fmt = (v) => String(v) + (unitLabel ? ' ' + unitLabel : '');
  /* SVG-фолбэк (тесты / нет Recharts): полосы; отрицательные — |v| полосой, знак в числе. */
  const fallback = () => {
    const max = Math.max(1, ...data.map((it) => Math.abs(it.value)));
    return (
      <React.Fragment>
        {data.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '5px 0', maxWidth: '620px' }}>
            <span style={{ flex: '0 0 150px', fontSize: '12px', color: 'var(--muted,#6b7785)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
            <span style={{ flex: '1 1 auto', height: '10px', borderRadius: '5px', background: 'var(--surface2,#eef0f3)', overflow: 'hidden' }}>
              <i style={{ display: 'block', height: '100%', width: (Math.abs(it.value) / max * 100) + '%', background: it.color || CHART.neutral, borderRadius: '5px' }} />
            </span>
            <span style={{ flex: '0 0 auto', minWidth: '40px', textAlign: 'right', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(it.value)}</span>
          </div>
        ))}
      </React.Fragment>
    );
  };
  const h = horizontal ? Math.max(120, data.length * 34 + 30) : 200;
  return (
    <div style={{ marginTop: '18px', marginBottom: '6px' }}>
      {head}
      <ChartFrame gate="BarChart" maxWidth="620px" height={h} fallback={fallback}>
        {(RC) => {
          const { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid, ReferenceLine, LabelList } = RC;
          const rows = data.map((it) => ({ name: it.label, v: it.value, color: it.color || CHART.neutral }));
          const hasNeg = rows.some((r) => r.v < 0);
          return (
            <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'}
              margin={{ top: 6, right: 40, bottom: 4, left: horizontal ? 8 : -12 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={!horizontal} vertical={!!horizontal} stroke={CHART.gridStroke} />
              {horizontal
                ? <XAxis type="number" tick={CHART.axisTick} />
                : <XAxis dataKey="name" tick={CHART.axisTick} />}
              {horizontal
                ? <YAxis type="category" dataKey="name" width={150} tick={CHART.axisTick} />
                : <YAxis allowDecimals={false} tick={CHART.axisTick} />}
              <Tooltip cursor={CHART.tooltipCursor} formatter={(v) => fmt(v)} />
              {hasNeg ? <ReferenceLine {...(horizontal ? { x: 0 } : { y: 0 })} stroke="var(--muted,#6b7785)" /> : null}
              <Bar dataKey="v" name={valueName || title} radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]} isAnimationActive={false}>
                {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
                <LabelList dataKey="v" position={horizontal ? 'right' : 'top'} formatter={fmt}
                  style={{ fontSize: 11, fill: 'var(--muted,#6b7785)' }} />
              </Bar>
            </BarChart>
          );
        }}
      </ChartFrame>
    </div>
  );
}

/* #50 v3.2.0 — A1: агрегация переходов в бакеты времени для чарта. Ключ дня в ЛОКАЛЬНОЙ зоне
   (консистентно _fmtDate таблицы); диапазон > 62 дней → помесячно. Zero-fill дыр НЕ делаем:
   ряды разрежены естественно (нет перехода = нет бара) — ось всё равно категорийная. */
function _a1ChartItems(rows) {
  const stamps = rows.map((r) => r.enteredAt).filter((v) => typeof v === 'number' && isFinite(v));
  if (!stamps.length) return { items: [], byMonth: false };
  const span = (Math.max.apply(null, stamps) - Math.min.apply(null, stamps)) / 86400000;
  const byMonth = span > 62;
  const p2 = (n) => String(n).padStart(2, '0');
  const cnt = {};
  stamps.forEach((ms) => {
    const d = new Date(ms);
    const key = byMonth
      ? d.getFullYear() + '-' + p2(d.getMonth() + 1)
      : d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    cnt[key] = (cnt[key] || 0) + 1;
  });
  const items = Object.keys(cnt).sort().map((k) => ({
    label: byMonth ? k : k.slice(5),                     /* день: без года (окно ≤ 62 дн) */
    value: cnt[k], color: '#2b6cb0',
  }));
  return { items, byMonth };
}

/* #50 v3.2.0 — A10: стековые бары «перенесено/снято» (часы) по ролям на Recharts;
   % недоезда — в подписи роли. Фолбэк (нет либы) — прежние ручные полосы в A10View. */
function RechartsSpillover({ roleRows, L, RC }) {
  const { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } = RC;
  const toH = (m) => Math.round(((Number(m) || 0) / 60) * 10) / 10;
  const data = roleRows.map((r) => ({
    name: r.label + ' · ' + Math.round(r.pct * 100) + '%',
    carried: toH(r.carriedMinutes), dropped: toH(r.droppedMinutes),
  }));
  const h = Math.max(120, data.length * 34 + 44);
  return (
    <ChartFrame gate="BarChart" maxWidth="680px" height={h}>
      {() => (
        <BarChart layout="vertical" data={data} margin={{ top: 6, right: 40, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART.gridStroke} />
          <XAxis type="number" tick={CHART.axisTick} />
          <YAxis type="category" dataKey="name" width={200} tick={CHART.axisTick} />
          <Tooltip cursor={CHART.tooltipCursor} formatter={(v) => v + ' ' + L.a10HoursUnit} />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
          <Bar dataKey="carried" stackId="s" fill="#e6a817" name={L.a10Carried} isAnimationActive={false} />
          <Bar dataKey="dropped" stackId="s" fill="#e5493a" name={L.a10Dropped} isAnimationActive={false} radius={[0, 3, 3, 0]} />
        </BarChart>
      )}
    </ChartFrame>
  );
}

/* A2 TTM — тайлы медиан (3 метрики) + таблица по типу единицы + бакеты Lead + счётчик риска. */
function A2View({ vm, L }) {
  if (vm.noAnchors) return <Banner kind="warn">{L.a2NoAnchors}</Banner>;
  const tiles = vm.tiles || [];
  const leadTile = tiles.filter((t) => t.metric === 'lead')[0] || null;
  const leadLevel = leadTile ? leadTile.level : 'none';
  const labelOf = (m) => (m === 'lead' ? L.metricLead : m === 'team' ? L.metricTeam : L.metricCycle);
  const normLine = (t) => (t.norm == null
    ? L.ttmNoNorm
    : L.ttmNormPrefix + ' ' + t.norm + ' · ' + (t.level === 'over' ? L.ttmOver : L.ttmOk));
  return (
    <React.Fragment>
      <LimitBanners vm={vm} L={L} />
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '4px 0 16px' }}>
        {tiles.map((t) => (
          <StatTile key={t.metric} metricLabel={labelOf(t.metric)} median={t.median}
            unit={L.ttmUnit} normLine={normLine(t)} level={t.level} L={L} />
        ))}
      </div>
      <A2TypeTable typeRows={vm.typeRows || []} leadLevel={leadLevel} L={L} />
      <BucketBars buckets={vm.buckets} L={L} />
      {vm.riskCount > 0 ? (
        <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '16px 0 0', fontSize: '12px', color: 'var(--muted,#6b7785)' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#c62828', flex: '0 0 auto' }} aria-hidden="true" />
          <span><b style={{ color: 'var(--text,#20303c)' }}>{vm.riskCount}</b> {L.riskSuffix}</span>
        </p>
      ) : null}
      {!vm.pausesActive ? <div style={{ ..._mutedS, margin: '10px 0 0' }}>{L.a2NoPauses}</div> : null}
      {vm.tagPausePending ? <div style={{ ..._mutedS, margin: '6px 0 0' }} aria-hidden="true">*</div> : null}
    </React.Fragment>
  );
}

function _Muted({ children }) {
  return <div style={{ padding: '24px', color: 'var(--muted,#6b7785)' }}>{children}</div>;
}

/* #50 S4c — заголовок секции потока (A8/A9): название + бейдж + подпись (мокап rep-head). */
function SectionHead({ title, badge, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '0 0 6px', flexWrap: 'wrap' }}>
      <h3 style={{ margin: 0, fontSize: '15px' }}>{title}</h3>
      <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: 'var(--surface2,#eef0f3)', color: 'var(--muted,#6b7785)' }}>{badge}</span>
      <span style={{ fontSize: '12px', color: 'var(--muted,#6b7785)' }}>{sub}</span>
    </div>
  );
}

/* #50 S9-VIZ — A8 «Узкое место» на Recharts: горизонтальные бары медианы dwell (цвет по светофору,
   _lvlColor как SVG), dwell подписан у бара, WIP — в тултипе. Стиль — CHART. SVG-фолбэк в FlowBars. */
function RechartsBottleneck({ states, L, RC }) {
  const { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid, LabelList } = RC;
  const data = states.map((s) => ({ state: s.state, median: (typeof s.median === 'number' ? s.median : 0), wip: s.wip || 0, level: s.level }));
  const h = Math.max(120, data.length * 40 + 24);
  const tip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: 'var(--surface,#fff)', border: '1px solid var(--border,#dfe3e8)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
        <div style={{ fontWeight: 600, marginBottom: '2px' }}>{d.state}</div>
        <div>{d.median} {L.daysUnit}</div>
        <div style={{ color: 'var(--muted,#6b7785)' }}>{d.wip} {L.flowColWip}</div>
      </div>
    );
  };
  return (
    <ChartFrame gate="BarChart" maxWidth="620px" height={h} style={{ marginTop: '4px' }}>
      {() => (
        <BarChart layout="vertical" data={data} margin={{ top: 6, right: 40, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART.gridStroke} />
          <XAxis type="number" allowDecimals={false} tick={CHART.axisTick} />
          <YAxis type="category" dataKey="state" width={140} tick={CHART.axisTick} />
          <Tooltip cursor={CHART.tooltipCursor} content={tip} />
          <Bar dataKey="median" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => <Cell key={i} fill={_lvlColor(d.level)} />)}
            <LabelList dataKey="median" position="right" style={{ fontSize: 11, fill: 'var(--muted,#6b7785)' }} />
          </Bar>
        </BarChart>
      )}
    </ChartFrame>
  );
}

/* A8 Bottleneck — Recharts-бары (если либа доступна) иначе inline-SVG-фолбэк (ширина ∝ dwell + WIP). */
function FlowBars({ states, L }) {
  const rows = states || [];
  const RC = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Recharts;
  if (RC && RC.BarChart) return <RechartsBottleneck states={rows} L={L} RC={RC} />;
  const meds = rows.map((s) => (typeof s.median === 'number' ? s.median : 0));
  const max = Math.max(1, ...meds);
  return (
    <div style={{ marginTop: '4px' }}>
      {rows.map((s) => {
        const med = (typeof s.median === 'number') ? s.median : null;
        const color = s.level === 'over' ? '#c62828' : s.level === 'warn' ? '#c98a00' : s.level === 'ok' ? '#1b7a43' : '#7c93a8';
        const w = med == null ? 0 : Math.max(2, med / max * 100);
        return (
          <div key={s.state} style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '6px 0' }}>
            <span style={{ flex: '0 0 150px', fontSize: '12px', color: 'var(--text,#20303c)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.state}>{s.state}</span>
            <span style={{ flex: '1 1 auto', height: '12px', borderRadius: '6px', background: 'var(--surface2,#eef0f3)', overflow: 'hidden' }}>
              <i style={{ display: 'block', height: '100%', width: w + '%', background: color, borderRadius: '6px' }} />
            </span>
            <span style={{ flex: '0 0 auto', minWidth: '52px', textAlign: 'right', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {med == null ? '—' : med}<span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--muted,#6b7785)', marginLeft: '3px' }}>{L.daysUnit}</span>
            </span>
            <span style={{ flex: '0 0 auto', minWidth: '58px', textAlign: 'right', fontSize: '12px', color: 'var(--muted,#6b7785)', whiteSpace: 'nowrap' }}>
              <b style={{ color: 'var(--text,#20303c)' }}>{s.wip || 0}</b> {L.flowColWip}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* Метрика-чип A9 (всего откатов / задач с откатами). bad → красная подсветка. */
function MetricChip({ label, value, sub, bad }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: '140px', padding: '10px 14px', border: '1px solid var(--border,#dfe3e8)', borderRadius: '8px', background: bad ? '#fdecea' : 'var(--surface,#fff)', boxSizing: 'border-box' }}>
      <div style={{ fontSize: '12px', color: 'var(--muted,#6b7785)' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 600, lineHeight: 1.1, color: bad ? '#c62828' : 'var(--text,#20303c)' }}>{value}</div>
      {sub ? <div style={{ fontSize: '11px', color: 'var(--muted,#6b7785)', marginTop: '3px' }}>{sub}</div> : null}
    </div>
  );
}

/* A9 Rework — таблица обратных переходов (from → to · кол-во ↓). Роль/система — сегментация вью S8+. */
function ReworkTable({ rework, L }) {
  const rows = (rework && rework.byTransition) || [];
  if (!rows.length) return <_Muted>{L.flowEmpty}</_Muted>;
  return (
    <div className="ring-table-tableWrapper" style={{ overflowX: 'auto', marginTop: '4px' }}>
      <table className="ring-table-table">
        <thead className="ring-table-tableHead"><tr>
          <th className="ring-table-headerCell ring-table-cellUnlimited">{L.reworkColTransition}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.reworkColCount}</th>
        </tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr className="ring-table-row" key={t.from + '→' + t.to}>
              <td className="ring-table-cell">{t.from} <span style={{ color: 'var(--muted,#6b7785)' }}>&rarr;</span> {t.to}</td>
              <td className="ring-table-cell ring-table-cellRight"><b>{t.count}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* A8/A9 «Поток» — бары узкого места (медиана dwell + WIP) + метрики/таблица откатов. */
function FlowView({ vm, L }) {
  if (vm.noFlow) return <Banner kind="warn">{L.flowNoFlow}</Banner>;
  const bottleneck = vm.bottleneck || [];
  const rework = vm.rework || { totalBack: 0, issuesWithReopen: 0, byTransition: [] };
  const pop = (typeof vm.populationCount === 'number') ? vm.populationCount : 0;
  const pct = pop > 0 ? Math.round((rework.issuesWithReopen || 0) / pop * 100) : 0;
  return (
    <React.Fragment>
      <LimitBanners vm={vm} L={L} />
      <SectionHead title={L.bottleneckTitle} badge="A8" sub={L.bottleneckSub} />
      {bottleneck.length ? <FlowBars states={bottleneck} L={L} /> : <_Muted>{L.flowEmpty}</_Muted>}
      <div style={{ height: '1px', background: 'var(--border,#dfe3e8)', margin: '22px 0 16px' }} />
      <SectionHead title={L.reworkTitle} badge="A9" sub={L.reworkSub} />
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <MetricChip label={L.reworkTotal} value={rework.totalBack || 0} bad={(rework.totalBack || 0) > 0}
          sub={String(L.flowPopulation || '').replace('{n}', String(pop))} />
        <MetricChip label={L.reworkIssues} value={rework.issuesWithReopen || 0} sub={pct + '%'} />
      </div>
      <ReworkTable rework={rework} L={L} />
      {!vm.pausesActive ? <div style={{ ..._mutedS, margin: '10px 0 0' }}>{L.a2NoPauses}</div> : null}
      {vm.tagPausePending ? <div style={{ ..._mutedS, margin: '6px 0 0' }} aria-hidden="true">*</div> : null}
    </React.Fragment>
  );
}

/* A4 Трудозатраты — таблица человек/роль/часы/дни (сорт по часам ↓). Роль null → «не определена». */
function A4Table({ rows, roleLabels, L }) {
  return (
    <div className="ring-table-tableWrapper" style={{ overflowX: 'auto', marginTop: '4px' }}>
      <table className="ring-table-table">
        <thead className="ring-table-tableHead"><tr>
          <th className="ring-table-headerCell ring-table-cellUnlimited">{L.a4ColPerson}</th>
          <th className="ring-table-headerCell">{L.a4ColRole}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.a4ColHours}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.a4ColDays}</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr className="ring-table-row" key={r.author + '·' + (r.roleKey || '') + '·' + i}>
              <td className="ring-table-cell">{r.author}</td>
              <td className="ring-table-cell">{r.roleKey ? (roleLabels[r.roleKey] || r.roleKey)
                : <span style={_mutedS}>{L.a4RoleNone}</span>}</td>
              <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>
                <b>{_fmtHours(r.minutes)}</b> <span style={{ color: 'var(--muted,#6b7785)', fontSize: '11px' }}>{L.a4HoursUnit}</span>
              </td>
              <td className="ring-table-cell ring-table-cellRight">{r.days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* A4 Трудозатраты — итог часов/людей + таблица + «кто не списал» чипы. */
function A4View({ vm, L }) {
  const rows = vm.workloadRows || [];
  const noLog = vm.noLog || [];
  const roleLabels = vm.roleLabels || {};
  const pop = (typeof vm.populationCount === 'number') ? vm.populationCount : 0;
  return (
    <React.Fragment>
      <LimitBanners vm={vm} L={L} />
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <MetricChip label={L.a4Total} value={_fmtHours(vm.totalMinutes) + ' ' + L.a4HoursUnit}
          sub={String(L.flowPopulation || '').replace('{n}', String(pop))} />
        <MetricChip label={L.a4ColPerson} value={vm.authorCount || 0} />
      </div>
      {/* #50 v3.2.0 — часы по исполнителям (Σ ролей), топ-12: хвост не влезает по высоте — полный список в таблице ниже. */}
      {rows.length ? (() => {
        const byAuthor = {};
        rows.forEach((r) => { byAuthor[r.author] = (byAuthor[r.author] || 0) + (Number(r.minutes) || 0); });
        const all = Object.keys(byAuthor)
          .map((a) => ({ label: a, value: Math.round((byAuthor[a] / 60) * 10) / 10, color: '#2b6cb0' }))
          .sort((x, y) => y.value - x.value);
        const sub = all.length > 12 ? String(L.chartTopN || '').replace('{n}', '12') : null;
        return <RepCatBars title={L.a4ChartTitle} sub={sub} items={all.slice(0, 12)} horizontal
          unitLabel={L.a4HoursUnit} valueName={L.a4ChartTitle} L={L} />;
      })() : null}
      {rows.length ? <A4Table rows={rows} roleLabels={roleLabels} L={L} /> : <_Muted>{L.a4Empty}</_Muted>}
      {noLog.length ? (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 8px' }}>{L.a4NoLogTitle}</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {noLog.map((n, i) => (
              <span key={n.author + '·' + (n.roleKey || '') + '·' + i}
                style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '12px', fontSize: '12px',
                  background: '#fff6e5', color: '#8a5a00', border: '1px solid #f5d99a' }}>
                {n.author}{n.roleKey ? ' · ' + (roleLabels[n.roleKey] || n.roleKey) : ''}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </React.Fragment>
  );
}

/* A5 План-факт — знаковый % расхождения + светофор-цвет по уровню (over/warn/ok/none). */
function _fmtPct(v) { return (v == null) ? '—' : (v > 0 ? '+' : '') + Math.round(v) + '%'; }
function _lvlColor(level) { return level === 'over' ? '#c62828' : level === 'warn' ? '#c98a00' : level === 'ok' ? '#1b7a43' : '#7c93a8'; }

/* Плитка роли: знаковое ср. расхождение + светофор + «N сверх порога · направление/норма». */
function RoleVarianceTile({ r, L, threshold }) {
  const color = _lvlColor(r.level);
  const dir = (r.avgVariancePct == null) ? '' : (r.avgVariancePct > 0 ? L.a5OverEst : r.avgVariancePct < 0 ? L.a5UnderEst : '');
  const over = String(L.a5OverCount || '').replace('{n}', String(r.overCount || 0));
  /* норма = зелёный бэнд = ±(порог/2)% (bands agingLevel порог/2) — производна от настройки. */
  const normHint = String(L.a5NormHint || '').replace('{n}', String(Math.round((threshold || 20) / 2)));
  const sub = r.level === 'ok' ? (over + ' · ' + normHint) : (dir ? over + ' · ' + dir : over);
  return (
    <div style={{ flex: '1 1 180px', minWidth: '170px', padding: '10px 14px', border: '1px solid ' + color + '55', borderRadius: '8px', background: 'var(--surface,#fff)', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--muted,#6b7785)' }}>
        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color, flex: '0 0 auto' }} aria-hidden="true" />
        <span>{r.label} · {L.a5MetricSuffix}</span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 600, lineHeight: 1.15, color: color }}>{_fmtPct(r.avgVariancePct)}</div>
      <div style={{ fontSize: '11px', color: 'var(--muted,#6b7785)', marginTop: '3px' }}>{sub}</div>
    </div>
  );
}

/* Таблица задач сверх порога: ID · Задача · Роль · Оценка(as-of) · Факт · Расхожд. (пилюля по уровню). */
function A5Table({ rows, L, vm }) {
  return (
    <div className="ring-table-tableWrapper" style={{ overflowX: 'auto', marginTop: '4px' }}>
      <table className="ring-table-table">
        <thead className="ring-table-tableHead"><tr>
          <th className="ring-table-headerCell">{L.colId}</th>
          <th className="ring-table-headerCell ring-table-cellUnlimited">{L.colTask}</th>
          <th className="ring-table-headerCell">{L.a4ColRole}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.a5ColEst}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.a5ColFact}</th>
          <th className="ring-table-headerCell ring-table-cellRight">{L.a5ColVar}</th>
          {vm.hasSystem ? <th className="ring-table-headerCell">{L.colSystem}</th> : null}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const color = _lvlColor(r.level);
            return (
              <tr className="ring-table-row" key={r.id + '·' + r.roleKey + '·' + i}>
                <td className="ring-table-cell"><IssueLink id={r.id} ytBase={vm.ytBase} /></td>
                <td className="ring-table-cell">{r.summary}</td>
                <td className="ring-table-cell">{r.roleLabel}</td>
                <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>{_fmtHours(r.asOfMin)} <span style={{ color: 'var(--muted,#6b7785)', fontSize: '11px' }}>{L.a4HoursUnit}</span></td>
                <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>{_fmtHours(r.factMin)} <span style={{ color: 'var(--muted,#6b7785)', fontSize: '11px' }}>{L.a4HoursUnit}</span></td>
                <td className="ring-table-cell ring-table-cellRight">
                  <span style={{ display: 'inline-block', whiteSpace: 'nowrap', padding: '1px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, color: color, background: color + '1f' }}>{_fmtPct(r.variancePct)}</span>
                </td>
                {vm.hasSystem ? <td className="ring-table-cell" style={_mutedS}>{r.system || '—'}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* A5 План-факт — плитки ролей (знаковое расхождение) + таблица задач сверх порога. */
function A5View({ vm, L }) {
  if (vm.noAnchors) return <Banner kind="warn">{L.a2NoAnchors}</Banner>;
  const rollups = (vm.rollups || []).filter((r) => (r.taskCount || 0) > 0);
  const rows = vm.rows || [];
  return (
    <React.Fragment>
      <LimitBanners vm={vm} L={L} />
      {rollups.length ? (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '4px 0 16px' }}>
          {rollups.map((r) => <RoleVarianceTile key={r.roleKey} r={r} L={L} threshold={vm.threshold} />)}
        </div>
      ) : null}
      {/* #50 v3.2.0 — знаковое ср. расхождение по ролям (цвет = светофор уровня, нулевая ось). */}
      {rollups.length > 1 ? <RepCatBars title={L.a5ChartTitle} horizontal unitLabel="%" valueName={L.a5ChartTitle} L={L}
        items={rollups.map((r) => ({ label: r.label, value: (r.avgVariancePct == null) ? null : Math.round(r.avgVariancePct), color: _lvlColor(r.level) }))} /> : null}
      {rows.length ? <A5Table rows={rows} L={L} vm={vm} /> : <_Muted>{L.a5Empty}</_Muted>}
    </React.Fragment>
  );
}

/* A3 сегмент WIP/Done (клиентский фильтр одного фетча, счётчики в чипах) + таблица среза.
   Колонки динамические: бизнес-поля рендерятся только при snapCols.*; оценки — колонка на роль. */
function A3View({ vm, L }) {
  const [mode, setMode] = React.useState('wip');
  const rows = (vm.rows || []).filter((r) => r.mode === mode);
  const roles = vm.snapRoles || [];
  const cols = vm.snapCols || {};
  const seg = (m, label, n) => (
    <button type="button" onClick={() => setMode(m)}
      className={'ring-button-button ring-button-heightS' + (mode === m ? ' ring-button-primary' : '')}
      style={{ marginRight: '6px' }}>{label} <span style={{ opacity: 0.65 }}>{n}</span></button>
  );
  return (
    <React.Fragment>
      <LimitBanners vm={vm} L={L} />
      {vm.a3NoDone ? <Banner kind="warn">{L.a3NoDoneCfg}</Banner> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', margin: '2px 0 12px' }}>
        {seg('wip', L.a3ModeWip, vm.wipCount || 0)}
        {seg('done', L.a3ModeDone, vm.doneCount || 0)}
      </div>
      {rows.length ? (
        <div className="ring-table-tableWrapper" style={{ overflowX: 'auto' }}>
          <table className="ring-table-table">
            <thead className="ring-table-tableHead"><tr>
              <th className="ring-table-headerCell">{L.colId}</th>
              <th className="ring-table-headerCell ring-table-cellUnlimited">{L.a3ColUnit}</th>
              {cols.stage ? <th className="ring-table-headerCell">{L.a3ColStage}</th> : null}
              {roles.map((r) => <th key={r.key} className="ring-table-headerCell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>{L.a3EstPrefix} {r.label}</th>)}
              {cols.org ? <th className="ring-table-headerCell">{L.a3ColOrg}</th> : null}
              {cols.priority ? <th className="ring-table-headerCell">{L.a3ColPriority}</th> : null}
              {vm.hasSystem ? <th className="ring-table-headerCell">{L.colSystem}</th> : null}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr className="ring-table-row" key={r.id}>
                  <td className="ring-table-cell"><IssueLink id={r.id} ytBase={vm.ytBase} /></td>
                  <td className="ring-table-cell">{r.summary}</td>
                  {cols.stage ? <td className="ring-table-cell">{r.stage ? <LabelPill text={r.stage} /> : '—'}</td> : null}
                  {roles.map((r2) => (
                    <td key={r2.key} className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>
                      {(r.est && r.est[r2.key] != null) ? _fmtHours(r.est[r2.key]) : '—'}
                    </td>
                  ))}
                  {cols.org ? <td className="ring-table-cell" style={_mutedS}>{r.org || '—'}</td> : null}
                  {cols.priority ? <td className="ring-table-cell">{r.priority ? <LabelPill text={r.priority} /> : '—'}</td> : null}
                  {vm.hasSystem ? <td className="ring-table-cell" style={_mutedS}>{r.system || '—'}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <_Muted>{L.a3Empty}</_Muted>}
    </React.Fragment>
  );
}

/* A6 гейдж «месяцев бэклога»: горизонтальная полоса (ширина ∝ месяцы/норму, цвет по уровню),
   маркер нормы = 100%, подпись «X мес» + «· у порога» на warn. months=null → «—». */
function BacklogGauge({ months, level, norm, L }) {
  if (months == null) return <span style={_mutedS}>—</span>;
  const color = level === 'over' ? '#c62828' : level === 'warn' ? '#c98a00' : '#1b7a43';
  const pct = Math.max(2, Math.min(100, months / (norm || 6) * 100));
  const num = (Math.round(months * 10) / 10).toString().replace('.', ',');
  const lbl = num + ' ' + L.a6MonthsUnit + (level === 'warn' ? ' · ' + L.a6AtThreshold : '');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ position: 'relative', flex: '1 1 auto', minWidth: '80px', height: '10px', borderRadius: '5px', background: 'var(--surface2,#eef0f3)', overflow: 'hidden' }}>
        <i style={{ display: 'block', height: '100%', width: pct + '%', background: color, borderRadius: '5px' }} />
      </span>
      <span style={{ flex: '0 0 auto', fontSize: '11px', color: 'var(--muted,#6b7785)', whiteSpace: 'nowrap' }}>{lbl}</span>
    </div>
  );
}

/* A6 Бэклог в ЧЧ по ролям — снимок: роль · задач · Σ ЧЧ · ёмкость ч/мес · гейдж «месяцев» (норм ≤N). */
function A6View({ vm, L }) {
  const rows = vm.rows || [];
  const norm = vm.norm || 6;
  return (
    <React.Fragment>
      <LimitBanners vm={vm} L={L} />
      {vm.noBacklogCfg ? <Banner kind="warn">{L.a6NoBacklogHint}</Banner> : null}
      {rows.length ? (
        <div className="ring-table-tableWrapper" style={{ overflowX: 'auto' }}>
          <table className="ring-table-table">
            <thead className="ring-table-tableHead"><tr>
              <th className="ring-table-headerCell">{L.a4ColRole}</th>
              <th className="ring-table-headerCell ring-table-cellRight">{L.a6ColTasks}</th>
              <th className="ring-table-headerCell ring-table-cellRight">{L.a6ColSum}</th>
              <th className="ring-table-headerCell ring-table-cellRight">{L.a6ColCapacity}</th>
              <th className="ring-table-headerCell" style={{ minWidth: '170px' }}>
                {L.a6ColMonths} <span style={{ color: 'var(--muted,#6b7785)', fontWeight: 400 }}>{String(L.a6NormMarker || '').replace('{n}', String(norm))}</span>
              </th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr className="ring-table-row" key={r.roleKey}>
                  <td className="ring-table-cell">{r.label}</td>
                  <td className="ring-table-cell ring-table-cellRight">{r.taskCount}</td>
                  <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>{_fmtHours(r.sumMinutes)} <span style={{ color: 'var(--muted,#6b7785)', fontSize: '11px' }}>{L.a4HoursUnit}</span></td>
                  <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>{r.capacityHours == null ? '—' : (Math.round(r.capacityHours * 10) / 10)}</td>
                  <td className="ring-table-cell"><BacklogGauge months={r.months} level={r.level} norm={norm} L={L} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <_Muted>{L.a6Empty}</_Muted>}
    </React.Fragment>
  );
}

/* A10 Spillover — 3 секции: недовыполнение по ролям (hbars carried/dropped) / хвосты спринта /
   возраст хвоста (зомби). Единица ЧЧ (минуты → часы через _fmtHours). Снимки соседних спринтов. */
function _ageBadge(level) {
  return level === 'hot' ? { bg: '#fdecea', fg: '#c23b2b' }
    : level === 'warm' ? { bg: '#fdf3d9', fg: '#8a6d1a' }
    : { bg: '#eef1f4', fg: '#6b7785' };
}
function A10View({ vm, L }) {
  if (vm.a10Empty) return <_Muted>{L.a10Empty}</_Muted>;
  const roleRows = vm.roleRows || [];
  const tails = vm.tails || [];
  const ages = vm.ages || [];
  const hu = L.a10HoursUnit;
  return (
    <React.Fragment>
      {!vm.hasN1 ? <Banner kind="warn">{L.a10NoN1}</Banner> : null}
      {vm.noDoneCfg ? <Banner kind="warn">{L.a10NoDoneCfg}</Banner> : null}
      <div style={{ fontSize: '13px', fontWeight: 600, margin: '2px 0 10px' }}>{L.a10SectUnder}</div>
      {/* #50 v3.2.0 — Recharts-стек по ролям (перенесено/снято, часы); нет либы → прежние ручные полосы. */}
      {roleRows.length && globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Recharts
        && globalThis.SSP_VENDORED.Recharts.BarChart ? (
        <RechartsSpillover roleRows={roleRows} L={L} RC={globalThis.SSP_VENDORED.Recharts} />
      ) : roleRows.length ? (
        <div style={{ maxWidth: '680px' }}>
          {roleRows.map((r) => {
            const carriedPct = r.plannedMinutes > 0 ? (r.carriedMinutes / r.plannedMinutes * 100) : 0;
            const droppedPct = r.plannedMinutes > 0 ? (r.droppedMinutes / r.plannedMinutes * 100) : 0;
            return (
              <div key={r.roleKey} style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 8px' }}>
                <span style={{ flex: '0 0 200px', fontSize: '12px', display: 'flex', gap: '5px', minWidth: 0, alignItems: 'baseline' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                  <b style={{ flex: '0 0 auto' }}>· {Math.round(r.pct * 100)}%</b>
                </span>
                <span style={{ flex: '1 1 auto', height: '14px', background: 'var(--border,#eef1f4)', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                  <i style={{ width: carriedPct + '%', background: '#e6a817', display: 'block' }} />
                  <i style={{ width: droppedPct + '%', background: '#e5493a', display: 'block' }} />
                </span>
                <span style={{ flex: '0 0 auto', fontSize: '12px', color: 'var(--muted,#6b7785)', whiteSpace: 'nowrap' }}>{_fmtHours(r.notDoneMinutes)} / {_fmtHours(r.plannedMinutes)} {hu}</span>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--muted,#6b7785)', marginTop: '10px' }}>
            <span><i style={{ display: 'inline-block', width: '11px', height: '11px', borderRadius: '2px', background: '#e6a817', marginRight: '6px', verticalAlign: 'middle' }} />{L.a10Carried}</span>
            <span><i style={{ display: 'inline-block', width: '11px', height: '11px', borderRadius: '2px', background: '#e5493a', marginRight: '6px', verticalAlign: 'middle' }} />{L.a10Dropped}</span>
          </div>
        </div>
      ) : <_Muted>{L.empty}</_Muted>}

      <div style={{ height: '1px', background: 'var(--border,#dfe3e8)', margin: '22px 0 14px' }} />
      <div style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 10px' }}>{L.a10SectTails}</div>
      {tails.length ? (
        <div className="ring-table-tableWrapper" style={{ overflowX: 'auto' }}>
          <table className="ring-table-table">
            <thead className="ring-table-tableHead"><tr>
              <th className="ring-table-headerCell">{L.colId}</th>
              <th className="ring-table-headerCell ring-table-cellUnlimited">{L.colTask}</th>
              <th className="ring-table-headerCell">{L.a4ColRole}</th>
              <th className="ring-table-headerCell ring-table-cellRight">{L.a10ColHours}</th>
              <th className="ring-table-headerCell">{L.a10ColType}</th>
              {vm.hasSystem ? <th className="ring-table-headerCell">{L.a10ColSystem}</th> : null}
            </tr></thead>
            <tbody>
              {tails.map((t, i) => (
                <tr className="ring-table-row" key={t.issueId + '·' + t.roleKey + '·' + i}>
                  <td className="ring-table-cell"><IssueLink id={t.issueId} ytBase={vm.ytBase} /></td>
                  <td className="ring-table-cell">{t.title}</td>
                  <td className="ring-table-cell">{t.roleLabel}</td>
                  <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>{_fmtHours(t.minutes)}</td>
                  <td className="ring-table-cell">
                    {/* v3.9.0 — короткий бейдж (полная формулировка — в легенде графика выше) */}
                    <span style={{ display: 'inline-block', whiteSpace: 'nowrap', padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                      background: t.type === 'carried' ? '#fdf3d9' : '#fdecea', color: t.type === 'carried' ? '#8a6d1a' : '#c23b2b' }}>
                      {t.type === 'carried' ? L.a10CarriedShort : L.a10DroppedShort}
                    </span>
                  </td>
                  {vm.hasSystem ? <td className="ring-table-cell" style={_mutedS}>{t.system || '—'}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <_Muted>{L.empty}</_Muted>}

      <div style={{ height: '1px', background: 'var(--border,#dfe3e8)', margin: '22px 0 14px' }} />
      <div style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 10px' }}>{L.a10SectAge}</div>
      {ages.length ? (
        <div className="ring-table-tableWrapper" style={{ overflowX: 'auto' }}>
          <table className="ring-table-table">
            <thead className="ring-table-tableHead"><tr>
              <th className="ring-table-headerCell">{L.colId}</th>
              <th className="ring-table-headerCell ring-table-cellUnlimited">{L.colTask}</th>
              <th className="ring-table-headerCell">{L.a4ColRole}</th>
              <th className="ring-table-headerCell">{L.a10ColAge}</th>
              {vm.hasSystem ? <th className="ring-table-headerCell">{L.a10ColSystem}</th> : null}
            </tr></thead>
            <tbody>
              {ages.map((a, i) => {
                const b = _ageBadge(a.level);
                return (
                  <tr className="ring-table-row" key={a.issueId + '·' + i}>
                    <td className="ring-table-cell"><IssueLink id={a.issueId} ytBase={vm.ytBase} /></td>
                    <td className="ring-table-cell">{a.title}</td>
                    <td className="ring-table-cell">{a.roleLabel}</td>
                    <td className="ring-table-cell">
                      <span style={{ display: 'inline-block', whiteSpace: 'nowrap', minWidth: '22px', textAlign: 'center', padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: b.bg, color: b.fg }}>
                        {a.age} {L.a10AgeUnit}
                      </span>
                    </td>
                    {vm.hasSystem ? <td className="ring-table-cell" style={_mutedS}>{a.system || '—'}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <_Muted>{L.empty}</_Muted>}
    </React.Fragment>
  );
}

/* v3.12.0 (#11) — A11 Velocity: средняя скорость по ролям (окно N закрытых спринтов из снимков)
   + тренд закрытых ЧЧ по спринтам (Recharts LineChart, линия на роль; синтетический dataKey
   s<idx> — паттерн B0Chart). Фолбэк без Recharts — таблица спринт×роль (jsdom/тест). */
function A11View({ vm, L }) {
  if (vm.a11Empty) return <_Muted>{L.a11Empty}</_Muted>;
  const roleRows = vm.roleRows || [];
  const hu = L.a10HoursUnit;
  const pctS = (v) => Math.round((Number(v) || 0) * 100) + '%';
  /* Объединённая ось спринтов (по dateStart), строка чарта — закрытые ЧАСЫ per-роль. */
  const axis = [];
  const seen = {};
  roleRows.forEach((r) => (r.sprints || []).forEach((s) => {
    if (!seen[s.sprintId]) { seen[s.sprintId] = true; axis.push({ id: s.sprintId, name: s.name, dateStart: s.dateStart }); }
  }));
  axis.sort((a, b) => a.dateStart - b.dateStart);
  const data = axis.map((ax) => {
    const row = { name: ax.name };
    roleRows.forEach((r, ri) => {
      const pt = (r.sprints || []).find((s) => s.sprintId === ax.id);
      row['s' + ri] = pt ? Math.round(pt.closedMinutes / 60 * 10) / 10 : null;
    });
    return row;
  });
  const RC = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Recharts;
  return (
    <React.Fragment>
      {vm.noDoneCfg ? <Banner kind="warn">{L.a11NoDoneCfg}</Banner> : null}
      <div style={{ fontSize: '13px', fontWeight: 600, margin: '2px 0 4px' }}>{L.a11SectAvg}</div>
      <div style={{ ...(_mutedS), margin: '0 0 10px' }}>{L.a11WindowNote.replace('{n}', String(vm.window))}</div>
      <div className="ring-table-tableWrapper" style={{ overflowX: 'auto', maxWidth: '680px' }}>
        <table className="ring-table-table">
          <thead className="ring-table-tableHead"><tr>
            <th className="ring-table-headerCell">{L.a4ColRole}</th>
            <th className="ring-table-headerCell ring-table-cellRight">{L.a11ColAvgClosed}</th>
            <th className="ring-table-headerCell ring-table-cellRight">{L.a11ColAvgPct}</th>
            <th className="ring-table-headerCell ring-table-cellRight">{L.a11ColSprints}</th>
          </tr></thead>
          <tbody>
            {roleRows.map((r) => (
              <tr className="ring-table-row" key={r.roleKey}>
                <td className="ring-table-cell">{r.label}</td>
                <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}><b>{_fmtHours(r.avgClosedMinutes)}</b> {hu}</td>
                <td className="ring-table-cell ring-table-cellRight">{pctS(r.avgPct)}</td>
                <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>
                  {r.sprints.length}
                  {r.sparse ? <span style={{ marginLeft: '6px', display: 'inline-block', padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#fdf3d9', color: '#8a6d1a' }}>{L.a11Sparse}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ height: '1px', background: 'var(--border,#dfe3e8)', margin: '22px 0 14px' }} />
      <div style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 10px' }}>{L.a11SectTrend}</div>
      {RC && RC.LineChart ? (
        <ChartFrame gate="LineChart" height={220} maxWidth="680px">
          {(RCl) => {
            const { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } = RCl;
            return (
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.gridStroke} />
                <XAxis dataKey="name" tick={CHART.axisTick} />
                <YAxis tick={CHART.axisTick} />
                <Tooltip cursor={CHART.tooltipCursor} formatter={(v) => v + ' ' + hu} />
                {roleRows.length > 1 ? <Legend wrapperStyle={{ fontSize: '11px' }} /> : null}
                {roleRows.map((r, ri) => (
                  <Line key={r.roleKey} type="monotone" dataKey={'s' + ri} name={r.label}
                    stroke={B0_SYS_COLORS[ri % B0_SYS_COLORS.length]} strokeWidth={1.8}
                    dot={{ r: 2 }} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            );
          }}
        </ChartFrame>
      ) : (
        /* ponytail: нет Recharts (jsdom/тест) → таблица спринт×роль; прод-чанк несёт Recharts */
        <div className="ring-table-tableWrapper" style={{ overflowX: 'auto', maxWidth: '680px' }}>
          <table className="ring-table-table">
            <thead className="ring-table-tableHead"><tr>
              <th className="ring-table-headerCell">{L.a11ColSprint}</th>
              {roleRows.map((r) => <th key={r.roleKey} className="ring-table-headerCell ring-table-cellRight">{r.label}</th>)}
            </tr></thead>
            <tbody>
              {data.map((row) => (
                <tr className="ring-table-row" key={row.name}>
                  <td className="ring-table-cell">{row.name}</td>
                  {roleRows.map((r, ri) => <td key={r.roleKey} className="ring-table-cell ring-table-cellRight">{row['s' + ri] == null ? '—' : row['s' + ri]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {roleRows.some((r) => Math.round(r.avgClosedMinutes / 60) === 42) ? (
        <div style={{ ...(_mutedS), marginTop: '8px', fontStyle: 'italic' }}>
          {L.a11Title === 'Velocity команды'
            ? 'Ответ на главный вопрос жизни, Вселенной и планирования.'
            : 'The answer to the ultimate question of life, the universe, and planning.'}
        </div>
      ) : null}
    </React.Fragment>
  );
}

/* #50 S8b — B1 Техдолг (контур B): плитки (Σ ЧЧ долга · % по ЧЧ · «без оценки») + таблица роль по системам. */
function B1View({ vm, L }) {
  if (vm.b1NoCfg) return <Banner kind="warn">{L.b1NoCfg}</Banner>;
  const groups = vm.groups || [];
  const pct = (v) => Math.round((Number(v) || 0) * 100) + '%';
  return (
    <React.Fragment>
      <LimitBanners vm={vm} L={L} />
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <MetricChip label={L.b1TotalDebt} value={_fmtHours(vm.totalDebtMinutes) + ' ' + L.b1HoursUnit} />
        <MetricChip label={L.b1TotalPct} value={pct(vm.totalPct)} />
        <MetricChip label={L.b1Unestimated} value={vm.unestimated || 0} bad={(vm.unestimated || 0) > 0} />
      </div>
      {/* #50 v3.2.0 — долг по ролям (Σ по системам), часы. */}
      {groups.length ? (() => {
        const byRole = {};
        groups.forEach((g) => g.rows.forEach((r) => {
          if (!byRole[r.roleKey]) byRole[r.roleKey] = { label: r.label, min: 0 };
          byRole[r.roleKey].min += (Number(r.debtMinutes) || 0);
        }));
        const items = Object.keys(byRole)
          .map((k) => ({ label: byRole[k].label, value: Math.round((byRole[k].min / 60) * 10) / 10, color: CHART.amber }))
          .sort((x, y) => y.value - x.value);
        return items.length > 1 ? <RepCatBars title={L.b1ChartTitle} horizontal unitLabel={L.b1HoursUnit}
          valueName={L.b1ChartTitle} items={items} L={L} /> : null;
      })() : null}
      {groups.length ? groups.map((g, gi) => {
        const gDebt = g.rows.reduce((s, r) => s + r.debtMinutes, 0);
        return (
          <div key={g.system || ('__' + gi)} style={{ marginBottom: '14px' }}>
            {vm.hasSystem ? <SectionHead title={g.system || L.b1AllSystems} badge={_fmtHours(gDebt) + ' ' + L.b1HoursUnit} sub="" /> : null}
            <div className="ring-table-tableWrapper" style={{ overflowX: 'auto' }}>
              <table className="ring-table-table">
                <thead className="ring-table-tableHead"><tr>
                  <th className="ring-table-headerCell ring-table-cellUnlimited">{L.b1ColRole}</th>
                  <th className="ring-table-headerCell ring-table-cellRight">{L.b1ColDebt}</th>
                  <th className="ring-table-headerCell ring-table-cellRight">{L.b1ColPct}</th>
                </tr></thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr className="ring-table-row" key={r.roleKey}>
                      <td className="ring-table-cell">{r.label}</td>
                      <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>{_fmtHours(r.debtMinutes)} <span style={{ color: 'var(--muted,#6b7785)', fontSize: '11px' }}>{L.b1HoursUnit}</span></td>
                      <td className="ring-table-cell ring-table-cellRight">{pct(r.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }) : <_Muted>{L.b1Empty}</_Muted>}
    </React.Fragment>
  );
}

/* #50 S8c — B2 «Налог на баги» (контур B): доля ЧЧ на баги vs фичи, система×роль + корзина orphan. */
function B2View({ vm, L }) {
  if (vm.b2NoCfg) return <Banner kind="warn">{L.b2NoCfg}</Banner>;
  const groups = vm.groups || [];
  const basket = vm.basket;
  const pct = (v) => Math.round((Number(v) || 0) * 100) + '%';
  return (
    <React.Fragment>
      <LimitBanners vm={vm} L={L} />
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <MetricChip label={L.b2TotalPct} value={pct(vm.totalPct)} bad={(Number(vm.totalPct) || 0) >= 0.3} />
        <MetricChip label={L.b2TotalBug} value={_fmtHours(vm.totalBugMinutes) + ' ' + L.b2HoursUnit} />
        {(vm.fallbackBugCount || 0) > 0 ? <MetricChip label={L.b2Fallback} value={vm.fallbackBugCount} /> : null}
      </div>
      {/* #50 v3.2.0 — часы на баги по ролям (Σ по системам). */}
      {groups.length ? (() => {
        const byRole = {};
        groups.forEach((g) => g.rows.forEach((r) => {
          if (!byRole[r.roleKey]) byRole[r.roleKey] = { label: r.label, min: 0 };
          byRole[r.roleKey].min += (Number(r.bugMinutes) || 0);
        }));
        const items = Object.keys(byRole)
          .map((k) => ({ label: byRole[k].label, value: Math.round((byRole[k].min / 60) * 10) / 10, color: CHART.red }))
          .sort((x, y) => y.value - x.value);
        return items.length > 1 ? <RepCatBars title={L.b2ChartTitle} horizontal unitLabel={L.b2HoursUnit}
          valueName={L.b2ChartTitle} items={items} L={L} /> : null;
      })() : null}
      {groups.length ? groups.map((g, gi) => {
        const gBug = g.rows.reduce((s, r) => s + r.bugMinutes, 0);
        return (
          <div key={g.system || ('__' + gi)} style={{ marginBottom: '14px' }}>
            {vm.hasSystem ? <SectionHead title={g.system || L.b2AllSystems} badge={_fmtHours(gBug) + ' ' + L.b2HoursUnit} sub="" /> : null}
            <div className="ring-table-tableWrapper" style={{ overflowX: 'auto' }}>
              <table className="ring-table-table">
                <thead className="ring-table-tableHead"><tr>
                  <th className="ring-table-headerCell ring-table-cellUnlimited">{L.b2ColRole}</th>
                  <th className="ring-table-headerCell ring-table-cellRight">{L.b2ColBug}</th>
                  <th className="ring-table-headerCell ring-table-cellRight">{L.b2ColPct}</th>
                </tr></thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr className="ring-table-row" key={r.roleKey}>
                      <td className="ring-table-cell">{r.label}</td>
                      <td className="ring-table-cell ring-table-cellRight" style={{ whiteSpace: 'nowrap' }}>{_fmtHours(r.bugMinutes)} <span style={{ color: 'var(--muted,#6b7785)', fontSize: '11px' }}>{L.b2HoursUnit}</span></td>
                      <td className="ring-table-cell ring-table-cellRight">{pct(r.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }) : <_Muted>{L.b2Empty}</_Muted>}
      {basket ? (
        <div style={{ marginTop: '6px' }}>
          <SectionHead title={L.b2Basket} badge={_fmtHours(basket.totalMinutes) + ' ' + L.b2HoursUnit} sub="" />
        </div>
      ) : null}
    </React.Fragment>
  );
}

/* #50 S8a — B3 «1000 мелочей» (контур B): плитка счётчика за период + среднемесячный темп с начала года. */
function B3View({ vm, L }) {
  if (vm.b3NoTag) return <Banner kind="warn">{L.b3NoTag}</Banner>;
  const avg = (typeof vm.b3Avg === 'number' && isFinite(vm.b3Avg)) ? (Math.round(vm.b3Avg * 10) / 10) : 0;
  const pfx = vm.b3Capped ? '≥' : '';   /* счётчик упёрся в 20k-кап → нижняя граница, не точное (D7) */
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '4px 0 6px' }}>
      <MetricChip label={L.b3Period} value={pfx + (vm.b3Period || 0)} sub={L.b3Unit} />
      <MetricChip label={L.b3Avg} value={pfx + avg} sub={L.b3Ytd + ': ' + pfx + (vm.b3Ytd || 0)} />
    </div>
  );
}

/* #50 B0-d — «Свод» (контур B): помесячный тренд метрики × система на Recharts LineChart.
   series.metrics[metricKey].lines = { [sys]: [{value,level}×N] }; строим row-на-месяц с колонкой на
   систему. Recharts из SSP_VENDORED (вендор-чанк); нет либы (jsdom/тест) → компактная таблица-фолбэк. */
const B0_SYS_COLORS = ['#2b6cb0', '#1b7a43', '#c98a00', '#8046a5', '#c62828', '#0f7b8a', '#a65a2a', '#5a6b7c'];
function _b0SysLabel(sys, L) { return sys === '__all__' ? L.b0AllSystems : sys; }

function B0Chart({ title, unit, series, metricKey, systems, months, L, RC }) {
  const metric = (series.metrics && series.metrics[metricKey]) || { lines: {} };
  const lines = metric.lines || {};
  /* dataKey = синтетический s<idx>, НЕ имя системы: имена систем могут содержать точки («ERP 11.5») —
     Recharts трактует dotted-строку как nested-path. Отображаемое имя несёт <Line name>. */
  const data = months.map((m, i) => {
    const row = { name: m.key };
    systems.forEach((sys, si) => { const pt = (lines[sys] || [])[i]; row['s' + si] = (pt && typeof pt.value === 'number') ? pt.value : null; });
    return row;
  });
  const head = title + (unit ? ' · ' + unit : '');
  if (RC && RC.LineChart) {
    const { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } = RC;
    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 8px' }}>{head}</div>
        <ChartFrame gate="LineChart" height={220}>
          {() => (
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.gridStroke} />
              <XAxis dataKey="name" tick={CHART.axisTick} />
              <YAxis tick={CHART.axisTick} />
              <Tooltip cursor={CHART.tooltipCursor} />
              {systems.length > 1 ? <Legend wrapperStyle={{ fontSize: '11px' }} /> : null}
              {systems.map((sys, si) => (
                <Line key={sys} type="monotone" dataKey={'s' + si} name={_b0SysLabel(sys, L)}
                  stroke={B0_SYS_COLORS[si % B0_SYS_COLORS.length]} strokeWidth={sys === '__all__' ? 2.5 : 1.5}
                  dot={{ r: 2 }} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          )}
        </ChartFrame>
      </div>
    );
  }
  /* ponytail: нет Recharts (jsdom/тест) → компактная таблица месяц×система; апгрейд не нужен — прод-чанк несёт Recharts */
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 6px' }}>{head}</div>
      <div className="ring-table-tableWrapper" style={{ overflowX: 'auto' }}>
        <table className="ring-table-table">
          <thead className="ring-table-tableHead"><tr>
            <th className="ring-table-headerCell">{L.b0ColMonth}</th>
            {systems.map((sys) => <th key={sys} className="ring-table-headerCell ring-table-cellRight">{_b0SysLabel(sys, L)}</th>)}
          </tr></thead>
          <tbody>
            {data.map((row) => (
              <tr className="ring-table-row" key={row.name}>
                <td className="ring-table-cell">{row.name}</td>
                {systems.map((sys, si) => <td key={sys} className="ring-table-cell ring-table-cellRight">{row['s' + si] == null ? '—' : (Math.round(row['s' + si] * 10) / 10)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function B0View({ vm, L }) {
  if (vm.b0NoCfg) return <Banner kind="warn">{L.b0NoCfg}</Banner>;
  const series = vm.series;
  if (!series || !Array.isArray(series.months) || !series.months.length) return <_Muted>{L.b0Empty}</_Muted>;
  const RC = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Recharts;
  const systems = (Array.isArray(series.systems) && series.systems.length) ? series.systems : ['__all__'];
  const months = series.months;
  return (
    <React.Fragment>
      <LimitBanners vm={vm} L={L} />
      <div style={{ fontSize: '12px', color: 'var(--muted,#6b7785)', margin: '2px 0 12px' }}>{String(L.b0Window || '').replace('{n}', String(months.length))}</div>
      <B0Chart title={L.b0MetricTtm} unit={L.b0UnitDays} series={series} metricKey="ttm" systems={systems} months={months} L={L} RC={RC} />
      <B0Chart title={L.b0MetricPlanfact} unit="%" series={series} metricKey="planfact" systems={systems} months={months} L={L} RC={RC} />
      <B0Chart title={L.b0MetricBottleneck} unit={L.b0UnitDays} series={series} metricKey="bottleneck" systems={systems} months={months} L={L} RC={RC} />
      <B0Chart title={L.b0MetricBacklogMonths} unit={L.b0UnitMonths} series={series} metricKey="backlogMonths" systems={systems} months={months} L={L} RC={RC} />
      <B0Chart title={L.b0MetricBacklogHours} unit={L.b0UnitHours} series={series} metricKey="backlogHours" systems={systems} months={months} L={L} RC={RC} />
      {!vm.hasFlow ? <div style={{ ..._mutedS, margin: '2px 0 0' }}>{L.b0NoFlowHint}</div> : null}
      {!vm.hasBacklog ? <div style={{ ..._mutedS, margin: '6px 0 0' }}>{L.b0NoBacklogHint}</div> : null}
    </React.Fragment>
  );
}

function ReportBody({ vm, L }) {
  if (vm.noTargets) return <_Muted>{L.a1NoTargets}</_Muted>;
  if (vm.rangePrompt) return <_Muted>{L.rangePrompt}</_Muted>;
  if (vm.loading) return <_Muted>{L.loading}</_Muted>;
  if (vm.error) return <Banner kind="err">{L.error}</Banner>;
  if (vm.report === 'a10') return <A10View vm={vm} L={L} />;
  if (vm.report === 'a11') return <A11View vm={vm} L={L} />;
  if (vm.report === 'flow') return <FlowView vm={vm} L={L} />;
  if (vm.report === 'a2') return <A2View vm={vm} L={L} />;
  if (vm.report === 'a4') return <A4View vm={vm} L={L} />;
  if (vm.report === 'a5') return <A5View vm={vm} L={L} />;
  if (vm.report === 'a3') return <A3View vm={vm} L={L} />;
  if (vm.report === 'a6') return <A6View vm={vm} L={L} />;
  if (vm.report === 'b3') return <B3View vm={vm} L={L} />;
  if (vm.report === 'b2') return <B2View vm={vm} L={L} />;
  if (vm.report === 'b1') return <B1View vm={vm} L={L} />;
  if (vm.report === 'b0') return <B0View vm={vm} L={L} />;
  const rows = vm.rows || [];
  const Table = vm.report === 'a1' ? A1Table : A7Table;
  return (
    <React.Fragment>
      <LimitBanners vm={vm} L={L} />
      {/* A1: явный контракт популяции (D7 «точная цифра или явный сигнал») — считаются задачи,
          СЕЙЧАС стоящие в целевых статусах; реопенутые/ушедшие дальше в окно не попадают. */}
      {vm.report === 'a1' ? <div style={{ ...(_mutedS), margin: '2px 0 8px' }}>{L.a1PopNote}</div> : null}
      {/* #50 v3.2.0 — графики каталога: A1 темп переходов по дням/месяцам; A7 счёт задач по зонам. */}
      {vm.report === 'a1' && rows.length ? (() => {
        const c = _a1ChartItems(rows);
        return <RepCatBars title={c.byMonth ? L.a1ChartByMonth : L.a1ChartByDay} items={c.items} valueName={L.chartTasks} L={L} />;
      })() : null}
      {vm.report === 'a7' && rows.length ? <RepCatBars title={L.a7ChartTitle} valueName={L.chartTasks} L={L}
        items={[
          { label: L.flagOk, value: rows.filter((r) => r.level === 'ok').length, color: CHART.green },
          { label: L.flagWarn, value: rows.filter((r) => r.level === 'warn').length, color: CHART.amber },
          { label: L.flagOver, value: rows.filter((r) => r.level === 'over').length, color: CHART.red },
        ]} /> : null}
      {rows.length ? <Table rows={rows} L={L} vm={vm} /> : <_Muted>{L.empty}</_Muted>}
    </React.Fragment>
  );
}

function ReportView({ vm }) {
  const L = vm.labels || {};
  const r = vm.report;
  const title = r === 'a1' ? L.a1Title : r === 'a2' ? L.a2Title : r === 'a3' ? L.a3Title : r === 'a6' ? L.a6Title : r === 'a10' ? L.a10Title : r === 'a11' ? L.a11Title : r === 'flow' ? L.flowTitle : r === 'a4' ? L.a4Title : r === 'a5' ? L.a5Title : r === 'b3' ? L.b3Title : r === 'b2' ? L.b2Title : r === 'b1' ? L.b1Title : r === 'b0' ? L.b0Title : L.a7Title;
  const sub = r === 'a1' ? L.a1Sub : r === 'a2' ? L.a2Sub : r === 'a3' ? L.a3Sub : r === 'a6' ? L.a6Sub : r === 'a10' ? L.a10Sub : r === 'a11' ? L.a11Sub : r === 'flow' ? L.flowSub : r === 'a4' ? L.a4Sub : r === 'a5' ? L.a5Sub : r === 'b3' ? L.b3Sub : r === 'b2' ? L.b2Sub : r === 'b1' ? L.b1Sub : r === 'b0' ? L.b0Sub : L.a7Sub;
  /* A2/Поток/A5: население периода в подзаголовке (только когда тело считается) */
  const showCount = ((r === 'a2' && !vm.noAnchors) || (r === 'flow' && !vm.noFlow) || (r === 'a5' && !vm.noAnchors))
    && !vm.rangePrompt && typeof vm.populationCount === 'number';
  return (
    <div style={{ padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '2px' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>{title}</h2>
        <span style={{ color: 'var(--muted,#6b7785)', fontSize: '13px' }}>{sub}{showCount ? ' · ' + vm.populationCount : ''}</span>
      </div>
      <Chrome vm={vm} L={L} />
      {vm.aborted ? <Banner kind="warn">{vm.aborted === 'timeout' ? L.abortedTimeout : L.abortedManual}</Banner> : null}
      <ReportBody vm={vm} L={L} />
    </div>
  );
}

/* Контур B (и любой контур без отчёта) — плейсхолдер. */
function Placeholder({ vm }) {
  const L = vm.labels || {};
  return (
    <div className="ssp-empty">
      <div className="ssp-empty__title">{vm.contour === 'b' ? L.contourB : L.contourA}</div>
      <div className="ssp-empty__desc">{L.placeholder}</div>
    </div>
  );
}

function ReportingInner({ vm }) {
  const isReport = vm.report === 'a7' || vm.report === 'a1' || vm.report === 'a2' || vm.report === 'a3' || vm.report === 'a6' || vm.report === 'a10' || vm.report === 'a11' || vm.report === 'flow' || vm.report === 'a4' || vm.report === 'a5' || vm.report === 'b3' || vm.report === 'b2' || vm.report === 'b1' || vm.report === 'b0';
  return isReport ? <ReportView vm={vm} /> : <Placeholder vm={vm} />;
}

/* Хост-биндинг: перерендер по bump'у data-vm-key. Key = contour+проект → локальный стейт chrome
   (query-input + custom-диапазон) переживает смену вида/обновление данных, но СБРАСЫВАЕТСЯ при
   смене проекта (иначе показанный фильтр ≠ применённый: draft per-project, локальный стейт — нет). */
function ReportingPanel({ host }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, { attributes: true, attributeFilter: ['data-vm-key'] });
    return () => obs.disconnect();
  }, [host]);
  const vm = host.__sspReportingVm;
  if (!vm) return null;
  return <ReportingInner key={String(vm.contour) + '|' + String(vm.projectName || '')} vm={vm} />;
}

window.__SSP_REPORTING_MOUNT = {
  mountAt(host, vm) {
    if (!host) return;
    host.__sspReportingVm = vm || null;
    if (_mounted.has(host)) {
      host.dataset.vmKey = String((parseInt(host.dataset.vmKey || '0', 10) || 0) + 1);
      return;
    }
    const root = ReactDOMClient.createRoot(host);
    root.render(<ReportingPanel host={host} />);
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* sandbox teardown may throw */ }
    _mounted.delete(host);
    try { delete host.__sspReportingVm; } catch (_) { /* noop */ }
  },
};
