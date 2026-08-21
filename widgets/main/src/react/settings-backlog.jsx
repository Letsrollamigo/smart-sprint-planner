/* settings-backlog.jsx — секция «BacklogSection» формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx (декомпозиция по файлам);
   props-контракт секции не менялся — чистый перенос. */

import * as React from 'react';
import { noop, MultiSelect, StateRolesTable } from './settings-shared.jsx';

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

  return (
    <React.Fragment>
      {/* Зоны: состояние → роль(и) (MANY, упорядочены) — таблица 68-7 вынесена в
          settings-shared StateRolesTable (общая со стендап-маппингом), контракт 1:1. */}
      <div className="field">
        <label>{t('lblBacklogZones')}</label>
        <StateRolesTable
          t={t} rows={v.zones} onChange={(rows) => patch({ zones: rows })}
          bundleStates={bundleStates} roleOpts={roleOpts}
          labels={{
            state: t('lblBacklogZoneState'), roles: t('lblBacklogZoneRoles'),
            empty: t('backlogZonesEmpty'), add: t('btnBacklogAddZone'),
            remove: t('btnBacklogRemoveZone'), up: t('btnStateRollupUp'),
            down: t('btnStateRollupDown'), noRoles: t('backlogNoActiveRoles'),
          }}
        />
        {props.hasDup ? <div role="alert" className="hint" style={{ fontSize: '12px', color: 'var(--error)', marginTop: '8px', fontWeight: 500 }}>{t('backlogErrDupState')}</div> : null}
        <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>{t('hintBacklogZonesGate')}</div>{/* #69 R1 строка 10 — гейт узла по зонам */}
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

export { BacklogSection };
