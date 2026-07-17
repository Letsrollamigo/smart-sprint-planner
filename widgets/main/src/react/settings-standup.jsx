/* settings-standup.jsx — секция «StandupSection» формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx (декомпозиция по файлам);
   props-контракт секции не менялся — чистый перенос. */

import * as React from 'react';
import { MultiSelect } from './settings-shared.jsx';

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
export { StandupSection };
