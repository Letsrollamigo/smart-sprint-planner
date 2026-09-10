/* react/reminders-body.jsx — #112 «Напоминания»: тело модалки remindersBody для openModal(body.kind:'component').
   Вынесено из modal-bodies.jsx (S5, v3.41.0 — файл упёрся в порог «жирных» A3). Держит своё состояние
   (вкладка, загруженный журнал), рисует секции активных пунктов и таблицу журнала; данные и действия
   приходят пропсами из infra/modal-specs.js (vm, journal.load/remove, тексты). Импортируется в index.js
   ПОСЛЕ modal-mount.jsx (мост __SSP_RING_MODAL уже существует). */

import * as React from 'react';

const noop = () => {};
/* Класс secondary-кнопки Ring (как _btnCls('secondary') в modal-bodies.jsx) */
const BTN_SECONDARY = 'ring-button-button ring-button-block ring-button-heightS';

/* ── remindersBody — #112 модалка напоминаний: секции по модулям (Спринты → Ёмкость → Релизы,
   макет design/mirror/reminders/modal.html вариант А), у пункта одна кнопка «Перейти»
   (props.onGo(item) → контроллер закрывает модалку и навигирует). Тексты приходят готовыми
   из pure/reminders-pure.js (pre / выделенный days / post — React-текст, не HTML). Пустой
   список — заглушка (открытие колокольчиком при нуле пунктов). S5: по колокольчику — вкладки
   «Активные (N) | Журнал» (props.withJournal + props.journal), при загрузке — без. ── */
/* S5 — вкладка «Журнал» (макет journal.html): ленивая загрузка раз на открытие через props.journal.load(),
   корзина → props.journal.remove(id) → список из ответа; отказ тостит контроллер, строки не трогаем. */
function RemindersJournal(props) {
  const texts = props.texts || {};
  const [st, setSt] = React.useState({ state: 'loading', vm: null });
  React.useEffect(() => {
    let alive = true;
    props.journal.load().then((vm) => { if (alive) setSt({ state: 'ok', vm }); }, () => { if (alive) setSt({ state: 'error', vm: null }); });
    return () => { alive = false; };
  }, []);
  const del = (id) => props.journal.remove(id).then((vm) => setSt({ state: 'ok', vm }), noop);
  if (st.state === 'loading') { const Loader = (globalThis.SSP_VENDORED || {}).LoaderInline; return Loader ? <Loader /> : <p className="ssp-modal-body-text">…</p>; }
  if (st.state === 'error') return <p className="ssp-modal-body-text ssp-reminders__empty">{texts.loadError}</p>;
  const rows = st.vm.rows || [];
  const trash = ((typeof window !== 'undefined' && window.__SSP_ICONS) || {}).trash || '✕';
  return (
    <React.Fragment>
      {rows.length ? (
        <table className="ssp-reminders__table">
          <thead><tr><th>{texts.fired}</th><th>{texts.module}</th><th>{texts.entity}</th><th>{texts.resolved}</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-ssp-jrn-id={r.id}>
                <td>{r.fired}</td>
                <td><span className="ssp-reminders__chip">{r.module}</span></td>
                <td>{r.entity}</td>
                <td className={r.active ? 'ssp-reminders__active' : undefined}>{r.resolved}</td>
                <td><button type="button" className="ssp-reminders__del" title={texts.del} aria-label={texts.del}
                            onClick={() => del(r.id)} dangerouslySetInnerHTML={{ __html: trash }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="ssp-modal-body-text ssp-reminders__empty">{texts.empty}</p>}
      <p className="ssp-reminders__cap">{texts.cap}</p>
    </React.Fragment>
  );
}

function RemindersBody(props) {
  const vm = props.vm || { sections: [] };
  const withJournal = !!(props.withJournal && props.journal);
  const [tab, setTab] = React.useState('active');
  const V = globalThis.SSP_VENDORED || {};
  const title = props.title ? <h3 className="ssp-reminders__title">{props.title}</h3> : null;
  /* Ring Tabs без содержимого — панель ниже рисуем сами (паттерн tabs-mount.jsx) */
  const tabs = withJournal && V.Tabs && V.Tab ? (
    <div className="ssp-reminders__tabs">
      <V.Tabs selected={tab} onSelect={setTab}>
        <V.Tab id="active" title={props.texts.tabActive} />
        <V.Tab id="journal" title={props.texts.tabJournal} />
      </V.Tabs>
    </div>
  ) : null;
  let panel;
  if (withJournal && tab === 'journal') {
    panel = <RemindersJournal journal={props.journal} texts={props.texts} />;
  } else if (!vm.sections || !vm.sections.length) {
    panel = <p className="ssp-modal-body-text ssp-reminders__empty">{props.emptyText}</p>;
  } else {
    panel = vm.sections.map((s) => (
      <div key={s.module} className="ssp-reminders__section" data-ssp-module={s.module}>
        <h4>{s.title}</h4>
        {s.items.map((it) => (
          <div key={it.id} className="ssp-reminders__item">
            <div className="ssp-reminders__text">{it.pre}<span className="ssp-reminders__days">{it.days}</span>{it.post}</div>
            <button type="button" className={BTN_SECONDARY} onClick={() => props.onGo(it)}>{props.goText}</button>
          </div>
        ))}
      </div>
    ));
  }
  return <div className="ssp-reminders__body">{title}{tabs}{panel}</div>;
}

if (window.__SSP_RING_MODAL && typeof window.__SSP_RING_MODAL.registerBody === 'function') {
  window.__SSP_RING_MODAL.registerBody('remindersBody', RemindersBody);
}
