/* v2.2.0 Phase 0 — SspModal: настоящий React-контент в Ring Dialog.
   Заменяет DOM-трансплантацию (dialog-mount.jsx) декларативным React-рендерингом.
   window.__SSP_MODAL: open(spec) / close(id) / update(id,partial) / registerBody(name,comp).
   Позиционирование: click-anchor без polling — double-RAF + settle-timer + scroll/resize.
   Bridge __SSP_DIALOG живёт параллельно до Phase 6 (де-гибридизация). */

import * as React from 'react';

const noop = () => {};

/* Реестр bespoke-компонентов для body.kind:'component' — пополняется по фазам */
const _bodyRegistry = {};

/* CSS-класс кнопки по variant из spec */
function _btnCls(variant) {
  const b = 'ring-button-button ring-button-block ring-button-heightS';
  if (variant === 'primary') return b + ' ring-button-primaryBlock ring-button-flat ring-button-whiteText';
  if (variant === 'danger')  return b + ' ring-button-danger';
  if (variant === 'flat')    return b + ' ring-button-ghost ring-button-flat';
  return b; /* secondary — default */
}

function ModalFooter({ buttons, onClose }) {
  if (!buttons || !buttons.length) return null;
  return (
    <div className="ssp-modal-footer">
      {buttons.map(btn => (
        <button
          key={btn.id}
          type="button"
          className={_btnCls(btn.variant)}
          onClick={() => btn.onClick({ close: onClose })}
          disabled={btn.disabled || false}
          aria-label={btn.ariaLabel || undefined}
        >
          {btn.text}
        </button>
      ))}
    </div>
  );
}

function BodyContent({ body }) {
  if (!body) return null;
  if (body.kind === 'text') {
    return <p className="ssp-modal-body-text">{body.text}</p>;
  }
  if (body.kind === 'lines') {
    return (
      <React.Fragment>
        {body.lines.map((line, i) => (
          line.html
            ? <p key={i} className="ssp-modal-body-text" style={line.style || undefined}
                 dangerouslySetInnerHTML={{ __html: line.html }} />
            : <p key={i} className="ssp-modal-body-text" style={line.style || undefined}>{line.text}</p>
        ))}
      </React.Fragment>
    );
  }
  if (body.kind === 'component') {
    const Comp = _bodyRegistry[body.name];
    if (!Comp) {
      if (process.env.NODE_ENV !== 'production') {
        return <p className="ssp-modal-body-text">[component &quot;{body.name}&quot; not registered]</p>;
      }
      return null;
    }
    return <Comp {...(body.props || {})} />;
  }
  return null;
}

function SspModal({ spec, onClose }) {
  const Dialog = globalThis.SSP_VENDORED.Dialog;
  const containerRef = React.useRef(null);

  /* Click-anchor позиционирование без polling.
     D2 использовал setInterval(100ms) — здесь заменено на:
     1. double-RAF после mount (Ring успевает отрендерить container + island)
     2. setTimeout(250ms) settle-pass (Ring может re-apply container styles)
     3. scroll + resize listeners
     Сохраняем ссылку на ringContainer внутри effect чтобы cleanup работал после unmount. */
  React.useEffect(() => {
    let savedRingContainer = null;

    const reposition = () => {
      let rc = null;
      if (containerRef.current) rc = containerRef.current.closest('.ring-dialog-container');
      if (!rc) {
        const all = document.querySelectorAll('.ring-dialog-container');
        rc = all.length ? all[all.length - 1] : null;
      }
      if (!rc) return;
      savedRingContainer = rc;
      const island = rc.querySelector('.ring-island-island');
      const dialogH = island ? island.offsetHeight : 300;
      const anchorY = (window.__SSP_MODAL_ANCHOR && window.__SSP_MODAL_ANCHOR.getCenterY())
        || ((window.innerHeight || 600) / 2);
      rc.style.alignItems = 'flex-start';
      rc.style.paddingTop = Math.max(20, anchorY - dialogH / 2) + 'px';
    };

    requestAnimationFrame(() => requestAnimationFrame(reposition));
    const settleTimer = setTimeout(reposition, 250);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    return () => {
      clearTimeout(settleTimer);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      if (savedRingContainer) {
        savedRingContainer.style.alignItems = '';
        savedRingContainer.style.paddingTop = '';
      }
    };
  }, []);

  /* Ручной focus с preventScroll вместо Ring trapFocus={true}.
     Ring trapFocus авто-скроллит iframe к focused элементу → потеря scroll-позиции.
     Осознанное отклонение (Q6 — lesson D10). */
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (!containerRef.current) return;
      const focusables = containerRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const target = focusables[0] || containerRef.current;
      try { target.focus({ preventScroll: true }); } catch (_) {
        try { target.focus(); } catch (__) {}
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  /* Defensive Escape — document-level capture-listener (восстановление контракта v2.1.9 B6).
     Ring onCloseAttempt при trapFocus={false} НЕ срабатывает, когда фокус на Ring Radio /
     textarea / select (проверено: confirmGoal не закрывался Escape'ом). Document-listener
     закрывает модалку независимо от типа focused-элемента. onClose идемпотентен → двойной
     вызов (Ring + этот) безопасен. blockEscape (wcMultiTab) — слушатель не вешаем. */
  React.useEffect(() => {
    if (spec.blockEscape) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [spec.blockEscape, onClose]);

  if (!Dialog) return null;

  return (
    <Dialog
      show={true}
      label={spec.title}
      className="ssp-ring-modal"
      onCloseAttempt={spec.blockEscape ? noop : onClose}
      trapFocus={false}
      showCloseButton={spec.showCloseButton || false}
      preventBodyScroll={false}
      onOverlayClick={spec.dismissOnBackdrop ? onClose : noop}
    >
      <div ref={containerRef} className="ssp-modal-inner">
        <BodyContent body={spec.body} />
      </div>
      <ModalFooter buttons={spec.buttons} onClose={onClose} />
    </Dialog>
  );
}

/* ВНИМАНИЕ: имя — НЕ `__SSP_MODAL`. Это имя уже занято legacy-monolith.js
   (фасад `{open:_appModalOpen, close:_appModalClose, stack, getFocusable}`,
   грузится последним → затёр бы наш мост). Новый декларативный spec-API —
   отдельный глобал `__SSP_RING_MODAL` (corp: `__SCBT_RING_MODAL`). */
window.__SSP_RING_MODAL = {
  open(spec) {
    const id = 'modal-' + spec.id;
    /* Идемпотентный close: гарантирует ровно один unmount и ровно один вызов
       spec.onClose — независимо от пути закрытия (кнопка → handle.close, Escape /
       backdrop → onCloseAttempt). spec.onClose — хук «модалка закрыта любым способом»
       (Phase 2: resolve(null)/return-focus). Phase 1 модалки spec.onClose не задают →
       поведение не меняется. */
    let closed = false;
    const onClose = () => {
      if (closed) return;
      closed = true;
      window.__SSP_REACT.unmount(id);
      if (typeof spec.onClose === 'function') {
        try { spec.onClose(); } catch (_) { /* noop */ }
      }
    };
    window.__SSP_REACT.mount(id, React.createElement(SspModal, { spec, onClose }));
    return { close: onClose, update: (partial) => this.update(spec.id, partial) };
  },
  close(id) {
    window.__SSP_REACT.unmount('modal-' + id);
  },
  update(id, partial) { void id; void partial; },
  registerBody(name, component) {
    _bodyRegistry[name] = component;
  },
};
