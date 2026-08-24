/* settings-release.jsx — секция «ReleaseSection» формы настроек.
   R6 (аудит §7 п.13) — вынесено из settings-form.jsx (декомпозиция по файлам);
   props-контракт секции не менялся — чистый перенос. */

import * as React from 'react';
import { noop, RoleCheck, RingSelLite } from './settings-shared.jsx';

function ReleaseSection(props) {
  const t = props.t;
  const v = props.value;
  const set = props.onChange;
  const bundleStates = props.bundleStates || [];
  const patch = (p) => set(Object.assign({}, v, p));
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

  return (
    <React.Fragment>
      <RoleCheck on={v.enabled} label={t('relSetEnable')} onToggle={() => patch({ enabled: !v.enabled })} />
      {/* #69 R1 (строка 6) — подполя при выключенном модуле притушены, не скрыты. */}
      <div className={v.enabled ? '' : 'ssp-subfields--dim'}>

      {/* #71 — пул кандидатов (D-D2) и группы прав переехали в «Управление правами»
          колонками матрицы «группа × полномочие»; слоты стейта остались здесь
          (candMgr/candEng/rightsMgr/rightsEng) — путь сохранения не менялся. */}

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
      </div>
    </React.Fragment>
  );
}

export { ReleaseSection };
