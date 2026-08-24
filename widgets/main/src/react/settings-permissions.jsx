/* settings-permissions.jsx — секция «Управление правами» (#71): таблица
   «группа × полномочие» вместо 12 мультиселектов в трёх разных секциях.
   Ось Y — группы (добавление/удаление), ось X — 12 полномочий в трёх группах
   шапки; пояснение полномочия — всплывающая подсказка на заголовке колонки.

   Компонент — ТОЛЬКО рендер: вся логика (объединение строк, toggle, удаление,
   маркеры) живёт в pure/permissions-matrix-pure.js и покрыта юнитами. Значения
   пишутся в те же 12 слотов формы через setGroups/setRelease/setReporting —
   путь сохранения settings-form.collect() не меняется ни строкой (императив #71 п.2). */

import * as React from 'react';
import { RoleCheck, RingIcon, RingSelLite } from './settings-shared.jsx';

const MATRIX = () => globalThis.__SSP_PERMISSIONS_MATRIX_PURE;

/* Ring-класс кнопки-корзины — как moveBtnCls строк-редакторов настроек. */
const TRASH_BTN_CLS = 'ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly';

/* Подписи колонок и групп шапки. hint — существующий ключ (планировочная шестёрка)
   либо новый (релизы/отчётность); short — короткая подпись в шапку. */
const COL_I18N = {
  planning:   { short: 'permColPlanning',   hint: 'hintPlanningManagerGroup' },
  val:        { short: 'permColVal',        hint: 'hintValGroup' },
  edit:       { short: 'permColEdit',       hint: 'hintEditGroup' },
  histClear:  { short: 'permColHistClear',  hint: 'hintHistClearGroup' },
  assigner:   { short: 'permColAssigner',   hint: 'hintAssignerGroup' },
  sprintLock: { short: 'permColSprintLock', hint: 'hintSprintLockGroup' },
  candMgr:    { short: 'permColCandMgr',    hint: 'hintRelCandMgr' },
  candEng:    { short: 'permColCandEng',    hint: 'hintRelCandEng' },
  rightsMgr:  { short: 'permColRelMgr',     hint: 'hintRelMgr' },
  rightsEng:  { short: 'permColRelEng',     hint: 'hintRelEng' },
  repA:       { short: 'permColRepA',       hint: 'hintRepA' },
  repB:       { short: 'permColRepB',       hint: 'hintRepB' },
};
const GRP_I18N = { planning: 'permGrpPlanning', release: 'permGrpRelease', reporting: 'permGrpReporting' };

function PermissionsMatrix(props) {
  const t = props.t;
  const PURE = MATRIX();
  /* Стейт-бакеты формы приходят как есть; патчи уходят обратно теми же сеттерами. */
  const state = { groups: props.groups, release: props.release, reporting: props.reporting };
  const setBucket = { groups: props.onGroups, release: props.onRelease, reporting: props.onReporting };

  const [liveGroups, setLiveGroups] = React.useState(() => props.initialGroups || []);
  /* Строки, добавленные кнопкой и ещё не получившие ни одной галки: в слотах их нет,
     buildRows их не вернёт — держим отдельно и дописываем в конец (SPEC §1.1). */
  const [pendingRows, setPendingRows] = React.useState([]);

  React.useEffect(() => {
    let alive = true;
    if (props.loadGroups) {
      Promise.resolve(props.loadGroups())
        .then((gs) => { if (alive && Array.isArray(gs)) setLiveGroups(gs); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savedRows = PURE.buildRows(state, liveGroups);
  const savedKeys = {};
  savedRows.forEach((r) => { savedKeys[r.key] = true; });
  /* Строка, получившая галку, приходит уже из слотов — из pending её убираем при рендере
     (стейт чистится лениво: setState в рендере запрещён). */
  const rows = savedRows.concat(pendingRows.filter((r) => !savedKeys[r.key]));

  const availOpts = PURE.availableGroups(liveGroups, rows)
    .map((g) => ({ key: g.id, label: g.name }));

  const emptyRequired = PURE.emptyRequiredColumns(state);

  function addRow(groupId) {
    if (!groupId) return;
    const g = liveGroups.find((x) => String(x.id) === String(groupId));
    if (!g) return;
    const row = PURE.makeNewRow(g);
    if (rows.some((r) => r.key === row.key)) return;
    setPendingRows(pendingRows.concat([row]));
  }

  function toggle(row, colId) {
    const col = PURE.columnById(colId);
    const res = PURE.toggleCell(state, row, colId);
    if (res.overflow) { if (props.onMax) props.onMax(); return; }
    setBucket[col.bucket](Object.assign({}, state[col.bucket], { [col.key]: res.slot }));
  }

  function askRemove(row) {
    const n = PURE.countRights(state, row);
    const text = t('permDeleteConfirm')
      .replace('{group}', row.display)
      .replace('{n}', String(n));
    const modal = (typeof window !== 'undefined') && window.__SSP_RING_MODAL;
    if (!modal || typeof modal.open !== 'function') { doRemove(row); return; }
    modal.open({
      id: 'permDeleteGroup', type: 'destructive', title: t('permDeleteTitle'),
      body: { kind: 'text', text: text },
      buttons: [
        { id: 'cancel', text: t('btnCancel'), variant: 'secondary', onClick: (h) => h.close() },
        { id: 'confirm', text: t('btnYesDelete'), variant: 'danger', onClick: (h) => { h.close(); doRemove(row); } },
      ],
      dismissOnBackdrop: false, blockEscape: false, showCloseButton: false,
    });
  }

  function doRemove(row) {
    const patch = PURE.removeRow(state, row);
    Object.keys(patch).forEach((bucket) => {
      setBucket[bucket](Object.assign({}, state[bucket], patch[bucket]));
    });
    setPendingRows(pendingRows.filter((r) => r.key !== row.key));
  }

  /* Группа шапки «Релизы» притушена при выключенном модуле (#69 R1 строка 6 — dim,
     не hide; чекбоксы остаются активными). Отчётность в corp — disabled целиком
     (#64): значения показываются как сохранены и проходят сейв как есть. */
  const dimGroup = { planning: false, release: !props.releaseEnabled, reporting: !props.reportingEnabled };
  const disabledGroup = { planning: false, release: false, reporting: !!props.reportingDisabled };

  const grpSpan = { planning: 0, release: 0, reporting: 0 };
  PURE.PERMISSION_COLUMNS.forEach((c) => { grpSpan[c.group]++; });

  const thGrpCls = (g) => 'ssp-perm-grp' + (dimGroup[g] ? ' ssp-perm-grp--dim' : '')
    + (disabledGroup[g] ? ' ssp-perm-grp--off' : '');

  return (
    <React.Fragment>
      <span className="hint ssp-perm-lead">{t('permTableLead')}</span>

      <div className="ssp-perm-add">
        <RingSelLite
          options={availOpts} value="" placeholder={t('permAddGroup')}
          onChange={addRow}
        />
      </div>

      <div className="ssp-perm-scroll">
        <table className="ssp-dta-table ssp-perm-table">
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className="ssp-perm-th-name">{t('permColGroup')}</th>
              {PURE.COLUMN_GROUPS.map((g) => (
                <th key={g} scope="colgroup" colSpan={grpSpan[g]} className={thGrpCls(g)}>
                  {t(GRP_I18N[g])}
                  {disabledGroup[g] ? <span className="ssp-perm-off-tag">{t('permReportingOff')}</span> : null}
                </th>
              ))}
              <th rowSpan={2} className="ssp-perm-th-act"><span className="ssp-sr-only">{t('permColActions')}</span></th>
            </tr>
            <tr>
              {PURE.PERMISSION_COLUMNS.map((c) => {
                const tip = t(COL_I18N[c.id].hint);
                return (
                  <th key={c.id} scope="col" title={tip}
                      className={'ssp-perm-th' + (dimGroup[c.group] ? ' ssp-perm-grp--dim' : '')}>
                    <span>{t(COL_I18N[c.id].short)}</span>
                    {c.required ? <abbr className="ssp-perm-req" title={t('permRequiredMark')}>*</abbr> : null}
                    <span className="ssp-sr-only">{tip}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {props.settingsManagerGroupName ? (
              <tr className="ssp-perm-row ssp-perm-row--manager">
                <th scope="row" className="ssp-perm-name">
                  <RingIcon name="lock" />
                  <span className="ssp-perm-name-text">{props.settingsManagerGroupName}</span>
                </th>
                <td colSpan={PURE.PERMISSION_COLUMNS.length} className="ssp-perm-manager-cell">
                  {t('permManagerAll')}
                </td>
                <td />
              </tr>
            ) : null}

            {rows.map((row) => (
              <tr key={row.key} className="ssp-perm-row">
                <th scope="row" className="ssp-perm-name">
                  <span className="ssp-perm-name-text">{row.display}</span>
                  {row.orphan ? <span className="ssp-perm-mark" title={t('permOrphanHint')}><RingIcon name="warning" /><span className="ssp-sr-only">{t('permOrphanHint')}</span></span> : null}
                  {row.allUsers ? <span className="ssp-perm-mark" title={t('permAllUsersHint')}><RingIcon name="warning" /><span className="ssp-sr-only">{t('permAllUsersHint')}</span></span> : null}
                  {PURE.countRights(state, row) === 0 ? <span className="ssp-perm-none">{t('permNoRights')}</span> : null}
                </th>
                {PURE.PERMISSION_COLUMNS.map((c) => {
                  const off = disabledGroup[c.group];
                  return (
                    <td key={c.id} className={'ssp-perm-cell' + (dimGroup[c.group] ? ' ssp-perm-grp--dim' : '')}>
                      <RoleCheck
                        on={PURE.isChecked(state, row, c.id)} disabled={off}
                        ariaLabel={row.display + ': ' + t(COL_I18N[c.id].short)}
                        onToggle={() => toggle(row, c.id)}
                      />
                    </td>
                  );
                })}
                <td className="ssp-perm-act">
                  <button type="button" className={TRASH_BTN_CLS} title={t('permDeleteRow')}
                          onClick={() => askRemove(row)}>
                    <RingIcon name="trash" />
                    <span className="ssp-sr-only">{t('permDeleteRow')}</span>
                  </button>
                </td>
              </tr>
            ))}

            {!rows.length ? (
              <tr><td colSpan={PURE.PERMISSION_COLUMNS.length + 2} className="ssp-perm-empty">{t('permTableEmpty')}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {props.settingsManagerGroupName
        ? <span className="hint ssp-perm-mgr-note">{t('permManagerNote')}</span> : null}

      {/* Предохранитель: обязательная колонка без единой группы. Сейв НЕ блокируется —
          пусто разрешено и сегодня (deny-by-default), предупреждаем об эффекте. */}
      {emptyRequired.map((colId) => (
        <div key={colId} role="alert" className="ssp-perm-warn">
          <RingIcon name="warning" />
          {t(colId === 'edit' ? 'permWarnEmptyEdit' : 'permWarnEmptyVal')}
        </div>
      ))}
    </React.Fragment>
  );
}

export { PermissionsMatrix };
