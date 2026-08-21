/* settings-standup.jsx — секция «StandupSection» формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx (декомпозиция по файлам);
   props-контракт секции не менялся — чистый перенос. */

import * as React from 'react';
import { MultiSelect, StateRolesTable } from './settings-shared.jsx';

function StandupSection(props) {
  const t = props.t;
  return (
    <React.Fragment>
      {/* 68-7 — стендап группирует по всем состояниям бандла; скрытие секций поимённо
          (вместе с их задачами). Done-пикер остался done-каноном отчётности (A10/spillover). */}
      {/* Маппинг «состояние → роли» — per-role фильтр секций: роль видит секции своих
          состояний + свои задачи в чужих — секцией «Прочие состояния»; пустой маппинг
          роли = без фильтра. Таблица общая с зонами бэклога (StateRolesTable);
          без ↑↓ — порядок секций диктует бандл. */}
      <div className="field">
        <label>{t('lblStandupStateRoles')}</label>
        <StateRolesTable
          t={t} rows={props.stateRoles || []} onChange={props.onStateRolesChange}
          bundleStates={props.bundleStates || []} roleOpts={props.activeRoles || []} orderable={false}
          labels={{
            state: t('lblBacklogZoneState'), roles: t('lblBacklogZoneRoles'),
            empty: t('standupStateRolesEmpty'), add: t('btnStandupAddStateRole'),
            remove: t('btnStandupRemoveStateRole'), noRoles: t('backlogNoActiveRoles'),
          }}
        />
        <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStandupStateRoles')}</div>
      </div>
      <div className="field" style={{ marginTop: '14px' }}>
        <label>{t('lblStandupHiddenStates')}</label>
        <MultiSelect options={props.bundleStates || []} selected={props.hidden || []} placeholder={props.t('phNotSelected')} onChange={props.onHiddenChange} />
        <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStandupHiddenStates')}</div>
      </div>
      <div className="field" style={{ marginTop: '14px' }}>
        <label>{t('lblStandupDoneStates')}</label>
        <MultiSelect options={props.bundleStates || []} selected={props.value || []} placeholder={props.t('phNotSelected')} onChange={props.onChange} />
        <div className="hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{t('hintStandupDoneStates')}</div>
      </div>
    </React.Fragment>
  );
}

/* ── Секция: #21 «Работа с бэклогом» ──
   Зоны пайплайна (состояние→роль(и), MANY, упорядочены) + стартовый пул + фильтр по
   типу + источник паузы. Контракт — backend-core.js validateSettings (state unique,
   roles⊆ROLE_KEYS, max 50). Шаблоны: таблица строк = DtaSection; reorder = StateRollupSection;
   роли per-row = inline-чекбоксы (активных ролей ≤9; MultiSelect не несёт label≠key). */
export { StandupSection };
