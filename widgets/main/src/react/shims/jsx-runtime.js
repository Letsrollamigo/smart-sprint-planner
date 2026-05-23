/* v2.0.0 D125 — jsx-runtime shim for JSX automatic mode.
   --alias:react/jsx-runtime=./shims/jsx-runtime.js resolves the automatic-mode import. */
var __JX = (globalThis.SSP_VENDORED && globalThis.SSP_VENDORED.jsxRuntime) || {};
export var jsx = __JX.jsx;
export var jsxs = __JX.jsxs;
export var Fragment = __JX.Fragment;
