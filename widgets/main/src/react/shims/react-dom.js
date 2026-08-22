/* v3.21.0 (#69 R2) — react-dom shim для ленивого recharts-чанка: Recharts 3.x тянет createPortal
   из 'react-dom'; чанк обязан использовать ТОТ ЖЕ React/ReactDOM, что и вендор-чанк (две копии
   React = invalid hook call). --alias:react-dom=./shims/react-dom.js в build:recharts. */
var __RDOM = (globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.ReactDOM) || {};
export var createPortal = __RDOM.createPortal;
export var flushSync = __RDOM.flushSync;
export var unstable_batchedUpdates = __RDOM.unstable_batchedUpdates;
export var findDOMNode = __RDOM.findDOMNode;
export var version = __RDOM.version;
export default __RDOM;
