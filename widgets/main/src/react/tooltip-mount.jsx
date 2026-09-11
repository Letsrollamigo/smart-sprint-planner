/* tooltip-mount.jsx — #120 мини-мост Ring Tooltip для строкового DOM: [data-ssp-tooltip="текст"] →
   узел переезжает в слот <Tooltip title delay={500}> (паттерн rail-tools.jsx #119: React детьми слота
   не управляет, узел переживает перерисовки Tooltip). Ring Tooltip по умолчанию тёмный
   (ring-ui-theme-dark в попапе — класс в CSS-сабсете с #119). Без вендор-чанка (golden-host) —
   mountAll no-op. window.__SSP_TOOLTIP.mountAll(root) / unmountAll(root). */
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const DELAY_MS = 500;
const _mounted = new WeakMap();

function Tip({ el, title }) {
  const Tooltip = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Tooltip;
  const slot = React.useRef(null);
  React.useLayoutEffect(() => { if (el && slot.current && el.parentNode !== slot.current) slot.current.appendChild(el); });
  const body = <span ref={slot} className="ssp-tip__slot" />;
  if (!Tooltip) return body;
  return <Tooltip title={title} delay={DELAY_MS}>{body}</Tooltip>;
}

window.__SSP_TOOLTIP = {
  mountAll(container) {
    const root = container || document;
    if (!(globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Tooltip)) return 0;
    let n = 0;
    root.querySelectorAll('[data-ssp-tooltip]').forEach((el) => {
      if (el.__sspTipWrap || !el.parentNode) return;
      const wrap = document.createElement('span');
      wrap.className = 'ssp-tip';
      el.parentNode.insertBefore(wrap, el);
      const r = ReactDOMClient.createRoot(wrap);
      r.render(<Tip el={el} title={el.dataset.sspTooltip || ''} />);
      _mounted.set(wrap, r);
      el.__sspTipWrap = wrap;
      n++;
    });
    return n;
  },
  unmountAll(container) {
    const root = container || document;
    root.querySelectorAll('.ssp-tip').forEach((wrap) => {
      const r = _mounted.get(wrap);
      if (r) { try { r.unmount(); } catch (_) { /* noop */ } _mounted.delete(wrap); }
    });
  },
};
