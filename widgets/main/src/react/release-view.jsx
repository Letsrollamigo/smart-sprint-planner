/* release-view.jsx — #48 React-презентация вкладок релиз-менеджмента (строго Ring UI).
   Доменная логика (load/filter/persist) — в domain/release-view.js: она строит view-model и
   зовёт мост mountAt(host, vm) / unmountAt(host). Канон — capacity-view.jsx.

   🔴 Правило проекта (CLAUDE_SHARED §3): контролы Ring; статус-бейдж/чипы — <span> с CSS-классом
   (в vendored-сабсете нет Tag/Badge — как капасити). Дизайн карточки — design/mirror/release/
   planned-card.html (H1-H7 + reps; светофор/дерево/действия — R1.4/R3/R1.5, за фичами). */

import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _mounted = new WeakMap(); // host element → React root (по одному на хост)

function _initials(s) {
  var t = String(s || '').trim();
  if (!t) return '—';
  var parts = t.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

function Rep({ role, login, name, variant }) {
  return (
    <div className="ssp-release-rep">
      <span className={'ssp-release-rep__ava' + (variant === 'e' ? ' ssp-release-rep__ava--e' : '')}>{_initials(name || login)}</span>
      <span className="ssp-release-rep__body">
        <span className="ssp-release-rep__name">{name || login}</span>
        <small className="ssp-release-rep__role">{role}</small>
      </span>
    </div>
  );
}

/* #polish — кликабельная ссылка на внешнюю задачу релиза. Рендерим <a> ТОЛЬКО для http(s)
   (защита от javascript:/data: — XSS на пользовательском вводе); иначе показываем текстом. */
function TaskLink({ url, L }) {
  if (!url) return null;
  const safe = /^https?:\/\//i.test(url) ? url : null;
  return (
    <React.Fragment>
      <div className="ssp-release-hist__sect">{L.taskUrl}</div>
      <div className="ssp-release-hist__pre">
        {safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{url}</a> : url}
      </div>
    </React.Fragment>
  );
}

/* R3.1 — светофор готовности: сегментная полоса + легенда со счётчиками (4 зоны, макет
   design/mirror/release/planned-card.html .tl-full). readiness = {green,yellow,red,grey};
   пустой состав → не рендерим. Живой (карточка) и frozen (история из snapshot) — один компонент. */
const _ZONES = ['green', 'yellow', 'red', 'grey'];
function TrafficLight({ readiness, L }) {
  const r = readiness || {};
  const total = _ZONES.reduce((n, z) => n + (r[z] > 0 ? r[z] : 0), 0);
  if (!total) return null;
  return (
    <div className="ssp-release-tl">
      <div className="ssp-release-tl__title">{L.readinessTitle}</div>
      <div className="ssp-release-tl__row">
        <span className="ssp-release-tl__bar">
          {_ZONES.map((z) => (r[z] > 0
            ? <i key={z} className={'ssp-release-tl__seg ssp-release-z--' + z} style={{ width: (r[z] / total * 100) + '%' }} />
            : null))}
        </span>
        <span className="ssp-release-tl__legend">
          {_ZONES.map((z) => (
            <span key={z} className="ssp-release-tl__item">
              <i className={'ssp-release-tl__dot ssp-release-z--' + z} />{L.zone[z]} <b>{r[z] > 0 ? r[z] : 0}</b>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/* R3.2 — свод узла-родителя: точки зон с ненулевыми счётчиками + «· N задач» (по листьям
   поддерева, макет .tree .agg). */
function AggBadge({ agg, L }) {
  return (
    <span className="ssp-release-tree__agg">
      {L.treeAggPrefix}{' '}
      {_ZONES.map((z) => (agg[z] > 0
        ? <span key={z} className="ssp-release-tree__aggitem"><i className={'ssp-release-tl__dot ssp-release-z--' + z} title={L.zone[z]} />{agg[z]}</span>
        : null))}
      {' · '}{L.treeAggTasks.replace('{n}', String(agg.total))}
    </span>
  );
}

/* R3.2 (US-R3-04) — дерево состава (эпик→стори→таска, макет planned-card.html .tree):
   flatten-строки pure-билдера; carets на узлах с детьми (локальный collapse — потомки
   прячутся по ancestors), точка зоны у каждого узла, бейдж типа у родителей, свод у
   родителей / State у листьев, orphan-подпись перед хвостом «без родителя в составе».
   Один компонент на live-карточку и frozen-историю (rows готовит VM). */
function TreeSection({ tree, L, onRemove }) {
  const [collapsed, setCollapsed] = React.useState({});
  if (!tree || !tree.rows || !tree.rows.length) return null;
  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const firstOrphan = tree.rows.findIndex((row) => row.orphan);
  return (
    <div className="ssp-release-tree">
      {tree.rows.map((row, i) => {
        if (row.ancestors.some((a) => collapsed[a])) return null;
        return (
          <React.Fragment key={row.id}>
            {i === firstOrphan ? <div className="ssp-release-tree__orphanh">{L.treeOrphans}</div> : null}
            <div className="ssp-release-tree__row" style={row.depth ? { paddingLeft: (row.depth * 22) + 'px' } : null}>
              {row.hasChildren ? (
                <button type="button" className="ssp-release-tree__caret" aria-expanded={!collapsed[row.id]}
                  onClick={() => toggle(row.id)}>{collapsed[row.id] ? '▸' : '▾'}</button>
              ) : <span className="ssp-release-tree__caret" aria-hidden="true" />}
              <i className={'ssp-release-tl__dot ssp-release-z--' + (row.zone || 'grey')} title={L.zone[row.zone] || L.zone.grey} />
              {row.hasChildren && row.type ? <span className="ssp-release-tree__kind">{row.type}</span> : null}
              <span className="ssp-release-tree__id">{row.id}</span>
              <span className="ssp-release-tree__sum">{row.summary || '—'}</span>
              {row.agg ? <AggBadge agg={row.agg} L={L} /> : <span className="ssp-release-tree__state">{row.state || '—'}</span>}
              {/* #57-1 — удаление задачи из состава (только canManage && !фриз && !терминальный).
                  ⚖ владелец: корзинка-канон (SVG trash из __SSP_ICONS + iconOnly ghost flat — как
                  history-view/rolecomposition), модалка destructive — в контроллере. */}
              {onRemove ? (
                <button type="button"
                  className="ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly ssp-release-tree__rm"
                  title={L.removeIssue} aria-label={L.removeIssue + ' ' + row.id}
                  onClick={() => onRemove(row.id)}>
                  <span aria-hidden="true" style={{ display: 'inline-flex' }}
                    dangerouslySetInnerHTML={{ __html: ((typeof window !== 'undefined' && window.__SSP_ICONS) || {}).trash || '✕' }} />
                </button>
              ) : null}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* Состав релиза: счётчик (клик — раскрытие) → дерево состава (Ring Collapse; R3.2 —
   дерево вместо плоской таблицы). 0 задач → только счётчик. */
function CompositionSection({ r, L, onRemoveIssue }) {
  const V = globalThis.SSP_VENDORED || {};
  const Collapse = V.Collapse, Ctrl = V.CollapseControl, Content = V.CollapseContent;
  const [open, setOpen] = React.useState(false);
  const hasTasks = !!(r.tree && r.tree.rows && r.tree.rows.length);
  if (!hasTasks) {
    return <div className="ssp-release-card__composition ssp-release-card__composition--empty">
      <span className="ssp-release-comp__toggle">{r.compositionLabel}</span>
    </div>;
  }
  const head = (
    <span className="ssp-release-comp__toggle" role="button" tabIndex={0} aria-expanded={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}>
      <span className="ssp-release-comp__caret">{open ? '▾' : '▸'}</span>{r.compositionLabel}
    </span>
  );
  const body = <TreeSection tree={r.tree} L={L} onRemove={onRemoveIssue ? (id) => onRemoveIssue(r.id, id) : null} />;
  if (!Collapse || !Ctrl || !Content) {
    return <div className="ssp-release-card__composition">{head}{body}</div>;
  }
  return (
    <div className="ssp-release-card__composition">
      <Collapse collapsed={!open} onChange={() => setOpen((o) => !o)}>
        <Ctrl>{head}</Ctrl>
        <Content>{body}</Content>
      </Collapse>
    </div>
  );
}

/* R2.4 (US-R2-11/12): canManage (РМ) — правка/удаление/состав/фриз; canAdvance (РМ|РИ) —
   смена статуса + обновление состояний; наблюдатель — карточка без контролов. */
function ReleaseCard({ r, L, canManage, canAdvance, onAddIssues, onStatusMenu, onStatePreview, onRollbackPreview, onToggleFreeze, onEdit, onDelete, onExport, onShare, onRemoveIssue }) {
  return (
    <li className="ssp-release-card">
      <div className="ssp-release-card__head">
        <span className="ssp-release-card__title">{r.name}</span>
        {r.kind ? <span className={'ssp-release-chip ssp-release-chip--kind' + (r.kind === 'hotfix' ? ' ssp-release-chip--hotfix' : '')}>{L.kind[r.kind] || r.kind}</span> : null}
        {r.source ? <span className="ssp-release-chip ssp-release-chip--src">{L.src[r.source] || r.source}</span> : null}
        <span className={'ssp-release-status ssp-release-status--' + r.status}>{L.status[r.status] || r.status}</span>
        {r.overdue ? <span className="ssp-release-status ssp-release-status--overdue">{L.status.overdue}</span> : null}
        {/* R4 (US-R4-01) — экспорт .txt: read-only действие, доступно всем ролям */}
        <button type="button"
          className="ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly ssp-release-card__export"
          title={L.export} aria-label={L.export} onClick={() => onExport(r.id)}>⤓</button>
        {canManage ? (
          <button type="button"
            className="ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly ssp-release-card__edit"
            title={L.edit} aria-label={L.edit} onClick={() => onEdit(r.id)}>✎</button>
        ) : null}
        {canManage ? (
          <button type="button"
            className="ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly ssp-release-card__del"
            title={L.delete} aria-label={L.delete} onClick={() => onDelete(r.id)}>✕</button>
        ) : null}
      </div>
      {(r.planDateLabel || r.freezeDateLabel || r.freezeLocked) ? (
        <div className="ssp-release-card__meta">
          {r.planDateLabel ? <span>{L.planDate}: {r.planDateLabel}</span> : null}
          {r.freezeDateLabel ? <span>{L.freezeDate}: {r.freezeDateLabel}</span> : null}
          {r.freezeLocked ? <span className="ssp-release-card__frozen">❄ {L.frozenBadge}</span> : null}
        </div>
      ) : null}
      {(r.manager || r.engineer) ? (
        <div className="ssp-release-card__reps">
          {r.manager ? <Rep role={L.manager} login={r.manager} name={r.managerName} variant="m" /> : null}
          {r.engineer ? <Rep role={L.engineer} login={r.engineer} name={r.engineerName} variant="e" /> : null}
        </div>
      ) : null}
      <TrafficLight readiness={r.readiness} L={L} />
      {/* R4-ревью владельца — патчноут и на планируемой карточке (классы sect/pre общие с историей) */}
      {r.patchNote ? (
        <React.Fragment>
          <div className="ssp-release-hist__sect">{L.patchNote}</div>
          <div className="ssp-release-hist__pre">{r.patchNote}</div>
        </React.Fragment>
      ) : null}
      {/* #polish — заметки тоже на планируемой карточке (раньше только в ✎) */}
      {r.notes ? (
        <React.Fragment>
          <div className="ssp-release-hist__sect">{L.notes}</div>
          <div className="ssp-release-hist__pre">{r.notes}</div>
        </React.Fragment>
      ) : null}
      <TaskLink url={r.taskUrl} L={L} />
      {/* #57-1 — ✕ в составе: РМ, не фриз, не терминальный (терминальные и так в истории) */}
      <CompositionSection r={r} L={L}
        onRemoveIssue={canManage && !r.freezeLocked && r.status !== 'released' && r.status !== 'cancelled' ? onRemoveIssue : null} />
      {canAdvance ? (
        <div className="ssp-release-card__actions">
          <button type="button"
            className="ring-button-button ring-button-block ring-button-heightS ssp-release-card__status"
            onClick={() => onStatusMenu(r.id)}>{L.statusChange} ▾</button>
          {r.issuesCount > 0 ? (
            <button type="button"
              className="ring-button-button ring-button-block ring-button-heightS ssp-release-card__states"
              onClick={() => onStatePreview(r.id)}>{L.updateStates}</button>
          ) : null}
          {/* #57-3 — откат последнего перехода по истории поля State (без снапшота) */}
          {r.issuesCount > 0 ? (
            <button type="button"
              className="ring-button-button ring-button-block ring-button-heightS ssp-release-card__rollback"
              onClick={() => onRollbackPreview(r.id)}>{L.rollbackStates}</button>
          ) : null}
          {canManage ? (
            <button type="button"
              className="ring-button-button ring-button-block ring-button-heightS ssp-release-card__freeze"
              onClick={() => onToggleFreeze(r.id)}>{r.freezeLocked ? L.unfreeze : '❄ ' + L.freeze}</button>
          ) : null}
          {/* R4 (US-R4-03, E-2) — share вендорского: shareVisible=false до YT 2026.1 (negative-якорь) */}
          {canManage && r.shareVisible ? (
            <button type="button"
              className="ring-button-button ring-button-block ring-button-heightS ssp-release-card__share"
              onClick={() => onShare(r.id)}>{L.share}</button>
          ) : null}
          {canManage && !r.freezeLocked ? <PrimaryBtn label={L.addIssues} onClick={() => onAddIssues(r.id)} /> : null}
        </div>
      ) : null}
    </li>
  );
}

/* История (US-R1-13/14): спойлер-слепок закрытого релиза. CSS-паттерн .spoiler (🟡 reuse,
   класс `open` из index.html), read-only, всё из snapshot. Клавиатура: Enter/Space. */
function HistorySpoiler({ r, L, onExport }) {
  const [open, setOpen] = React.useState(false);
  const toggle = () => setOpen((o) => !o);
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
  return (
    <div className={'spoiler' + (open ? ' open' : '')}>
      <div className="spoiler__head" role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={onKey}>
        <span className="ssp-release-hist__head">
          <span className="ssp-release-card__title">{r.name}</span>
          {r.kind ? <span className={'ssp-release-chip ssp-release-chip--kind' + (r.kind === 'hotfix' ? ' ssp-release-chip--hotfix' : '')}>{L.kind[r.kind] || r.kind}</span> : null}
          {r.source ? <span className="ssp-release-chip ssp-release-chip--src">{L.src[r.source] || r.source}</span> : null}
          <span className={'ssp-release-status ssp-release-status--' + r.status}>{L.status[r.status] || r.status}</span>
          {r.wasOverdue ? <span className="ssp-release-status ssp-release-status--overdue">{L.wasOverdue}</span> : null}
          <span className="ssp-release-hist__dates">
            {r.planDateLabel ? <span>{L.planDate}: {r.planDateLabel}</span> : null}
            {r.closedAtLabel ? <span>{L.closedAt}: {r.closedAtLabel}</span> : null}
          </span>
        </span>
        <span className="spoiler__arrow" aria-hidden="true">▶</span>
      </div>
      <div className="spoiler__body">
        <div className="ssp-release-hist__bodypad">
          {(r.managerName || r.engineerName) ? (
            <div className="ssp-release-hist__reps">
              {r.managerName ? <span>{L.manager}: {r.managerName}</span> : null}
              {r.engineerName ? <span>{L.engineer}: {r.engineerName}</span> : null}
            </div>
          ) : null}
          <TrafficLight readiness={r.readiness} L={L} />
          {/* R4 полировка — замороженные закрытием патчноут/заметки */}
          {r.patchNote ? (
            <React.Fragment>
              <div className="ssp-release-hist__sect">{L.patchNote}</div>
              <div className="ssp-release-hist__pre">{r.patchNote}</div>
            </React.Fragment>
          ) : null}
          {r.notes ? (
            <React.Fragment>
              <div className="ssp-release-hist__sect">{L.notes}</div>
              <div className="ssp-release-hist__pre">{r.notes}</div>
            </React.Fragment>
          ) : null}
          <TaskLink url={r.taskUrl} L={L} />
          <div className="ssp-release-hist__sect">{L.composition} ({r.issuesCount})</div>
          {/* R3.2 — frozen-дерево из parentId слепка (легаси без parentId → плоско) */}
          {(r.tree && r.tree.rows.length) ? <TreeSection tree={r.tree} L={L} /> : <div className="ssp-release-hist__empty">—</div>}
          {/* R4 (US-R4-01) — экспорт слепка в .txt */}
          <div className="ssp-release-hist__actions">
            <button type="button"
              className="ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ssp-release-hist__export"
              onClick={() => onExport(r.id)}>⤓ {L.export}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* R4 (US-R4-02) — спойлер «Архив (N)» в хвосте истории: старые закрытые релизы,
   свёрнутые бэкендом при росте стора. Read-only, lazy-fetch по первому раскрытию. */
function ArchiveSection({ archive, L, onLoadArchive, onExport }) {
  const [open, setOpen] = React.useState(false);
  if (!archive || !archive.count) return null;
  const toggle = () => setOpen((o) => {
    if (!o && !archive.loaded) onLoadArchive();
    return !o;
  });
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
  return (
    <div className={'spoiler ssp-release-archive' + (open ? ' open' : '')}>
      <div className="spoiler__head" role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={onKey}>
        <span className="ssp-release-hist__head">
          <span className="ssp-release-card__title">{L.archiveNode} ({archive.count})</span>
        </span>
        <span className="spoiler__arrow" aria-hidden="true">▶</span>
      </div>
      <div className="spoiler__body">
        <div className="ssp-release-hist__bodypad">
          {archive.loaded
            ? (archive.rows.length
              ? archive.rows.map((r) => <HistorySpoiler key={r.id} r={r} L={L} onExport={onExport} />)
              : <div className="ssp-release-hist__empty">—</div>)
            : <div className="ssp-release-hist__empty">…</div>}
        </div>
      </div>
    </div>
  );
}

/* Единая primary Ring-кнопка — одинаковый стиль для «Создать релиз» и «+ Задачи». */
function PrimaryBtn({ label, onClick }) {
  return (
    <button type="button"
      className="ring-button-button ring-button-block ring-button-heightS ring-button-primaryBlock ring-button-flat ring-button-whiteText"
      onClick={() => onClick()}>{label}</button>
  );
}

function ReleaseInner({ vm }) {
  const L = vm.labels;
  const histHasArchive = vm.mode === 'history' && vm.archive && vm.archive.count > 0; // R4 — вся история может уехать в архив
  if (!vm.releases.length && !histHasArchive) {
    return (
      <div className="ssp-empty">
        <div className="ssp-empty__title">{vm.mode === 'history' ? L.historyTitle : L.emptyTitle}</div>
        {vm.canCreate ? <div className="ssp-empty__desc">{L.emptyHint}</div> : null}
        {vm.canCreate ? <div className="ssp-empty__cta"><PrimaryBtn label={L.create} onClick={vm.onCreate} /></div> : null}
      </div>
    );
  }
  if (vm.mode === 'history') {
    return (
      <div className="ssp-release-root">
        <div className="ssp-release-hist-list">
          {vm.releases.map((r) => <HistorySpoiler key={r.id} r={r} L={L} onExport={vm.onExport} />)}
          <ArchiveSection archive={vm.archive} L={L} onLoadArchive={vm.onLoadArchive} onExport={vm.onExport} />
        </div>
      </div>
    );
  }
  return (
    <div className="ssp-release-root">
      {vm.canCreate ? <div className="ssp-release-toolbar"><PrimaryBtn label={L.create} onClick={vm.onCreate} /></div> : null}
      <ul className="ssp-release-list">
        {vm.releases.map((r) => <ReleaseCard key={r.id} r={r} L={L} canManage={vm.canManage} canAdvance={vm.canAdvance} onAddIssues={vm.onAddIssues} onStatusMenu={vm.onStatusMenu} onStatePreview={vm.onStatePreview} onRollbackPreview={vm.onRollbackPreview} onToggleFreeze={vm.onToggleFreeze} onEdit={vm.onEdit} onDelete={vm.onDelete} onExport={vm.onExport} onShare={vm.onShare} onRemoveIssue={vm.onRemoveIssue} />)}
      </ul>
    </div>
  );
}

/* Хост-биндинг: перерендер по bump'у data-vm-key; внутренний инстанс ре-маунтится по key
   на смене versionTag (сброс локального стейта). Канон CapacityPanel. */
function ReleasePanel({ host }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const obs = new MutationObserver(() => force());
    obs.observe(host, { attributes: true, attributeFilter: ['data-vm-key'] });
    return () => obs.disconnect();
  }, [host]);
  const vm = host.__sspReleaseVm;
  if (!vm) return null;
  return <ReleaseInner key={String(vm.mode) + ':' + String(vm.versionTag)} vm={vm} />;
}

window.__SSP_RELEASE_MOUNT = {
  mountAt(host, vm) {
    if (!host) return;
    host.__sspReleaseVm = vm || null;
    if (_mounted.has(host)) {
      host.dataset.vmKey = String((parseInt(host.dataset.vmKey || '0', 10) || 0) + 1);
      return;
    }
    const root = ReactDOMClient.createRoot(host);
    root.render(<ReleasePanel host={host} />);
    _mounted.set(host, root);
  },
  unmountAt(host) {
    if (!host) return;
    const root = _mounted.get(host);
    if (!root) return;
    try { root.unmount(); } catch (_) { /* sandbox teardown may throw */ }
    _mounted.delete(host);
    try { delete host.__sspReleaseVm; } catch (_) { /* noop */ }
  },
};
