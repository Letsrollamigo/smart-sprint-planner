/* settings-release.jsx — секция «ReleaseSection» формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx (декомпозиция по файлам);
   props-контракт секции не менялся — чистый перенос. */

import * as React from 'react';
import { noop, RoleCheck, GrpMultiSelect, RingSelLite } from './settings-shared.jsx';

function ReleaseSection(props) {
  const t = props.t;
  const v = props.value;
  const set = props.onChange;
  const bundleStates = props.bundleStates || [];
  const patch = (p) => set(Object.assign({}, v, p));
  const setGrp = (k, val) => patch({ [k]: val });
  const setMap = (status, val) => patch({ mapping: Object.assign({}, v.mapping, { [status]: val }) });
  const setTagMap = (status, val) => patch({ tagMapping: Object.assign({}, v.tagMapping, { [status]: val }) });

  /* #55 — теги инстанса для колонки «Тег задач» (кэш сессии формы — props.loadTags). */
  const [tagOpts, setTagOpts] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    if (props.loadTags) {
      Promise.resolve(props.loadTags())
        .then((tags) => { if (alive && Array.isArray(tags)) setTagOpts(tags.map((name) => ({ key: name, label: name }))); }) /* loadProjectTags → массив ИМЁН */
        .catch(noop);
    }
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stateOpts = bundleStates.map((s) => ({ key: s, label: s }));
  const STATUS_ROWS = [
    { k: 'planned',   lbl: t('relStatusPlanned') },
    { k: 'prep',      lbl: t('relStatusPrep') },
    { k: 'work',      lbl: t('relStatusWork') },
    { k: 'released',  lbl: t('relStatusReleased') },
    { k: 'cancelled', lbl: t('relStatusCancelled') },
  ];
  const subCls = { fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '16px', marginBottom: '8px' };
  const hintCls = { fontSize: '12px', color: 'var(--muted)', marginTop: '6px', display: 'block' };
  const grpRow = (key, label) => (
    <div className="field" style={{ marginBottom: '12px' }} key={key}>
      <label>{label}</label>
      <GrpMultiSelect t={t} value={v[key]} onChange={(val) => setGrp(key, val)}
        initialGroups={props.initialGroups} loadGroups={props.loadGroups} onMax={props.onMax} />
    </div>
  );

  return (
    <React.Fragment>
      <RoleCheck on={v.enabled} label={t('relSetEnable')} onToggle={() => patch({ enabled: !v.enabled })} />

      {/* Пул кандидатов представителей (D-D2 — отдельно от групп прав) */}
      <div className="card-subtitle" style={subCls}>{t('relSetCandGroups')}</div>
      {grpRow('candMgr', t('relSetCandManagers'))}
      {grpRow('candEng', t('relSetCandEngineers'))}

      {/* Группы прав */}
      <div className="card-subtitle" style={subCls}>{t('relSetRightsGroups')}</div>
      {grpRow('rightsMgr', t('relSetRightsManagers'))}
      {grpRow('rightsEng', t('relSetRightsEngineers'))}

      {/* Маппинг «статус релиза → целевое состояние задач» (применение — R2) */}
      <div className="card-subtitle" style={subCls}>{t('relSetMappingTitle')}</div>
      <table className="ssp-dta-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th scope="col" style={{ width: '32%' }}>{t('relSetMappingColStatus')}</th>
          <th scope="col">{t('relSetMappingColState')}</th>
          {/* #55 — авто-тег задач при входе в статус */}
          <th scope="col">{t('relSetMappingColTag')}</th>
        </tr></thead>
        <tbody>
          {STATUS_ROWS.map((r) => (
            <tr key={r.k}>
              <td>{r.lbl}</td>
              <td>
                <RingSelLite options={stateOpts} value={v.mapping[r.k] || ''} clearable
                  placeholder={t('relSetMappingNoChange')} onChange={(val) => setMap(r.k, val)} />
              </td>
              <td>
                <RingSelLite options={tagOpts} value={(v.tagMapping && v.tagMapping[r.k]) || ''} clearable
                  placeholder={t('relSetTagNone')} onChange={(val) => setTagMap(r.k, val)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* R3.1 — двойная роль маппинга: R2 пишет State, строка «Запланирован» якорит красную зону светофора */}
      <span className="hint" style={hintCls}>{t('relSetMappingAnchorNote')}</span>
      {/* #55 — семантика авто-тегов: снимается тег предыдущего статуса, ставится нового; только существующие теги */}
      <span className="hint" style={hintCls}>{t('relSetTagMappingNote')}</span>

      {/* Тип релиза — фиксированная таксономия 2×2 (инфо, не настраивается) */}
      <div className="card-subtitle" style={subCls}>{t('relSetTypeTitle')}</div>
      <div className="form-grid form-grid--2">
        <div><b>{t('relKindLabel')}:</b> {t('relKindRelease')} · {t('relKindHotfix')}</div>
        <div><b>{t('relSrcLabel')}:</b> {t('relSrcInternal')} · {t('relSrcVendor')}</div>
      </div>
      <span className="hint" style={hintCls}>{t('relSetTypeFixedNote')}</span>
    </React.Fragment>
  );
}

/* #50 — «Отчётность» (admin-тир). S1: мастер-тумблер + reporting-access группы контуров
   A (лиды) / B (руководство, B⊇A). Данные чувствительны → доступ по членству, не опционален.
   Пороги/паузы/сегментация — со своими вью (S1c+), здесь пока нет.
   value = { enabled, groupsA:{ids,names}, groupsB:{ids,names} }. */
/* #50 — статусные секции отчётности: конвертеры каноническая-модель ↔ строки-редактора.
   UI = список строк [{_uid, state, …сателлит}] (пикер из бандла + добавить/удалить, как зоны
   бэклога #21); хранимая модель прежняя (пороги-объект / цели-массив+ярлыки / поток-массив). */
export { ReleaseSection };
