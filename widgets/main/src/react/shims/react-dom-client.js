/* v2.0.0 D125 — react-dom/client shim.
   --alias:react-dom/client=./shims/react-dom-client.js */
var __RD = (globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.ReactDOMClient) || {};
export var createRoot = __RD.createRoot;
export var hydrateRoot = __RD.hydrateRoot;
export default __RD;
