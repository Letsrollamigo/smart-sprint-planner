/* settings-reporting.jsx — секция «ReportingSection» формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx (декомпозиция по файлам);
   props-контракт секции не менялся — чистый перенос. */

import * as React from 'react';
import { noop, genZoneUid, _btnCls, FieldSelect, RoleCheck, GrpMultiSelect, MultiSelect, RingSelLite } from './settings-shared.jsx';

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
  /* #50 S3a — теги инстанса: маркеры-пауз A2 + тег-пикеры B1/B3 (реюз props.loadTags, как BacklogSection/#55). */
  const [pauseTagBundle, setPauseTagBundle] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    if (props.loadTags) {
      Promise.resolve(props.loadTags())
        .then((tags) => { if (alive && Array.isArray(tags)) setPauseTagBundle(tags); }).catch(noop);
    }
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* Значения Type-поля для B1/B2 (реактивно от живого выбора поля, как BacklogSection). */
  const [typeBundle, setTypeBundle] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    if (props.fieldTypeName && props.loadFieldValues) {
      Promise.resolve(props.loadFieldValues(props.fieldTypeName))
        .then((vals) => { if (alive && Array.isArray(vals)) setTypeBundle(vals); }).catch(noop);
    } else { setTypeBundle([]); }
    return () => { alive = false; };
  }, [props.fieldTypeName]); // eslint-disable-line react-hooks/exhaustive-deps
  /* A3 — кандидаты имён полей: state∪system-бакеты (enum/state/owned — всё, что читает _cfText). */
  const fbt = props.fieldsByType || {};
  const a3Names = (() => { const seen = {}; const out = [];
    [].concat(fbt.state || [], fbt.system || []).forEach((n) => { if (n && !seen[n]) { seen[n] = true; out.push(n); } });
    return out; })();
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
  /* v3.12.0 (#11) — A11 Velocity: окно среднего (закрытые спринты). Дефолт 3; пусто/<1 → 3; кламп 1..10. */
  const velocityWindowVal = (v.velocityWindow != null ? v.velocityWindow : 3);
  const setVelocityWindow = (raw) => {
    const s = String(raw).trim();
    let val = 3;
    if (s !== '') { const num = Math.round(Number(s)); if (isFinite(num) && num >= 1) val = num > 10 ? 10 : num; }
    patch({ velocityWindow: val });
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
  /* #58-5 шаг 2 — потолок задач среза (A3/A6/B1/B0). Дефолт 1000; кламп 200..5000; blur-commit
     (как timeoutSec: кламп на keystroke — input-trap, значения с первой цифрой 1 недостижимы). */
  const [maxIssuesRaw, setMaxIssuesRaw] = React.useState(null);
  const maxIssuesVal = (v.maxIssues != null ? v.maxIssues : 1000);
  const commitMaxIssues = () => {
    const s = String(maxIssuesRaw == null ? '' : maxIssuesRaw).trim();
    let val = 1000;
    if (s !== '') { const num = Math.round(Number(s)); if (isFinite(num) && num >= 200) val = num > 5000 ? 5000 : num; }
    patch({ maxIssues: val });
    setMaxIssuesRaw(null);
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

      {/* #58-5 шаг 2 — потолок задач среза A3/A6/B1/B0 (страницы по 200 до потолка). */}
      <div className="card-subtitle" style={subCls}>{t('repSetMaxIssues')}</div>
      <span className="hint" style={hintCls}>{t('repSetMaxIssuesHint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetMaxIssuesLabel')}</label>
          <input type="number" min="200" max="5000" step="100" style={numCell}
            value={maxIssuesRaw != null ? maxIssuesRaw : maxIssuesVal}
            onChange={(e) => setMaxIssuesRaw(e.target.value)} onBlur={commitMaxIssues} />
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
          <FieldSelect value={v.a3StageField || ''} names={a3Names}
            placeholder={t('phNotSelected')} onChange={(val) => patch({ a3StageField: val })} />
        </div>
        <div className="field">
          <label>{t('repSetA3Org')}</label>
          <FieldSelect value={v.a3OrgField || ''} names={a3Names}
            placeholder={t('phNotSelected')} onChange={(val) => patch({ a3OrgField: val })} />
        </div>
        <div className="field">
          <label>{t('repSetA3Priority')}</label>
          <FieldSelect value={v.a3PriorityField || ''} names={a3Names}
            placeholder={t('phNotSelected')} onChange={(val) => patch({ a3PriorityField: val })} />
        </div>
      </div>

      {/* #50 S6b — A6 Бэклог в ЧЧ: месячная ёмкость роли (ч/мес) — знаменатель «месяцев бэклога». */}
      <div className="card-subtitle" style={subCls}>{t('repSetA6')}</div>
      <span className="hint" style={hintCls}>{t('repSetA6Hint')}</span>
      {(props.activeRoles || []).length ? (
        <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
          {(props.activeRoles || []).map((r) => (
            <div className="field" key={r.key}>
              <label>{t('role.' + r.key)}</label>
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

      {/* v3.12.0 (#11) — A11 Velocity: окно скользящего среднего (закрытые спринты). Дефолт 3; кламп 1..10. */}
      <div className="card-subtitle" style={subCls}>{t('repSetA11')}</div>
      <span className="hint" style={hintCls}>{t('repSetA11Hint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetA11Window')}</label>
          <input type="number" min="1" max="10" step="1" style={numCell}
            value={velocityWindowVal} onChange={(e) => setVelocityWindow(e.target.value)} />
        </div>
      </div>

      {/* #50 S8b — B1 Техдолг (контур B): отбор техдолга = тип задачи ИЛИ тег (одно из двух, тип имеет приоритет). */}
      <div className="card-subtitle" style={subCls}>{t('repSetB1')}</div>
      <span className="hint" style={hintCls}>{t('repSetB1Hint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetB1Type')}</label>
          <FieldSelect value={v.techDebtType || ''} names={typeBundle}
            placeholder={t('phNotSelected')} onChange={(val) => patch({ techDebtType: val })} />
        </div>
        <div className="field">
          <label>{t('repSetB1Tag')}</label>
          <FieldSelect value={v.techDebtTag || ''} names={pauseTagBundle}
            placeholder={t('phNotSelected')} onChange={(val) => patch({ techDebtTag: val })} />
        </div>
      </div>

      {/* #50 S8c — B2 «Налог на баги» (контур B): тип задачи-бага + типы связей баг→фича (CSV). */}
      <div className="card-subtitle" style={subCls}>{t('repSetB2')}</div>
      <span className="hint" style={hintCls}>{t('repSetB2Hint')}</span>
      <div className="form-grid form-grid--2" style={{ marginTop: '8px' }}>
        <div className="field">
          <label>{t('repSetB2Type')}</label>
          <FieldSelect value={v.bugType || ''} names={typeBundle}
            placeholder={t('phNotSelected')} onChange={(val) => patch({ bugType: val })} />
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
          <FieldSelect value={v.thousandTag || ''} names={pauseTagBundle}
            placeholder={t('phNotSelected')} onChange={(val) => patch({ thousandTag: val })} />
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

export { ReportingSection, _repThToRows, _repA1ToRows, _repFlowToRows, _repNumOrNull, _repRowsToTh, _repRowsToA1, _repRowsToFlow };
