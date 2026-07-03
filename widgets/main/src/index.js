/* Smart Sprint Planner — entry point.
   v5.12.0: src/ layout (OQ61/OQ64). esbuild inlines imports before the monolith IIFE,
   so APP_VERSION from common/version.js is accessible via closure inside the IIFE.

   v1.1.0: i18n bridge MUST be imported BEFORE core.js — ES modules execute
   side-effects in declaration order, and the bridge sets `window.__SSP_*` properties
   that the IIFE in core.js reads at instantiation time.

   v1.9.6: icons bridge (icons.generated.js) follows the same pattern — sets window.__SSP_ICONS
   before the monolith IIFE reads it via `var ICONS = window.__SSP_ICONS || {}`. */

import './infra/click-anchor.js';
import './icons.generated.js';
import './i18n/i18n-bridge.js';
import './domain/ring-class-helpers.js';
import './pure/toast-pure.js';
import './infra/toast-ring.js';
import './infra/datepicker-bridge.js';
import './pure/sort-pure.js';
import './pure/period-pure.js';
import './pure/enum-locale-pure.js';
import './pure/date-pure.js';
import './pure/hash-pure.js';
import './pure/util-pure.js';
import './pure/migrate-pure.js';
import './pure/refresh-merge-pure.js';
import './pure/share-url-pure.js';
import './pure/planning-model-pure.js';
import './pure/backlog-vm-pure.js';
import './pure/capacity-pure.js';
import './pure/release-tree-pure.js';
import './infra/modal-specs.js';
import './domain/excel-export.js';
import './domain/revalidation.js';
import './domain/history-io.js';
import './domain/pick.js';
import './data/youtrack-api.js';
import './domain/working-copy.js';
import './domain/draft-store.js';
import './domain/permissions.js';
import './domain/share-controller.js';
import './domain/validation-controller.js';
import './domain/refresh-controller.js';
import './domain/sprint-controller.js';
import './domain/reassign-controller.js';
import './i18n/i18n-controller.js';
import './domain/history-controller.js';
import './domain/settings-controller.js';
import './data/data-loaders.js';
import './domain/dash-shell.js';
import './domain/project-nav.js';
import './domain/standup-view.js';
import './domain/currentrole-view.js';
import './domain/rolecomposition-view.js';
import './domain/history-view.js';
import './domain/header-view.js';
import './domain/gantt-view.js';
import './domain/backlog-loader.js';
import './domain/backlog-view.js';
import './domain/backlog-assign.js';
import './domain/intro-view.js';
import './domain/capacity-view.js';
import './domain/sprint-store.js';
import './domain/release-store.js';
import './domain/release-view.js';
import './domain/release-controller.js';
import './domain/release-pick.js';
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
import './react/backlog-view.jsx';
import './react/backlog-assign.jsx';
import './react/release-create.jsx';
import './react/release-state-preview.jsx';
import './react/release-view.jsx';
import './react/capacity-view.jsx';
import './react/input-mount.jsx';
import './react/select-mount.jsx';
import './core.js';
