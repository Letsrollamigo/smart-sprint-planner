/* Smart Sprint Planner — entry point.
   v5.12.0: src/ layout (OQ61/OQ64). esbuild inlines imports before the monolith IIFE,
   so APP_VERSION from common/version.js is accessible via closure inside the IIFE.

   v1.1.0: i18n bridge MUST be imported BEFORE legacy-monolith.js — ES modules execute
   side-effects in declaration order, and the bridge sets `window.__SSP_*` properties
   that the IIFE in legacy-monolith.js reads at instantiation time.

   v1.9.6: icons bridge (icons.generated.js) follows the same pattern — sets window.__SSP_ICONS
   before the monolith IIFE reads it via `var ICONS = window.__SSP_ICONS || {}`. */

import './click-anchor.js';
import './icons.generated.js';
import './i18n-bridge.js';
import './ring-class-helpers.js';
import './toast-pure.js';
import './sort-pure.js';
import './period-pure.js';
import './enum-locale-pure.js';
import './date-pure.js';
import './hash-pure.js';
import './util-pure.js';
import './migrate-pure.js';
import './refresh-merge-pure.js';
import './share-url-pure.js';
import './modal-specs.js';
import './excel-export.js';
import './revalidation.js';
import './history-io.js';
import './pick.js';
import './youtrack-api.js';
import './working-copy.js';
import './standup-view.js';
import './currentrole-view.js';
import './rolecomposition-view.js';
import './history-view.js';
import './header-view.js';
import './gantt-view.js';
import './react/portal.jsx';
import './react/modal-mount.jsx';
import './react/modal-bodies.jsx';
import './react/settings-form.jsx';
import './react/loader-mount.jsx';
import './react/datepicker-mount.jsx';
import './react/checkbox-mount.jsx';
import './react/radio-mount.jsx';
import './react/tabs-mount.jsx';
import './react/table-mount.jsx';
import './react/standup-view.jsx';
import './react/gantt-view.jsx';
import './react/input-mount.jsx';
import './react/select-mount.jsx';
import './react/collapse-mount.jsx';
import './legacy-monolith.js';
