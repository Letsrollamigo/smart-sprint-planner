/* sprint-lock-toggle.jsx — #57-2 (эпик 57) тумблер блокировки создания спринтов в шапке
   планера (СТРОГО Ring UI — вендоренный Toggle, CSS-сабсет ring-toggle-* в ring-subset.css).

   Мини-React-остров (паттерн modal-mount/toast-ring): ядро зовёт
   window.__SSP_SPRINT_LOCK.mountAt(host, vm) после GET sprint-lock.
   vm: { locked, canToggle, label, hintNoRights, onToggle(nextLocked)→Promise }.
   ⚖ Владелец: нет прав (canToggle=false) → тумблер серый и недоступен (Ring disabled),
   title-подсказка про группу из «Управления правами». */
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

const _roots = new WeakMap();

function SprintLockToggle({ vm }) {
  const Toggle = globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.Toggle;
  const [busy, setBusy] = React.useState(false);
  if (!Toggle) return null;   /* test-env без вендор-чанка */
  const onChange = (e) => {
    if (!vm.canToggle || busy) return;
    setBusy(true);
    Promise.resolve(typeof vm.onToggle === 'function' ? vm.onToggle(!!(e && e.target && e.target.checked)) : null)
      .catch(() => {})
      .then(() => setBusy(false));
  };
  return (
    <span title={vm.canToggle ? undefined : vm.hintNoRights} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <Toggle checked={!!vm.locked} disabled={!vm.canToggle || busy} onChange={onChange}>{vm.label}</Toggle>
    </span>
  );
}

window.__SSP_SPRINT_LOCK = {
  mountAt(host, vm) {
    if (!host) return;
    let root = _roots.get(host);
    if (!root) { root = ReactDOMClient.createRoot(host); _roots.set(host, root); }
    root.render(<SprintLockToggle vm={vm} />);
  },
};
