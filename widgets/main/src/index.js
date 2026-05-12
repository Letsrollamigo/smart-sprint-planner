/* Smart Sprint Planner — entry point.
   v5.12.0: src/ layout (OQ61/OQ64). esbuild inlines imports before the monolith IIFE,
   so APP_VERSION from common/version.js is accessible via closure inside the IIFE.

   v1.1.0: i18n bridge MUST be imported BEFORE legacy-monolith.js — ES modules execute
   side-effects in declaration order, and the bridge sets `window.__SSP_*` properties
   that the IIFE in legacy-monolith.js reads at instantiation time. */

import './i18n-bridge.js';
import './legacy-monolith.js';
