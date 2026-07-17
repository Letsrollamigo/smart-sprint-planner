/* settings-backlog.jsx — секция «BacklogSection» формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx (декомпозиция по файлам);
   props-контракт секции не менялся — чистый перенос. */

import * as React from 'react';
import { noop, genZoneUid, _btnCls, MultiSelect, RingSelLite } from './settings-shared.jsx';

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
export { BacklogSection };
