/* rail-tools.jsx — #119 сервисные иконки рельса: колокольчик в шапке рядом с «свернуть», строка
   иконок (черновик · настройки · руководство · обратная связь · язык) под брендом; подсказки —
   Ring Tooltip (задержка 500 мс, показ по ховеру и по фокусу с клавиатуры).

   Остров-декоратор (паттерн sprint-lock-toggle + делегация дерева на tracker-узлы): существующие
   контролы (#remindersBellBtn, #clearDraftBtn, #openSettingsBtn, ссылки .editor-btn, #langSel) НЕ
   пересоздаются — переезжают в слоты <span> внутри <Tooltip>; их id, обработчики, серверная
   видимость и i18n целы. React детьми слота не управляет (свои children у слота — только иконка
   языка) → перенесённый узел переживает перерисовки. Скрытый контрол = класс на обёртке, узел
   остаётся в документе (core ищет его через getElementById). Нативный title снимается в
   data-ssp-tip (иначе две подсказки: браузерная и Ring); у ссылок без title — подпись.
   MutationObserver по контролам (title/class/style/текст) → перерисовка (rAF-дебаунс).
   Без вендор-чанка (golden-host) mount() возвращает false — рельс остаётся прежним. */
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const DELAY_MS = 500;

function vendored() { return globalThis.SSP_VENDORED || {}; }
function isShown(el) { return !!el && !el.classList.contains('hidden') && el.style.display !== 'none'; }
function stripTitle(el) {
  const t = el.getAttribute('title');
  if (t) { el.dataset.sspTip = t; el.removeAttribute('title'); }
}
function tipOf(el) {
  if (!el) return '';
  if (el.dataset.sspTip) return el.dataset.sspTip;
  const lbl = el.querySelector('[data-i18n]');
  return (lbl && lbl.textContent) || el.getAttribute('aria-label') || '';
}

function Tool({ el, cls, icon }) {
  const Tooltip = vendored().Tooltip;
  const slot = React.useRef(null);
  React.useLayoutEffect(() => { if (el && slot.current && el.parentNode !== slot.current) slot.current.appendChild(el); });
  if (!el) return null;
  const shown = isShown(el);
  const body = (
    <span ref={slot} className={'ssp-rail__tool' + (cls ? ' ' + cls : '')}>
      {icon ? <span className="ssp-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon }} /> : null}
    </span>
  );
  const wrapCls = 'ssp-rail__tip' + (shown ? '' : ' ssp-rail__tip--hidden');
  if (!Tooltip) return <span className={wrapCls}>{body}</span>;
  return <Tooltip title={tipOf(el)} delay={DELAY_MS} className={wrapCls}>{body}</Tooltip>;
}

function HeadTools({ c }) { return <Tool el={c.bell} />; }

function RailTools({ c }) {
  const earth = (window.__SSP_ICONS || {}).earth || '';
  return (
    <div className="ssp-rail__tools">
      <Tool el={c.clear} />
      <Tool el={c.settings} />
      <Tool el={c.guide} />
      <Tool el={c.feedback} />
      <Tool el={c.lang} cls="ssp-rail__tool--lang" icon={earth} />
    </div>
  );
}

window.__SSP_RAIL_TOOLS = {
  /* { headHost, rowHost, links } — контейнеры в .ssp-rail__head / .ssp-rail__utils и исходный
     .page-header__links (dash-shell). true — остров смонтирован. */
  mount({ headHost, rowHost, links }) {
    if (!headHost || !rowHost || !links || !vendored().Tooltip) return false;
    const byId = (id) => document.getElementById(id);
    const anchors = links.querySelectorAll('a.editor-btn');
    const c = { bell: byId('remindersBellBtn'), clear: byId('clearDraftBtn'), settings: byId('openSettingsBtn'),
      guide: anchors[0] || null, feedback: anchors[1] || null, lang: byId('langSel') };
    const els = Object.keys(c).map((k) => c[k]).filter(Boolean);
    const headRoot = ReactDOMClient.createRoot(headHost);
    const rowRoot = ReactDOMClient.createRoot(rowHost);
    let raf = 0;
    const render = () => {
      raf = 0;
      els.forEach(stripTitle);
      headRoot.render(<HeadTools c={c} />);
      rowRoot.render(<RailTools c={c} />);
    };
    const obs = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(render); });
    els.forEach((el) => obs.observe(el, { attributes: true, attributeFilter: ['title', 'class', 'style'], childList: true, characterData: true, subtree: true }));
    render();
    return true;
  },
};
