/* v2.2.0 Phase 0 — SspModal: настоящий React-контент в Ring Dialog.
   Заменяет DOM-трансплантацию (dialog-mount.jsx) декларативным React-рендерингом.
   window.__SSP_MODAL: open(spec) / close(id) / update(id,partial) / registerBody(name,comp).
   Позиционирование: IO-срез видимости (#56-6) + click-anchor фолбэк — double-RAF + settle-timer + scroll/resize.
   Bridge __SSP_DIALOG (dialog-mount.jsx) демонтирован в Phase 6 — все модалки на этом API. */

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
     Сохраняем ссылку на ringContainer внутри effect чтобы cleanup работал после unmount.

     #56-6 — модалка за границей экрана: sandbox-iframe (about:srcdoc, без allow-same-origin)
     не знает внешний viewport, auto-grow растит iframe до 2000-4000px, и якорь клика был
     единственной эвристикой «видимой точки». Первичный источник теперь IntersectionObserver:
     наблюдая documentElement, получаем intersectionRect = видимый срез НАШЕГО документа в
     наших client-координатах (IO спроектирован работать кросс-оригин — ads use-case;
     rootBounds при этом null, его НЕ требуем). Центрируем остров в срезе; threshold-лесенка
     даёт колбэки при скролле внешней страницы → модалка держится в видимой зоне (нативное
     поведение fixed-диалога). Click-anchor остаётся фолбэком (IO ещё не сработал/недоступен);
     его координаты приведены к viewport-координатам fixed-контейнера (pageY - scrollY;
     в auto-grow scrollY=0 → поведение прежнее). */
  React.useEffect(() => {
    let savedRingContainer = null;
    let visRect = null; // видимый срез документа (client coords) из IO | null

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
      let top;
      if (visRect && visRect.height > 80) {
        /* центр видимого среза; остров выше среза → прижим к верху среза (+12) */
        top = visRect.top + Math.max(12, (visRect.height - dialogH) / 2);
      } else {
        const anchorY = (window.__SSP_MODAL_ANCHOR && window.__SSP_MODAL_ANCHOR.getCenterY())
          || ((window.innerHeight || 600) / 2);
        top = anchorY - (window.scrollY || 0) - dialogH / 2;
      }
      rc.style.alignItems = 'flex-start';
      rc.style.paddingTop = Math.max(20, top) + 'px';
    };

    let io = null;
    if (typeof IntersectionObserver === 'function') {
      try {
        const steps = []; for (let i = 0; i <= 20; i++) steps.push(i / 20);
        io = new IntersectionObserver((entries) => {
          const en = entries[entries.length - 1];
          if (en && en.isIntersecting && en.intersectionRect && en.intersectionRect.height > 0) {
            visRect = en.intersectionRect;
            reposition();
          }
        }, { threshold: steps });
        io.observe(document.documentElement);
      } catch (_) { io = null; /* старый движок — остаёмся на click-anchor */ }
    }
    /* ⚠️ IO-thresholds — ratio-based: скролл родителя ДВИГАЕТ видимое окно по гигантскому
       iframe, но ДОЛЯ видимости не меняется → порог не пересекается → колбэков нет и
       visRect протухает. Re-observe форсит initial-колбэк (спека доставляет его всегда) →
       свежий intersectionRect каждые 300мс, пока модалка открыта. Дешевле легаси-полла D2
       (100мс) и живёт только в окне открытой модалки. */
    const reObserve = io ? setInterval(() => {
      try { io.unobserve(document.documentElement); io.observe(document.documentElement); } catch (_) {}
    }, 300) : null;

    requestAnimationFrame(() => requestAnimationFrame(reposition));
    const settleTimer = setTimeout(reposition, 250);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    return () => {
      clearTimeout(settleTimer);
      if (reObserve) clearInterval(reObserve);
      if (io) io.disconnect();
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
    /* #56-6 — фокус строго ПОСЛЕ первой репозиции (double-RAF ≈ 16-32мс): preventScroll
       не пересекает OOPIF-границу (#33), и фокус-скролл родителя целится в ТЕКУЩУЮ позицию
       острова. При t=0 остров ещё в Ring-дефолте (flex-center гиганта ~Y2000) → родитель
       скроллил В ПУСТОТУ, потом остров телепортировался в старый срез — «модалка за
       границей экрана». 80мс = после RAF²-репозиции, до settle-прохода. */
    const t = setTimeout(() => {
      if (!containerRef.current) return;
      const focusables = containerRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      /* #33 — если первый фокусируемый элемент внутри Ring QueryAssist (модалка
         подбора задач), НЕ фокусируем его: QueryAssist на фокусе ставит каретку
         (Selection API), что скроллит виджет-iframe, а preventScroll Selection-скролл
         не глушит. Модалка в position:fixed видна и без фокуса; поле фокусится по клику.
         Для остальных модалок — обычный preventScroll-фокус первого элемента. */
      const first = focusables[0];
      if (first && first.closest('.ring-query-assist')) return;
      const target = first || containerRef.current;
      try { target.focus({ preventScroll: true }); } catch (_) {
        try { target.focus(); } catch (__) {}
      }
    }, 80); /* #56-6: было 0 — фокус обгонял репозицию, см. коммент выше */
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
        /* v3.2.1 — открытый Ring-попап (Select/QueryAssist/DatePicker) потребляет
           Escape первым: раньше capture-слушатель закрывал ВСЮ модалку (правки формы
           настроек гибли), когда пользователь закрывал лишь дропдаун. */
        if (document.querySelector('.ring-popup-popup:not(.ring-popup-hidden)')) return;
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
      className={'ssp-ring-modal' + (spec.dialogClass ? ' ' + spec.dialogClass : '')}
      onCloseAttempt={spec.blockEscape ? noop : onClose}
      trapFocus={false}
      /* #33 — Ring autoFocusFirst (дефолт true) фокусит первый элемент на открытии
         БЕЗ preventScroll; для Ring QueryAssist (модалка подбора) это ставит каретку
         (Selection) и браузер скроллит виджет-iframe (OOPIF, preventScroll не пересекает
         границу) → страница прыгает. Отключаем — фокус ставит modal-mount вручную ниже
         с preventScroll (а для QueryAssist пропускает focus вовсе). */
      autoFocusFirst={false}
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

/* Имя `__SSP_RING_MODAL` — историческое:
   `__SSP_MODAL` был занят легаси-фасадом монолита (снесён при декомпозиции);
   глобал оставлен как есть ради стабильности контракта. */
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
  /* #25 Ф1-A — inline-рендер body-компонента в контейнер страницы (не модалка). */
  mountInline(container, bodyName, props) {
    const Comp = _bodyRegistry[bodyName];
    if (!Comp || !container) return false;
    window.__SSP_REACT.mountInto(container, React.createElement(Comp, props || {}));
    return true;
  },
  unmountInline(container) {
    window.__SSP_REACT.unmountFrom(container);
  },
};
