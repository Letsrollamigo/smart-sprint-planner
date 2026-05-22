(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // widgets/main/src/ring-class-helpers.js
  var require_ring_class_helpers = __commonJS({
    "widgets/main/src/ring-class-helpers.js"(exports, module) {
      "use strict";
      function escapeHtml(str) {
        if (str == null) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      }
      function ringButtonClass(opts) {
        opts = opts || {};
        const {
          primary,
          secondary,
          ghost,
          danger,
          success,
          height,
          iconOnly,
          inline,
          disabled,
          active,
          short
        } = opts;
        const h = height || "M";
        const classes = ["ring-button-button"];
        classes.push(inline ? "ring-button-inline" : "ring-button-block");
        classes.push("ring-button-height" + h);
        if (primary) classes.push("ring-button-primaryBlock", "ring-button-flat", "ring-button-whiteText");
        else if (ghost) classes.push("ring-button-ghost", "ring-button-flat");
        else if (secondary) classes.push("ring-button-secondary", "ring-button-flat");
        else if (danger) classes.push("ring-button-danger");
        else if (success) classes.push("ring-button-success");
        if (iconOnly) classes.push("ring-button-iconOnly");
        if (disabled) classes.push("ring-button-disabled");
        if (active) classes.push("ring-button-active");
        if (short) classes.push("ring-button-short");
        return classes.join(" ");
      }
      function ringInputClass(opts) {
        opts = opts || {};
        const { size, height, empty, error, withIcon } = opts;
        const s = size || "M";
        const h = height || "M";
        const classes = ["ring-input-outerContainer", "ring-input-size" + s, "ring-input-height" + h];
        if (empty) classes.push("ring-input-empty");
        if (error) classes.push("ring-input-error");
        if (withIcon) classes.push("ring-input-withIcon");
        return classes.join(" ");
      }
      function ringInputTemplate(opts) {
        opts = opts || {};
        const {
          id,
          value,
          placeholder,
          size,
          height,
          error,
          disabled,
          extraAttrs,
          type
        } = opts;
        const outerClass = ringInputClass({
          size,
          height,
          empty: value == null || value === "",
          error
        });
        const inputType = type || "text";
        const val = escapeHtml(value == null ? "" : value);
        const ph = escapeHtml(placeholder || "");
        const extra = extraAttrs || "";
        const disabledAttr = disabled ? " disabled" : "";
        return '<span class="' + outerClass + '"><span class="ring-input-container"><input id="' + escapeHtml(id || "") + '" type="' + inputType + '" class="ring-input-input" value="' + val + '" placeholder="' + ph + '"' + disabledAttr + (extra ? " " + extra : "") + "/></span></span>";
      }
      function ringSelectButtonClass(opts) {
        opts = opts || {};
        const { height, empty, open, disabled, size } = opts;
        const classes = ["ring-select-button"];
        if (height === "S") classes.push("ring-select-heightS");
        else if (height === "L") classes.push("ring-select-heightL");
        if (size === "S") classes.push("ring-select-sizeS");
        else if (size === "L") classes.push("ring-select-sizeL");
        else if (size === "FULL") classes.push("ring-select-sizeFULL");
        else classes.push("ring-select-sizeM");
        if (empty) classes.push("ring-select-buttonValueEmpty");
        if (open) classes.push("ring-select-open");
        if (disabled) classes.push("ring-select-disabled");
        return classes.join(" ");
      }
      function ringCheckboxClass(opts) {
        opts = opts || {};
        return "ring-checkbox-cell";
      }
      function ringIconClass(opts) {
        opts = opts || {};
        const { color, loading } = opts;
        const classes = ["ring-icon-icon"];
        if (color) classes.push("ring-icon-" + color);
        if (loading) classes.push("ring-icon-loading");
        return classes.join(" ");
      }
      module.exports = {
        escapeHtml,
        ringButtonClass,
        ringInputClass,
        ringInputTemplate,
        ringSelectButtonClass,
        ringCheckboxClass,
        ringIconClass
      };
    }
  });

  // widgets/main/src/icons.generated.js
  if (typeof window !== "undefined") {
    window.__SSP_ICONS = {
      "add": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M7.632.375c.346 0 .625.28.625.625v12.8a.625.625 0 1 1-1.25 0V1c0-.345.28-.625.625-.625Z" clip-rule="evenodd"/><path fill-rule="evenodd" d="M1.002 7.625c0-.345.28-.625.625-.625h12.204a.625.625 0 1 1 0 1.25H1.627a.625.625 0 0 1-.625-.625Z" clip-rule="evenodd"/></svg>',
      "bars": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M2.271 1.645a.625.625 0 1 0-1.25 0V14.37a.625.625 0 1 0 1.25 0V1.645Zm9.376 1.977c0 .345-.28.625-.625.625H3.64a.625.625 0 1 1 0-1.25h7.383c.345 0 .625.28.625.625Zm3.321 3.01c0 .346-.28.626-.625.626H3.64a.625.625 0 1 1 0-1.25h10.704c.345 0 .625.28.625.625Zm-5.633 3.63a.625.625 0 1 0 0-1.25H3.64a.625.625 0 1 0 0 1.25h5.696Zm2.6 2.37c0 .345-.28.625-.625.625H3.64a.625.625 0 1 1 0-1.25h7.67c.345 0 .625.28.625.625Z" clip-rule="evenodd"/></svg>',
      "checkmark": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M14.853 3.149c.248.24.254.636.014.884l-8.541 8.816a.625.625 0 0 1-.863.033L1.177 9.085a.625.625 0 0 1 .83-.936l3.837 3.401 8.125-8.387a.625.625 0 0 1 .884-.014Z" clip-rule="evenodd"/></svg>',
      "close": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M13.442 2.558a.625.625 0 0 1 0 .884L8.883 8.006l4.546 4.552a.625.625 0 1 1-.884.884L8 8.89l-4.545 4.55a.625.625 0 0 1-.884-.883l4.546-4.552-4.56-4.564a.625.625 0 1 1 .885-.884L8 7.122l4.558-4.564a.625.625 0 0 1 .884 0Z" clip-rule="evenodd"/></svg>',
      "comment": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.825 3.84c0-.321-.286-.665-.742-.665H3.917c-.456 0-.742.344-.742.666v4.818c0 .322.286.666.742.666v1.3l-.209-.01c-.961-.094-1.725-.83-1.822-1.756l-.011-.2V3.841c0-1.018.804-1.856 1.833-1.956l.209-.01h8.166c1.127 0 2.042.88 2.042 1.966v9.792l-.006.075c-.052.34-.451.524-.759.35l-.064-.041-4.275-3.392H3.917v-1.3h5.104l.109.005a1.3 1.3 0 0 1 .7.276l2.995 2.377V3.841Z"/></svg>',
      "group": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M6.006 6.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM4.912 8.588A6.512 6.512 0 0 1 6.003 8.5h.003c.394 0 .757.031 1.093.088 2.694.46 3.59 2.6 3.886 3.9.125.548-.317 1.012-.88 1.012H1.907c-.561 0-1.004-.463-.88-1.01.295-1.3 1.188-3.444 3.885-3.902Zm.128-1.281c.297.124.622.193.963.193h.003a2.5 2.5 0 1 0-.966-.194Zm3.748 3.491c-.515-.552-1.342-1.048-2.785-1.048s-2.269.496-2.782 1.048c-.405.435-.665.96-.83 1.452h7.23c-.166-.492-.428-1.017-.833-1.452Zm3.021 2.702h2.283c.563 0 1.005-.464.88-1.012-.297-1.3-1.193-3.44-3.887-3.9A6.51 6.51 0 0 0 9.993 8.5H9.99c-.146 0-.288.004-.426.013.326.224.615.477.87.751.169.181.32.369.457.56.906.157 1.488.549 1.884.974.405.435.667.96.833 1.452h-1.652l.004.015a1.75 1.75 0 0 1-.151 1.235ZM8.752 7.17a2.492 2.492 0 0 0 1.238.33h.003a2.5 2.5 0 1 0-1.241-4.67c.258.325.46.698.589 1.104a1.25 1.25 0 1 1 0 2.133c-.13.405-.331.778-.59 1.104Z" clip-rule="evenodd"/></svg>',
      "history": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g><path d="M15,0H7.3V7.42a.8.8,0,0,0,.51.75.81.81,0,0,0,.31.06A.85.85,0,0,0,8.7,8l2-2-1-1-1,1V2.45a5.6,5.6,0,1,1-2.4.22V1.22a7,7,0,1,0,4,.18H15Z"/></g></svg>',
      "loader": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
      "settings": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M9.67 1.449a.781.781 0 0 0-.56-.372 8.014 8.014 0 0 0-2.22 0 .781.781 0 0 0-.56.372L5.404 2.99a.84.84 0 0 1-.731.397l-1.887-.02a.804.804 0 0 0-.623.269 6.901 6.901 0 0 0-1.112 1.802.693.693 0 0 0 .064.64l.962 1.525a.736.736 0 0 1 0 .792L1.115 9.92a.693.693 0 0 0-.064.64 6.9 6.9 0 0 0 1.112 1.802c.15.177.382.271.623.269l1.887-.02a.84.84 0 0 1 .731.396l.926 1.543a.781.781 0 0 0 .56.372 8.008 8.008 0 0 0 2.22 0 .782.782 0 0 0 .56-.372l.925-1.543a.845.845 0 0 1 .732-.396l1.887.02a.804.804 0 0 0 .623-.269 6.903 6.903 0 0 0 1.112-1.802.693.693 0 0 0-.064-.64l-.962-1.525a.736.736 0 0 1 0-.792l.962-1.525a.693.693 0 0 0 .064-.64 6.901 6.901 0 0 0-1.112-1.802.804.804 0 0 0-.623-.269l-1.887.02a.84.84 0 0 1-.732-.397L9.67 1.45Zm0 0-.002.001-.02.012.02-.012.002-.001Zm-.022.013-.002.001ZM5.445 3.016l1.031.619A2.09 2.09 0 0 1 4.66 4.638L2.973 4.62a5.66 5.66 0 0 0-.648 1.035l.809 1.281a1.986 1.986 0 0 1 0 2.128l-.81 1.281c.178.366.395.712.649 1.035l1.687-.018a2.09 2.09 0 0 1 1.816 1.003l-1.072.643 1.072-.643.809 1.347a6.797 6.797 0 0 0 1.43 0l.809-1.347a2.09 2.09 0 0 1 1.816-1.003l1.687.018a5.64 5.64 0 0 0 .648-1.035l-.809-1.281a1.986 1.986 0 0 1 0-2.128l.81-1.281a5.66 5.66 0 0 0-.649-1.035l-1.687.018a2.09 2.09 0 0 1-1.816-1.003l-.809-1.347a6.788 6.788 0 0 0-1.43 0l-.809 1.347-1.031-.62Z" clip-rule="evenodd"/><path fill-rule="evenodd" d="M5.019 8a2.981 2.981 0 1 1 5.962 0 2.981 2.981 0 0 1-5.962 0ZM8 6.27a1.731 1.731 0 1 0 0 3.462A1.731 1.731 0 0 0 8 6.27Z" clip-rule="evenodd"/></svg>',
      "task": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><g class="task"><path fill-rule="evenodd" d="M11.343 2.25H4.657c-.66 0-1.08.001-1.4.027-.303.025-.403.066-.441.086-.195.1-.354.258-.453.453-.02.038-.061.138-.086.442-.026.318-.027.738-.027 1.4v6.685c0 .66.001 1.08.027 1.4.025.303.066.403.086.441.1.195.258.354.453.453.038.02.138.061.442.086.318.026.738.027 1.4.027h6.685c.66 0 1.08-.001 1.4-.027.303-.025.403-.066.441-.086.195-.1.354-.258.453-.453.02-.038.061-.138.086-.442.026-.318.027-.739.027-1.4V4.658c0-.66-.001-1.08-.027-1.4-.025-.303-.066-.403-.086-.441a1.036 1.036 0 0 0-.453-.453c-.038-.02-.138-.061-.442-.086-.318-.026-.739-.027-1.4-.027ZM1.249 2.248C1 2.737 1 3.377 1 4.658v6.685c0 1.28 0 1.92.25 2.409.218.43.568.78.998.999.489.249 1.129.249 2.41.249h6.685c1.28 0 1.92 0 2.409-.25.43-.218.78-.568.999-.998.249-.489.249-1.129.249-2.41V4.658c0-1.28 0-1.92-.25-2.409a2.278 2.278 0 0 0-.998-.999C13.263 1 12.623 1 11.342 1H4.658c-1.28 0-1.92 0-2.409.25-.43.218-.78.568-.999.998Z" class="Icon" clip-rule="evenodd"/><path fill-rule="evenodd" d="M11.369 4.995c.278.204.34.595.136.874l-3.577 4.896a.625.625 0 0 1-.952.068l-2.17-2.217a.625.625 0 0 1 .894-.874l1.654 1.69 3.141-4.3a.625.625 0 0 1 .874-.137Z" class="Icon (Stroke)" clip-rule="evenodd"/></g></svg>',
      "trash": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M7 1.756h2a.75.75 0 0 1 .75.75v.25h-3.5v-.25a.75.75 0 0 1 .75-.75Zm-2 .75a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.512h2a1 1 0 0 1 1 1v2.485h-1v6.37a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6.37H2V4.018a1 1 0 0 1 1-1h2v-.512Zm8 1.512H3v1.234h10V4.018Zm-8.75 8.854V6.503h7.5v6.37a.75.75 0 0 1-.75.75H5a.75.75 0 0 1-.75-.75Zm2.25-5.42a.5.5 0 0 0-.5.5v3.551a.5.5 0 0 0 1 0v-3.55a.5.5 0 0 0-.5-.5Zm2.5.5a.5.5 0 1 1 1 0v3.551a.5.5 0 0 1-1 0v-3.55Z" clip-rule="evenodd"/></svg>',
      "update": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="m4.257 7.086-.818.819a4.562 4.562 0 0 1 7.05-3.73.625.625 0 1 0 .682-1.047 5.812 5.812 0 0 0-8.982 4.779l-.82-.82a.625.625 0 0 0-.885.883l1.887 1.886c.244.245.64.245.884 0L5.14 7.97a.625.625 0 0 0-.884-.884Zm1.255 4.739a4.562 4.562 0 0 0 7.05-3.73l-.82.818a.625.625 0 1 1-.883-.884l1.886-1.886a.625.625 0 0 1 .884 0l1.886 1.886a.625.625 0 0 1-.883.884l-.82-.82a5.812 5.812 0 0 1-8.983 4.779.625.625 0 0 1 .683-1.047Z" clip-rule="evenodd"/></svg>',
      "user": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M3.527 12.77h8.947c-.164-.647-.461-1.394-.988-2.015C10.864 10.02 9.838 9.359 8 9.359c-1.837 0-2.863.661-3.486 1.396-.526.62-.823 1.368-.987 2.015Zm-1.336.273c.292-1.68 1.424-4.934 5.81-4.934 4.385 0 5.516 3.254 5.808 4.934.093.536-.34.977-.883.977H3.074c-.544 0-.977-.441-.884-.977ZM8 5.742a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm0 1.25a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd"/></svg>'
    };
  }

  // widgets/main/src/i18n/loader.js
  var loader_exports = {};
  __export(loader_exports, {
    LANG_CODES: () => LANG_CODES,
    getCachedDictionary: () => getCachedDictionary,
    getCurrentLang: () => getCurrentLang,
    isSupportedLang: () => isSupportedLang,
    loadDictionary: () => loadDictionary,
    setLang: () => setLang,
    setProjectDefault: () => setProjectDefault,
    subscribe: () => subscribe
  });

  // widgets/main/i18n/en.json
  var en_default = {
    appTitle: "Smart Sprint Planner",
    linkGuide: "User Guide",
    linkFeedback: "Feedback",
    tabSettings: "Settings",
    tabPlanning: "Planning",
    tabGantt: "Gantt Chart",
    tabHistory: "Sprint History",
    planningLevelRoles: "Total resource allocation",
    planningLevelPeople: "Distribution by assignees",
    lblGanttRole: "Role:",
    ganttRoleSwitchDirtyText: "The selected role has unsaved Gantt changes. Switch without saving?",
    planningRolesNoSprint: "Pick a sprint in the widget header or create a new one to plan role load.",
    planningRolesNoActive: "\u26A0\uFE0F No functional roles selected. Open the settings widget and pick at least one role.",
    planningRoleStatResource: "Resource",
    planningRoleStatAlloc: "Allocation",
    planningRoleStatTasks: "tasks",
    planningRoleStatHourSuffix: "h",
    planningRoleStatOverlimit: "\u26A0 Over limit",
    btnJumpToPeople: "\u2192 Open in assignee distribution mode",
    lblTasksAbbrPlanning: "tasks",
    lblPlanningRole: "Role:",
    planningPeopleNoSprint: "Pick a sprint in the widget header or create a new one.",
    planningPeopleEmptyTitleTpl: "No assignees picked for role \xAB{role}\xBB yet",
    planningPeopleEmptyDesc: "Click the button below to load the current list of assignees from the Assignee field bundle.",
    planningPeopleSummaryTitleTpl: "People distribution \u2014 role \xAB{role}\xBB",
    planningPeopleAssigneeCount: "Assignees",
    planningPeopleResourceSum: "\u03A3 people resources",
    planningPeopleTaskAssigned: "Tasks distributed",
    planningPeopleTaskTotal: "Total role tasks",
    lblRoleResourceManual: "Role resource (entered manually):",
    lblPeopleSum: "\u03A3 people:",
    resStatusOk: "\u2705 Resource distributed exactly",
    resStatusUnderTpl: "\u{1F7E1} Under-distributed: {n} h available",
    resStatusOverTpl: "\u{1F534} Overlimit: {n} h over role resource",
    roleSwitchDirtyText: "Role \xAB{role}\xBB has unsaved changes. They will be lost if you switch. Continue?",
    btnOpenForEditingHistorical: "\u270F Open for editing",
    lblHistoricalReadonlyHint: "Sprint is in view-only mode. Click \xABOpen for editing\xBB to make changes.",
    wcCrossTabHint: "\u270F Open in another browser tab",
    cardRoles: "Functional Roles of Sprint Participants",
    cardFieldEst: "Estimate Fields",
    cardFieldFact: "Actual Effort Fields",
    cardOtherFields: "Other Fields",
    cardUserFields: "User Fields by Role",
    cardGroups: "Manage permissions",
    cardPlanParams: "Sprint Planning Parameters",
    cardWorkloadSettings: "Workload Settings (Business Capacity)",
    cardKpe: "Productivity Factor (PF) by Grade",
    cardModes: "Planning Modes",
    cardMisc: "Other",
    secDta: "Differentiated time tracking",
    cardDta: "Differentiated time tracking",
    lblDtaEnabled: "Enable differentiated time tracking",
    lblDtaWarnings: "Enable plan/fact ratio control notifications",
    hintDtaWarnings: "When enabled, the workflow emits per-role plan-vs-fact progress messages on each work-item logging: under 90% \u2014 informational ratio, 90-100% \u2014 warning that less than 10% of the plan remains, over 100% \u2014 overrun alert. The role label and advice text are localised. Disable this checkbox if you only need the silent fact-field aggregation.",
    hintDta: "When enabled, the bundled workflow rule aggregates issue work items by type and writes the result into per-role fact-fields according to the mapping below. Each work item type may be mapped to a single role only.",
    dtaColType: "Work item type (exact name)",
    dtaColRole: "Role",
    btnDtaAddRow: "+ Add mapping",
    btnDtaRemoveRow: "Remove row",
    dtaErrDuplicate: "A work item type cannot be mapped to two different roles. Remove the duplicate row before saving.",
    errDuplicateEstField: "\u26A0 The same estimate field cannot be selected for two different roles. Each role must point to its own period field.",
    errDuplicateFactField: "\u26A0 The same fact field cannot be selected for two different roles. Each role must point to its own period field.",
    ssbLabel: "Modules:",
    ssbInline: "Quick edit",
    ssbPersonal: "Personal planning",
    ssbDta: "Time-by-type",
    ssbCascade: "Plan/fact roll-up",
    ssbOn: "on",
    ssbOff: "off",
    hintSsbInline: "Direct editing of issue fields in the planner table (dynEditEnabled).",
    hintSsbPersonal: "Per-assignee distribution layer enabled (personalPlanningEnabled).",
    hintSsbDta: "Differentiated time accounting workflow active \u2014 work items are aggregated into per-role fact-fields.",
    hintSsbCascade: "Cascade aggregation parent \u2190 child active \u2014 child plan/fact fields roll up into level-2/level-3 parents.",
    dtaTypePlaceholder: "e.g. Development",
    dtaEmptyTable: "No mappings yet. Click \xAB+ Add mapping\xBB to add one.",
    secCascade: "Cascade of estimates & hours",
    cardCascade: "Cascade aggregation of estimates and work hours",
    lblCascadeEnabled: "Enable cascade aggregation parent \u2190 child",
    hintCascade: "When enabled, the bundled workflow rule sums per-role plan/fact fields (derived from DTA Fields \u2192 Estimate/Fact mapping) from child issues into their level-2/level-3 parents along the configured parent link. Hierarchy max 2 levels (task \u2192 level-2 \u2192 level-3).",
    lblForbidContainer: "Forbid direct work-item logging on container issues",
    hintForbidContainer: "When enabled, saves are rejected if a user tries to add or edit work items on issues whose kind matches a level-2 or level-3 container value. Time logging must happen on leaf child issues only.",
    warnCascadeWithoutForbid: "\u26A0 Cascade is on while forbid is off: any direct work-item logged on a container issue will be overwritten by the next cascade aggregation. Enable \xABForbid direct logging\xBB to keep aggregated values consistent.",
    lblCascadeKindField: "Issue kind field",
    lblCascadeLevel2: "Level-2 (story-like) values",
    lblCascadeLevel3: "Level-3 (epic-like) values \u2014 optional",
    hintCascadeLevel3Optional: "Leave empty if you only need 1-step aggregation (task \u2192 level-2). When set, cascade extends to level-3 (level-2 \u2192 level-3).",
    warnCascadeLevelsOverlap: "\u26A0 Level-2 and level-3 must not share a value \u2014 overlap is ambiguous and breaks aggregation.",
    lblCascadeLinkInward: "Parent link \u2014 inward (child \u2192 parent)",
    lblCascadeLinkOutward: "Parent link \u2014 outward (parent \u2192 child)",
    hintCascadeLinks: "Defaults match the built-in YouTrack \xABSubtask\xBB link type (inward \xABsubtask of\xBB, outward \xABparent for\xBB). Override only if your project uses a custom relation. Both directions must be filled.",
    phCascadeLinkInward: "subtask of",
    phCascadeLinkOutward: "parent for",
    secAccess: "Access & roles",
    secFields: "YouTrack field mapping",
    secNorms: "Calculation norms",
    secModes: "Planning modes",
    secMisc: "Other",
    lblLang: "Interface language",
    lblDefaultLang: "Project default language",
    hintDefaultLang: "Applied to users who have not picked a personal language. Leave empty to fall back to the user's browser preference (or RU as the legacy default).",
    fldPriority: "Priority",
    fldXpriority: "Cross Priority",
    fldState: "State",
    fldSystem: "System",
    fldSprint: "Sprint Field",
    fldSprintOptional: "(optional)",
    fldVersion: "Version",
    fldVersionOptional: "(optional)",
    fldExternalTicketId: "External ticket ID",
    fldExternalTicketIdOptional: "(optional)",
    hintExternalTicketId: "Select the YouTrack string field that stores the ticket ID in the external system (Service Desk, Jira, 1C, SAP, \u2026). Once saved, a read-only column with that ID will appear in task tables.",
    thExternalTicketId: "External ID",
    cardOtherFieldsRequired: "Required",
    cardOtherFieldsOptional: "Optional",
    fldOptionalSuffix: "(optional)",
    toastRequiredFieldsMissing: "Required fields are not set",
    lblValGroup: "Sprint Validation",
    lblEditGroup: "Sprint Editing",
    lblHistClearGroup: "Full Sprint History Clearing",
    hintHistClearGroup: "Only members of this group can completely clear the entire sprint history of the project.",
    lblAssignerGroup: "Assignee & Dates Edit (Assigner)",
    hintAssignerGroup: "Members can change task assignees and start/end dates without full edit rights. Hierarchy: editor\u2283assigner\u2283viewer.",
    toastNoHistClearRights: "Insufficient rights to clear sprint history",
    phFilterGroups: "Filter groups",
    grpTeams: "GROUPS AND TEAMS",
    btnResetGroup: "Reset selection",
    overlimitModalBody: "Current allocation exceeds the available resource. To fix it, reduce allocations or raise the resource. If you leave it as is \u2014 the sprint status will be downgraded to Draft and require re-validation.",
    overlimitModalBodyTpl: 'Current allocation for role "{role}" exceeds the available resource. To fix it, reduce allocations or raise the resource. If you leave it as is \u2014 the sprint status will be downgraded to Draft and require re-validation.',
    overlimitModalDowngrade: "Downgrade status and continue",
    overlimitModalCancel: "Cancel \u2014 I will fix it",
    toastOverlimitDowngraded: "Sprint status downgraded due to overlimit. Fix and re-validate.",
    tooltipRowLocked: 'Sprint is distributed. Use "Open for edit" in history to modify.',
    toastAllocatedLockHint: 'Sprint is distributed \u2014 table is read-only. To edit, open the sprint from history with "Open for edit".',
    lblDynEdit: "Direct editing of YouTrack issue fields from sprint table",
    tooltipDynEdit: "When enabled, the sprint table gains extra columns (Fact, Resource, Allocation) and the State/System/Priority/XPriority cells become editable with direct write-back to YouTrack issues. Be mindful of YouTrack API load on bulk edits.",
    descDynEdit: 'When enabled: the "Refresh task data" button is hidden; table fields become interactive. Changes are applied to YouTrack tasks with confirmation.',
    lblPersonalRes: "Use personal planning for automatic total resource calculation",
    descPersonalRes: 'When enabled, manual resource input on the "Overall Load Planning" tab is replaced by a calculated value based on the team composition.',
    lblPersonalMode: "Personal Planning Mode",
    descPersonalMode: 'Enables the "Task Distribution" tab and resource calculation by assignee.',
    lblNkcJanuary: "Standard hours: January (h)",
    lblNkcMay: "Standard hours: May (h)",
    lblNkcOther: "Standard hours: other months (h)",
    lblRate: "Rate",
    lblParticipation: "Participation % (0\u20131)",
    lblKpeIntern: "PF Intern",
    lblKpeJun: "PF Junior",
    lblKpeMid: "PF Middle",
    lblKpeSenior: "PF Senior",
    btnSaveSettings: "Save Settings",
    bannerCfg: "\u26A0\uFE0F One or more previously selected fields have been removed or changed type. Please fix the configuration.",
    bannerNoSettings: "\u26A0\uFE0F Plugin settings are not filled in. Go to the Settings tab.",
    bannerNoRoles: "\u26A0\uFE0F No functional roles selected. Please choose at least one role in Settings.",
    bannerOrphanGanttColorsText: "\u26A0 Assignments found only in Gantt:",
    bannerOrphanGanttColorsHint: "Assign them manually in \u201CPeople\u201D mode.",
    btnDismiss: "Dismiss",
    modalReassignTitle: "Reassign task",
    modalReassignBody: "Choose assignee for task",
    reassignOptionUnassigned: "\u2014 Unassigned \u2014",
    btnApply: "Apply",
    btnCancel: "Cancel",
    ganttReassignNoRights: "You don't have rights to reassign tasks.",
    ganttReassignDisabledByInlineEdit: "Enable inline editing of YouTrack fields in settings to reassign tasks on the Gantt chart.",
    diagPanelTitle: "Diagnostic log (for incident investigation)",
    btnExportLog: "Export TXT",
    toastLogExported: "Log exported.",
    toastLogEmpty: "Log is empty \u2014 nothing to export.",
    lblHideDiagLogUi: "Hide diagnostic log panel from UI",
    hintHideDiagLogUi: "When checked, the \xABDiagnostic log\xBB block at the bottom of the widget is hidden. Events still go to memory and are available through TXT export after unchecking.",
    ganttBarTooltipUnassigned: "Unassigned",
    cardSprintIntro: "Sprint Overview",
    lblSprintName: "Sprint Name",
    phSprintName: "e.g. Sprint 1 \u2014 April 2026",
    lblDateStart: "Start Date",
    lblDateEnd: "End Date",
    lblSprintField: "Sprint",
    lblVersionField: "Version",
    cardAvailRes: "Available Resources",
    cardRemRes: "Resource Remainders",
    cardStatusPlanning: "Planning Status",
    btnEditHist: "\u270F Edit",
    btnFinishSprint: "\u2713 Finish Sprint",
    btnExcelTitle: "Save to Excel",
    btnDeleteTitle: "Delete",
    histSprintLabel: "Sprint",
    histVersionLabel: "Version",
    phResource: "e.g. 5d",
    cardComposition: "Sprint Composition",
    btnNewSprint: "New Sprint",
    btnSaveParams: "Save Parameters",
    btnSaveSprintIntro: "Save Sprint Parameters",
    btnPickTasks: "+ Pick Tasks",
    btnRefreshTasks: "\u27F3 Refresh Task Data",
    btnRecalc: "\u2211 Recalculate Remainder",
    btnClear: "Clear",
    btnToday: "Today",
    btnValidate: "Validate",
    thId: "ID",
    thSystem: "System",
    thPriority: "Priority",
    thXpriority: "Cross<br>Priority",
    thState: "State",
    thTitle: "Title",
    thEstimate: "Estimate",
    thFact: "Actual",
    thResource: "Resource",
    thAllocation: "Allocation",
    thIncStatus: "Inclusion<br>Status",
    phSelectRole: "\u2014 select role \u2014",
    lblCurrentSprint: "Current sprint",
    phNoSprintsActive: "\u2014 no active sprints \u2014",
    btnNewSprintWidget: "New sprint",
    lblHasWorkingCopy: "Working copy",
    hintBadgeAggregated: "Lowest status across active roles",
    hintWcIndicator: "A working copy exists \u2014 click to open editing",
    wcCloseTitle: "Close working copy?",
    wcCloseBody: "You have an in-progress edit for the current sprint/role. Changes are auto-saved \u2014 you can resume later from History.",
    wcCloseConfirm: "Close and switch",
    wcSourceSnapshot: "Snapshot",
    wcSourceWorkingCopy: "Working copy",
    wcSpoilerNotice: "This is an in-progress edit by {who}, {when}",
    currentRoleNoSprintSelected: "Select a sprint in the widget header",
    currentRoleNoRolesForSprint: "No role records in history for the selected sprint",
    dstSubPersonal: "Personal Planning",
    dstSubGantt: "Gantt Chart",
    lblSelectNkc: "Select standard hours",
    optNkcJanuary: "Standard hours: January",
    optNkcMay: "Standard hours: May",
    optNkcOther: "Standard hours: other months",
    nkcJanuary: "Standard hours: January",
    nkcMay: "Standard hours: May",
    nkcOther: "Standard hours: other months",
    lblTotalResource: "Total Resource (h)",
    lblTotalRemain: "Remainder (h)",
    btnCalcResource: "Calculate Resource",
    btnSaveCurrentRoleParams: "Save parameters",
    toastCurrentRoleParamsSaved: "Distribution parameters saved",
    btnValidateCurrentRole: "Validate Distribution",
    cardAssignees: "Assignee Resources",
    btnPickAssignees: "Pick Assignees",
    btnClearAssignees: "Clear",
    thTeamMember: "Team Member",
    thGrade: "Grade",
    thResHours: "Resource (h)",
    thResourceH: "Resource (h)",
    thRemHours: "Remainder (h)",
    thRemainH: "Remainder (h)",
    emptyAssignees: "Select a sprint and click \u201CPick Assignees\u201D",
    cardTaskCurrentRole: "Task Distribution",
    thAllocHours: "Allocation (h)",
    thAllocH: "Allocation (h)",
    thAssignee: "Assignee",
    thStart: "Start",
    thFinish: "Finish",
    emptyTaskCurrentRole: "Select a sprint",
    btnUpdateGantt: "\u21BA Update Gantt Chart",
    ganttDblClickHint: "Double-click a bar to toggle color (red \u2194 blue)",
    emptyGantt: "Select a sprint and assign tasks to team members",
    btnClearHistory: "Clear All History",
    dirtyBadge: "\u25CF  Unsaved changes",
    draftSavedAt: "\u{1F4BE} Draft saved {ts}",
    draftSavedAtTitle: "Local draft in browser. Use \u201CClear draft\u201D to reload the server version.",
    tooltipDirtyRow: "Changes not saved to server",
    btnClearDraft: "Clear draft",
    btnClearDraftTitle: "Delete local draft and load server version",
    clearDraftConfirmTitle: "Clear local draft?",
    clearDraftConfirmBody: "All unsaved changes will be lost. The server version stays intact.",
    btnYesClearDraft: "Yes, clear",
    draftMetaInfo: "Draft from {ts}, sections: {sections}",
    draftSectionSprint: "sprint header",
    draftSectionRoleItems: "composition",
    draftSectionCurrentRole: "distribution",
    toastDraftRestored: "Restored unsaved changes from {ts}",
    toastDraftStale: "Server data was updated by another user \u2014 draft is not applied",
    toastDraftCleared: "Local draft cleared",
    toastDraftClearErr: "Failed to clear draft",
    toastDraftQuotaExceeded: "Browser local storage quota exceeded \u2014 clear the draft",
    toastDraftTooLarge: "Draft is too large for local storage",
    emptyHistory: "No saved sprints",
    modalClearHistTitle: "Clear Sprint History",
    clearAllHistTitle: "Clear Sprint History",
    modalClearHistWarn: "\u26A0 This action will permanently delete all history records.",
    clearAllHistWarn: "\u26A0 This action will permanently delete <b>all</b> history records.",
    modalClearHistInfo: "Data is stored in YouTrack and cannot be restored. Continue?",
    clearAllHistInfo: "Data is stored in YouTrack and cannot be restored. Continue?",
    btnNo: "No",
    btnClose: "Close",
    btnYesClearAll: "Yes, clear all",
    modalPickTitle: "Pick Tasks for Sprint",
    pickModalTitle: "Pick Tasks for Sprint",
    phPickQuery: "YouTrack query (e.g. Priority: Critical #unresolved)",
    btnFind: "Find",
    emptyPickResults: "Enter a query and click \u201CFind\u201D",
    btnAddPicked: "Add Selected",
    confirmClearTask: "Remove all tasks from the current sprint (role)?",
    btnYesClear: "Yes, clear",
    confirmDelAssignee: "Remove assignee?",
    fromList: "from list",
    btnYesDelete: "Yes, delete",
    confirmClearAssignees: "Clear the entire assignee list? Task assignments will be preserved.",
    confirmDelHist: "Delete history record? It will be restored on next validation.",
    confirmFinishSprint: "Mark sprint as \u201CClosed\u201D? This action is irreversible.",
    btnYesFinish: "Yes, finish",
    dynModalTitle: "Update Field Value",
    phDynInput: "e.g. 2d 4h",
    btnYesUpdate: "Yes, update",
    toastInitError: "Initialization error: ",
    toastSettingsSaved: "Settings saved",
    toastSettingsErr: "Save error",
    toastSprintSaved: "Sprint parameters saved",
    toastSprintCreated: "New sprint created",
    toastNoRights: "Insufficient rights to edit",
    toastNoRightsShort: "Insufficient rights",
    toastRecalcDone: "Remainder recalculated",
    toastNoValidRights: "Insufficient validation rights",
    toastFillSettings: "Please fill in plugin settings",
    toastFillDates: "Please fill in sprint dates",
    toastFillResource: "Please fill in available resources",
    toastNoActiveTasks: "No active tasks in composition",
    toastChecking: "Checking\u2026",
    toastSprintConfirmed: "Sprint ({role}) confirmed. Record saved.",
    toastSaveError: "Save error: ",
    toastCheckError: "Rights check error",
    toastCleared: "Composition cleared",
    toastEstUpdated: "Estimates updated",
    toastPickAtLeastOne: "Select at least one task",
    titlePickAll: "Select all results across all pages",
    toastPickAllLoading: "Loading all pages\u2026",
    toastPickAllLoaded: "Selected tasks: {n}",
    toastPickAllLimit: "Loaded {n} tasks. Limit reached \u2014 refine the query to select more.",
    toastPickAllErr: "Failed to load pages",
    toastPickPageMetaLost: "Metadata for some tasks is lost \u2014 repeat the search",
    toastNoEditRights: "Insufficient rights to edit",
    toastHistoryCleared: "History cleared",
    toastHistoryClearErr: "History clear error: ",
    toastXlsxErr: "XLSX library not loaded. Check your network connection.",
    toastXlsxLoading: "Loading XLSX library\u2026",
    toastSelectSprint: "Select a sprint",
    toastSelectRole: "Select an active role first",
    toastAssigneesEmpty: "Assignee list is empty. Click \u201CPick Assignees\u201D first.",
    toastResourceRecalc: "Resource recalculated",
    toastSelectRoleFirst: "Select sprint role before picking assignees.",
    toastNoUserField: "No user field set for role \u201C{role}\u201D \u2014 go to Settings \u2192 User Fields by Role.",
    toastPickLoading: "Loading\u2026",
    toastPickDone: "Assignees picked from bundle: ",
    toastPickEmpty: "Field bundle contains no users. Check field settings in YouTrack.",
    toastPickErr: "Bundle load error: ",
    toastCurrentRoleAllocated: "Distribution complete. Sprint status: \u201CDistributed\u201D.",
    toastSprintFinished: "Sprint marked as \u201CClosed\u201D",
    toastHistDeleted: "Record deleted",
    toastAssigneeDeleted: "Assignee removed",
    toastAssigneesCleared: "Assignees cleared",
    toastSaving: "Saving\u2026",
    toastError: "Error: ",
    toastDateError: "End date cannot be before start date",
    toastTasksAdded: "Added: ",
    toastDuplicates: " (duplicates skipped: ",
    pageOf: "Page ",
    pageOfSep: " / ",
    noSprintsAvail: "\u2014 no sprints available \u2014",
    phNotSelected: "\u2014 not selected \u2014",
    labelProject: "Project: ",
    overlimitBadge: "\u26A0 Allocation exceeds task resource",
    overlimitTooltip: "Allocation of one or more tasks exceeds the task resource (delta)",
    histSpoilerName: "Name",
    histSpoilerRole: "Role",
    histSpoilerStart: "Start",
    histSpoilerEnd: "End",
    histSpoilerStatus: "Status",
    histSpoilerTasks: "Tasks",
    histSpoilerRem: "Remainder",
    overlimitTag: "\u26A0 Over Limit",
    histColNum: "Task #",
    histColTitle: "Title",
    histColSystem: "System",
    histColPriority: "Priority",
    histColXpriority: "Cross Priority",
    histColState: "State",
    histColIncStatus: "Inclusion Status",
    histColAlloc: "Allocation",
    histColAssignee: "Assignee",
    currentRoleConfirmedAt: "Confirmed",
    currentRoleHeadStart: "Start",
    currentRoleHeadEnd: "End",
    currentRoleHeadStatus: "Status",
    excelSprintName: "Sprint Name",
    excelRole: "Role",
    excelPeriod: "Period",
    excelStatus: "Status",
    excelQtyTasks: "Task Count",
    excelResource: "Resource",
    excelRemain: "Remainder",
    excelSprint: "Sprint",
    excelVersion: "Version",
    excelColId: "Task #",
    excelColTitle: "Title",
    excelColSystem: "System",
    excelColPriority: "Priority",
    excelColXpriority: "Cross Priority",
    excelColState: "State",
    excelColInclusion: "Inclusion Status",
    excelColEstimate: "Estimate",
    excelColFact: "Fact",
    excelColResource: "Resource",
    excelColAlloc: "Allocation",
    thSortClickHint: "Click to sort by this column (click again to disable).",
    btnSyncFromYt: "Refresh from issues",
    toastSyncFromYtNoTasks: "No tasks to sync.",
    toastSyncFromYtNoField: "Assignee field is not configured for the role.",
    toastSyncFromYtUpdated: "Pulled from YouTrack: {n} updates.",
    toastSyncFromYtNoChange: "No differences with YouTrack.",
    toastSyncFromYtErr: "YouTrack sync failed.",
    excelColAssignee: "Task Owner",
    excelColLink: "Link",
    excelColStartDate: "Start",
    excelColEndDate: "Finish",
    excelSheetBase: "Current snapshot",
    excelSheetWorking: "Your working copy",
    excelDiffHighlightLegend: "Column \u201C\u0394\u201D marks rows that differ between sheets (assignee, dates, estimate, allocation, inclusion).",
    excelTotal: "TOTAL:",
    dynFieldState: "State",
    dynFieldPriority: "Priority",
    dynFieldXpriority: "Cross Priority",
    dynFieldSystem: "System",
    dynConfirmEst: "Update task estimate",
    dynConfirmEstTo: "to \xAB",
    dynIssuePrefix: "Task: ",
    tasksNotFound: "No tasks found",
    ganttColTask: "Task / Assignee",
    compEmpty: "Composition is empty",
    compSprintEmpty: 'Sprint composition is empty. Click "+ Pick Tasks".',
    currentRoleCalcEmpty: 'Select a sprint and click "Calculate Resource"',
    currentRoleNoTasks: "No active tasks",
    currentRoleNoSprint: "Sprint not found",
    histNoTasks: "No tasks",
    histNoDates: "No tasks with dates",
    alreadyInSprint: "Already in sprint",
    editBannerPrefix: "\u270F Editing sprint: ",
    tooltipNoRightsEdit: "Insufficient rights. Sprint editing group required.",
    tooltipNoRightsVal: "Insufficient rights. Sprint validation group required.",
    btnRefreshLoading: "Updating\u2026",
    pickSearching: "Searching\u2026",
    pickError: "Error: ",
    optLoading: "\u2014 loading\u2026 \u2014",
    phNotAssigned: "\u2014 not assigned \u2014",
    resColLabel: "Resource",
    noRightsSettings: "Insufficient rights to manage settings",
    resManagedByCurrentRole: "Managed via Task Distribution",
    grpsNotFound: "Groups not found",
    grpsNotLoaded: "Groups not loaded",
    status_PLANNING: "Draft",
    status_CONFIRMED: "Composition agreed",
    status_ALLOCATED: "Distributed",
    tooltipStatusAllocated: "Composition agreed, distributed",
    status_FINISHED: "Closed",
    inc_INC_PENDING: "Pending",
    inc_INC_PLANNED: "Planned",
    inc_INC_UNPLANNED: "Unplanned",
    inc_INC_EXCLUDED: "Excluded",
    btnOpenSettings: "Plugin Settings",
    btnOpenSettingsTitle: "Open plugin settings (available to members of the settings management group)",
    bannerNotConfigured: "\u26A0\uFE0F Plugin not configured. Project admin must set the management group in Project Settings \u2192 Apps \u2192 Sprint Planner.",
    appTitleSettings: "Smart Sprint Planner: Settings",
    btnCloseSettings: "Close",
    btnCloseSettingsTitle: "Close settings and return to planning",
    settingsNotConfigured: "Plugin not configured",
    settingsNotConfiguredHint: "Project admin must set the settings management group in Project Settings \u2192 Apps \u2192 Sprint Planner. Until then, the plugin is in read-only mode.",
    settingsNoAccess: "Settings access denied",
    settingsNoAccessHint: "Contact your project admin. Plugin settings management is restricted to a dedicated group.",
    settingsNoAccessGroup: "Group membership required: {group}",
    overlimitWarnSrv: "Server: resource overlimit detected for role {role}",
    nkcCrossMonthWarn: "\u26A0\uFE0F Sprint crosses month boundary. Verify the selected standard hours.",
    suffixActive: " (active)",
    wcBannerTextTpl: "\u270F Working copy: {sprint} [{role}] \xB7 base snapshot from {date}",
    wcLevel_NONE: "No changes",
    wcLevel_META_ONLY: "Metadata only \u2014 no re-validation needed",
    wcLevel_ALLOCATED_REVAL: "Allocations changed \u2014 re-validation up to \xABDistributed\xBB required",
    wcLevel_CONFIRMED_REVAL: "Composition or estimates changed \u2014 re-validation up to \xABComposition agreed\xBB required",
    wcLevelMetaOnlyShort: "META",
    wcLevelAllocatedShort: "ALLOC",
    wcLevelConfirmedShort: "CONFIRM",
    wcShowDiff: "Show diff",
    wcDiffTitle: "Working copy diff",
    wcDiffAdded: "Added tasks",
    wcDiffRemoved: "Removed tasks",
    wcDiffChanged: "Changed tasks",
    wcDiffNoChanges: "No diff \u2014 working copy is identical to the snapshot.",
    wcCloseHide: "Hide working copy",
    wcResume: "Resume editing",
    wcDiscard: "Discard working copy",
    wcDiscardConfirmTitle: "Discard working copy?",
    wcDiscardConfirmBody: "All unsaved changes in the working copy will be lost. The base history record is not affected.",
    wcDiscardedToast: "Working copy discarded. The base snapshot was not modified.",
    wcHasCopyPill: "\u270F Has working copy",
    wcEditedBy: "Editing: {who}, {when}",
    wcLockedByOther: "Already being edited by {who}",
    wcSnapshotView: "Snapshot",
    wcWorkingView: "Working copy",
    wcWorkingViewNotice: "This is an unfinished edit",
    wcConflictTitle: "Version conflict",
    wcConflictBody: "The base snapshot was modified ({who}) after this working copy was opened.",
    wcConflictOverwrite: "Overwrite with my changes",
    wcConflictExportBoth: "Export both to Excel",
    wcConflictCancel: "Cancel",
    wcMultiTabTitle: "Open in another tab",
    wcMultiTabBody: "This working copy is being edited in another tab. Continue here? Changes from the other tab may be overwritten.",
    wcMultiTabContinue: "Continue here",
    wcMultiTabReadonly: "Open read-only",
    wcGcDiscarded: "Old working copies removed: {n}",
    wcRevalidatedToast: "Snapshot updated \xB7 {level} \xB7 status: {status}",
    wcOrphanCleared: "Orphan working copy removed",
    wcMigrationNotice: "Unfinished v5.2 edit was committed as a draft. In v5.3, edits no longer destroy validated snapshots \u2014 use \xABOpen for editing\xBB to create a working copy.",
    wcStorageQuotaExceeded: "Working-copies storage quota reached. Discard old unfinished edits.",
    cannotEditFinished: "Closed sprints cannot be edited.",
    unnamedSprint: "(unnamed sprint)",
    lblManualPersonalRes: "Manual per-assignee resource",
    descManualPersonalRes: "When enabled, per-assignee resource in the \xABResources by assignee\xBB table is entered manually in hours instead of auto-calc by grade. Grade remains informational only.",
    thAllocByProject: "Allocations by project",
    allocBySysNoProject: "No project/system",
    allocBySysOverlimit: "Over limit",
    hourShort: "h",
    minuteShort: "m",
    gradeIntern: "Intern",
    gradeJunior: "Junior",
    gradeMiddle: "Middle",
    gradeSenior: "Senior",
    newSprintDraftName: "New sprint (unsaved)",
    toastSprintNameRequired: "Sprint name is required",
    toastSprintDateStartRequired: "Sprint start date is required",
    toastSprintDateEndRequired: "Sprint end date is required",
    cardStateRollup: "State rollup parent \u2190 children",
    lblStateRollupEnabled: "Enable state rollup parent \u2190 min(children)",
    hintStateRollup: "When enabled, the bundled workflow rule recomputes container State (Story / Epic) as the least-progressed state across child issues whenever any child State changes. Reuses the hierarchy config from \xABCascade aggregation\xBB above. Disable if you have custom state-propagation workflows.",
    hintStateRollupNoHierarchy: "\u26A0 Rollup needs hierarchy config from \xABCascade aggregation\xBB above (kind field + level-2 / level-3 values). Fill that section first.",
    lblStateRollupOrder: "State order (least-progressed \u2192 most-progressed)",
    lblStateRollupBundle: "Available states (from project bundle)",
    lblStateRollupOrderList: "Ordered (drag-free; use buttons)",
    btnStateRollupAdd: "\u2192 Add to order",
    btnStateRollupUp: "\u2191 Up",
    btnStateRollupDown: "\u2193 Down",
    btnStateRollupRemove: "Remove",
    hintStateRollupOrder: "Select states from the project bundle and order them from \xABleast progressed\xBB (Open / Backlog) at the top to \xABmost progressed\xBB (Done / Closed) at the bottom. The rollup picks the topmost state across all children. Minimum 2 states.",
    warnStateRollupOrderShort: "\u26A0 State order must contain at least 2 states.",
    lblStateRollupResolved: "Resolved states (won\u2019t be reopened by rollup)",
    hintStateRollupResolved: "When a container is already in any of these states, rollup will not change it back. Typically: Done, Cancelled. Leave empty to disable the guard (containers will follow children even after closing).",
    lblStateRollupFloor: "Floor state (optional)",
    optStateRollupFloorNone: "\u2014 none (pure min) \u2014",
    hintStateRollupFloor: "Containers won\u2019t drop below this state even if children would push them lower. Use to keep Epics out of \xABBacklog\xBB once analysis has started.",
    lblStateRollupStrategy: "Strategy",
    hintStateRollupStrategy: "v1.7.0 supports \xABmin\xBB only. \xABmax\xBB (any-progressed) and \xABmode\xBB (majority) are reserved for future releases.",
    btnStateRollupRescan: "\u27F3 Rescan all containers now",
    hintStateRollupRescan: "Forces a one-time recomputation across all level-2 / level-3 containers in this project. Use after enabling rollup for the first time or after a bulk state change. Cooldown: 60 seconds.",
    stateRollupRescanDeferred: "Coming in a future release",
    stateRollupRescanQueued: "Rescan queued. Workflow will process all containers shortly.",
    toastStateRollupRescanCooldown: "Rescan already running, please wait.",
    toastStateRollupRescanFailed: "Rescan request failed. Check workflow status.",
    ssbStateRollup: "State rollup",
    hintSsbStateRollup: "State rollup status (parent.State \u2190 min children)",
    toastMaxGroupsReached: "Maximum 100 groups reached",
    lblSprintGoal: "\u{1F3AF} Sprint goal",
    phSprintGoal: "What the team wants to achieve by sprint end",
    hintSprintGoal: "One or two lines. Not a task list \u2014 an outcome.",
    errSprintGoalTooLong: "Sprint goal must be \u2264 500 characters",
    toastSprintGoalMissing: "Sprint goal is empty \u2014 consider adding one",
    dialogConfirmGoalTitle: "Confirm sprint outcome",
    lblGoalOutcome: "Goal outcome",
    optGoalAchieved: "\u2705 Achieved",
    optGoalPartial: "\u2696 Partial",
    optGoalMissed: "\u274C Missed",
    lblGoalRetroNote: "Retrospective note (optional)",
    phGoalRetroNote: "What worked / didn't work toward this goal",
    errGoalRetroNoteTooLong: "Retro note must be \u2264 1000 characters",
    btnConfirmGoal: "Confirm sprint",
    btnCancelGoal: "Cancel",
    histGoalLabel: "\u{1F3AF} Goal",
    histOutcomeLabel: "Outcome",
    histRetroLabel: "\u{1F4DD} Retro",
    histGoalNotSet: "Sprint goal was not set",
    planningLevelStandup: "Stand-up",
    cardStandupSettings: "Stand-up assist",
    lblStandupDoneStates: "Done states for Stand-up",
    hintStandupDoneStates: "Tasks in these states appear in the Done bucket. If empty, the last 2 positions of State Rollup order are used.",
    standupRoleLabel: "Role:",
    btnStandupRefresh: "Refresh",
    toastStandupRefreshed: "Stand-up refreshed",
    standupBucketDone: "\u2705 Done",
    standupBucketInflight: "\u{1F504} In flight",
    standupBucketNotStarted: "\u{1F4CB} Not started",
    standupNoSprint: "Pick a sprint in the widget header or create a new one.",
    standupEmptyRole: "No tasks in this role. Add tasks in \xABRoles\xBB.",
    standupGoalLabel: "\u{1F3AF} Sprint goal:",
    standupGoalMissing: "Sprint goal is not set. Add it in the Sprint Intro card.",
    standupNoDoneStatesHint: "Configure Done states in Settings \u2192 Stand-up to populate the Done bucket.",
    "aria.btnClearDraft": "Reset draft to server version",
    "aria.btnSettings": "Open plugin settings",
    "aria.btnSave": "Save changes",
    "aria.btnValidate": "Validate before save",
    "aria.btnRefresh": "Refresh from server",
    "aria.btnAddAssignee": "Add assignee row",
    "aria.btnDeleteRow": "Delete row",
    "aria.btnClose": "Close",
    "aria.btnClearHistory": "Clear history snapshot",
    "aria.tabPlanning": "Planning tab",
    "aria.tabGantt": "Gantt chart tab",
    "aria.tabHistory": "History tab",
    "aria.levelRoles": "Roles allocation level",
    "aria.levelPeople": "People distribution level",
    "aria.levelStandup": "Daily standup view",
    "aria.dynEnumCell": "Change value (Enter to edit)",
    "aria.loading": "Loading",
    "role.analysis": "Analysis",
    "role.testing": "Testing",
    "role.devPlatform": "Platform development",
    "role.devBack": "Dev Back",
    "role.devFront": "Dev Front",
    "role.devIos": "Dev iOS",
    "role.devAndroid": "Dev Android",
    "role.devFs": "Dev FullStack",
    "role.devDb": "Dev DB",
    _meta: {
      lang: "en",
      name: "English",
      auto_translated: false,
      source: "Original (extracted from legacy-monolith.js I18N.en in v1.1.0)",
      review_status: "human_authored",
      version: "1.1.0-rc"
    }
  };

  // widgets/main/i18n/ru.json
  var ru_default = {
    appTitle: "Smart Sprint Planner",
    linkGuide: "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F",
    linkFeedback: "\u041E\u0431\u0440\u0430\u0442\u043D\u0430\u044F \u0441\u0432\u044F\u0437\u044C",
    tabSettings: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    tabPlanning: "\u041F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
    tabGantt: "\u0414\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0430 \u0413\u0430\u043D\u0442\u0430",
    tabHistory: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043F\u0440\u0438\u043D\u0442\u043E\u0432",
    planningLevelRoles: "\u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F \u043E\u0431\u0449\u0435\u0433\u043E \u0440\u0435\u0441\u0443\u0440\u0441\u0430",
    planningLevelPeople: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043F\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F\u043C",
    lblGanttRole: "\u0420\u043E\u043B\u044C:",
    ganttRoleSwitchDirtyText: "\u0423 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0440\u043E\u043B\u0438 \u0435\u0441\u0442\u044C \u043D\u0435\u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043F\u0440\u0430\u0432\u043A\u0438 \u0432 \u0434\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0435 \u0413\u0430\u043D\u0442\u0430. \u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F \u0431\u0435\u0437 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F?",
    planningRolesNoSprint: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0438\u043D\u0442 \u0432 \u0448\u0430\u043F\u043A\u0435 \u0432\u0438\u0434\u0436\u0435\u0442\u0430 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439, \u0447\u0442\u043E\u0431\u044B \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u043F\u043E \u0440\u043E\u043B\u044F\u043C.",
    planningRolesNoActive: "\u26A0\uFE0F \u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u044B \u0444\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0440\u043E\u043B\u0438 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0432\u0438\u0434\u0436\u0435\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043A \u0438 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u0443 \u0440\u043E\u043B\u044C.",
    planningRoleStatResource: "\u0420\u0435\u0441\u0443\u0440\u0441",
    planningRoleStatAlloc: "\u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F",
    planningRoleStatTasks: "\u0437\u0430\u0434\u0430\u0447",
    planningRoleStatHourSuffix: "\u0447",
    planningRoleStatOverlimit: "\u26A0 \u041F\u0435\u0440\u0435\u043B\u0438\u043C\u0438\u0442",
    btnJumpToPeople: "\u2192 \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0432 \u0440\u0435\u0436\u0438\u043C\u0435 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F \u043F\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F\u043C",
    lblTasksAbbrPlanning: "\u0437\u0430\u0434\u0430\u0447",
    lblPlanningRole: "\u0420\u043E\u043B\u044C:",
    planningPeopleNoSprint: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0438\u043D\u0442 \u0432 \u0448\u0430\u043F\u043A\u0435 \u0432\u0438\u0434\u0436\u0435\u0442\u0430 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439.",
    planningPeopleEmptyTitleTpl: "\u0414\u043B\u044F \u0440\u043E\u043B\u0438 \xAB{role}\xBB \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u043E\u0431\u0440\u0430\u043D\u044B \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438",
    planningPeopleEmptyDesc: "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0435, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439 \u0438\u0437 \u0431\u0430\u043D\u0434\u043B\u0430 \u043F\u043E\u043B\u044F Assignee.",
    planningPeopleSummaryTitleTpl: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043F\u043E \u043B\u044E\u0434\u044F\u043C \u2014 \u0440\u043E\u043B\u044C \xAB{role}\xBB",
    planningPeopleAssigneeCount: "\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439",
    planningPeopleResourceSum: "\u03A3 \u0440\u0435\u0441\u0443\u0440\u0441\u043E\u0432 \u043B\u044E\u0434\u0435\u0439",
    planningPeopleTaskAssigned: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u043E \u0437\u0430\u0434\u0430\u0447",
    planningPeopleTaskTotal: "\u0412\u0441\u0435\u0433\u043E \u0437\u0430\u0434\u0430\u0447 \u0443 \u0440\u043E\u043B\u0438",
    lblRoleResourceManual: "\u0420\u0435\u0441\u0443\u0440\u0441 \u0440\u043E\u043B\u0438 (\u0432\u0432\u0435\u0434\u0451\u043D \u0432\u0440\u0443\u0447\u043D\u0443\u044E):",
    lblPeopleSum: "\u03A3 \u043B\u044E\u0434\u0435\u0439:",
    resStatusOk: "\u2705 \u0420\u0435\u0441\u0443\u0440\u0441 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D \u0442\u043E\u0447\u043D\u043E",
    resStatusUnderTpl: "\u{1F7E1} \u041D\u0435\u0434\u043E-\u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435: {n} \u0447 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u044B",
    resStatusOverTpl: "\u{1F534} \u041F\u0435\u0440\u0435\u043B\u0438\u043C\u0438\u0442: {n} \u0447 \u0441\u0432\u0435\u0440\u0445 \u0440\u0435\u0441\u0443\u0440\u0441\u0430 \u0440\u043E\u043B\u0438",
    roleSwitchDirtyText: "\u0423 \u0440\u043E\u043B\u0438 \xAB{role}\xBB \u0435\u0441\u0442\u044C \u043D\u0435\u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F. \u041E\u043D\u0438 \u0431\u0443\u0434\u0443\u0442 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u044B \u043F\u0440\u0438 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0438. \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C?",
    btnOpenForEditingHistorical: "\u270F \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 \u043F\u0440\u0430\u0432\u043A\u0443",
    lblHistoricalReadonlyHint: "\u0421\u043F\u0440\u0438\u043D\u0442 \u043E\u0442\u043A\u0440\u044B\u0442 \u0432 \u0440\u0435\u0436\u0438\u043C\u0435 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 \u043F\u0440\u0430\u0432\u043A\u0443\xBB, \u0447\u0442\u043E\u0431\u044B \u0432\u043D\u0435\u0441\u0442\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F.",
    wcCrossTabHint: "\u270F \u041E\u0442\u043A\u0440\u044B\u0442\u043E \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430",
    cardRoles: "\u0424\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0440\u043E\u043B\u0438 \u043A\u043E\u043C\u0430\u043D\u0434-\u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    cardFieldEst: "\u041F\u043E\u043B\u044F \u043E\u0446\u0435\u043D\u043E\u043A",
    cardFieldFact: "\u041F\u043E\u043B\u044F \u0444\u0430\u043A\u0442\u0430 \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442",
    cardOtherFields: "\u041F\u0440\u043E\u0447\u0438\u0435 \u043F\u043E\u043B\u044F",
    cardUserFields: "\u041F\u043E\u043B\u044F \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439 \u043F\u043E \u0440\u043E\u043B\u044F\u043C",
    cardGroups: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0440\u0430\u0432\u0430\u043C\u0438",
    cardPlanParams: "\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    cardWorkloadSettings: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0443\u0447\u0451\u0442\u0430 \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442 \u043F\u043E \u0431\u0438\u0437\u043D\u0435\u0441-\u0451\u043C\u043A\u043E\u0441\u0442\u0438",
    cardKpe: "\u041A\u041F\u0415 (\u043A\u043E\u044D\u0444\u0444\u0438\u0446\u0438\u0435\u043D\u0442 \u043F\u043E\u043B\u0435\u0437\u043D\u043E\u0439 \u044D\u0444\u0444\u0435\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438) \u043F\u043E \u0433\u0440\u0435\u0439\u0434\u0430\u043C",
    cardModes: "\u0420\u0435\u0436\u0438\u043C\u044B \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F",
    cardMisc: "\u041F\u0440\u043E\u0447\u0435\u0435",
    secDta: "\u0423\u0447\u0451\u0442 \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442",
    cardDta: "\u0414\u0438\u0444\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0443\u0447\u0451\u0442 \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442",
    lblDtaEnabled: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0434\u0438\u0444\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0443\u0447\u0451\u0442 \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442",
    lblDtaWarnings: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044F \u043F\u043B\u0430\u043D-\u0444\u0430\u043A\u0442\u043D\u043E\u0433\u043E \u0441\u043E\u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u044F \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442",
    hintDtaWarnings: "\u0415\u0441\u043B\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E, workflow \u0432\u044B\u0434\u0430\u0451\u0442 \u043F\u043E \u043A\u0430\u0436\u0434\u043E\u0439 \u0440\u043E\u043B\u0438 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 \u043E \u0441\u043E\u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0438 \u043F\u043B\u0430\u043D/\u0444\u0430\u043A\u0442 \u043F\u0440\u0438 \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438 \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442: \u0434\u043E 90% \u2014 \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u043F\u0440\u043E\u0446\u0435\u043D\u0442, 90-100% \u2014 \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0435 \xAB\u043E\u0441\u0442\u0430\u0442\u043E\u043A \u043C\u0435\u043D\u0435\u0435 10%\xBB, \u0441\u0432\u044B\u0448\u0435 100% \u2014 \u0430\u043B\u0435\u0440\u0442 \u043E \u043F\u0435\u0440\u0435\u043B\u0438\u043C\u0438\u0442\u0435. \u041B\u0435\u0439\u0431\u043B \u0440\u043E\u043B\u0438 \u0438 \u0442\u0435\u043A\u0441\u0442 \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u044B. \u0421\u043D\u0438\u043C\u0438\u0442\u0435 \u0447\u0435\u043A\u0431\u043E\u043A\u0441, \u0435\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0442\u0438\u0445\u0430\u044F \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u0432 fact-\u043F\u043E\u043B\u044F \u0431\u0435\u0437 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439.",
    hintDta: "\u0415\u0441\u043B\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E, \u0432\u0445\u043E\u0434\u044F\u0449\u0438\u0439 \u0432 \u043F\u043B\u0430\u0433\u0438\u043D workflow-rule \u0430\u0433\u0440\u0435\u0433\u0438\u0440\u0443\u0435\u0442 workItems \u0437\u0430\u0434\u0430\u0447\u0438 \u043F\u043E \u0442\u0438\u043F\u0430\u043C \u0438 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0432 fact-\u043F\u043E\u043B\u044F \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0445 \u0440\u043E\u043B\u0435\u0439 \u0441\u043E\u0433\u043B\u0430\u0441\u043D\u043E \u043C\u0430\u043F\u043F\u0438\u043D\u0433\u0443 \u043D\u0438\u0436\u0435. \u041E\u0434\u0438\u043D \u0442\u0438\u043F \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0441 \u043E\u0434\u043D\u043E\u0439 \u0440\u043E\u043B\u044C\u044E.",
    dtaColType: "\u0422\u0438\u043F \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442 (\u0442\u043E\u0447\u043D\u043E\u0435 \u0438\u043C\u044F)",
    dtaColRole: "\u0420\u043E\u043B\u044C",
    btnDtaAddRow: "+ \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043C\u0430\u043F\u043F\u0438\u043D\u0433",
    btnDtaRemoveRow: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443",
    dtaErrDuplicate: "\u041E\u0434\u0438\u043D \u0442\u0438\u043F \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u0441 \u0434\u0432\u0443\u043C\u044F \u0440\u0430\u0437\u043D\u044B\u043C\u0438 \u0440\u043E\u043B\u044F\u043C\u0438. \u0423\u0434\u0430\u043B\u0438\u0442\u0435 \u0434\u0443\u0431\u043B\u0438\u043A\u0430\u0442 \u043F\u0435\u0440\u0435\u0434 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u043C.",
    errDuplicateEstField: "\u26A0 \u041E\u0434\u043D\u043E \u0438 \u0442\u043E \u0436\u0435 \u043F\u043E\u043B\u0435 \u043E\u0446\u0435\u043D\u043A\u0438 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043E \u0434\u043B\u044F \u0434\u0432\u0443\u0445 \u0440\u0430\u0437\u043D\u044B\u0445 \u0440\u043E\u043B\u0435\u0439. \u041A\u0430\u0436\u0434\u0430\u044F \u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u043D\u0430 \u0443\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043D\u0430 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435 period-\u043F\u043E\u043B\u0435.",
    errDuplicateFactField: "\u26A0 \u041E\u0434\u043D\u043E \u0438 \u0442\u043E \u0436\u0435 \u043F\u043E\u043B\u0435 \u0444\u0430\u043A\u0442\u0430 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043E \u0434\u043B\u044F \u0434\u0432\u0443\u0445 \u0440\u0430\u0437\u043D\u044B\u0445 \u0440\u043E\u043B\u0435\u0439. \u041A\u0430\u0436\u0434\u0430\u044F \u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u043D\u0430 \u0443\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043D\u0430 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0435 period-\u043F\u043E\u043B\u0435.",
    ssbLabel: "\u041C\u043E\u0434\u0443\u043B\u0438:",
    ssbInline: "\u0411\u044B\u0441\u0442\u0440\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430",
    ssbPersonal: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0435 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
    ssbDta: "\u0423\u0447\u0451\u0442 \u043F\u043E \u0442\u0438\u043F\u0430\u043C \u0427\u0427",
    ssbCascade: "\u041A\u0430\u0441\u043A\u0430\u0434 \u043F\u043B\u0430\u043D/\u0444\u0430\u043A\u0442",
    ssbOn: "\u0432\u043A\u043B",
    ssbOff: "\u0432\u044B\u043A\u043B",
    hintSsbInline: "\u041F\u0440\u044F\u043C\u043E\u0435 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u043B\u0435\u0439 \u0437\u0430\u0434\u0430\u0447 \u0432 \u0442\u0430\u0431\u043B\u0438\u0446\u0435 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0449\u0438\u043A\u0430 (dynEditEnabled).",
    hintSsbPersonal: "\u0423\u0440\u043E\u0432\u0435\u043D\u044C \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F \u043F\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F\u043C \u0430\u043A\u0442\u0438\u0432\u0435\u043D (personalPlanningEnabled).",
    hintSsbDta: "Workflow \u0434\u0438\u0444\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u0443\u0447\u0451\u0442\u0430 \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442 \u0430\u043A\u0442\u0438\u0432\u0435\u043D \u2014 workItems \u0430\u0433\u0440\u0435\u0433\u0438\u0440\u0443\u044E\u0442\u0441\u044F \u043F\u043E \u0440\u043E\u043B\u044F\u043C \u0432 fact-\u043F\u043E\u043B\u044F.",
    hintSsbCascade: "\u041A\u0430\u0441\u043A\u0430\u0434\u043D\u0430\u044F \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F parent \u2190 child \u0430\u043A\u0442\u0438\u0432\u043D\u0430 \u2014 \u043F\u043E\u043B\u044F \u043F\u043B\u0430\u043D\u0430/\u0444\u0430\u043A\u0442\u0430 \u0434\u043E\u0447\u0435\u0440\u043D\u0438\u0445 \u0437\u0430\u0434\u0430\u0447 \u0441\u0443\u043C\u043C\u0438\u0440\u0443\u044E\u0442\u0441\u044F \u0432 parent'\u044B 2-\u0433\u043E \u0438 3-\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u0435\u0439.",
    dtaTypePlaceholder: "\u043D\u0430\u043F\u0440. \u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430",
    dtaEmptyTable: "\u041C\u0430\u043F\u043F\u0438\u043D\u0433\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u044B. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB+ \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043C\u0430\u043F\u043F\u0438\u043D\u0433\xBB, \u0447\u0442\u043E\u0431\u044B \u0441\u043E\u0437\u0434\u0430\u0442\u044C.",
    secCascade: "\u041A\u0430\u0441\u043A\u0430\u0434 \u043E\u0446\u0435\u043D\u043E\u043A \u0438 \u0427\u0427",
    cardCascade: "\u041A\u0430\u0441\u043A\u0430\u0434\u043D\u0430\u044F \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u043E\u0446\u0435\u043D\u043E\u043A \u0438 \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442",
    lblCascadeEnabled: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043A\u0430\u0441\u043A\u0430\u0434\u043D\u0443\u044E \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044E parent \u2190 child",
    hintCascade: "\u0415\u0441\u043B\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E, \u0432\u0445\u043E\u0434\u044F\u0449\u0438\u0439 \u0432 \u043F\u043B\u0430\u0433\u0438\u043D workflow-rule \u0441\u0443\u043C\u043C\u0438\u0440\u0443\u0435\u0442 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F plan/fact-\u043F\u043E\u043B\u0435\u0439 \u043F\u043E \u0440\u043E\u043B\u044F\u043C (\u0431\u0435\u0440\u0443\u0442\u0441\u044F \u0438\u0437 \u043C\u0430\u043F\u043F\u0438\u043D\u0433\u0430 DTA \xAB\u041F\u043E\u043B\u044F \u2192 \u041F\u043B\u0430\u043D/\u0424\u0430\u043A\u0442\xBB) \u0441 \u0434\u043E\u0447\u0435\u0440\u043D\u0438\u0445 \u0437\u0430\u0434\u0430\u0447 \u0432 \u0438\u0445 parent'\u044B 2-\u0433\u043E \u0438 3-\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F \u043F\u043E \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u043E\u0439 \u0440\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0439 \u0441\u0432\u044F\u0437\u0438. \u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C 2 \u0443\u0440\u043E\u0432\u043D\u044F \u0438\u0435\u0440\u0430\u0440\u0445\u0438\u0438 (\u0437\u0430\u0434\u0430\u0447\u0430 \u2192 2-\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C \u2192 3-\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C).",
    lblForbidContainer: "\u0417\u0430\u043F\u0440\u0435\u0442\u0438\u0442\u044C \u043F\u0440\u044F\u043C\u043E\u0435 \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442 \u043D\u0430 \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438",
    hintForbidContainer: "\u0415\u0441\u043B\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E, save \u043E\u0442\u043A\u043B\u043E\u043D\u044F\u0435\u0442\u0441\u044F \u043F\u0440\u0438 \u043F\u043E\u043F\u044B\u0442\u043A\u0435 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0438\u043B\u0438 \u043E\u0442\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C workItem \u043D\u0430 \u0437\u0430\u0434\u0430\u0447\u0435, \u0442\u0438\u043F \u043A\u043E\u0442\u043E\u0440\u043E\u0439 \u043F\u043E\u043F\u0430\u0434\u0430\u0435\u0442 \u0432 \u0441\u043F\u0438\u0441\u043E\u043A \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0439 2-\u0433\u043E \u0438\u043B\u0438 3-\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F. \u0421\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u0442\u0440\u0443\u0434\u043E\u0437\u0430\u0442\u0440\u0430\u0442 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 \u043A\u043E\u043D\u0435\u0447\u043D\u044B\u0445 \u0434\u043E\u0447\u0435\u0440\u043D\u0438\u0445 \u0437\u0430\u0434\u0430\u0447\u0430\u0445.",
    warnCascadeWithoutForbid: "\u26A0 \u041A\u0430\u0441\u043A\u0430\u0434 \u0432\u043A\u043B\u044E\u0447\u0451\u043D, \u0430 \u0437\u0430\u043F\u0440\u0435\u0442 \u2014 \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D: \u043B\u044E\u0431\u043E\u0435 \u043F\u0440\u044F\u043C\u043E\u0435 \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0430 \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u043D\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0435 \u0431\u0443\u0434\u0435\u0442 \u043F\u0435\u0440\u0435\u0437\u0430\u0442\u0451\u0440\u0442\u043E \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u043A\u0430\u0441\u043A\u0430\u0434\u043D\u043E\u0439 \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u0435\u0439. \u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \xAB\u0417\u0430\u043F\u0440\u0435\u0442\u0438\u0442\u044C \u043F\u0440\u044F\u043C\u043E\u0435 \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435\xBB, \u0447\u0442\u043E\u0431\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0446\u0435\u043B\u043E\u0441\u0442\u043D\u043E\u0441\u0442\u044C \u0430\u0433\u0440\u0435\u0433\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0439.",
    lblCascadeKindField: "\u041F\u043E\u043B\u0435 \u0442\u0438\u043F\u0430 \u0437\u0430\u0434\u0430\u0447\u0438",
    lblCascadeLevel2: "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u044F 2-\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F (story-like)",
    lblCascadeLevel3: "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u044F 3-\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F (epic-like) \u2014 \u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E",
    hintCascadeLevel3Optional: "\u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0435\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u043D\u0430 1 \u0448\u0430\u0433 \u0432\u0432\u0435\u0440\u0445 (task \u2192 2-\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C). \u041F\u0440\u0438 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0438 \u043A\u0430\u0441\u043A\u0430\u0434 \u0440\u0430\u0441\u0448\u0438\u0440\u044F\u0435\u0442\u0441\u044F \u0434\u043E 3-\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F (2-\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C \u2192 3-\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C).",
    warnCascadeLevelsOverlap: "\u26A0 \u0417\u043D\u0430\u0447\u0435\u043D\u0438\u044F 2-\u0433\u043E \u0438 3-\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F \u043D\u0435 \u0434\u043E\u043B\u0436\u043D\u044B \u043F\u0435\u0440\u0435\u0441\u0435\u043A\u0430\u0442\u044C\u0441\u044F \u2014 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0441\u043E\u0437\u0434\u0430\u0451\u0442 \u043D\u0435\u043E\u0434\u043D\u043E\u0437\u043D\u0430\u0447\u043D\u043E\u0441\u0442\u044C \u0438 \u043B\u043E\u043C\u0430\u0435\u0442 \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044E.",
    lblCascadeLinkInward: "\u0420\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u0441\u0432\u044F\u0437\u044C \u2014 inward (child \u2192 parent)",
    lblCascadeLinkOutward: "\u0420\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u0441\u0432\u044F\u0437\u044C \u2014 outward (parent \u2192 child)",
    hintCascadeLinks: "\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442\u0441\u044F \u0438\u043C\u0435\u043D\u0430 \u0432\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u043E\u0439 \u0441\u0432\u044F\u0437\u0438 YouTrack \xABSubtask\xBB (inward \xABsubtask of\xBB, outward \xABparent for\xBB). \u041F\u0435\u0440\u0435\u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0439\u0442\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0435\u0441\u043B\u0438 \u0432 \u043F\u0440\u043E\u0435\u043A\u0442\u0435 \u0441\u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u0430\u044F \u0441\u0432\u044F\u0437\u044C. \u0414\u043E\u043B\u0436\u043D\u044B \u0431\u044B\u0442\u044C \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u044B \u043E\u0431\u0430 \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F.",
    phCascadeLinkInward: "subtask of",
    phCascadeLinkOutward: "parent for",
    secAccess: "\u0414\u043E\u0441\u0442\u0443\u043F \u0438 \u0440\u043E\u043B\u0438",
    secFields: "\u041C\u0430\u043F\u043F\u0438\u043D\u0433 \u043F\u043E\u043B\u0435\u0439 YouTrack",
    secNorms: "\u041D\u043E\u0440\u043C\u0430\u0442\u0438\u0432\u044B \u0440\u0430\u0441\u0447\u0451\u0442\u0430",
    secModes: "\u0420\u0435\u0436\u0438\u043C\u044B \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F",
    secMisc: "\u041F\u0440\u043E\u0447\u0435\u0435",
    lblLang: "\u042F\u0437\u044B\u043A \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430",
    lblDefaultLang: "\u042F\u0437\u044B\u043A \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
    hintDefaultLang: "\u041F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u043A \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F\u043C, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0435\u0449\u0451 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043B\u0438 \u0441\u0432\u043E\u0439 \u044F\u0437\u044B\u043A. \u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C \u2014 \u043B\u044F\u0436\u0435\u0442 fallback \u043D\u0430 \u044F\u0437\u044B\u043A \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F (\u0438\u043B\u0438 RU \u043A\u0430\u043A legacy-default).",
    fldPriority: "\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
    fldXpriority: "\u0421\u043A\u0432\u043E\u0437\u043D\u043E\u0439 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
    fldState: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435",
    fldSystem: "\u0421\u0438\u0441\u0442\u0435\u043C\u0430",
    fldSprint: "\u041F\u043E\u043B\u0435 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    fldSprintOptional: "(\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)",
    fldVersion: "\u0412\u0435\u0440\u0441\u0438\u044F",
    fldVersionOptional: "(\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)",
    fldExternalTicketId: "ID \u0437\u0430\u0434\u0430\u0447\u0438 \u0432\u043E \u0432\u043D\u0435\u0448\u043D\u0435\u0439 \u0441\u0438\u0441\u0442\u0435\u043C\u0435",
    fldExternalTicketIdOptional: "(\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)",
    hintExternalTicketId: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 string-\u043F\u043E\u043B\u0435 YouTrack, \u0432 \u043A\u043E\u0442\u043E\u0440\u043E\u043C \u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F ID \u0442\u0438\u043A\u0435\u0442\u0430 \u0432\u043E \u0432\u043D\u0435\u0448\u043D\u0435\u0439 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 (Service Desk, Jira, 1C, SAP, \u2026). \u041F\u043E\u0441\u043B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0432 \u0442\u0430\u0431\u043B\u0438\u0446\u0430\u0445 \u0437\u0430\u0434\u0430\u0447 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F read-only \u043A\u043E\u043B\u043E\u043D\u043A\u0430 \u0441 \u044D\u0442\u0438\u043C ID.",
    thExternalTicketId: "\u0412\u043D\u0435\u0448\u043D\u0438\u0439 ID",
    cardOtherFieldsRequired: "\u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435",
    cardOtherFieldsOptional: "\u041D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435",
    fldOptionalSuffix: "(\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)",
    toastRequiredFieldsMissing: "\u041D\u0435 \u0437\u0430\u0434\u0430\u043D\u044B \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u043E\u043B\u044F",
    lblValGroup: "\u0412\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    lblEditGroup: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    lblHistClearGroup: "\u041F\u043E\u043B\u043D\u0430\u044F \u043E\u0447\u0438\u0441\u0442\u043A\u0430 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u0441\u043F\u0440\u0438\u043D\u0442\u043E\u0432",
    hintHistClearGroup: "\u0422\u043E\u043B\u044C\u043A\u043E \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u044D\u0442\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u044B \u043C\u043E\u0433\u0443\u0442 \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u043E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0432\u0441\u0435\u0445 \u0441\u043F\u0440\u0438\u043D\u0442\u043E\u0432 \u043F\u0440\u043E\u0435\u043A\u0442\u0430.",
    lblAssignerGroup: "\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439 \u0438 \u0434\u0430\u0442 (Assigner)",
    hintAssignerGroup: "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u043C\u043E\u0433\u0443\u0442 \u043C\u0435\u043D\u044F\u0442\u044C \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439 \u0438 \u0434\u0430\u0442\u044B \u0437\u0430\u0434\u0430\u0447 \u0431\u0435\u0437 \u043F\u043E\u043B\u043D\u044B\u0445 \u043F\u0440\u0430\u0432 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F. \u0418\u0435\u0440\u0430\u0440\u0445\u0438\u044F: editor\u2283assigner\u2283viewer.",
    toastNoHistClearRights: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432 \u043D\u0430 \u043F\u043E\u043B\u043D\u0443\u044E \u043E\u0447\u0438\u0441\u0442\u043A\u0443 \u0438\u0441\u0442\u043E\u0440\u0438\u0438",
    phFilterGroups: "\u0424\u0438\u043B\u044C\u0442\u0440\u043E\u0432\u0430\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u044B",
    grpTeams: "\u0413\u0420\u0423\u041F\u041F\u042B \u0418 \u041A\u041E\u041C\u0410\u041D\u0414\u042B",
    btnResetGroup: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u044B\u0431\u043E\u0440",
    overlimitModalBody: "\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u0430\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0439 \u0440\u0435\u0441\u0443\u0440\u0441. \u0427\u0442\u043E\u0431\u044B \u0438\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C, \u0443\u043C\u0435\u043D\u044C\u0448\u0438\u0442\u0435 \u0430\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u0438 \u0438\u043B\u0438 \u0443\u0432\u0435\u043B\u0438\u0447\u044C\u0442\u0435 \u0440\u0435\u0441\u0443\u0440\u0441. \u0415\u0441\u043B\u0438 \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043A\u0430\u043A \u0435\u0441\u0442\u044C \u2014 \u0441\u0442\u0430\u0442\u0443\u0441 \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u043D\u0438\u0436\u0435\u043D \u0434\u043E \u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u0430 \u0438 \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F.",
    overlimitModalBodyTpl: "\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u0430\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F \u043F\u043E \u0440\u043E\u043B\u0438 \xAB{role}\xBB \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0439 \u0440\u0435\u0441\u0443\u0440\u0441. \u0427\u0442\u043E\u0431\u044B \u0438\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C, \u0443\u043C\u0435\u043D\u044C\u0448\u0438\u0442\u0435 \u0430\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u0438 \u0438\u043B\u0438 \u0443\u0432\u0435\u043B\u0438\u0447\u044C\u0442\u0435 \u0440\u0435\u0441\u0443\u0440\u0441. \u0415\u0441\u043B\u0438 \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043A\u0430\u043A \u0435\u0441\u0442\u044C \u2014 \u0441\u0442\u0430\u0442\u0443\u0441 \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u043D\u0438\u0436\u0435\u043D \u0434\u043E \u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u0430 \u0438 \u043F\u043E\u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F.",
    overlimitModalDowngrade: "\u041F\u043E\u043D\u0438\u0437\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441 \u0438 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C",
    overlimitModalCancel: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u2014 \u044F \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u044E",
    toastOverlimitDowngraded: "\u0421\u0442\u0430\u0442\u0443\u0441 \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u043F\u043E\u043D\u0438\u0436\u0435\u043D \u0438\u0437-\u0437\u0430 \u043F\u0435\u0440\u0435\u043B\u0438\u043C\u0438\u0442\u0430. \u0423\u0441\u0442\u0440\u0430\u043D\u0438\u0442\u0435 \u0438 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u0443\u0439\u0442\u0435 \u0437\u0430\u043D\u043E\u0432\u043E.",
    tooltipRowLocked: "\u0421\u043F\u0440\u0438\u043D\u0442 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 \u043F\u0440\u0430\u0432\u043A\u0443\xBB \u0432 \u0438\u0441\u0442\u043E\u0440\u0438\u0438, \u0447\u0442\u043E\u0431\u044B \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C.",
    toastAllocatedLockHint: "\u0421\u043F\u0440\u0438\u043D\u0442 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D \u2014 \u0442\u0430\u0431\u043B\u0438\u0446\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0447\u0442\u0435\u043D\u0438\u044F. \u0414\u043B\u044F \u043F\u0440\u0430\u0432\u043E\u043A \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0441\u043F\u0440\u0438\u043D\u0442 \u0438\u0437 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \xAB\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 \u043F\u0440\u0430\u0432\u043A\u0443\xBB.",
    lblDynEdit: "\u041F\u0440\u044F\u043C\u043E\u0435 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u043B\u0435\u0439 \u0437\u0430\u0434\u0430\u0447 YouTrack \u0438\u0437 \u0442\u0430\u0431\u043B\u0438\u0446\u044B \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    tooltipDynEdit: "\u041F\u0440\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0438 \u0432 \u0442\u0430\u0431\u043B\u0438\u0446\u0435 \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u043F\u043E\u044F\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043A\u043E\u043B\u043E\u043D\u043A\u0438 (\u0424\u0430\u043A\u0442, \u0420\u0435\u0441\u0443\u0440\u0441, \u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F) \u0438 \u044F\u0447\u0435\u0439\u043A\u0438 State/System/Priority/XPriority \u0441\u0442\u0430\u043D\u043E\u0432\u044F\u0442\u0441\u044F \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0435\u043C\u044B\u043C\u0438 \u0441 \u0437\u0430\u043F\u0438\u0441\u044C\u044E \u043F\u0440\u044F\u043C\u043E \u0432 YouTrack-\u0437\u0430\u0434\u0430\u0447\u0443. \u0423\u0447\u0438\u0442\u044B\u0432\u0430\u0439\u0442\u0435 \u043D\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u043D\u0430 YouTrack API \u043F\u0440\u0438 \u043C\u0430\u0441\u0441\u043E\u0432\u044B\u0445 \u043F\u0440\u0430\u0432\u043A\u0430\u0445.",
    descDynEdit: "\u0415\u0441\u043B\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E: \u043A\u043D\u043E\u043F\u043A\u0430 \xAB\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E \u0437\u0430\u0434\u0430\u0447\u0430\u043C\xBB \u0441\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F, \u043F\u043E\u043B\u044F \u0432 \u0442\u0430\u0431\u043B\u0438\u0446\u0435 \xAB\u0421\u043E\u0441\u0442\u0430\u0432 \u0441\u043F\u0440\u0438\u043D\u0442\u0430\xBB \u0441\u0442\u0430\u043D\u043E\u0432\u044F\u0442\u0441\u044F \u0438\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432\u043D\u044B\u043C\u0438. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u043A \u0437\u0430\u0434\u0430\u0447\u0430\u043C \u0432 YouTrack \u0441 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435\u043C.",
    lblPersonalRes: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0435 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0430\u0432\u0442\u043E\u0440\u0430\u0441\u0447\u0451\u0442\u0430 \u043E\u0431\u0449\u0435\u0433\u043E \u0440\u0435\u0441\u0443\u0440\u0441\u0430 \u043D\u0430 \u0441\u043F\u0440\u0438\u043D\u0442",
    descPersonalRes: "\u041F\u0440\u0438 \u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u0438 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u0430 \u0440\u0443\u0447\u043D\u043E\u0439 \u0432\u0432\u043E\u0434 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0433\u043E \u0440\u0435\u0441\u0443\u0440\u0441\u0430 \u043D\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u0435 \xAB\u041F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043E\u0431\u0449\u0435\u0439 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0441\u043F\u0440\u0438\u043D\u0442\u0430\xBB \u0437\u0430\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u043D\u0430 \u043A\u0430\u043B\u044C\u043A\u0443\u043B\u0438\u0440\u0443\u0435\u043C\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u0441\u043E\u0441\u0442\u0430\u0432\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u044B.",
    lblPersonalMode: "\u0420\u0435\u0436\u0438\u043C \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F",
    descPersonalMode: "\u0412\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \xAB\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\xBB \u0438 \u0440\u0430\u0441\u0447\u0451\u0442 \u0440\u0435\u0441\u0443\u0440\u0441\u043E\u0432 \u043F\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F\u043C.",
    lblNkcJanuary: "\u041D\u043E\u0440\u043C\u0430 \u0447\u0430\u0441\u043E\u0432: \u044F\u043D\u0432\u0430\u0440\u044C (\u0447)",
    lblNkcMay: "\u041D\u043E\u0440\u043C\u0430 \u0447\u0430\u0441\u043E\u0432: \u043C\u0430\u0439 (\u0447)",
    lblNkcOther: "\u041D\u043E\u0440\u043C\u0430 \u0447\u0430\u0441\u043E\u0432: \u0434\u0440\u0443\u0433\u0438\u0435 \u043C\u0435\u0441\u044F\u0446\u044B (\u0447)",
    lblRate: "\u0421\u0442\u0430\u0432\u043A\u0430",
    lblParticipation: "% \u0443\u0447\u0430\u0441\u0442\u0438\u044F (0\u20131)",
    lblKpeIntern: "\u041A\u041F\u0415 \u0421\u0442\u0430\u0436\u0451\u0440",
    lblKpeJun: "\u041A\u041F\u0415 \u0414\u0436\u0443\u043D",
    lblKpeMid: "\u041A\u041F\u0415 \u041C\u0438\u0434\u043B",
    lblKpeSenior: "\u041A\u041F\u0415 \u0421\u0438\u043D\u044C\u043E\u0440",
    btnSaveSettings: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    bannerCfg: "\u26A0\uFE0F \u041E\u0434\u043D\u043E \u0438\u043B\u0438 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u043D\u0435\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0445 \u043F\u043E\u043B\u0435\u0439 \u0443\u0434\u0430\u043B\u0435\u043D\u043E \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u043E \u0442\u0438\u043F. \u0418\u0441\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044E.",
    bannerNoSettings: "\u26A0\uFE0F \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 \u043D\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u044B. \u041F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u043D\u0430 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \xAB\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438\xBB.",
    bannerNoRoles: "\u26A0\uFE0F \u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u044B \u0444\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0440\u043E\u043B\u0438 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u0443 \u0440\u043E\u043B\u044C \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445.",
    bannerOrphanGanttColorsText: "\u26A0 \u041D\u0430\u0439\u0434\u0435\u043D\u044B \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0413\u0430\u043D\u0442\u0435:",
    bannerOrphanGanttColorsHint: "\u041D\u0430\u0437\u043D\u0430\u0447\u044C\u0442\u0435 \u0438\u0445 \u0432\u0440\u0443\u0447\u043D\u0443\u044E \u0432 \u0440\u0435\u0436\u0438\u043C\u0435 \xAB\u041B\u044E\u0434\u0438\xBB.",
    btnDismiss: "\u0421\u043A\u0440\u044B\u0442\u044C",
    modalReassignTitle: "\u041D\u0430\u0437\u043D\u0430\u0447\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443",
    modalReassignBody: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0433\u043E \u0434\u043B\u044F \u0437\u0430\u0434\u0430\u0447\u0438",
    reassignOptionUnassigned: "\u2014 \u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u2014",
    btnApply: "\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C",
    btnCancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
    ganttReassignNoRights: "\u0423 \u0432\u0430\u0441 \u043D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u043F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447.",
    ganttReassignDisabledByInlineEdit: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435 inline-\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u043B\u0435\u0439 YouTrack \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445, \u0447\u0442\u043E\u0431\u044B \u043F\u0435\u0440\u0435\u043D\u0430\u0437\u043D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0438 \u043D\u0430 \u0434\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0435 \u0413\u0430\u043D\u0442\u0430.",
    diagPanelTitle: "\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043B\u043E\u0433 (\u0434\u043B\u044F \u0440\u0430\u0437\u0431\u043E\u0440\u0430 \u0438\u043D\u0446\u0438\u0434\u0435\u043D\u0442\u043E\u0432)",
    btnExportLog: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 TXT",
    toastLogExported: "\u041B\u043E\u0433 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D.",
    toastLogEmpty: "\u041B\u043E\u0433 \u043F\u0443\u0441\u0442\u043E\u0439 \u2014 \u043D\u0435\u0447\u0435\u0433\u043E \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C.",
    lblHideDiagLogUi: "\u0421\u043A\u0440\u044B\u0442\u044C \u043F\u0430\u043D\u0435\u043B\u044C \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043B\u043E\u0433\u0430 \u0438\u0437 UI",
    hintHideDiagLogUi: "\u041F\u0440\u0438 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u043E\u043C \u0444\u043B\u0430\u0433\u0435 \u0431\u043B\u043E\u043A \xAB\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043B\u043E\u0433\xBB \u0432 \u043D\u0438\u0436\u043D\u0435\u0439 \u0447\u0430\u0441\u0442\u0438 \u0432\u0438\u0434\u0436\u0435\u0442\u0430 \u0441\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F. \u0421\u0430\u043C\u0438 \u0441\u043E\u0431\u044B\u0442\u0438\u044F \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u044E\u0442 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0442\u044C\u0441\u044F \u0432 \u043F\u0430\u043C\u044F\u0442\u044C \u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u0447\u0435\u0440\u0435\u0437 \u044D\u043A\u0441\u043F\u043E\u0440\u0442 TXT \u043F\u043E\u0441\u043B\u0435 \u0441\u043D\u044F\u0442\u0438\u044F \u0444\u043B\u0430\u0433\u0430.",
    ganttBarTooltipUnassigned: "\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D",
    cardSprintIntro: "\u0412\u0432\u043E\u0434\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E \u0441\u043F\u0440\u0438\u043D\u0442\u0443",
    lblSprintName: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    phSprintName: "\u043D\u0430\u043F\u0440. \u0421\u043F\u0440\u0438\u043D\u0442 1 \u2014 \u0430\u043F\u0440\u0435\u043B\u044C 2026",
    lblDateStart: "\u0414\u0430\u0442\u0430 \u043D\u0430\u0447\u0430\u043B\u0430",
    lblDateEnd: "\u0414\u0430\u0442\u0430 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F",
    lblSprintField: "\u0421\u043F\u0440\u0438\u043D\u0442",
    lblVersionField: "\u0412\u0435\u0440\u0441\u0438\u044F",
    cardAvailRes: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u0440\u0435\u0441\u0443\u0440\u0441\u044B",
    cardRemRes: "\u041E\u0441\u0442\u0430\u0442\u043A\u0438 \u0440\u0435\u0441\u0443\u0440\u0441\u043E\u0432",
    cardStatusPlanning: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F",
    btnEditHist: "\u270F \u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
    btnFinishSprint: "\u2713 \u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0441\u043F\u0440\u0438\u043D\u0442",
    btnExcelTitle: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0432 Excel",
    btnDeleteTitle: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
    histSprintLabel: "\u0421\u043F\u0440\u0438\u043D\u0442",
    histVersionLabel: "\u0412\u0435\u0440\u0441\u0438\u044F",
    phResource: "\u043D\u0430\u043F\u0440. 5\u0434",
    cardComposition: "\u0421\u043E\u0441\u0442\u0430\u0432 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    btnNewSprint: "\u041D\u043E\u0432\u044B\u0439 \u0441\u043F\u0440\u0438\u043D\u0442",
    btnSaveParams: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B",
    btnSaveSprintIntro: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    btnPickTasks: "+ \u041F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0438",
    btnRefreshTasks: "\u27F3 \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E \u0437\u0430\u0434\u0430\u0447\u0430\u043C",
    btnRecalc: "\u2211 \u041F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u0442\u044C \u043E\u0441\u0442\u0430\u0442\u043E\u043A",
    btnClear: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C",
    btnToday: "\u0421\u0435\u0433\u043E\u0434\u043D\u044F",
    btnValidate: "\u0412\u0430\u043B\u0438\u0434\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
    thId: "ID",
    thSystem: "\u0421\u0438\u0441\u0442\u0435\u043C\u0430",
    thPriority: "\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
    thXpriority: "\u0421\u043A\u0432\u043E\u0437\u043D\u043E\u0439<br>\u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
    thState: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435",
    thTitle: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
    thEstimate: "\u041E\u0446\u0435\u043D\u043A\u0430",
    thFact: "\u0424\u0430\u043A\u0442",
    thResource: "\u0420\u0435\u0441\u0443\u0440\u0441",
    thAllocation: "\u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F",
    thIncStatus: "\u0421\u0442\u0430\u0442\u0443\u0441<br>\u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
    phSelectRole: "\u2014 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u043E\u043B\u044C \u2014",
    lblCurrentSprint: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0441\u043F\u0440\u0438\u043D\u0442",
    phNoSprintsActive: "\u2014 \u043D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0441\u043F\u0440\u0438\u043D\u0442\u043E\u0432 \u2014",
    btnNewSprintWidget: "\u041D\u043E\u0432\u044B\u0439 \u0441\u043F\u0440\u0438\u043D\u0442",
    lblHasWorkingCopy: "\u0420\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F",
    hintBadgeAggregated: "\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441 \u043F\u043E \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u043C \u0440\u043E\u043B\u044F\u043C",
    hintWcIndicator: "\u0415\u0441\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u2014 \u043A\u043B\u0438\u043A\u043D\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044E",
    wcCloseTitle: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043A\u043E\u043F\u0438\u044E?",
    wcCloseBody: "\u0423 \u0432\u0430\u0441 \u0435\u0441\u0442\u044C \u043D\u0435\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430 \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 \u0441\u043F\u0440\u0438\u043D\u0442\u0443/\u0440\u043E\u043B\u0438. \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0443\u0436\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u2014 \u0432\u044B \u0441\u043C\u043E\u0436\u0435\u0442\u0435 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043F\u043E\u0437\u0436\u0435 \u0438\u0437 \u0418\u0441\u0442\u043E\u0440\u0438\u0438.",
    wcCloseConfirm: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0438 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C",
    wcSourceSnapshot: "\u0421\u043D\u0438\u043C\u043E\u043A",
    wcSourceWorkingCopy: "\u0420\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F",
    wcSpoilerNotice: "\u042D\u0442\u043E \u043D\u0435\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430 \u043E\u0442 {who}, {when}",
    currentRoleNoSprintSelected: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0438\u043D\u0442 \u0432 \u0448\u0430\u043F\u043A\u0435 \u0432\u0438\u0434\u0436\u0435\u0442\u0430",
    currentRoleNoRolesForSprint: "\u0414\u043B\u044F \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u043D\u0435\u0442 \u0440\u043E\u043B\u0435-\u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0432 \u0438\u0441\u0442\u043E\u0440\u0438\u0438",
    dstSubPersonal: "\u041F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u043E\u0435 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
    dstSubGantt: "\u0414\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0430 \u0413\u0430\u043D\u0442\u0430",
    lblSelectNkc: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043D\u043E\u0440\u043C\u0443 \u0447\u0430\u0441\u043E\u0432",
    optNkcJanuary: "\u041D\u043E\u0440\u043C\u0430 \u0447\u0430\u0441\u043E\u0432: \u044F\u043D\u0432\u0430\u0440\u044C",
    optNkcMay: "\u041D\u043E\u0440\u043C\u0430 \u0447\u0430\u0441\u043E\u0432: \u043C\u0430\u0439",
    optNkcOther: "\u041D\u043E\u0440\u043C\u0430 \u0447\u0430\u0441\u043E\u0432: \u0434\u0440\u0443\u0433\u0438\u0435 \u043C\u0435\u0441\u044F\u0446\u044B",
    nkcJanuary: "\u041D\u043E\u0440\u043C\u0430 \u0447\u0430\u0441\u043E\u0432: \u044F\u043D\u0432\u0430\u0440\u044C",
    nkcMay: "\u041D\u043E\u0440\u043C\u0430 \u0447\u0430\u0441\u043E\u0432: \u043C\u0430\u0439",
    nkcOther: "\u041D\u043E\u0440\u043C\u0430 \u0447\u0430\u0441\u043E\u0432: \u0434\u0440\u0443\u0433\u0438\u0435 \u043C\u0435\u0441\u044F\u0446\u044B",
    lblTotalResource: "\u041E\u0431\u0449\u0438\u0439 \u0440\u0435\u0441\u0443\u0440\u0441 (\u0447)",
    lblTotalRemain: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A (\u0447)",
    btnCalcResource: "\u0420\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u0442\u044C \u0440\u0435\u0441\u0443\u0440\u0441",
    btnSaveCurrentRoleParams: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B",
    toastCurrentRoleParamsSaved: "\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B",
    btnValidateCurrentRole: "\u0412\u0430\u043B\u0438\u0434\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435",
    cardAssignees: "\u0420\u0435\u0441\u0443\u0440\u0441\u044B \u043F\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F\u043C",
    btnPickAssignees: "\u041F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439",
    btnClearAssignees: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C",
    thTeamMember: "\u0427\u043B\u0435\u043D \u043A\u043E\u043C\u0430\u043D\u0434\u044B",
    thGrade: "\u0413\u0440\u0435\u0439\u0434",
    thResHours: "\u0420\u0435\u0441\u0443\u0440\u0441 (\u0447)",
    thResourceH: "\u0420\u0435\u0441\u0443\u0440\u0441 (\u0447)",
    thRemHours: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A (\u0447)",
    thRemainH: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A (\u0447)",
    emptyAssignees: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0438\u043D\u0442 \u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439\xBB",
    cardTaskCurrentRole: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447",
    thAllocHours: "\u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F (\u0447)",
    thAllocH: "\u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F (\u0447)",
    thAssignee: "\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C",
    thStart: "\u0421\u0442\u0430\u0440\u0442",
    thFinish: "\u0424\u0438\u043D\u0438\u0448",
    emptyTaskCurrentRole: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0438\u043D\u0442",
    btnUpdateGantt: "\u21BA \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0434\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0443 \u0413\u0430\u043D\u0442\u0430",
    ganttDblClickHint: "\u0414\u0432\u043E\u0439\u043D\u043E\u0439 \u043A\u043B\u0438\u043A \u043F\u043E \u0431\u0430\u0440\u0443 \u2014 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0446\u0432\u0435\u0442 (\u043A\u0440\u0430\u0441\u043D\u044B\u0439 \u2194 \u0441\u0438\u043D\u0438\u0439)",
    emptyGantt: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0438\u043D\u0442 \u0438 \u043D\u0430\u0437\u043D\u0430\u0447\u044C\u0442\u0435 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439 \u0437\u0430\u0434\u0430\u0447\u0430\u043C",
    btnClearHistory: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u044E \u0438\u0441\u0442\u043E\u0440\u0438\u044E",
    dirtyBadge: "\u25CF  \u041D\u0435\u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
    draftSavedAt: "\u{1F4BE} \u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D {ts}",
    draftSavedAtTitle: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \xAB\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\xBB, \u0447\u0442\u043E\u0431\u044B \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u0443\u044E \u0432\u0435\u0440\u0441\u0438\u044E.",
    tooltipDirtyRow: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440",
    btnClearDraft: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A",
    btnClearDraftTitle: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u0443\u044E \u0432\u0435\u0440\u0441\u0438\u044E",
    clearDraftConfirmTitle: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A?",
    clearDraftConfirmBody: "\u0412\u0441\u0435 \u043D\u0435\u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0431\u0443\u0434\u0443\u0442 \u0443\u0442\u0435\u0440\u044F\u043D\u044B. \u0421\u0435\u0440\u0432\u0435\u0440\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F \u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439.",
    btnYesClearDraft: "\u0414\u0430, \u043E\u0447\u0438\u0441\u0442\u0438\u0442\u044C",
    draftMetaInfo: "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043E\u0442 {ts}, \u0441\u0435\u043A\u0446\u0438\u0438: {sections}",
    draftSectionSprint: "\u0448\u0430\u043F\u043A\u0430 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    draftSectionRoleItems: "\u0441\u043E\u0441\u0442\u0430\u0432",
    draftSectionCurrentRole: "\u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435",
    toastDraftRestored: "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B \u043D\u0435\u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u043E\u0442 {ts}",
    toastDraftStale: "\u0421\u0435\u0440\u0432\u0435\u0440\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u044B \u0434\u0440\u0443\u0433\u0438\u043C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C \u2014 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043D\u0435 \u043D\u0430\u043A\u0430\u0442\u044B\u0432\u0430\u0435\u0442\u0441\u044F",
    toastDraftCleared: "\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043E\u0447\u0438\u0449\u0435\u043D",
    toastDraftClearErr: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u0430",
    toastDraftQuotaExceeded: "\u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043B \u043B\u0438\u043C\u0438\u0442 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0430 \u2014 \u043E\u0447\u0438\u0441\u0442\u0438\u0442\u0435 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A",
    toastDraftTooLarge: "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0434\u043B\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F",
    emptyHistory: "\u041D\u0435\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0445 \u0441\u043F\u0440\u0438\u043D\u0442\u043E\u0432",
    modalClearHistTitle: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0441\u043F\u0440\u0438\u043D\u0442\u043E\u0432",
    clearAllHistTitle: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0441\u043F\u0440\u0438\u043D\u0442\u043E\u0432",
    modalClearHistWarn: "\u26A0 \u042D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0443\u0434\u0430\u043B\u0438\u0442 \u0432\u0441\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u0431\u0435\u0437\u0432\u043E\u0437\u0432\u0440\u0430\u0442\u043D\u043E.",
    clearAllHistWarn: "\u26A0 \u042D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0443\u0434\u0430\u043B\u0438\u0442 <b>\u0432\u0441\u0435</b> \u0437\u0430\u043F\u0438\u0441\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u0431\u0435\u0437\u0432\u043E\u0437\u0432\u0440\u0430\u0442\u043D\u043E.",
    modalClearHistInfo: "\u0414\u0430\u043D\u043D\u044B\u0435 \u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0432 YouTrack \u0438 \u043D\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u044E\u0442\u0441\u044F. \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C?",
    clearAllHistInfo: "\u0414\u0430\u043D\u043D\u044B\u0435 \u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0432 YouTrack \u0438 \u043D\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u044E\u0442\u0441\u044F. \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C?",
    btnNo: "\u041D\u0435\u0442",
    btnClose: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C",
    btnYesClearAll: "\u0414\u0430, \u043E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0441\u0451",
    modalPickTitle: "\u041F\u043E\u0434\u0431\u043E\u0440 \u0437\u0430\u0434\u0430\u0447 \u0432 \u0441\u043F\u0440\u0438\u043D\u0442",
    pickModalTitle: "\u041F\u043E\u0434\u0431\u043E\u0440 \u0437\u0430\u0434\u0430\u0447 \u0432 \u0441\u043F\u0440\u0438\u043D\u0442",
    phPickQuery: "\u0417\u0430\u043F\u0440\u043E\u0441 YouTrack (\u043D\u0430\u043F\u0440. \u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442: \u041A\u0440\u0438\u0442\u0438\u0447\u043D\u044B\u0439 #unresolved)",
    btnFind: "\u041D\u0430\u0439\u0442\u0438",
    emptyPickResults: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0437\u0430\u043F\u0440\u043E\u0441 \u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041D\u0430\u0439\u0442\u0438\xBB",
    btnAddPicked: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435",
    confirmClearTask: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438\u0437 \u0441\u043E\u0441\u0442\u0430\u0432\u0430 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u0441\u043F\u0440\u0438\u043D\u0442\u0430 (\u0440\u043E\u043B\u0438)?",
    btnYesClear: "\u0414\u0430, \u043E\u0447\u0438\u0441\u0442\u0438\u0442\u044C",
    confirmDelAssignee: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F?",
    fromList: "\u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430",
    btnYesDelete: "\u0414\u0430, \u0443\u0434\u0430\u043B\u0438\u0442\u044C",
    confirmClearAssignees: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0432\u0435\u0441\u044C \u0441\u043F\u0438\u0441\u043E\u043A \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439? \u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u0437\u0430\u0434\u0430\u0447 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F.",
    confirmDelHist: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u0438? \u041F\u0440\u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u0438 \u043E\u043D\u0430 \u0431\u0443\u0434\u0435\u0442 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430.",
    confirmFinishSprint: "\u041F\u0435\u0440\u0435\u0432\u0435\u0441\u0442\u0438 \u0441\u043F\u0440\u0438\u043D\u0442 \u0432 \u0441\u0442\u0430\u0442\u0443\u0441 \xAB\u0417\u0430\u043A\u0440\u044B\u0442\xBB? \u042D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435\u043E\u0431\u0440\u0430\u0442\u0438\u043C\u043E.",
    btnYesFinish: "\u0414\u0430, \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C",
    dynModalTitle: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043F\u043E\u043B\u044F",
    phDynInput: "\u043D\u0430\u043F\u0440. 2\u0434 4\u0447",
    btnYesUpdate: "\u0414\u0430, \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
    toastInitError: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0438\u043D\u0438\u0446\u0438\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438: ",
    toastSettingsSaved: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B",
    toastSettingsErr: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F",
    toastSprintSaved: "\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B",
    toastSprintCreated: "\u041D\u043E\u0432\u044B\u0439 \u0441\u043F\u0440\u0438\u043D\u0442 \u0441\u043E\u0437\u0434\u0430\u043D",
    toastNoRights: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432 \u0434\u043B\u044F \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F",
    toastNoRightsShort: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432",
    toastRecalcDone: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A \u043F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u043D",
    toastNoValidRights: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432 \u043D\u0430 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044E",
    toastFillSettings: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u0430",
    toastFillDates: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0434\u0430\u0442\u044B \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    toastFillResource: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u0440\u0435\u0441\u0443\u0440\u0441\u044B",
    toastNoActiveTasks: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447 \u0432 \u0441\u043E\u0441\u0442\u0430\u0432\u0435",
    toastChecking: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430\u2026",
    toastSprintConfirmed: "\u0421\u043F\u0440\u0438\u043D\u0442 ({role}) \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D. \u0417\u0430\u043F\u0438\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0430.",
    toastSaveError: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F: ",
    toastCheckError: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043F\u0440\u0430\u0432",
    toastCleared: "\u0421\u043E\u0441\u0442\u0430\u0432 \u043E\u0447\u0438\u0449\u0435\u043D",
    toastEstUpdated: "\u041E\u0446\u0435\u043D\u043A\u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u044B",
    toastPickAtLeastOne: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u0443 \u0437\u0430\u0434\u0430\u0447\u0443",
    titlePickAll: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0432\u0441\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0441\u043E \u0432\u0441\u0435\u0445 \u0441\u0442\u0440\u0430\u043D\u0438\u0446",
    toastPickAllLoading: "\u041F\u043E\u0434\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0432\u0441\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B\u2026",
    toastPickAllLoaded: "\u0412\u044B\u0431\u0440\u0430\u043D\u043E \u0437\u0430\u0434\u0430\u0447: {n}",
    toastPickAllLimit: "\u0417\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E {n} \u0437\u0430\u0434\u0430\u0447. \u041F\u0440\u0435\u0432\u044B\u0448\u0435\u043D \u043B\u0438\u043C\u0438\u0442 \u2014 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u0437\u0430\u043F\u0440\u043E\u0441 \u0434\u043B\u044F \u0432\u044B\u0431\u043E\u0440\u0430 \u0431\u043E\u043B\u044C\u0448\u0435\u0433\u043E \u043E\u0431\u044A\u0451\u043C\u0430.",
    toastPickAllErr: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u043E\u0434\u0433\u0440\u0443\u0437\u043A\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446",
    toastPickPageMetaLost: "\u041C\u0435\u0442\u0430\u0434\u0430\u043D\u043D\u044B\u0435 \u0447\u0430\u0441\u0442\u0438 \u0437\u0430\u0434\u0430\u0447 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u044B \u2014 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u0438\u0441\u043A",
    toastNoEditRights: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432 \u043D\u0430 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
    toastHistoryCleared: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043E\u0447\u0438\u0449\u0435\u043D\u0430",
    toastHistoryClearErr: "\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0447\u0438\u0441\u0442\u043A\u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u0438: ",
    toastXlsxErr: "\u0411\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A\u0430 XLSX \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u0430. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043A \u0441\u0435\u0442\u0438.",
    toastXlsxLoading: "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C XLSX-\u0431\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A\u0443\u2026",
    toastSelectSprint: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0438\u043D\u0442",
    toastSelectRole: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u0443\u044E \u0440\u043E\u043B\u044C",
    toastAssigneesEmpty: "\u0421\u043F\u0438\u0441\u043E\u043A \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439 \u043F\u0443\u0441\u0442. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439\xBB.",
    toastResourceRecalc: "\u0420\u0435\u0441\u0443\u0440\u0441 \u043F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u043D",
    toastSelectRoleFirst: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u043E\u043B\u044C \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u043F\u0435\u0440\u0435\u0434 \u043F\u043E\u0434\u0431\u043E\u0440\u043E\u043C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439.",
    toastNoUserField: "\u041D\u0435 \u0437\u0430\u0434\u0430\u043D\u043E \u043F\u043E\u043B\u0435 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u0434\u043B\u044F \u0440\u043E\u043B\u0438 \xAB{role}\xBB \u2014 \u0437\u0430\u0439\u0434\u0438\u0442\u0435 \u0432 \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2192 \u041F\u043E\u043B\u044F \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439 \u043F\u043E \u0440\u043E\u043B\u044F\u043C.",
    toastPickLoading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026",
    toastPickDone: "\u041F\u043E\u0434\u043E\u0431\u0440\u0430\u043D\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439 \u0438\u0437 \u0431\u0430\u043D\u0434\u043B\u0430: ",
    toastPickEmpty: "\u0411\u0430\u043D\u0434\u043B \u043F\u043E\u043B\u044F \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043E\u043B\u044F \u0432 YouTrack.",
    toastPickErr: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0438\u0437 \u0431\u0430\u043D\u0434\u043B\u0430: ",
    toastCurrentRoleAllocated: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E. \u0421\u0442\u0430\u0442\u0443\u0441 \u0441\u043F\u0440\u0438\u043D\u0442\u0430: \xAB\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D \u043F\u043E \u043B\u044E\u0434\u044F\u043C\xBB.",
    toastSprintFinished: "\u0421\u043F\u0440\u0438\u043D\u0442 \u043F\u0435\u0440\u0435\u0432\u0435\u0434\u0451\u043D \u0432 \u0441\u0442\u0430\u0442\u0443\u0441 \xAB\u0417\u0430\u043A\u0440\u044B\u0442\xBB",
    toastHistDeleted: "\u0417\u0430\u043F\u0438\u0441\u044C \u0443\u0434\u0430\u043B\u0435\u043D\u0430",
    toastAssigneeDeleted: "\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C \u0443\u0434\u0430\u043B\u0451\u043D",
    toastAssigneesCleared: "\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438 \u043E\u0447\u0438\u0449\u0435\u043D\u044B",
    toastSaving: "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u2026",
    toastError: "\u041E\u0448\u0438\u0431\u043A\u0430: ",
    toastDateError: "\u0414\u0430\u0442\u0430 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043C\u0435\u043D\u044C\u0448\u0435 \u0434\u0430\u0442\u044B \u043D\u0430\u0447\u0430\u043B\u0430",
    toastTasksAdded: "\u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E: ",
    toastDuplicates: " (\u0434\u0443\u0431\u043B\u0435\u0439 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E: ",
    pageOf: "\u0421\u0442\u0440. ",
    pageOfSep: " / ",
    noSprintsAvail: "\u2014 \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0445 \u0441\u043F\u0440\u0438\u043D\u0442\u043E\u0432 \u2014",
    phNotSelected: "\u2014 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043E \u2014",
    labelProject: "\u041F\u0440\u043E\u0435\u043A\u0442: ",
    overlimitBadge: "\u26A0 \u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u0440\u0435\u0441\u0443\u0440\u0441 \u0437\u0430\u0434\u0430\u0447\u0438",
    overlimitTooltip: "\u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F \u043E\u0434\u043D\u043E\u0439 \u0438\u043B\u0438 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u0438\u0445 \u0437\u0430\u0434\u0430\u0447 \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 \u0440\u0435\u0441\u0443\u0440\u0441 (\u0434\u0435\u043B\u044C\u0442\u0443) \u044D\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438",
    histSpoilerName: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
    histSpoilerRole: "\u0420\u043E\u043B\u044C",
    histSpoilerStart: "\u041D\u0430\u0447\u0430\u043B\u043E",
    histSpoilerEnd: "\u041E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u0435",
    histSpoilerStatus: "\u0421\u0442\u0430\u0442\u0443\u0441",
    histSpoilerTasks: "\u0417\u0430\u0434\u0430\u0447",
    histSpoilerRem: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A",
    overlimitTag: "\u26A0 \u041F\u0435\u0440\u0435\u043B\u0438\u043C\u0438\u0442",
    histColNum: "\u2116 \u0437\u0430\u0434\u0430\u0447\u0438",
    histColTitle: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
    histColSystem: "\u0421\u0438\u0441\u0442\u0435\u043C\u0430",
    histColPriority: "\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
    histColXpriority: "\u0421\u043A\u0432\u043E\u0437\u043D\u043E\u0439 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
    histColState: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435",
    histColIncStatus: "\u0421\u0442\u0430\u0442\u0443\u0441 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
    histColAlloc: "\u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F",
    histColAssignee: "\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C",
    currentRoleConfirmedAt: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D",
    currentRoleHeadStart: "\u041D\u0430\u0447\u0430\u043B\u043E",
    currentRoleHeadEnd: "\u041E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u0435",
    currentRoleHeadStatus: "\u0421\u0442\u0430\u0442\u0443\u0441",
    excelSprintName: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    excelRole: "\u0420\u043E\u043B\u044C",
    excelPeriod: "\u041F\u0435\u0440\u0438\u043E\u0434",
    excelStatus: "\u0421\u0442\u0430\u0442\u0443\u0441",
    excelQtyTasks: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0437\u0430\u0434\u0430\u0447",
    excelResource: "\u0420\u0435\u0441\u0443\u0440\u0441",
    excelRemain: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A",
    excelSprint: "\u0421\u043F\u0440\u0438\u043D\u0442",
    excelVersion: "\u0412\u0435\u0440\u0441\u0438\u044F",
    excelColId: "\u2116 \u0437\u0430\u0434\u0430\u0447\u0438",
    excelColTitle: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435",
    excelColSystem: "\u0421\u0438\u0441\u0442\u0435\u043C\u0430",
    excelColPriority: "\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
    excelColXpriority: "\u0421\u043A\u0432\u043E\u0437\u043D\u043E\u0439 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
    excelColState: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435",
    excelColInclusion: "\u0421\u0442\u0430\u0442\u0443\u0441 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F",
    excelColEstimate: "\u041E\u0446\u0435\u043D\u043A\u0430",
    excelColFact: "\u0424\u0430\u043A\u0442",
    excelColResource: "\u0420\u0435\u0441\u0443\u0440\u0441",
    excelColAlloc: "\u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F",
    thSortClickHint: "\u041A\u043B\u0438\u043A \u2014 \u0441\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0430 \u043F\u043E \u044D\u0442\u043E\u0439 \u043A\u043E\u043B\u043E\u043D\u043A\u0435 (\u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E \u2014 \u0432\u044B\u043A\u043B.)",
    btnSyncFromYt: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0438\u0437 \u0437\u0430\u0434\u0430\u0447",
    toastSyncFromYtNoTasks: "\u041D\u0435\u0442 \u0437\u0430\u0434\u0430\u0447 \u0434\u043B\u044F \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438.",
    toastSyncFromYtNoField: "\u041D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043E \u043F\u043E\u043B\u0435 \xAB\u041D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\xBB \u0434\u043B\u044F \u0440\u043E\u043B\u0438.",
    toastSyncFromYtUpdated: "\u041F\u043E\u0434\u0442\u044F\u043D\u0443\u0442\u043E \u0438\u0437 YouTrack: {n} \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439.",
    toastSyncFromYtNoChange: "\u0420\u0430\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0439 \u0441 YouTrack \u043D\u0435\u0442.",
    toastSyncFromYtErr: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438 \u0441 YouTrack.",
    excelColAssignee: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u043F\u043E \u0437\u0430\u0434\u0430\u0447\u0435",
    excelColLink: "\u0421\u0441\u044B\u043B\u043A\u0430",
    excelColStartDate: "\u0421\u0442\u0430\u0440\u0442",
    excelColEndDate: "\u0424\u0438\u043D\u0438\u0448",
    excelTotal: "\u0418\u0422\u041E\u0413\u041E:",
    excelSheetBase: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0441\u043D\u0438\u043C\u043E\u043A",
    excelSheetWorking: "\u0412\u0430\u0448\u0430 \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F",
    excelDiffHighlightLegend: "\u041A\u043E\u043B\u043E\u043D\u043A\u0430 \xAB\u0394\xBB \u043F\u043E\u043C\u0435\u0447\u0430\u0435\u0442 \u043E\u0442\u043B\u0438\u0447\u0430\u044E\u0449\u0438\u0435\u0441\u044F \u0441\u0442\u0440\u043E\u043A\u0438 \u043C\u0435\u0436\u0434\u0443 \u043B\u0438\u0441\u0442\u0430\u043C\u0438 (assignee, \u0434\u0430\u0442\u044B, \u043E\u0446\u0435\u043D\u043A\u0430, \u0430\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u044F, inclusion).",
    dynFieldState: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435",
    dynFieldPriority: "\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
    dynFieldXpriority: "\u0421\u043A\u0432\u043E\u0437\u043D\u043E\u0439 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442",
    dynFieldSystem: "\u0421\u0438\u0441\u0442\u0435\u043C\u0430",
    dynConfirmEst: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043E\u0446\u0435\u043D\u043A\u0443 \u0437\u0430\u0434\u0430\u0447\u0438",
    dynConfirmEstTo: "\u0434\u043E \xAB",
    dynIssuePrefix: "\u0417\u0430\u0434\u0430\u0447\u0430: ",
    tasksNotFound: "\u0417\u0430\u0434\u0430\u0447\u0438 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B",
    ganttColTask: "\u0417\u0430\u0434\u0430\u0447\u0430 / \u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C",
    compEmpty: "\u0421\u043E\u0441\u0442\u0430\u0432 \u043F\u0443\u0441\u0442",
    compSprintEmpty: "\u0421\u043E\u0441\u0442\u0430\u0432 \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u043F\u0443\u0441\u0442. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB+ \u041F\u043E\u0434\u043E\u0431\u0440\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0438\xBB.",
    currentRoleCalcEmpty: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0438\u043D\u0442 \u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0420\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u0442\u044C \u0440\u0435\u0441\u0443\u0440\u0441\xBB",
    currentRoleNoTasks: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447",
    currentRoleNoSprint: "\u0421\u043F\u0440\u0438\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D",
    histNoTasks: "\u041D\u0435\u0442 \u0437\u0430\u0434\u0430\u0447",
    histNoDates: "\u041D\u0435\u0442 \u0437\u0430\u0434\u0430\u0447 \u0441 \u0434\u0430\u0442\u0430\u043C\u0438",
    alreadyInSprint: "\u0423\u0436\u0435 \u0432 \u0441\u043E\u0441\u0442\u0430\u0432\u0435",
    editBannerPrefix: "\u270F \u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0441\u043F\u0440\u0438\u043D\u0442\u0430: ",
    tooltipNoRightsEdit: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432. \u041D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u0430 \u0433\u0440\u0443\u043F\u043F\u0430 \xAB\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0441\u043F\u0440\u0438\u043D\u0442\u0430\xBB",
    tooltipNoRightsVal: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432. \u041D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u0430 \u0433\u0440\u0443\u043F\u043F\u0430 \xAB\u0412\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0441\u043F\u0440\u0438\u043D\u0442\u0430\xBB",
    btnRefreshLoading: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435\u2026",
    pickSearching: "\u041F\u043E\u0438\u0441\u043A\u2026",
    pickError: "\u041E\u0448\u0438\u0431\u043A\u0430: ",
    optLoading: "\u2014 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026 \u2014",
    phNotAssigned: "\u2014 \u043D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043E \u2014",
    resColLabel: "\u0420\u0435\u0441\u0443\u0440\u0441",
    noRightsSettings: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432 \u0434\u043B\u044F \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u043C\u0438",
    resManagedByCurrentRole: "\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 \xAB\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\xBB",
    grpsNotFound: "\u0413\u0440\u0443\u043F\u043F\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B",
    grpsNotLoaded: "\u0413\u0440\u0443\u043F\u043F\u044B \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u044B",
    suffixActive: " (\u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0439)",
    status_PLANNING: "\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A",
    status_CONFIRMED: "\u0421\u043E\u0441\u0442\u0430\u0432 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D",
    status_ALLOCATED: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D \u043F\u043E \u043B\u044E\u0434\u044F\u043C",
    tooltipStatusAllocated: "\u0421\u043E\u0441\u0442\u0430\u0432 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D, \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D \u043F\u043E \u043B\u044E\u0434\u044F\u043C",
    status_FINISHED: "\u0417\u0430\u043A\u0440\u044B\u0442",
    inc_INC_PENDING: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F",
    inc_INC_PLANNED: "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u043F\u043B\u0430\u043D\u043E\u0432\u043E",
    inc_INC_UNPLANNED: "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0432\u043D\u0435\u043F\u043B\u0430\u043D\u043E\u0432\u043E",
    inc_INC_EXCLUDED: "\u0418\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0438\u0437 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    btnOpenSettings: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u0430",
    btnOpenSettingsTitle: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 (\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430\u043C \u0433\u0440\u0443\u043F\u043F\u044B \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u043C\u0438)",
    bannerNotConfigured: "\u26A0\uFE0F \u041F\u043B\u0430\u0433\u0438\u043D \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D. \u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0434\u043E\u043B\u0436\u0435\u043D \u0437\u0430\u0434\u0430\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0443 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u043C\u0438 \u0432 Project Settings \u2192 Apps \u2192 Sprint Planner.",
    appTitleSettings: "Smart Sprint Planner: \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    btnCloseSettings: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C",
    btnCloseSettingsTitle: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0438 \u0432\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F \u043A \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044E",
    settingsNotConfigured: "\u041F\u043B\u0430\u0433\u0438\u043D \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D",
    settingsNotConfiguredHint: "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0434\u043E\u043B\u0436\u0435\u043D \u0437\u0430\u0434\u0430\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0443 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u043C\u0438 \u0432 Project Settings \u2192 Apps \u2192 Sprint Planner. \u0414\u043E \u044D\u0442\u043E\u0433\u043E \u043C\u043E\u043C\u0435\u043D\u0442\u0430 \u043F\u043B\u0430\u0433\u0438\u043D \u0432 \u0440\u0435\u0436\u0438\u043C\u0435 read-only.",
    settingsNoAccess: "\u0414\u043E\u0441\u0442\u0443\u043F \u043A \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u043C \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D",
    settingsNoAccessHint: "\u041E\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044C \u043A \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u043C\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430\u043C \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043D\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u044B.",
    settingsNoAccessGroup: "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0447\u043B\u0435\u043D\u0441\u0442\u0432\u043E \u0432 \u0433\u0440\u0443\u043F\u043F\u0435: {group}",
    overlimitWarnSrv: "\u0421\u0435\u0440\u0432\u0435\u0440: \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D \u043F\u0435\u0440\u0435\u043B\u0438\u043C\u0438\u0442 \u0440\u0435\u0441\u0443\u0440\u0441\u043E\u0432 \u0432 \u0440\u043E\u043B\u0438 {role}",
    nkcCrossMonthWarn: "\u26A0\uFE0F \u0421\u043F\u0440\u0438\u043D\u0442 \u043F\u0435\u0440\u0435\u0441\u0435\u043A\u0430\u0435\u0442 \u0433\u0440\u0430\u043D\u0438\u0446\u0443 \u043C\u0435\u0441\u044F\u0446\u0430. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u0443\u044E \u043D\u043E\u0440\u043C\u0443 \u0447\u0430\u0441\u043E\u0432.",
    wcBannerTextTpl: "\u270F \u0420\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F: {sprint} [{role}] \xB7 \u0431\u0430\u0437\u043E\u0432\u044B\u0439 \u0441\u043D\u0438\u043C\u043E\u043A \u043E\u0442 {date}",
    wcLevel_NONE: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u043D\u0435\u0442",
    wcLevel_META_ONLY: "\u0422\u043E\u043B\u044C\u043A\u043E \u043C\u0435\u0442\u0430\u0434\u0430\u043D\u043D\u044B\u0435 \u2014 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u043D\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F",
    wcLevel_ALLOCATED_REVAL: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u044B \u0430\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u0438 \u2014 \u043D\u0443\u0436\u043D\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0434\u043E \xAB\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D\xBB",
    wcLevel_CONFIRMED_REVAL: "\u0418\u0437\u043C\u0435\u043D\u0451\u043D \u0441\u043E\u0441\u0442\u0430\u0432 \u0438\u043B\u0438 \u043E\u0446\u0435\u043D\u043A\u0438 \u2014 \u043D\u0443\u0436\u043D\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0434\u043E \xAB\u0421\u043E\u0441\u0442\u0430\u0432 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D\xBB",
    wcLevelMetaOnlyShort: "META",
    wcLevelAllocatedShort: "ALLOC",
    wcLevelConfirmedShort: "CONFIRM",
    wcShowDiff: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0440\u0430\u0437\u043B\u0438\u0447\u0438\u044F",
    wcDiffTitle: "\u0420\u0430\u0437\u043B\u0438\u0447\u0438\u044F \u0440\u0430\u0431\u043E\u0447\u0435\u0439 \u043A\u043E\u043F\u0438\u0438",
    wcDiffAdded: "\u0414\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B \u0437\u0430\u0434\u0430\u0447\u0438",
    wcDiffRemoved: "\u0423\u0434\u0430\u043B\u0435\u043D\u044B \u0437\u0430\u0434\u0430\u0447\u0438",
    wcDiffChanged: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u044B \u0437\u0430\u0434\u0430\u0447\u0438",
    wcDiffNoChanges: "\u0420\u0430\u0437\u043B\u0438\u0447\u0438\u0439 \u043D\u0435\u0442 \u2014 \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u0430 \u0441\u043D\u0438\u043C\u043A\u0443.",
    wcCloseHide: "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043A\u043E\u043F\u0438\u044E",
    wcResume: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043F\u0440\u0430\u0432\u043A\u0443",
    wcDiscard: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0440\u0430\u0432\u043A\u0443",
    wcDiscardConfirmTitle: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0440\u0430\u0432\u043A\u0443?",
    wcDiscardConfirmBody: "\u0412\u0441\u0435 \u043D\u0435\u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0440\u0430\u0431\u043E\u0447\u0435\u0439 \u043A\u043E\u043F\u0438\u0438 \u0431\u0443\u0434\u0443\u0442 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u044B. \u0411\u0430\u0437\u043E\u0432\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u043D\u0435 \u043F\u043E\u0441\u0442\u0440\u0430\u0434\u0430\u0435\u0442.",
    wcDiscardedToast: "\u0420\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430. \u0411\u0430\u0437\u043E\u0432\u044B\u0439 \u0441\u043D\u0438\u043C\u043E\u043A \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D.",
    wcHasCopyPill: "\u270F \u0415\u0441\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F",
    wcEditedBy: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0435\u0442: {who}, {when}",
    wcLockedByOther: "\u0423\u0436\u0435 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0435\u0442 {who}",
    wcSnapshotView: "\u0421\u043D\u0438\u043C\u043E\u043A",
    wcWorkingView: "\u0420\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F",
    wcWorkingViewNotice: "\u042D\u0442\u043E \u043D\u0435\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430",
    wcConflictTitle: "\u041A\u043E\u043D\u0444\u043B\u0438\u043A\u0442 \u0432\u0435\u0440\u0441\u0438\u0439",
    wcConflictBody: "\u0411\u0430\u0437\u043E\u0432\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C \u0431\u044B\u043B\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0430 ({who}) \u043F\u043E\u0441\u043B\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u044F \u0440\u0430\u0431\u043E\u0447\u0435\u0439 \u043A\u043E\u043F\u0438\u0438.",
    wcConflictOverwrite: "\u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0441\u0432\u043E\u0438\u043C\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F\u043C\u0438",
    wcConflictExportBoth: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043E\u0431\u0435 \u0432\u0435\u0440\u0441\u0438\u0438 \u0432 Excel",
    wcConflictCancel: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C",
    wcMultiTabTitle: "\u041E\u0442\u043A\u0440\u044B\u0442\u043E \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435",
    wcMultiTabBody: "\u042D\u0442\u0430 \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u0443\u0436\u0435 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435. \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0437\u0434\u0435\u0441\u044C? \u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435 \u043C\u043E\u0433\u0443\u0442 \u0431\u044B\u0442\u044C \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u0430\u043D\u044B.",
    wcMultiTabContinue: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0437\u0434\u0435\u0441\u044C",
    wcMultiTabReadonly: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430",
    wcGcDiscarded: "\u0423\u0434\u0430\u043B\u0435\u043D\u043E \u0441\u0442\u0430\u0440\u044B\u0445 \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u043A\u043E\u043F\u0438\u0439: {n}",
    wcRevalidatedToast: "\u0421\u043D\u0438\u043C\u043E\u043A \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D \xB7 {level} \xB7 \u0441\u0442\u0430\u0442\u0443\u0441: {status}",
    wcOrphanCleared: "\u0420\u0430\u0431\u043E\u0447\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u0431\u0435\u0437 \u0431\u0430\u0437\u043E\u0432\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u0430",
    wcMigrationNotice: "\u041D\u0435\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u043E\u0435 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 v5.2 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E \u043A\u0430\u043A \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A. \u0412 v5.3 \u043F\u0440\u0430\u0432\u043A\u0438 \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u0440\u0430\u0437\u0440\u0443\u0448\u0430\u044E\u0442 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0441\u043D\u0438\u043C\u043A\u0438 \u2014 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \xAB\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430 \u043F\u0440\u0430\u0432\u043A\u0443\xBB, \u0447\u0442\u043E\u0431\u044B \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043A\u043E\u043F\u0438\u044E.",
    wcStorageQuotaExceeded: "\u0414\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442 \u043B\u0438\u043C\u0438\u0442 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0430 \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u043A\u043E\u043F\u0438\u0439. \u0423\u0434\u0430\u043B\u0438\u0442\u0435 \u0441\u0442\u0430\u0440\u044B\u0435 \u043D\u0435\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u044B\u0435 \u043F\u0440\u0430\u0432\u043A\u0438.",
    cannotEditFinished: "\u0417\u0430\u043A\u0440\u044B\u0442\u044B\u0435 \u0441\u043F\u0440\u0438\u043D\u0442\u044B \u043D\u0435\u043B\u044C\u0437\u044F \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C.",
    unnamedSprint: "(\u0441\u043F\u0440\u0438\u043D\u0442 \u0431\u0435\u0437 \u0438\u043C\u0435\u043D\u0438)",
    lblManualPersonalRes: "\u0420\u0443\u0447\u043D\u043E\u0439 \u0432\u0432\u043E\u0434 \u0440\u0435\u0441\u0443\u0440\u0441\u0430 \u043F\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F\u043C",
    descManualPersonalRes: "\u0415\u0441\u043B\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E, \u0440\u0435\u0441\u0443\u0440\u0441 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F \u0432 \u0442\u0430\u0431\u043B\u0438\u0446\u0435 \xAB\u0420\u0435\u0441\u0443\u0440\u0441\u044B \u043F\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F\u043C\xBB \u0432\u0432\u043E\u0434\u0438\u0442\u0441\u044F \u0432\u0440\u0443\u0447\u043D\u0443\u044E \u0432 \u0447\u0430\u0441\u0430\u0445, \u0430 \u043D\u0435 \u0432\u044B\u0447\u0438\u0441\u043B\u044F\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u043E \u0433\u0440\u0435\u0439\u0434\u0443. \u0413\u0440\u0435\u0439\u0434 \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u043C.",
    thAllocByProject: "\u0410\u043B\u043B\u043E\u043A\u0430\u0446\u0438\u0438 \u043F\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430\u043C",
    allocBySysNoProject: "\u0412\u043D\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432/\u0441\u0438\u0441\u0442\u0435\u043C",
    allocBySysOverlimit: "\u041F\u0435\u0440\u0435\u043B\u0438\u043C\u0438\u0442",
    hourShort: "\u0447",
    minuteShort: "\u043C",
    gradeIntern: "\u0421\u0442\u0430\u0436\u0451\u0440",
    gradeJunior: "\u0414\u0436\u0443\u043D",
    gradeMiddle: "\u041C\u0438\u0434\u043B",
    gradeSenior: "\u0421\u0438\u043D\u044C\u043E\u0440",
    newSprintDraftName: "\u041D\u043E\u0432\u044B\u0439 \u0441\u043F\u0440\u0438\u043D\u0442 (\u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D)",
    toastSprintNameRequired: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    toastSprintDateStartRequired: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    toastSprintDateEndRequired: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    cardStateRollup: "\u041A\u0430\u0441\u043A\u0430\u0434 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439 parent \u2190 children",
    lblStateRollupEnabled: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043A\u0430\u0441\u043A\u0430\u0434 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439 parent \u2190 min(children)",
    hintStateRollup: "\u041F\u0440\u0438 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0438 \u0432\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u043E\u0435 workflow-\u043F\u0440\u0430\u0432\u0438\u043B\u043E \u043F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u044B\u0432\u0430\u0435\u0442 State \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u0430 (Story / Epic) \u043A\u0430\u043A \u043D\u0430\u0438\u043C\u0435\u043D\u0435\u0435 \u043F\u0440\u043E\u0434\u0432\u0438\u043D\u0443\u0442\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0441\u0440\u0435\u0434\u0438 \u0434\u043E\u0447\u0435\u0440\u043D\u0438\u0445 \u0437\u0430\u0434\u0430\u0447 \u043F\u0440\u0438 \u043B\u044E\u0431\u043E\u043C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0438 child.State. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0438\u0435\u0440\u0430\u0440\u0445\u0438\u044E \u0438\u0437 \u0441\u0435\u043A\u0446\u0438\u0438 \xAB\u041A\u0430\u0441\u043A\u0430\u0434\u043D\u0430\u044F \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u0447\u0430\u0441\u043E\u0432\xBB \u0432\u044B\u0448\u0435. \u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u0435, \u0435\u0441\u043B\u0438 \u0443 \u0432\u0430\u0441 \u0435\u0441\u0442\u044C \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0435 workflow \u0434\u043B\u044F \u0440\u0430\u0441\u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439.",
    hintStateRollupNoHierarchy: "\u26A0 \u0414\u043B\u044F \u043A\u0430\u0441\u043A\u0430\u0434\u0430 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439 \u043D\u0443\u0436\u043D\u0430 \u0438\u0435\u0440\u0430\u0440\u0445\u0438\u044F \u0438\u0437 \u0441\u0435\u043A\u0446\u0438\u0438 \xAB\u041A\u0430\u0441\u043A\u0430\u0434\u043D\u0430\u044F \u0430\u0433\u0440\u0435\u0433\u0430\u0446\u0438\u044F \u0447\u0430\u0441\u043E\u0432\xBB (kind-\u043F\u043E\u043B\u0435 + \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F level-2 / level-3). \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u0435\u0451.",
    lblStateRollupOrder: "\u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439 (\u043E\u0442 \u043D\u0430\u0438\u043C\u0435\u043D\u0435\u0435 \u043A \u043D\u0430\u0438\u0431\u043E\u043B\u0435\u0435 \u043F\u0440\u043E\u0434\u0432\u0438\u043D\u0443\u0442\u043E\u043C\u0443)",
    lblStateRollupBundle: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F (\u0438\u0437 bundle \u043F\u0440\u043E\u0435\u043A\u0442\u0430)",
    lblStateRollupOrderList: "\u0423\u043F\u043E\u0440\u044F\u0434\u043E\u0447\u0435\u043D\u043D\u044B\u0435 (\u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0438)",
    btnStateRollupAdd: "\u2192 \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u043F\u043E\u0440\u044F\u0434\u043E\u043A",
    btnStateRollupUp: "\u2191 \u0412\u0432\u0435\u0440\u0445",
    btnStateRollupDown: "\u2193 \u0412\u043D\u0438\u0437",
    btnStateRollupRemove: "\u0423\u0431\u0440\u0430\u0442\u044C",
    hintStateRollupOrder: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u0438\u0437 bundle \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0438 \u0443\u043F\u043E\u0440\u044F\u0434\u043E\u0447\u044C\u0442\u0435 \u0438\u0445 \u0441\u0432\u0435\u0440\u0445\u0443 (\u043D\u0430\u0438\u043C\u0435\u043D\u0435\u0435 \u043F\u0440\u043E\u0434\u0432\u0438\u043D\u0443\u0442\u043E\u0435 \u2014 Open / Backlog) \u0432\u043D\u0438\u0437 (\u043D\u0430\u0438\u0431\u043E\u043B\u0435\u0435 \u043F\u0440\u043E\u0434\u0432\u0438\u043D\u0443\u0442\u043E\u0435 \u2014 Done / Closed). Rollup \u0432\u044B\u0431\u0438\u0440\u0430\u0435\u0442 \u0441\u0430\u043C\u043E\u0435 \u0432\u0435\u0440\u0445\u043D\u0435\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0438\u0437 \u0432\u0441\u0435\u0445 children. \u041C\u0438\u043D\u0438\u043C\u0443\u043C 2 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F.",
    warnStateRollupOrderShort: "\u26A0 \u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439 \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u043C\u0438\u043D\u0438\u043C\u0443\u043C 2 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F.",
    lblStateRollupResolved: "\u0420\u0435\u0437\u043E\u043B\u0432\u043D\u0443\u0442\u044B\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F (rollup \u043D\u0435 \u0440\u0435\u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u0442)",
    hintStateRollupResolved: "\u0415\u0441\u043B\u0438 \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440 \u0443\u0436\u0435 \u0432 \u043E\u0434\u043D\u043E\u043C \u0438\u0437 \u044D\u0442\u0438\u0445 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439 \u2014 rollup \u0435\u0433\u043E \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442. \u041E\u0431\u044B\u0447\u043D\u043E: \u0413\u043E\u0442\u043E\u0432\u043E, \u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E. \u041E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043F\u0443\u0441\u0442\u044B\u043C, \u0447\u0442\u043E\u0431\u044B \u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C guard (\u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u044B \u0431\u0443\u0434\u0443\u0442 \u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C \u0437\u0430 children \u0434\u0430\u0436\u0435 \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u044F).",
    lblStateRollupFloor: "\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)",
    optStateRollupFloorNone: "\u2014 \u043D\u0435\u0442 (\u0447\u0438\u0441\u0442\u044B\u0439 min) \u2014",
    hintStateRollupFloor: "\u041A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u044B \u043D\u0435 \u043E\u043F\u0443\u0441\u043A\u0430\u044E\u0442\u0441\u044F \u043D\u0438\u0436\u0435 \u044D\u0442\u043E\u0433\u043E \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F, \u0434\u0430\u0436\u0435 \u0435\u0441\u043B\u0438 children \u043F\u044B\u0442\u0430\u044E\u0442\u0441\u044F \u0438\u0445 \u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435, \u0447\u0442\u043E\u0431\u044B Epic \u043D\u0435 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u043B\u0441\u044F \u0432 \xABBacklog\xBB \u043F\u043E\u0441\u043B\u0435 \u043D\u0430\u0447\u0430\u043B\u0430 \u0430\u043D\u0430\u043B\u0438\u0437\u0430.",
    lblStateRollupStrategy: "\u0421\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044F",
    hintStateRollupStrategy: "v1.7.0 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \xABmin\xBB. \xABmax\xBB (any-progressed) \u0438 \xABmode\xBB (majority) \u0437\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u044B \u0434\u043B\u044F \u0431\u0443\u0434\u0443\u0449\u0438\u0445 \u0440\u0435\u043B\u0438\u0437\u043E\u0432.",
    btnStateRollupRescan: "\u27F3 \u041F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u0442\u044C \u0432\u0441\u0435 \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u044B \u0441\u0435\u0439\u0447\u0430\u0441",
    hintStateRollupRescan: "\u041F\u0440\u0438\u043D\u0443\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u044B\u0432\u0430\u0435\u0442 \u0432\u0441\u0435 level-2 / level-3 \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u044B \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0432\u043E\u0433\u043E \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F rollup \u0438\u043B\u0438 \u043C\u0430\u0441\u0441\u043E\u0432\u043E\u0439 \u043F\u0440\u0430\u0432\u043A\u0438 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439. Cooldown: 60 \u0441\u0435\u043A\u0443\u043D\u0434.",
    stateRollupRescanDeferred: "\u041F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0432 \u043E\u0434\u043D\u043E\u043C \u0438\u0437 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0445 \u0440\u0435\u043B\u0438\u0437\u043E\u0432",
    stateRollupRescanQueued: "\u041F\u0435\u0440\u0435\u0441\u0447\u0451\u0442 \u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u044C. Workflow \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u044B \u0432 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0432\u0440\u0435\u043C\u044F.",
    toastStateRollupRescanCooldown: "\u041F\u0435\u0440\u0435\u0441\u0447\u0451\u0442 \u0443\u0436\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F, \u043F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435.",
    toastStateRollupRescanFailed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u0441\u0447\u0451\u0442. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u0442\u0430\u0442\u0443\u0441 workflow.",
    ssbStateRollup: "\u041A\u0430\u0441\u043A\u0430\u0434 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439",
    hintSsbStateRollup: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043A\u0430\u0441\u043A\u0430\u0434\u0430 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439 (parent.State \u2190 min children)",
    toastMaxGroupsReached: "\u0414\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442 \u043B\u0438\u043C\u0438\u0442 \u0432 100 \u0433\u0440\u0443\u043F\u043F",
    lblSprintGoal: "\u{1F3AF} \u0426\u0435\u043B\u044C \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    phSprintGoal: "\u0427\u0442\u043E \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u0445\u043E\u0447\u0435\u0442 \u0434\u043E\u0441\u0442\u0438\u0447\u044C \u043A \u043A\u043E\u043D\u0446\u0443 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    hintSprintGoal: "\u041E\u0434\u043D\u0430-\u0434\u0432\u0435 \u0441\u0442\u0440\u043E\u043A\u0438. \u041D\u0435 \xAB\u0441\u043F\u0438\u0441\u043E\u043A \u0437\u0430\u0434\u0430\u0447\xBB, \u0430 outcome.",
    errSprintGoalTooLong: "\u0426\u0435\u043B\u044C \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0434\u043B\u0438\u043D\u043D\u0435\u0435 500 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432",
    toastSprintGoalMissing: "\u0426\u0435\u043B\u044C \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u0430 \u2014 \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u043C \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u044C",
    dialogConfirmGoalTitle: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u0441\u043F\u0440\u0438\u043D\u0442\u0430",
    lblGoalOutcome: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u043E \u0446\u0435\u043B\u0438",
    optGoalAchieved: "\u2705 \u0414\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442\u0430",
    optGoalPartial: "\u2696 \u0427\u0430\u0441\u0442\u0438\u0447\u043D\u043E",
    optGoalMissed: "\u274C \u041D\u0435 \u0434\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442\u0430",
    lblGoalRetroNote: "\u0417\u0430\u043C\u0435\u0442\u043A\u0430 \u0440\u0435\u0442\u0440\u043E\u0441\u043F\u0435\u043A\u0442\u0438\u0432\u044B (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)",
    phGoalRetroNote: "\u0427\u0442\u043E \u0441\u0440\u0430\u0431\u043E\u0442\u0430\u043B\u043E / \u043D\u0435 \u0441\u0440\u0430\u0431\u043E\u0442\u0430\u043B\u043E \u0434\u043B\u044F \u0434\u043E\u0441\u0442\u0438\u0436\u0435\u043D\u0438\u044F \u0446\u0435\u043B\u0438",
    errGoalRetroNoteTooLong: "\u0417\u0430\u043C\u0435\u0442\u043A\u0430 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0434\u043B\u0438\u043D\u043D\u0435\u0435 1000 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432",
    btnConfirmGoal: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0441\u043F\u0440\u0438\u043D\u0442",
    btnCancelGoal: "\u041E\u0442\u043C\u0435\u043D\u0430",
    histGoalLabel: "\u{1F3AF} \u0426\u0435\u043B\u044C",
    histOutcomeLabel: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442",
    histRetroLabel: "\u{1F4DD} \u0420\u0435\u0442\u0440\u043E",
    histGoalNotSet: "\u0426\u0435\u043B\u044C \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u043D\u0435 \u0431\u044B\u043B\u0430 \u0437\u0430\u0434\u0430\u043D\u0430",
    planningLevelStandup: "Stand-up",
    cardStandupSettings: "Stand-up assist",
    lblStandupDoneStates: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \xABDone\xBB \u0434\u043B\u044F Stand-up",
    hintStandupDoneStates: "\u0417\u0430\u0434\u0430\u0447\u0438 \u0432 \u044D\u0442\u0438\u0445 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F\u0445 \u043F\u043E\u043F\u0430\u0434\u0430\u044E\u0442 \u0432 bucket \xABDone\xBB. \u0415\u0441\u043B\u0438 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u043E \u2014 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 2 \u043F\u043E\u0437\u0438\u0446\u0438\u0438 \xAB\u041F\u043E\u0440\u044F\u0434\u043A\u0430 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0439\xBB \u0438\u0437 State Rollup.",
    standupRoleLabel: "\u0420\u043E\u043B\u044C:",
    btnStandupRefresh: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
    toastStandupRefreshed: "Stand-up \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D",
    standupBucketDone: "\u2705 Done",
    standupBucketInflight: "\u{1F504} \u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
    standupBucketNotStarted: "\u{1F4CB} \u041D\u0435 \u043D\u0430\u0447\u0430\u0442\u043E",
    standupNoSprint: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043F\u0440\u0438\u043D\u0442 \u0432 \u0448\u0430\u043F\u043A\u0435 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439.",
    standupEmptyRole: "\u0421\u043E\u0441\u0442\u0430\u0432 \u0440\u043E\u043B\u0438 \u043F\u0443\u0441\u0442 \u2014 \u0434\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0432 \xAB\u0420\u043E\u043B\u0438\xBB.",
    standupGoalLabel: "\u{1F3AF} \u0426\u0435\u043B\u044C \u0441\u043F\u0440\u0438\u043D\u0442\u0430:",
    standupGoalMissing: "\u0426\u0435\u043B\u044C \u0441\u043F\u0440\u0438\u043D\u0442\u0430 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u0430. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0432 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0435 \xAB\u0412\u0432\u043E\u0434\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435\xBB.",
    standupNoDoneStatesHint: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F \xABDone\xBB \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2192 Stand-up.",
    "aria.btnClearDraft": "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043A \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u043E\u0439 \u0432\u0435\u0440\u0441\u0438\u0438",
    "aria.btnSettings": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u0430",
    "aria.btnSave": "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
    "aria.btnValidate": "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0435\u0440\u0435\u0434 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u043C",
    "aria.btnRefresh": "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430",
    "aria.btnAddAssignee": "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F",
    "aria.btnDeleteRow": "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443",
    "aria.btnClose": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C",
    "aria.btnClearHistory": "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u0438",
    "aria.tabPlanning": "\u0412\u043A\u043B\u0430\u0434\u043A\u0430 \u041F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
    "aria.tabGantt": "\u0412\u043A\u043B\u0430\u0434\u043A\u0430 \u0414\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0430 \u0413\u0430\u043D\u0442\u0430",
    "aria.tabHistory": "\u0412\u043A\u043B\u0430\u0434\u043A\u0430 \u0418\u0441\u0442\u043E\u0440\u0438\u044F",
    "aria.levelRoles": "\u0423\u0440\u043E\u0432\u0435\u043D\u044C: \u0421\u043E\u0441\u0442\u0430\u0432 \u0440\u043E\u043B\u0435\u0439",
    "aria.levelPeople": "\u0423\u0440\u043E\u0432\u0435\u043D\u044C: \u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043F\u043E \u043B\u044E\u0434\u044F\u043C",
    "aria.levelStandup": "\u0412\u044C\u044E\u0445\u0430 \u0434\u043B\u044F \u0434\u0435\u0439\u043B\u0438-\u0441\u0442\u0435\u043D\u0434\u0430\u043F\u0430",
    "aria.dynEnumCell": "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 (Enter \u0434\u043B\u044F \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F)",
    "aria.loading": "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430",
    "role.analysis": "\u0410\u043D\u0430\u043B\u0438\u0437",
    "role.testing": "\u0422\u0435\u0441\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
    "role.devPlatform": "\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435\u043D\u043D\u0430\u044F \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430",
    "role.devBack": "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 Back",
    "role.devFront": "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 Front",
    "role.devIos": "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 IOS",
    "role.devAndroid": "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 Android",
    "role.devFs": "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 FullStack",
    "role.devDb": "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u0421\u0423\u0411\u0414",
    _meta: {
      lang: "ru",
      name: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439",
      auto_translated: false,
      source: "\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B (\u0438\u0437\u0432\u043B\u0435\u0447\u0451\u043D \u0438\u0437 legacy-monolith.js I18N.ru \u0432 v1.1.0)",
      review_status: "human_authored",
      version: "1.1.0-rc"
    }
  };

  // widgets/main/src/i18n/languages.js
  var LANGS = [
    { code: "en", native: "English", flag: "\u{1F1EC}\u{1F1E7}" },
    { code: "ru", native: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439", flag: "\u{1F1F7}\u{1F1FA}" },
    { code: "cs", native: "\u010Ce\u0161tina", flag: "\u{1F1E8}\u{1F1FF}" },
    { code: "de", native: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}" },
    { code: "es", native: "Espa\xF1ol", flag: "\u{1F1EA}\u{1F1F8}" },
    { code: "fr", native: "Fran\xE7ais", flag: "\u{1F1EB}\u{1F1F7}" },
    { code: "hu", native: "Magyar", flag: "\u{1F1ED}\u{1F1FA}" },
    { code: "it", native: "Italiano", flag: "\u{1F1EE}\u{1F1F9}" },
    { code: "ja", native: "\u65E5\u672C\u8A9E", flag: "\u{1F1EF}\u{1F1F5}" },
    { code: "ko", native: "\uD55C\uAD6D\uC5B4", flag: "\u{1F1F0}\u{1F1F7}" },
    { code: "nl", native: "Nederlands", flag: "\u{1F1F3}\u{1F1F1}" },
    { code: "pl", native: "Polski", flag: "\u{1F1F5}\u{1F1F1}" },
    { code: "pt", native: "Portugu\xEAs", flag: "\u{1F1F5}\u{1F1F9}" },
    { code: "tr", native: "T\xFCrk\xE7e", flag: "\u{1F1F9}\u{1F1F7}" },
    { code: "zh", native: "\u4E2D\u6587", flag: "\u{1F1E8}\u{1F1F3}" }
  ];
  var LANG_CODES = LANGS.map(function(l) {
    return l.code;
  });
  var DEFAULT_LANG = "en";
  function isSupportedLang(code) {
    return LANG_CODES.indexOf(String(code || "").toLowerCase()) >= 0;
  }

  // widgets/main/src/i18n/loader.js
  var _cache = /* @__PURE__ */ Object.create(null);
  _cache.en = en_default;
  _cache.ru = ru_default;
  var _currentLang = null;
  var _subscribers = [];
  var _projectDefault = null;
  function safeReadStorage(key) {
    try {
      if (typeof localStorage !== "undefined" && localStorage) {
        return localStorage.getItem(key);
      }
    } catch (e) {
    }
    return null;
  }
  function safeWriteStorage(key, value) {
    try {
      if (typeof localStorage !== "undefined" && localStorage) {
        localStorage.setItem(key, value);
        return true;
      }
    } catch (e) {
    }
    return false;
  }
  function detectBrowserLang() {
    try {
      var nav = typeof navigator !== "undefined" ? navigator : null;
      if (!nav) return null;
      var raw = (nav.language || nav.languages && nav.languages[0] || "").toLowerCase();
      if (!raw) return null;
      var primary = raw.split("-")[0];
      if (isSupportedLang(primary)) return primary;
    } catch (e) {
    }
    return null;
  }
  function getCurrentLang() {
    if (_currentLang) return _currentLang;
    var fromStorage = (safeReadStorage("ssp_lang") || "").toLowerCase();
    if (fromStorage && isSupportedLang(fromStorage)) {
      _currentLang = fromStorage;
      return _currentLang;
    }
    if (_projectDefault && isSupportedLang(_projectDefault)) {
      _currentLang = _projectDefault;
      return _currentLang;
    }
    var fromBrowser = detectBrowserLang();
    if (fromBrowser) {
      _currentLang = fromBrowser;
      return _currentLang;
    }
    _currentLang = DEFAULT_LANG;
    return _currentLang;
  }
  function setProjectDefault(lang) {
    var v = String(lang || "").toLowerCase();
    if (v && isSupportedLang(v)) _projectDefault = v;
    else _projectDefault = null;
  }
  function setLang(lang) {
    var v = String(lang || "").toLowerCase();
    if (!isSupportedLang(v)) v = DEFAULT_LANG;
    _currentLang = v;
    safeWriteStorage("ssp_lang", v);
    return loadDictionary(v).then(function(dict) {
      notify(v, dict);
      return { lang: v, dict };
    });
  }
  function loadDictionary(lang) {
    var v = String(lang || "").toLowerCase();
    if (!isSupportedLang(v)) v = DEFAULT_LANG;
    if (_cache[v]) return Promise.resolve(_cache[v]);
    var url = resolveDictUrl(v);
    return fetch(url, { credentials: "same-origin" }).then(function(resp) {
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return resp.json();
    }).then(function(json) {
      _cache[v] = json || {};
      return _cache[v];
    }).catch(function(err) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[ssp-i18n] failed to load dictionary for " + v + ", falling back to EN:", err);
      }
      _cache[v] = en_default;
      return en_default;
    });
  }
  function resolveDictUrl(lang) {
    return "i18n/" + lang + ".json";
  }
  function getCachedDictionary(lang) {
    var v = String(lang || getCurrentLang()).toLowerCase();
    return _cache[v] || null;
  }
  function subscribe(cb) {
    if (typeof cb !== "function") return function() {
    };
    _subscribers.push(cb);
    return function unsubscribe() {
      var idx = _subscribers.indexOf(cb);
      if (idx >= 0) _subscribers.splice(idx, 1);
    };
  }
  function notify(lang, dict) {
    for (var i = 0; i < _subscribers.length; i++) {
      try {
        _subscribers[i](lang, dict);
      } catch (e) {
      }
    }
  }

  // widgets/main/src/i18n/plural.js
  var plural_exports = {};
  __export(plural_exports, {
    formatPlural: () => formatPlural,
    isPluralForms: () => isPluralForms
  });
  var _rulesCache = /* @__PURE__ */ Object.create(null);
  function getRules(lang) {
    var key = String(lang || "en").toLowerCase();
    if (_rulesCache[key]) return _rulesCache[key];
    try {
      if (typeof Intl !== "undefined" && Intl.PluralRules) {
        _rulesCache[key] = new Intl.PluralRules(key);
        return _rulesCache[key];
      }
    } catch (e) {
    }
    _rulesCache[key] = null;
    return null;
  }
  function formatPlural(formsObject, count, lang) {
    if (formsObject == null) return "";
    if (typeof formsObject === "string") {
      return interpolate(formsObject, count);
    }
    if (typeof formsObject !== "object") return String(formsObject);
    var rules = getRules(lang);
    var form = "other";
    try {
      if (rules) {
        form = rules.select(typeof count === "number" ? count : 0);
      }
    } catch (e) {
    }
    var picked = formsObject[form];
    if (typeof picked !== "string") picked = formsObject.other;
    if (typeof picked !== "string") {
      for (var k in formsObject) {
        if (Object.prototype.hasOwnProperty.call(formsObject, k) && typeof formsObject[k] === "string") {
          picked = formsObject[k];
          break;
        }
      }
    }
    if (typeof picked !== "string") return "";
    return interpolate(picked, count);
  }
  function interpolate(template, count) {
    if (typeof count !== "number") return template;
    return template.replace(/\{n\}|\{count\}/g, String(count));
  }
  function isPluralForms(value) {
    return value != null && typeof value === "object" && (typeof value.other === "string" || typeof value.one === "string");
  }

  // widgets/main/src/i18n-bridge.js
  if (typeof window !== "undefined") {
    window.__SSP_I18N__ = loader_exports;
    window.__SSP_I18N_DICTS__ = { en: en_default, ru: ru_default };
    window.__SSP_I18N_LANGS__ = LANGS;
    window.__SSP_I18N_PLURAL__ = plural_exports;
  }

  // widgets/main/src/index.js
  var import_ring_class_helpers = __toESM(require_ring_class_helpers());

  // widgets/main/src/legacy-monolith.js
  (function() {
    "use strict";
    var INC = {
      PENDING: "INC_PENDING",
      PLANNED: "INC_PLANNED",
      UNPLANNED: "INC_UNPLANNED",
      EXCLUDED: "INC_EXCLUDED"
    };
    var ACTIVE_INC = [INC.PLANNED, INC.UNPLANNED];
    function statusLabel(code) {
      if (!code) return "";
      return T("status_" + code) || code;
    }
    function incLabel(code) {
      if (!code) return "";
      return T("inc_" + code) || code;
    }
    function roleLabel(role) {
      if (!role) return "";
      var t = T("role." + role.key);
      if (t !== "role." + role.key) return t;
      return _lang === "en" && role.labelEn ? role.labelEn : role.label || role.key;
    }
    var STATUS_MIGRATION = {
      "\u041F\u043B\u0430\u043D\u0438\u0440\u0443\u0435\u0442\u0441\u044F": "PLANNING",
      "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D": "PLANNING",
      "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D": "CONFIRMED",
      "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D": "CONFIRMED",
      "\u0410\u043B\u043B\u043E\u0446\u0438\u0440\u043E\u0432\u0430\u043D": "ALLOCATED",
      "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D, \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D, \u0430\u043B\u043B\u043E\u0446\u0438\u0440\u043E\u0432\u0430\u043D": "ALLOCATED",
      "\u0417\u0430\u0432\u0435\u0440\u0448\u0451\u043D": "FINISHED",
      "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D": "FINISHED"
    };
    var INC_MIGRATION = {
      "\u041E\u0436\u0438\u0434\u0430\u0435\u0442 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F": "INC_PENDING",
      "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u043F\u043B\u0430\u043D\u043E\u0432\u043E": "INC_PLANNED",
      "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0432\u043D\u0435\u043F\u043B\u0430\u043D\u043E\u0432\u043E": "INC_UNPLANNED",
      "\u0418\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0438\u0437 \u0441\u043F\u0440\u0438\u043D\u0442\u0430": "INC_EXCLUDED"
    };
    function migrateStatus(v) {
      if (!v) return v;
      if (STATUS_MIGRATION[v]) return STATUS_MIGRATION[v];
      if (v === "PLANNED") return "PLANNING";
      return v;
    }
    function migrateInc(v) {
      return v && INC_MIGRATION[v] ? INC_MIGRATION[v] : v;
    }
    var safeLs = {
      get: function(k) {
        try {
          return localStorage.getItem(k);
        } catch (e) {
          return null;
        }
      },
      set: function(k, v) {
        try {
          localStorage.setItem(k, v);
          return true;
        } catch (e) {
          return false;
        }
      },
      del: function(k) {
        try {
          localStorage.removeItem(k);
        } catch (e) {
        }
      }
    };
    var SORT_KEYS_CYCLE = ["off", "xpriority", "priority", "id", "system", "externalTicketId"];
    var _sortKeyMemo = null;
    function getSortKey() {
      if (_sortKeyMemo !== null) return _sortKeyMemo;
      var v = safeLs.get("ssp_sortKey");
      _sortKeyMemo = SORT_KEYS_CYCLE.indexOf(v) >= 0 ? v : "off";
      return _sortKeyMemo;
    }
    function setSortKey(k) {
      if (SORT_KEYS_CYCLE.indexOf(k) < 0) k = "off";
      _sortKeyMemo = k;
      safeLs.set("ssp_sortKey", k);
    }
    function _xpRank(xp) {
      var m = String(xp || "").match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 1e6;
    }
    var _PRIORITY_RANK_MAP = {
      "Show-stopper": 0,
      "Critical": 1,
      "Major": 2,
      "Normal": 3,
      "Minor": 4
    };
    function _prRank(p) {
      var k = String(p || "");
      return k in _PRIORITY_RANK_MAP ? _PRIORITY_RANK_MAP[k] : 1e6;
    }
    function _idCmp(a, b) {
      return String(a || "").localeCompare(String(b || ""), void 0, { numeric: true });
    }
    function multiKeySort(items, primary) {
      if (!Array.isArray(items)) return items;
      primary = primary || getSortKey();
      if (primary === "off") return items;
      var arr = items.slice();
      arr.sort(function(a, b) {
        if (primary === "id") {
          var c0 = _idCmp(a.issueId, b.issueId);
          if (c0 !== 0) return c0;
          return _xpRank(a.xpriority) - _xpRank(b.xpriority) || _prRank(a.priority) - _prRank(b.priority);
        }
        if (primary === "priority") {
          var c1 = _prRank(a.priority) - _prRank(b.priority);
          if (c1 !== 0) return c1;
          return _xpRank(a.xpriority) - _xpRank(b.xpriority) || _idCmp(a.issueId, b.issueId);
        }
        if (primary === "system") {
          var sysA = String(a.system || "").toLowerCase();
          var sysB = String(b.system || "").toLowerCase();
          var cs = sysA < sysB ? -1 : sysA > sysB ? 1 : 0;
          if (cs !== 0) return cs;
          return _xpRank(a.xpriority) - _xpRank(b.xpriority) || _idCmp(a.issueId, b.issueId);
        }
        if (primary === "externalTicketId") {
          var extA = String(a.externalTicketId || "").toLowerCase();
          var extB = String(b.externalTicketId || "").toLowerCase();
          var ce = extA < extB ? -1 : extA > extB ? 1 : 0;
          if (ce !== 0) return ce;
          return _idCmp(a.issueId, b.issueId);
        }
        var c2 = _xpRank(a.xpriority) - _xpRank(b.xpriority);
        if (c2 !== 0) return c2;
        return _prRank(a.priority) - _prRank(b.priority) || _idCmp(a.issueId, b.issueId);
      });
      return arr;
    }
    function _rerenderAllSortableTables() {
      Object.keys(_uiExpandedRoles || {}).forEach(function(rk) {
        if (_uiExpandedRoles[rk] && typeof renderRoleComposition === "function") {
          try {
            renderRoleComposition(rk);
          } catch (_) {
          }
        }
      });
      try {
        if (typeof renderCurrentRoleTaskTable === "function") renderCurrentRoleTaskTable();
      } catch (_) {
      }
      try {
        if (typeof renderGanttChart === "function") renderGanttChart();
      } catch (_) {
      }
    }
    var _sortDelegated = false;
    function _bindSortHeaders(thead) {
      if (_sortDelegated) return;
      _sortDelegated = true;
      document.addEventListener("click", function(e) {
        var t = e.target;
        var th = t && typeof t.closest === "function" ? t.closest("th[data-sort-key]") : null;
        if (!th) return;
        var k = th.getAttribute("data-sort-key");
        if (!k) return;
        var cur = getSortKey();
        setSortKey(cur === k ? "off" : k);
        _rerenderAllSortableTables();
      });
    }
    _bindSortHeaders();
    var _i18nBridge = typeof window !== "undefined" && window.__SSP_I18N__ || null;
    var _i18nDicts = typeof window !== "undefined" && window.__SSP_I18N_DICTS__ || { en: {}, ru: {} };
    var _i18nPlural = typeof window !== "undefined" && window.__SSP_I18N_PLURAL__ || null;
    var I18N = {
      en: _i18nDicts && _i18nDicts.en || {},
      ru: _i18nDicts && _i18nDicts.ru || {}
    };
    var _lang = _i18nBridge ? _i18nBridge.getCurrentLang() : safeLs.get("ssp_lang") || "en";
    function T(key) {
      var d = I18N[_lang] || {};
      if (d[key] !== void 0) return d[key];
      if (I18N.en && I18N.en[key] !== void 0) return I18N.en[key];
      if (I18N.ru && I18N.ru[key] !== void 0) return I18N.ru[key];
      return key;
    }
    function Tn(key, count) {
      var d = I18N[_lang] || {};
      var forms = d[key] !== void 0 ? d[key] : I18N.en && I18N.en[key] !== void 0 ? I18N.en[key] : null;
      if (forms == null) return key;
      if (typeof forms === "string") {
        return forms.replace(/\{n\}|\{count\}/g, String(count));
      }
      if (_i18nPlural && typeof _i18nPlural.formatPlural === "function") {
        return _i18nPlural.formatPlural(forms, count, _lang);
      }
      if (typeof forms.other === "string") return forms.other.replace(/\{n\}|\{count\}/g, String(count));
      for (var k in forms) {
        if (Object.prototype.hasOwnProperty.call(forms, k) && typeof forms[k] === "string") {
          return forms[k].replace(/\{n\}|\{count\}/g, String(count));
        }
      }
      return key;
    }
    var ICONS = typeof window !== "undefined" && window.__SSP_ICONS || {};
    function icon(name, ariaLabel, opts) {
      opts = opts || {};
      var svg = ICONS[name];
      if (!svg) {
        console.warn("[ssp] missing icon: " + name);
        var empty = document.createElement("span");
        empty.className = "ssp-icon ssp-icon--missing";
        empty.setAttribute("data-icon-name", name);
        return empty;
      }
      var wrap = document.createElement("span");
      wrap.className = "ssp-icon" + (opts.size ? " ssp-icon--" + opts.size : "") + (opts.cls ? " " + opts.cls : "");
      wrap.innerHTML = svg;
      if (ariaLabel) {
        wrap.setAttribute("role", "img");
        wrap.setAttribute("aria-label", ariaLabel);
      } else {
        wrap.setAttribute("aria-hidden", "true");
      }
      return wrap;
    }
    function applyRingTheme() {
      var isDark = document.body.classList.contains("theme-dark") || document.body.getAttribute("data-theme") === "dark" || window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (isDark) {
        document.documentElement.classList.add("ring-variables_dark-dark");
      } else {
        document.documentElement.classList.remove("ring-variables_dark-dark");
      }
    }
    if (typeof MutationObserver !== "undefined") {
      var _ringThemeObserver = new MutationObserver(applyRingTheme);
      _ringThemeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme"] });
    }
    if (window.matchMedia) {
      try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyRingTheme);
      } catch (_) {
      }
    }
    function applyIcons() {
      document.querySelectorAll("[data-icon]").forEach(function(el) {
        var iconName = el.getAttribute("data-icon");
        var ariaKey = el.getAttribute("data-aria-label-key");
        var ariaLabel = ariaKey ? T(ariaKey) : el.getAttribute("aria-label") || "";
        var iconNode = icon(iconName, "", { cls: "btn-icon" });
        el.insertBefore(iconNode, el.firstChild);
        if (ariaLabel) el.setAttribute("aria-label", ariaLabel);
        el.removeAttribute("data-icon");
        el.removeAttribute("data-aria-label-key");
      });
    }
    function withLoader(btn, asyncFn) {
      var origDisabled = btn.disabled;
      btn.disabled = true;
      var origIcon = btn.querySelector(".ssp-icon");
      var loader = document.createElement("span");
      loader.className = "ssp-loader";
      loader.innerHTML = ICONS["loader"] || "";
      if (origIcon) {
        origIcon.replaceWith(loader);
        var restore = function() {
          loader.replaceWith(origIcon);
          btn.disabled = origDisabled;
        };
      } else {
        var prevSib = document.createTextNode(" ");
        btn.appendChild(prevSib);
        btn.appendChild(loader);
        var restore = function() {
          prevSib.remove();
          loader.remove();
          btn.disabled = origDisabled;
        };
      }
      return asyncFn().finally(restore);
    }
    var _initialLoadTimer = null;
    function startInitialLoad() {
      _initialLoadTimer = setTimeout(function() {
        var panel = document.querySelector(".tab-panel.active");
        if (!panel || panel.querySelector(".ssp-initial-loader")) return;
        var wrap = document.createElement("div");
        wrap.className = "ssp-initial-loader";
        wrap.style.cssText = "text-align:center;padding:40px;color:var(--muted);";
        var loaderEl = icon("loader", T("aria.loading"), { size: "20" });
        loaderEl.classList.add("ssp-loader", "ssp-loader--20");
        wrap.appendChild(loaderEl);
        panel.appendChild(wrap);
      }, 500);
    }
    function finishInitialLoad() {
      clearTimeout(_initialLoadTimer);
      document.querySelectorAll(".ssp-initial-loader").forEach(function(el) {
        el.remove();
      });
    }
    function applyI18N() {
      document.querySelectorAll("[data-i18n]").forEach(function(el) {
        var key = el.getAttribute("data-i18n");
        var val = T(key);
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.placeholder = val;
        } else if (el.hasAttribute("data-i18n-html")) {
          el.innerHTML = val;
        } else {
          var iconChild = el.querySelector(".ssp-icon");
          if (iconChild) {
            var textNode = null;
            for (var i = 0; i < el.childNodes.length; i++) {
              if (el.childNodes[i].nodeType === Node.TEXT_NODE) {
                textNode = el.childNodes[i];
                break;
              }
            }
            if (textNode) {
              textNode.textContent = " " + val;
            } else {
              el.appendChild(document.createTextNode(" " + val));
            }
          } else {
            el.textContent = val;
          }
        }
      });
      document.querySelectorAll("[data-i18n-title]").forEach(function(el) {
        el.title = T(el.getAttribute("data-i18n-title"));
      });
      document.querySelectorAll("[data-i18n-ph]").forEach(function(el) {
        el.placeholder = T(el.getAttribute("data-i18n-ph"));
      });
      document.querySelectorAll("[data-i18n-tooltip]").forEach(function(el) {
        el.setAttribute("data-tooltip", T(el.getAttribute("data-i18n-tooltip")));
      });
    }
    function setButtonText(btn, text) {
      var iconEl = btn.querySelector(".ssp-icon");
      if (!iconEl) {
        btn.textContent = text;
        return;
      }
      for (var i = 0; i < btn.childNodes.length; i++) {
        if (btn.childNodes[i].nodeType === Node.TEXT_NODE) {
          btn.childNodes[i].textContent = " " + text;
          return;
        }
      }
      btn.appendChild(document.createTextNode(" " + text));
    }
    function setLang2(lang) {
      var prev = _lang;
      _lang = lang;
      safeLs.set("ssp_lang", lang);
      var sel = document.getElementById("langSel");
      if (sel) sel.value = lang;
      var sel2 = document.getElementById("langSelSettings");
      if (sel2) sel2.value = lang;
      if (!I18N[lang] && _i18nBridge && typeof _i18nBridge.loadDictionary === "function") {
        _i18nBridge.loadDictionary(lang).then(function(dict) {
          I18N[lang] = dict || {};
          _doFullRerender();
        }).catch(function() {
          _lang = prev;
          safeLs.set("ssp_lang", prev);
          if (sel) sel.value = prev;
          if (sel2) sel2.value = prev;
        });
        return;
      }
      _doFullRerender();
    }
    function _populateLangSelect(el) {
      if (!el) return;
      var langs = typeof window !== "undefined" && window.__SSP_I18N_LANGS__ || null;
      if (!langs || !langs.length) return;
      if (el.options && el.options.length === langs.length && el._sspPopulated) return;
      var prevValue = el.value;
      el.innerHTML = "";
      for (var i = 0; i < langs.length; i++) {
        var l = langs[i];
        var opt = document.createElement("option");
        opt.value = l.code;
        opt.textContent = (l.flag ? l.flag + " " : "") + l.native + " (" + l.code + ")";
        el.appendChild(opt);
      }
      el._sspPopulated = true;
      if (prevValue) el.value = prevValue;
    }
    function _populateDefaultLangSelect(el) {
      if (!el) return;
      var langs = typeof window !== "undefined" && window.__SSP_I18N_LANGS__ || null;
      if (!langs || !langs.length) return;
      if (el._sspDefaultPopulated) return;
      var inheritOpt = el.options && el.options.length ? el.options[0] : null;
      var inheritLabel = inheritOpt ? inheritOpt.textContent : "\u2014 inherit from user \u2014";
      el.innerHTML = "";
      var inherit = document.createElement("option");
      inherit.value = "";
      inherit.textContent = inheritLabel;
      el.appendChild(inherit);
      for (var i = 0; i < langs.length; i++) {
        var l = langs[i];
        var opt = document.createElement("option");
        opt.value = l.code;
        opt.textContent = (l.flag ? l.flag + " " : "") + l.native + " (" + l.code + ")";
        el.appendChild(opt);
      }
      el._sspDefaultPopulated = true;
    }
    function _syncProjectDefaultLang() {
      if (!_i18nBridge || typeof _i18nBridge.setProjectDefault !== "function") return;
      var v = _settings && typeof _settings.defaultLang === "string" ? _settings.defaultLang : "";
      _i18nBridge.setProjectDefault(v || null);
    }
    function _updateProjectNameLabel() {
      if (!_projectDisplayName) return;
      var lbl = document.getElementById("projectNameLabel");
      if (lbl) lbl.textContent = T("labelProject") + _projectDisplayName;
    }
    var _sspDpPopup = null, _sspDpTarget = null, _sspDpView = null;
    function _sspDpParseIso(s) {
      if (!s) return null;
      var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
    }
    function _sspDpFmtIso(y, mo, d) {
      var pm = mo + 1 < 10 ? "0" + (mo + 1) : mo + 1;
      var pd = d < 10 ? "0" + d : d;
      return y + "-" + pm + "-" + pd;
    }
    function _sspDpEnsurePopup() {
      if (_sspDpPopup && _sspDpPopup.isConnected) return _sspDpPopup;
      var p = document.createElement("div");
      p.className = "ssp-dp-popup";
      p.style.cssText = "position:absolute;z-index:10000;display:none;background:var(--surface,#fff);border:1px solid var(--border,#ddd);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:8px;font-size:12px;min-width:240px;color:var(--text,#222)";
      document.body.appendChild(p);
      _sspDpPopup = p;
      return p;
    }
    function _sspDpRender() {
      if (!_sspDpTarget || !_sspDpView) return;
      var p = _sspDpEnsurePopup();
      var minP = _sspDpParseIso(_sspDpTarget.getAttribute("min"));
      var maxP = _sspDpParseIso(_sspDpTarget.getAttribute("max"));
      var valP = _sspDpParseIso(_sspDpTarget.value);
      var y = _sspDpView.y, mo = _sspDpView.mo;
      var title = new Intl.DateTimeFormat(_lang, { month: "long", year: "numeric" }).format(new Date(y, mo, 1));
      var weekdays = [];
      for (var w = 0; w < 7; w++) {
        weekdays.push(new Intl.DateTimeFormat(_lang, { weekday: "short" }).format(new Date(2024, 0, 1 + w)));
      }
      var first = new Date(y, mo, 1);
      var firstDow = (first.getDay() + 6) % 7;
      var daysInMonth = new Date(y, mo + 1, 0).getDate();
      var prevDays = new Date(y, mo, 0).getDate();
      var todayD = /* @__PURE__ */ new Date();
      var todayIso = _sspDpFmtIso(todayD.getFullYear(), todayD.getMonth(), todayD.getDate());
      var minIso = minP ? _sspDpFmtIso(minP.y, minP.mo, minP.d) : null;
      var maxIso = maxP ? _sspDpFmtIso(maxP.y, maxP.mo, maxP.d) : null;
      var valIso = valP ? _sspDpFmtIso(valP.y, valP.mo, valP.d) : null;
      var h = '<div class="ssp-dp-hdr" style="display:flex;align-items:center;justify-content:space-between;padding:2px 0"><button type="button" class="ssp-dp-nav ssp-dp-prev" aria-label="prev month" style="background:none;border:none;cursor:pointer;font-size:16px;padding:2px 10px;color:inherit">\u2039</button><span class="ssp-dp-title" style="font-weight:600;text-transform:capitalize">' + esc(title) + '</span><button type="button" class="ssp-dp-nav ssp-dp-next" aria-label="next month" style="background:none;border:none;cursor:pointer;font-size:16px;padding:2px 10px;color:inherit">\u203A</button></div><div class="ssp-dp-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-top:6px">';
      for (var ww = 0; ww < 7; ww++) {
        h += '<div style="text-align:center;color:var(--muted,#999);font-size:11px;padding:2px 0;text-transform:capitalize">' + esc(weekdays[ww]) + "</div>";
      }
      for (var cell = 0; cell < 42; cell++) {
        var dayNum, cellY, cellMo;
        if (cell < firstDow) {
          dayNum = prevDays - firstDow + cell + 1;
          cellMo = mo - 1;
          cellY = y;
          if (cellMo < 0) {
            cellMo = 11;
            cellY--;
          }
        } else if (cell < firstDow + daysInMonth) {
          dayNum = cell - firstDow + 1;
          cellMo = mo;
          cellY = y;
        } else {
          dayNum = cell - firstDow - daysInMonth + 1;
          cellMo = mo + 1;
          cellY = y;
          if (cellMo > 11) {
            cellMo = 0;
            cellY++;
          }
        }
        var iso = _sspDpFmtIso(cellY, cellMo, dayNum);
        var isOther = cellMo !== mo;
        var disabled = minIso && iso < minIso || maxIso && iso > maxIso;
        var selected = valIso === iso;
        var isToday = iso === todayIso;
        var st = "text-align:center;padding:5px 0;border-radius:3px;cursor:" + (disabled ? "not-allowed" : "pointer") + ";user-select:none";
        if (isOther) st += ";color:var(--muted,#bbb)";
        if (disabled) st += ";opacity:.35;pointer-events:none";
        if (selected) st += ";background:var(--accent,#0d6efd);color:#fff";
        else if (isToday) st += ";border:1px solid var(--accent,#0d6efd)";
        h += '<div class="ssp-dp-day" data-iso="' + iso + '" style="' + st + '">' + dayNum + "</div>";
      }
      h += '</div><div class="ssp-dp-actions" style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid var(--border,#eee)"><button type="button" class="ssp-dp-clear" style="background:none;border:1px solid var(--border,#ddd);border-radius:4px;padding:3px 10px;cursor:pointer;font-size:12px;color:inherit">' + esc(T("btnClear")) + '</button><button type="button" class="ssp-dp-today" style="background:none;border:1px solid var(--border,#ddd);border-radius:4px;padding:3px 10px;cursor:pointer;font-size:12px;color:inherit">' + esc(T("btnToday")) + "</button></div>";
      p.innerHTML = h;
    }
    function _sspDpOpen(input) {
      _sspDpTarget = input;
      var v = _sspDpParseIso(input.value);
      var now = /* @__PURE__ */ new Date();
      _sspDpView = v ? { y: v.y, mo: v.mo } : { y: now.getFullYear(), mo: now.getMonth() };
      var p = _sspDpEnsurePopup();
      _sspDpRender();
      var r = input.getBoundingClientRect();
      p.style.left = r.left + window.scrollX + "px";
      p.style.top = r.bottom + window.scrollY + 2 + "px";
      p.style.display = "block";
    }
    function _sspDpClose() {
      if (_sspDpPopup) _sspDpPopup.style.display = "none";
      _sspDpTarget = null;
      _sspDpView = null;
    }
    function _sspDpCommit(value) {
      if (!_sspDpTarget) return;
      _sspDpTarget.value = value;
      try {
        _sspDpTarget.dispatchEvent(new Event("input", { bubbles: true }));
        _sspDpTarget.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {
      }
      _sspDpClose();
    }
    document.addEventListener("click", function(e) {
      var t = e.target;
      if (!t || !t.matches) return;
      if (t.matches("input[data-ssp-datepicker]")) {
        e.preventDefault();
        _sspDpOpen(t);
        return;
      }
      if (_sspDpPopup && _sspDpPopup.contains(t)) {
        if (t.classList.contains("ssp-dp-prev")) {
          _sspDpView.mo--;
          if (_sspDpView.mo < 0) {
            _sspDpView.mo = 11;
            _sspDpView.y--;
          }
          _sspDpRender();
        } else if (t.classList.contains("ssp-dp-next")) {
          _sspDpView.mo++;
          if (_sspDpView.mo > 11) {
            _sspDpView.mo = 0;
            _sspDpView.y++;
          }
          _sspDpRender();
        } else if (t.classList.contains("ssp-dp-today")) {
          var n = /* @__PURE__ */ new Date();
          _sspDpCommit(_sspDpFmtIso(n.getFullYear(), n.getMonth(), n.getDate()));
        } else if (t.classList.contains("ssp-dp-clear")) {
          _sspDpCommit("");
        } else if (t.classList.contains("ssp-dp-day") && t.hasAttribute("data-iso")) {
          _sspDpCommit(t.getAttribute("data-iso"));
        }
        return;
      }
      if (_sspDpPopup && _sspDpPopup.style.display === "block") _sspDpClose();
    }, true);
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && _sspDpPopup && _sspDpPopup.style.display === "block") _sspDpClose();
    });
    function _doFullRerender() {
      applyI18N();
      _updateProjectNameLabel();
      try {
        _refreshFeatureStatusBar();
      } catch (_) {
      }
      try {
        if (typeof renderWidgetHeader === "function") renderWidgetHeader();
      } catch (_) {
      }
      try {
        if (typeof renderPlanningRoles === "function") renderPlanningRoles();
      } catch (_) {
      }
      try {
        Object.keys(_uiExpandedRoles || {}).forEach(function(rk) {
          if (_uiExpandedRoles[rk] && typeof renderRoleComposition === "function") {
            try {
              renderRoleComposition(rk);
            } catch (_) {
            }
          }
        });
      } catch (_) {
      }
      try {
        if (typeof renderCurrentRoleTaskTable === "function") renderCurrentRoleTaskTable();
      } catch (_) {
      }
      try {
        if (typeof renderCurrentRoleAssigneeTable === "function") renderCurrentRoleAssigneeTable();
      } catch (_) {
      }
      try {
        if (typeof renderGanttChart === "function") renderGanttChart();
      } catch (_) {
      }
      try {
        if (typeof renderHistory === "function") renderHistory();
      } catch (_) {
      }
      if (typeof refreshDirtyIndicator === "function") refreshDirtyIndicator();
    }
    var STATUS = {
      PLANNING: "PLANNING",
      CONFIRMED: "CONFIRMED",
      ALLOCATED: "ALLOCATED",
      FINISHED: "FINISHED"
    };
    var PAGE_SIZE = 25, PICK_PAGE = 10, HIST_PAGE = 10;
    var FINAL_STATUSES = [STATUS.FINISHED];
    var ALL_ROLES = [
      {
        key: "analysis",
        label: "\u0410\u043D\u0430\u043B\u0438\u0437",
        labelEn: "Analysis",
        fieldEst: "fieldAnalysis",
        fieldFact: "fieldFactAnalysis",
        resKey: "resourceAnalysis",
        remKey: "remainAnalysis",
        userField: "userFieldAnalysis"
      },
      {
        key: "testing",
        label: "\u0422\u0435\u0441\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
        labelEn: "Testing",
        fieldEst: "fieldTesting",
        fieldFact: "fieldFactTesting",
        resKey: "resourceTesting",
        remKey: "remainTesting",
        userField: "userFieldTesting"
      },
      {
        key: "devPlatform",
        label: "\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435\u043D\u043D\u0430\u044F \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430",
        labelEn: "Platform development",
        fieldEst: "fieldDevPlatform",
        fieldFact: "fieldFactDevPlatform",
        resKey: "resourceDevPlatform",
        remKey: "remainDevPlatform",
        userField: "userFieldDevPlatform"
      },
      {
        key: "devBack",
        label: "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 Back",
        labelEn: "Dev Back",
        fieldEst: "fieldDevBack",
        fieldFact: "fieldFactDevBack",
        resKey: "resourceDevBack",
        remKey: "remainDevBack",
        userField: "userFieldDevBack"
      },
      {
        key: "devFront",
        label: "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 Front",
        labelEn: "Dev Front",
        fieldEst: "fieldDevFront",
        fieldFact: "fieldFactDevFront",
        resKey: "resourceDevFront",
        remKey: "remainDevFront",
        userField: "userFieldDevFront"
      },
      {
        key: "devIos",
        label: "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 IOS",
        labelEn: "Dev iOS",
        fieldEst: "fieldDevIos",
        fieldFact: "fieldFactDevIos",
        resKey: "resourceDevIos",
        remKey: "remainDevIos",
        userField: "userFieldDevIos"
      },
      {
        key: "devAndroid",
        label: "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 Android",
        labelEn: "Dev Android",
        fieldEst: "fieldDevAndroid",
        fieldFact: "fieldFactDevAndroid",
        resKey: "resourceDevAndroid",
        remKey: "remainDevAndroid",
        userField: "userFieldDevAndroid"
      },
      {
        key: "devFs",
        label: "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 FullStack",
        labelEn: "Dev FullStack",
        fieldEst: "fieldDevFullstack",
        fieldFact: "fieldFactDevFullstack",
        resKey: "resourceDevFs",
        remKey: "remainDevFs",
        userField: "userFieldDevFs"
      },
      {
        key: "devDb",
        label: "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u0421\u0423\u0411\u0414",
        labelEn: "Dev DB",
        fieldEst: "fieldDevDb",
        fieldFact: "fieldFactDevDb",
        resKey: "resourceDevDb",
        remKey: "remainDevDb",
        userField: "userFieldDevDb"
      }
    ];
    function getActiveRoles(settingsObj) {
      var s = settingsObj || _settings;
      if (!s || !s.activeRoles || !s.activeRoles.length) return [];
      return ALL_ROLES.filter(function(r) {
        return s.activeRoles.indexOf(r.key) >= 0;
      });
    }
    var _host, _ctx, _settings = null, _projectFields = [], _projectGroups = [];
    var _sprint = null;
    var _overlimitModalShownFor = {};
    var _roleItems = {};
    var _history = [];
    var _currentSprintId = null;
    var _planningLevel = "roles";
    var _dirtyRoleKeys = /* @__PURE__ */ Object.create(null);
    var _workingDrafts = {};
    var _workingDraftsDirty = false;
    var _workingDraftsFlushTimer = null;
    var _workingDraftsLoaded = false;
    var _activeWorkingDraftKey = null;
    var _thisTabToken = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "tab_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    var _currentUser = null, _isValidator = false, _isEditor = false;
    var _projectDisplayName = "";
    var _isAssigner = false;
    var _valGroups = /* @__PURE__ */ new Set(), _editGroups = /* @__PURE__ */ new Set();
    var _histPage = 1;
    var _pickPage = 1, _pickResults = [], _selectedIds = /* @__PURE__ */ new Set(), _pickHasMore = false;
    var _pickAllResults = /* @__PURE__ */ new Map();
    var _pickQueryFingerprint = "";
    var _pickAllInFlight = false;
    var MAX_PICK_TOTAL = 1e3;
    var _currentPickRole = null;
    var _pendingDelHist = -1, _pendingFinishHist = -1;
    var _diagLines = [];
    var _enableDebugLog = false;
    var _activeSubtab = null;
    var _dynFieldCallback = null;
    var _valGroupsState = { ids: [], names: [] };
    var _editGroupsState = { ids: [], names: [] };
    var _histClearGroupsState = { ids: [], names: [] };
    var _assignerGroupsState = { ids: [], names: [] };
    var _settingsLoaded = false;
    var _ytBase = function() {
      try {
        if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
          return window.location.ancestorOrigins[0];
        }
      } catch (e) {
      }
      try {
        var ref = document.referrer || "";
        var rm = ref.match(/^(https?:\/\/[^\/]+)/);
        if (rm) return rm[1];
      } catch (e) {
      }
      try {
        var href = window.location.href || "";
        var hm = href.match(/^(https?:\/\/[^\/]+)/);
        if (hm) return hm[1];
      } catch (e) {
      }
      return "";
    }();
    function _ytBaseFromProject() {
      if (!_ytBase) {
        try {
          var su = typeof YTApp !== "undefined" && YTApp.serverUrl ? YTApp.serverUrl : null;
          if (su) {
            var sm = su.match(/^(https?:\/\/[^\/]+)/);
            if (sm) {
              _ytBase = sm[1];
            }
          }
        } catch (e) {
        }
      }
    }
    function esc(s) {
      return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function safeUrl(url) {
      if (!url) return "#";
      var s = String(url).trim();
      if (/^https?:\/\//i.test(s)) return esc(s);
      return "#";
    }
    function uid() {
      var d = Date.now();
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === "x" ? r : r & 3 | 8).toString(16);
      });
    }
    function fmtPeriod(m) {
      if (m === null || m === void 0) return "\u2014";
      m = Math.round(m);
      var sign = m < 0 ? "-" : "";
      m = Math.abs(m);
      var h = Math.floor(m / 60), mn = m % 60, p = [];
      var hSuf = T("hourShort"), mSuf = T("minuteShort");
      if (h) p.push(h + hSuf);
      if (mn) p.push(mn + mSuf);
      return sign + (p.length ? p.join(" ") : "0" + mSuf);
    }
    function fmtHours(m) {
      if (m === null || m === void 0) return "\u2014";
      m = Math.round(m);
      var sign = m < 0 ? "-" : "";
      m = Math.abs(m);
      var h = Math.floor(m / 60), mn = m % 60, p = [];
      var hSuf = T("hourShort"), mSuf = T("minuteShort");
      if (h) p.push(h + hSuf);
      if (mn) p.push(mn + mSuf);
      return sign + (p.length ? p.join(" ") : "0" + mSuf);
    }
    function fmtHoursOnly(m) {
      if (m === null || m === void 0) return "\u2014";
      m = Math.round(m);
      var h = Math.floor(m / 60), mn = m % 60, p = [];
      var hSuf = T("hourShort"), mSuf = T("minuteShort");
      if (h) p.push(h + hSuf);
      if (mn) p.push(mn + mSuf);
      return p.length ? p.join(" ") : "0" + mSuf;
    }
    function parsePeriod(s) {
      if (!s) return 0;
      s = s.trim().toLowerCase();
      var t = 0;
      var wm = s.match(/(\d+)\s*[нnw]/), dm = s.match(/(\d+)\s*[дd]/), hm = s.match(/(\d+)\s*[чh]/), mm = s.match(/(\d+)\s*[мm]/);
      if (wm) t += parseInt(wm[1]) * 2400;
      if (dm) t += parseInt(dm[1]) * 480;
      if (hm) t += parseInt(hm[1]) * 60;
      if (mm) t += parseInt(mm[1]);
      if (!wm && !dm && !hm && !mm) {
        var n = parseInt(s);
        if (!isNaN(n)) t = n;
      }
      return t;
    }
    var _enumLocaleMap = {
      "Normal": "\u041E\u0431\u044B\u0447\u043D\u0430\u044F",
      "Minor": "\u041D\u0435\u0437\u043D\u0430\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439",
      "Major": "\u0417\u043D\u0430\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439",
      "Critical": "\u041A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F",
      "Blocker": "\u0411\u043B\u043E\u043A\u0438\u0440\u0443\u044E\u0449\u0438\u0439",
      "High": "\u0412\u044B\u0441\u043E\u043A\u0438\u0439",
      "Low": "\u041D\u0438\u0437\u043A\u0438\u0439",
      "Open": "\u041E\u0442\u043A\u0440\u044B\u0442\u0430",
      "In Progress": "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
      "Resolved": "\u0420\u0435\u0448\u0435\u043D\u0430",
      "Won't fix": "\u041D\u0435 \u0431\u0443\u0434\u0435\u0442 \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430",
      "Duplicate": "\u0414\u0443\u0431\u043B\u0438\u043A\u0430\u0442",
      "Fixed": "\u0418\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430",
      "Submitted": "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430",
      "Reopened": "\u041F\u0435\u0440\u0435\u043E\u0442\u043A\u0440\u044B\u0442\u0430",
      "Obsolete": "\u0423\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0430\u044F",
      "Verified": "\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u0430"
    };
    function localizeEnumVal(s) {
      if (!s) return s;
      return _enumLocaleMap[s] || s;
    }
    function toDateIn(ts) {
      return ts ? new Date(ts).toISOString().slice(0, 10) : "";
    }
    function fromDateIn(s) {
      return s ? new Date(s).getTime() : null;
    }
    function fmtDate(ts) {
      return ts ? new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "\u2014";
    }
    function fmtDT(ts) {
      return ts ? new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "\u2014";
    }
    var _lastClickX = 0, _lastClickY = 0;
    try {
      document.addEventListener("mousedown", function(e) {
        if (typeof e.clientY === "number" && !isNaN(e.clientY)) {
          _lastClickX = e.clientX;
          _lastClickY = e.clientY;
        }
      }, true);
    } catch (_) {
    }
    function _ensureParentToastHost() {
      var candidates = [];
      try {
        if (window.top && window.top !== window) candidates.push(window.top);
      } catch (_) {
      }
      try {
        if (window.parent && window.parent !== window && candidates.indexOf(window.parent) < 0) candidates.push(window.parent);
      } catch (_) {
      }
      for (var ci = 0; ci < candidates.length; ci++) {
        var w = candidates[ci];
        try {
          var d = w.document;
          if (!d || !d.body) continue;
          var existing = d.getElementById("ssp-parent-toast-host");
          if (existing) return existing;
          var host = d.createElement("div");
          host.id = "ssp-parent-toast-host";
          host.style.cssText = [
            "position:fixed",
            "top:24px",
            "right:24px",
            "z-index:2147483647",
            "pointer-events:none",
            "display:flex",
            "flex-direction:column",
            "gap:8px",
            "max-width:50vw",
            "max-height:50vh",
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif'
          ].join(";");
          d.body.appendChild(host);
          return host;
        } catch (_) {
        }
      }
      return null;
    }
    function toast(msg, type) {
      var text = String(msg == null ? "" : msg).replace(/\n+/g, " \xB7 ");
      var t = type || "error";
      var host = _ensureParentToastHost();
      if (host) {
        try {
          var pDoc = host.ownerDocument || host.parentNode && host.parentNode.ownerDocument;
          if (!pDoc) throw new Error("host has no ownerDocument");
          var item = pDoc.createElement("div");
          var colors = {
            error: { bg: "#e05a6a", fg: "#fff" },
            success: { bg: "#5cb368", fg: "#fff" },
            warn: { bg: "#e09a3a", fg: "#fff" },
            info: { bg: "#5b7cfa", fg: "#fff" },
            err: { bg: "#e05a6a", fg: "#fff" }
          };
          var c = colors[t] || colors.error;
          item.style.cssText = [
            "background:" + c.bg,
            "color:" + c.fg,
            "padding:10px 16px",
            "border-radius:8px",
            "font-size:13px",
            "font-weight:500",
            "line-height:1.4",
            "box-shadow:0 4px 12px rgba(0,0,0,0.18)",
            "opacity:0",
            "transform:translateY(-8px)",
            "transition:opacity .2s,transform .2s",
            "pointer-events:none",
            "max-width:100%",
            "overflow-wrap:break-word",
            "word-wrap:break-word",
            "white-space:pre-wrap"
          ].join(";");
          item.textContent = text;
          host.appendChild(item);
          setTimeout(function() {
            item.style.opacity = "1";
            item.style.transform = "translateY(0)";
          }, 10);
          setTimeout(function() {
            item.style.opacity = "0";
            item.style.transform = "translateY(-8px)";
          }, 4500);
          setTimeout(function() {
            if (item && item.parentNode) item.parentNode.removeChild(item);
          }, 4900);
          return;
        } catch (_) {
        }
      }
      var el = document.getElementById("toast");
      if (!el) return;
      el.textContent = text;
      el.className = "toast toast--" + t;
      el.style.whiteSpace = "pre-wrap";
      el.style.overflow = "visible";
      el.style.textOverflow = "";
      el.style.maxWidth = "420px";
      el.style.maxHeight = "40vh";
      el.style.overflowY = "auto";
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
      el.style.bottom = "";
      var anchorY = _lastClickY > 0 ? _lastClickY : 300;
      var pageOff = window.pageYOffset || 0;
      var toastTop = Math.max(8, anchorY + pageOff - 280);
      el.style.top = toastTop + "px";
      var iframeWidth = window.innerWidth || document.documentElement.clientWidth || 1200;
      if (_lastClickX > iframeWidth / 2) {
        el.style.left = "24px";
        el.style.right = "";
      } else {
        el.style.right = "24px";
        el.style.left = "";
      }
      void el.offsetWidth;
      el.classList.add("show");
      setTimeout(function() {
        el.classList.remove("show");
        el.style.position = "";
        el.style.top = "";
        el.style.right = "";
        el.style.left = "";
        el.style.whiteSpace = "";
        el.style.overflow = "";
        el.style.maxHeight = "";
        el.style.overflowY = "";
        el.style.maxWidth = "";
      }, 4500);
    }
    var DRAFT_VERSION = 1;
    var APP_VERSION = "1.9.10";
    var ASSIGNEE_PALETTE = [
      "#5b7de8",
      "#e05a6a",
      "#48b974",
      "#f0a23a",
      "#9c6ade",
      "#1ea7c4",
      "#d65a9b",
      "#7a8a99",
      "#c97a4a",
      "#5fa86d",
      "#8a6ad3",
      "#d9534f"
    ];
    var ASSIGNEE_FALLBACK_COLOR = "#9aa3ad";
    function assigneeColorOf(login, allLogins) {
      if (!login) return ASSIGNEE_FALLBACK_COLOR;
      if (!Array.isArray(allLogins) || !allLogins.length) {
        var h = 0;
        for (var i = 0; i < login.length; i++) h = h * 31 + login.charCodeAt(i) >>> 0;
        return ASSIGNEE_PALETTE[h % ASSIGNEE_PALETTE.length];
      }
      var sorted = allLogins.slice().sort();
      var idx = sorted.indexOf(login);
      if (idx < 0) return assigneeColorOf(login, null);
      return ASSIGNEE_PALETTE[idx % ASSIGNEE_PALETTE.length];
    }
    function _loadAppVersion() {
      var badge = document.getElementById("appVersionBadge");
      if (!badge) return;
      var TTL_MS = 5 * 60 * 1e3;
      var nowTs = Date.now();
      var raw = safeLs.get("ssp_app_version_cache");
      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.version && parsed.ts && nowTs - parsed.ts < TTL_MS) {
            badge.textContent = "v" + parsed.version;
            return;
          }
        } catch (_) {
        }
      }
      badge.textContent = "v" + APP_VERSION;
      if (typeof apiGet !== "function") return;
      try {
        apiGet("app-version").then(function(resp) {
          var v = resp && resp.version;
          if (!v) return;
          badge.textContent = "v" + v;
          safeLs.set("ssp_app_version_cache", JSON.stringify({ version: v, ts: Date.now() }));
        }, function(err) {
          diag("loadAppVersion fetch err (fallback to APP_VERSION): " + (err && err.message ? err.message : err), "warn");
        });
      } catch (e) {
        diag("loadAppVersion sync err: " + e, "err");
      }
    }
    var _draftSaveTimers = {};
    var _baseRevHash = "";
    var _serverSnapshotSprint = null;
    var _serverSnapshotRoleItems = null;
    var _serverSnapshotCurrentRolePP = null;
    var _serverSnapshotCurrentRoleGantt = null;
    var _draftRestoreInProgress = false;
    var _draft = { meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null };
    var _draftPending = false;
    var _draftFlushTimer = null;
    var _draftLoaded = false;
    function _draftSet(suffix, value) {
      if (!_draft) _draft = {};
      _draft[suffix] = value;
      diag("draft SET " + suffix + " (in-memory)", "ok");
      _draftScheduleFlush();
    }
    function _draftGet(suffix) {
      return _draft ? _draft[suffix] !== void 0 ? _draft[suffix] : null : null;
    }
    function _draftDel(suffix) {
      if (_draft) delete _draft[suffix];
      _draftScheduleFlush();
    }
    function _draftScheduleFlush() {
      if (_draftRestoreInProgress) return;
      _draftPending = true;
      clearTimeout(_draftFlushTimer);
      _draftFlushTimer = setTimeout(_draftFlushNow, 300);
    }
    function _draftFlushNow() {
      if (!_draftPending) return;
      var sz = JSON.stringify(_draft || {}).length;
      if (sz > 200 * 1024) {
        try {
          toast(T("toastDraftTooLarge"), "warn");
        } catch (_) {
        }
        return;
      }
      _draftPending = false;
      diag("draft FLUSH \u2192 backend (size=" + sz + "B)", "info");
      apiPost("draft", { data: _draft }).catch(function(e) {
        diag("draft flush failed: " + (e && e.message ? e.message : e), "err");
      });
    }
    function _draftLoadFromBackend() {
      return apiGet("draft").then(function(r) {
        var slot = r && r.data || null;
        if (slot && typeof slot === "object") {
          _draft = {
            meta: slot.meta || null,
            ui: slot.ui || null,
            sprint: slot.sprint || null,
            roleItems: slot.roleItems || null,
            currentRole: slot.currentRole || null,
            dirty: slot.dirty || null
          };
          diag("draft loaded from backend (meta=" + (slot.meta ? "yes" : "no") + ")", "ok");
        } else {
          _draft = { meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null };
          diag("draft: no data on backend", "info");
        }
        _draftLoaded = true;
      }).catch(function(e) {
        diag("draft load failed: " + (e && e.message ? e.message : e), "err");
        _draft = { meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null };
        _draftLoaded = true;
      });
    }
    function _draftClearOnBackend() {
      return apiPost("draft", {}, { action: "clear" }).then(function() {
        _draft = { meta: null, ui: null, sprint: null, roleItems: null, currentRole: null, dirty: null };
      });
    }
    function _workingDraftsLoadFromBackend() {
      return apiGet("working-drafts").then(function(r) {
        var data = r && r.data || {};
        _workingDrafts = data && typeof data === "object" && !Array.isArray(data) ? data : {};
        _workingDraftsLoaded = true;
        var n = Object.keys(_workingDrafts).length;
        diag("working-drafts loaded (" + n + " entries)", "ok");
      }).catch(function(e) {
        diag("working-drafts load failed: " + (e && e.message ? e.message : e), "err");
        _workingDrafts = {};
        _workingDraftsLoaded = true;
      });
    }
    function _workingDraftsScheduleFlush() {
      _workingDraftsDirty = true;
      if (_workingDraftsFlushTimer) clearTimeout(_workingDraftsFlushTimer);
      _workingDraftsFlushTimer = setTimeout(_workingDraftsFlushNow, 300);
    }
    function _workingDraftsFlushNow() {
      if (!_workingDraftsDirty) return;
      _workingDraftsDirty = false;
      return apiPost("working-drafts", { data: _workingDrafts }).then(function() {
        if (typeof renderWidgetHeader === "function") {
          try {
            renderWidgetHeader();
          } catch (_) {
          }
        }
        Object.keys(_workingDrafts || {}).forEach(function(k) {
          safeLs.set("ssp:wc-touched:" + k, String(Date.now()));
        });
      }).catch(function(e) {
        var reason = e && e.reason || e && e.error || "";
        if (String(reason).indexOf("working_drafts_too_large") >= 0 || String(reason).indexOf("working_draft_too_large") >= 0) {
          try {
            toast(T("wcStorageQuotaExceeded"), "warn");
          } catch (_) {
          }
        } else {
          diag("working-drafts flush failed: " + (e && e.message ? e.message : e), "err");
        }
        _workingDraftsDirty = true;
      });
    }
    function _workingDraftsDeleteOnBackend(key) {
      if (!key) return Promise.resolve();
      return apiPost("working-drafts", null, { action: "delete", key }).catch(function(e) {
        diag("working-drafts delete failed for " + key + ": " + (e && e.message ? e.message : e), "err");
      });
    }
    function reconcileHasWorkingCopyFlag() {
      if (!_workingDraftsLoaded) return;
      var historyChanged = false, draftsChanged = false;
      Object.keys(_workingDrafts).forEach(function(key) {
        var found = _history.some(function(snap) {
          return snap && snap.sprintId === key;
        });
        if (!found) {
          diag("working-drafts: orphan removed: " + key, "warn");
          delete _workingDrafts[key];
          draftsChanged = true;
        }
      });
      _history.forEach(function(snap) {
        if (!snap) return;
        var actual = !!_workingDrafts[snap.sprintId];
        if (!!snap.hasWorkingCopy !== actual) {
          snap.hasWorkingCopy = actual;
          historyChanged = true;
        }
      });
      if (draftsChanged) _workingDraftsScheduleFlush();
      if (historyChanged) {
        apiPost("history", { history: _history }).catch(function(e) {
          diag("history flush after reconcile failed: " + (e && e.message ? e.message : e), "err");
        });
      }
    }
    function gcWorkingDrafts() {
      if (!_workingDraftsLoaded) return;
      var now = Date.now();
      var TTL = 30 * 24 * 3600 * 1e3;
      var removed = [];
      Object.keys(_workingDrafts).forEach(function(key) {
        var d = _workingDrafts[key];
        if (!d) {
          delete _workingDrafts[key];
          removed.push(key);
          return;
        }
        if (now - (d.updatedAt || 0) > TTL) {
          delete _workingDrafts[key];
          removed.push(key);
        }
      });
      if (removed.length) {
        diag("working-drafts GC: removed " + removed.length + " stale entries", "info");
        _workingDraftsScheduleFlush();
        var historyChanged = false;
        _history.forEach(function(snap) {
          if (snap && removed.indexOf(snap.sprintId) >= 0 && snap.hasWorkingCopy) {
            snap.hasWorkingCopy = false;
            historyChanged = true;
          }
        });
        if (historyChanged) {
          apiPost("history", { history: _history }).catch(function() {
          });
        }
        try {
          toast(T("wcGcDiscarded").replace("{n}", removed.length), "info");
        } catch (_) {
        }
      }
    }
    function _wcSha1Light(s) {
      var h = 2166136261 >>> 0;
      for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
      }
      return ("00000000" + h.toString(16)).slice(-8);
    }
    function _sortKeys(obj) {
      if (obj === null || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(_sortKeys);
      var keys = Object.keys(obj).sort();
      var out = {};
      for (var i = 0; i < keys.length; i++) out[keys[i]] = _sortKeys(obj[keys[i]]);
      return out;
    }
    function _blockEq(a, b) {
      return JSON.stringify(_sortKeys(a || null)) === JSON.stringify(_sortKeys(b || null));
    }
    function _mapById(arr) {
      var out = {};
      if (!Array.isArray(arr)) return out;
      for (var i = 0; i < arr.length; i++) {
        var it = arr[i];
        if (it && it.issueId) out[it.issueId] = it;
      }
      return out;
    }
    function _numEq(a, b) {
      if (a === void 0) a = null;
      if (b === void 0) b = null;
      if (a === null || b === null) return a === b;
      return Number(a) === Number(b);
    }
    function computeRequiredRevalidationLevel(snap, work) {
      if (!snap || !work) return "CONFIRMED_REVAL";
      var rk = snap.roleKey;
      if (!rk) return "NONE";
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      var resK = role ? role.resKey : "";
      var estK = "estimate_" + rk;
      var allK = "alloc_" + rk;
      var sMap = _mapById(snap.items || []);
      var wMap = _mapById(work.items || []);
      var sIds = Object.keys(sMap), wIds = Object.keys(wMap);
      var added = wIds.filter(function(id2) {
        return !sMap[id2];
      });
      var removed = sIds.filter(function(id2) {
        return !wMap[id2];
      });
      if (added.length || removed.length) return "CONFIRMED_REVAL";
      var allocChanged = false;
      for (var i = 0; i < wIds.length; i++) {
        var id = wIds[i], s = sMap[id], w = wMap[id];
        if (s.inclusionStatus !== w.inclusionStatus) return "CONFIRMED_REVAL";
        if (!_numEq(s[estK], w[estK])) return "CONFIRMED_REVAL";
        if (!_numEq(s[allK], w[allK])) allocChanged = true;
      }
      var sRes = resK && snap[resK] != null ? snap[resK] : 0;
      var wRes = work.sprint && resK && work.sprint[resK] != null ? work.sprint[resK] : 0;
      if (!_numEq(sRes, wRes)) allocChanged = true;
      var ws = work.sprint || {};
      var metaChanged = (snap.name || null) !== (ws.name || null) || (snap.dateStart || null) !== (ws.dateStart || null) || (snap.dateEnd || null) !== (ws.dateEnd || null) || (snap.sprintFieldVal || null) !== (ws.sprintFieldVal || null) || (snap.versionFieldVal || null) !== (ws.versionFieldVal || null) || !_blockEq(snap.personalPlanning, work.personalPlanning) || !_blockEq(snap.gantt, work.gantt);
      if (allocChanged) return "ALLOCATED_REVAL";
      if (metaChanged) return "META_ONLY";
      return "NONE";
    }
    function applyRevalidationLevel(currentStatus, level) {
      if (level === "CONFIRMED_REVAL") return STATUS.PLANNING;
      if (level === "ALLOCATED_REVAL") {
        return currentStatus === STATUS.ALLOCATED ? STATUS.CONFIRMED : currentStatus;
      }
      return currentStatus;
    }
    function computeBaseSnapshotHash(snap) {
      if (!snap) return "";
      var rk = snap.roleKey;
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      var resK = role ? role.resKey : "";
      var estK = "estimate_" + rk;
      var allK = "alloc_" + rk;
      var items = (snap.items || []).slice().sort(function(a, b) {
        return String(a.issueId || "").localeCompare(String(b.issueId || ""));
      }).map(function(it) {
        return [it.issueId, it.inclusionStatus || "", it[estK] != null ? it[estK] : "", it[allK] != null ? it[allK] : ""].join("|");
      }).join(";");
      var head = [
        snap.sprintId || "",
        snap.status || "",
        snap.name || "",
        snap.dateStart || 0,
        snap.dateEnd || 0,
        resK && snap[resK] != null ? snap[resK] : 0,
        snap.sprintFieldVal || "",
        snap.versionFieldVal || ""
      ].join("|");
      return _wcSha1Light(head + "##" + items);
    }
    function createWorkingDraftFromSnapshot(snap, idx) {
      if (!snap || !snap.sprintId) return null;
      var key = snap.sprintId;
      var rk = snap.roleKey;
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      if (!role) return null;
      var login = _currentUser && _currentUser.login || "";
      var draft = {
        schemaVersion: 1,
        key,
        baseSnapshotHash: computeBaseSnapshotHash(snap),
        baseStatusAtOpen: snap.status || STATUS.PLANNING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        editorLogin: login,
        editorTabToken: _thisTabToken,
        sprint: {
          sprintId: snap.sprintId,
          name: snap.name || null,
          dateStart: snap.dateStart || null,
          dateEnd: snap.dateEnd || null,
          sprintFieldVal: snap.sprintFieldVal || null,
          versionFieldVal: snap.versionFieldVal || null
        },
        items: (snap.items || []).map(function(it) {
          var copy = {};
          Object.keys(it).forEach(function(k) {
            copy[k] = it[k];
          });
          return copy;
        }),
        personalPlanning: snap.personalPlanning ? deepClone(snap.personalPlanning) : null,
        gantt: snap.gantt ? deepClone(snap.gantt) : null,
        revisions: (snap.revisions || []).slice()
      };
      if (role.resKey) draft.sprint[role.resKey] = snap[role.resKey] != null ? snap[role.resKey] : 0;
      _workingDrafts[key] = draft;
      if (idx != null && _history[idx]) {
        _history[idx].hasWorkingCopy = true;
        apiPost("history", { history: _history }).catch(function() {
        });
      }
      _workingDraftsScheduleFlush();
      return draft;
    }
    function resumeWorkingDraft(key, idx) {
      var draft = _workingDrafts[key];
      if (!draft) return;
      var rk = draft.items && draft.items.length ? null : null;
      var snap = _history.find(function(s) {
        return s && s.sprintId === key;
      });
      if (!snap) {
        diag("resumeWorkingDraft: base snap not found for key=" + key, "err");
        return;
      }
      rk = snap.roleKey;
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      if (!role) return;
      _activeWorkingDraftKey = key;
      _sprint = _sprint || {};
      _sprint.sprintId = key.replace("_" + rk, "");
      _sprint.name = draft.sprint.name;
      _sprint.dateStart = draft.sprint.dateStart;
      _sprint.dateEnd = draft.sprint.dateEnd;
      _sprint.sprintFieldVal = draft.sprint.sprintFieldVal;
      _sprint.versionFieldVal = draft.sprint.versionFieldVal;
      _sprint.status = STATUS.PLANNING;
      ALL_ROLES.forEach(function(r) {
        if (draft.sprint[r.resKey] != null) _sprint[r.resKey] = draft.sprint[r.resKey];
      });
      delete _sprint.editingFromHistory;
      delete _sprint.historyIdx;
      _roleItems[rk] = (draft.items || []).map(function(it) {
        var copy = {};
        Object.keys(it).forEach(function(k) {
          copy[k] = it[k];
        });
        return copy;
      });
      var _sprintIdForOthers = _sprint.sprintId;
      ALL_ROLES.forEach(function(r) {
        if (r.key === rk) return;
        var otherSnapId = _sprintIdForOthers + "_" + r.key;
        var otherSnap = Array.isArray(_history) ? _history.find(function(h) {
          return h && h.sprintId === otherSnapId;
        }) : null;
        if (otherSnap && Array.isArray(otherSnap.items)) {
          _roleItems[r.key] = otherSnap.items.map(function(it) {
            var copy = {};
            Object.keys(it).forEach(function(k) {
              copy[k] = it[k];
            });
            return copy;
          });
        } else {
          _roleItems[r.key] = [];
        }
      });
      if (draft.personalPlanning) _sprint.personalPlanning = deepClone(draft.personalPlanning);
      if (draft.gantt) _sprint.gantt = deepClone(draft.gantt);
      apiPost("sprint-data", { sprint: _sprint, roleItems: _roleItems }).catch(function(e) {
        diag("resumeWorkingDraft: sprint-data sync failed: " + (e && e.message ? e.message : e), "err");
      });
      var planBtn = document.querySelector('.tab-btn[data-tab="planning"]');
      if (planBtn) planBtn.click();
      var rolesBtn = document.querySelector('.planning-level-btn[data-level="roles"]');
      if (rolesBtn) rolesBtn.click();
      if (typeof _uiExpandedRoles !== "undefined") {
        _uiExpandedRoles[rk] = true;
        var ui = _draftGet("ui") || {};
        ui.expandedRoles = Object.keys(_uiExpandedRoles).filter(function(k) {
          return _uiExpandedRoles[k];
        });
        _draftSet("ui", ui);
      }
      if (typeof renderPlanningRoles === "function") {
        try {
          renderPlanningRoles();
        } catch (e) {
          diag("renderPlanningRoles err: " + e, "err");
        }
      }
      if (typeof renderWorkingCopyBanner === "function") renderWorkingCopyBanner();
      if (typeof renderRolePlannerHeader === "function") renderRolePlannerHeader(rk);
      if (typeof renderRoleComposition === "function") renderRoleComposition(rk);
      if (typeof updateRoleRemaining === "function") updateRoleRemaining(rk);
      if (typeof renderHistory === "function") renderHistory();
    }
    function discardWorkingDraft(key) {
      if (typeof showDiscardConfirmModal === "function") {
        showDiscardConfirmModal(key, function(confirmed) {
          if (!confirmed) return;
          _doDiscardWorkingDraft(key);
        });
      } else {
        _doDiscardWorkingDraft(key);
      }
    }
    function _doDiscardWorkingDraft(key) {
      delete _workingDrafts[key];
      var idx = _history.findIndex(function(s) {
        return s && s.sprintId === key;
      });
      if (idx >= 0) {
        _history[idx].hasWorkingCopy = false;
        apiPost("history", { history: _history }).catch(function() {
        });
      }
      _workingDraftsDeleteOnBackend(key);
      if (_activeWorkingDraftKey === key) {
        _activeWorkingDraftKey = null;
        if (typeof hideWorkingCopyBanner === "function") hideWorkingCopyBanner();
        apiGet("sprint-data").then(function(r) {
          if (r && r.success) {
            _sprint = r.sprint || null;
            _roleItems = r.roleItems || {};
            if (_sprint && Array.isArray(r.orphanGanttIssues) && r.orphanGanttIssues.length) {
              _sprint._orphanGanttIssues = r.orphanGanttIssues;
            }
            if (typeof renderPlannerRoles === "function") renderPlannerRoles();
          }
        }).catch(function() {
        });
      }
      if (typeof renderHistory === "function") renderHistory();
      try {
        toast(T("wcDiscardedToast"), "info");
      } catch (_) {
      }
    }
    function syncWorkingDraftFromMemory(rk) {
      if (!_activeWorkingDraftKey) return;
      var draft = _workingDrafts[_activeWorkingDraftKey];
      if (!draft) return;
      draft.updatedAt = Date.now();
      draft.editorTabToken = _thisTabToken;
      if (_sprint) {
        draft.sprint.name = _sprint.name || null;
        draft.sprint.dateStart = _sprint.dateStart || null;
        draft.sprint.dateEnd = _sprint.dateEnd || null;
        draft.sprint.sprintFieldVal = _sprint.sprintFieldVal || null;
        draft.sprint.versionFieldVal = _sprint.versionFieldVal || null;
        ALL_ROLES.forEach(function(r) {
          if (_sprint[r.resKey] != null) draft.sprint[r.resKey] = _sprint[r.resKey];
        });
        if (_sprint.personalPlanning) draft.personalPlanning = deepClone(_sprint.personalPlanning);
        if (_sprint.gantt) draft.gantt = deepClone(_sprint.gantt);
      }
      if (rk && _roleItems[rk]) {
        draft.items = _roleItems[rk].map(function(it) {
          var copy = {};
          Object.keys(it).forEach(function(k) {
            copy[k] = it[k];
          });
          return copy;
        });
      }
      _workingDraftsScheduleFlush();
      if (typeof renderWorkingCopyBanner === "function") renderWorkingCopyBanner();
    }
    function _commitWorkingCopy(rk, idx, draft, snapFromCurrent) {
      var baseSnap = _history[idx];
      if (!baseSnap) return;
      var level = computeRequiredRevalidationLevel(baseSnap, draft);
      var newStatus = applyRevalidationLevel(baseSnap.status, level);
      diag("[COMMIT-WC] role=" + rk + " baseStatus=" + baseSnap.status + " level=" + level + " newStatus=" + newStatus + " snapFromStatus=" + (snapFromCurrent && snapFromCurrent.status), "info");
      var finalSnap = snapFromCurrent;
      finalSnap.status = newStatus;
      if (level !== "NONE" && level !== "META_ONLY") {
        finalSnap.confirmedAt = Date.now();
        finalSnap.confirmedBy = _currentUser && (_currentUser.fullName || _currentUser.login) || baseSnap.confirmedBy || "";
      } else {
        finalSnap.confirmedAt = baseSnap.confirmedAt;
        finalSnap.confirmedBy = baseSnap.confirmedBy;
      }
      var newRevisions = (baseSnap.revisions || []).slice();
      if (level !== "NONE") {
        newRevisions.push({
          at: Date.now(),
          by: _currentUser && _currentUser.login || "",
          level
        });
      }
      finalSnap.revisions = newRevisions.slice(-200);
      finalSnap.hasWorkingCopy = false;
      if (baseSnap.finishedAt) finalSnap.finishedAt = baseSnap.finishedAt;
      if (baseSnap.finishedBy) finalSnap.finishedBy = baseSnap.finishedBy;
      _history[idx] = finalSnap;
      delete _workingDrafts[draft.key];
      _workingDraftsScheduleFlush();
      _workingDraftsDeleteOnBackend(draft.key);
      _activeWorkingDraftKey = null;
      if (typeof hideWorkingCopyBanner === "function") hideWorkingCopyBanner();
      return apiPost("history", { history: _history }).then(function() {
        if (typeof renderHistory === "function") renderHistory();
        if (typeof renderRoleComposition === "function") renderRoleComposition(rk);
        if (typeof renderWidgetHeader === "function") {
          try {
            renderWidgetHeader();
          } catch (_) {
          }
        }
        try {
          var statusLabelKey = "status_" + newStatus;
          var levelKey = "wcLevel_" + level;
          toast(
            T("wcRevalidatedToast").replace("{status}", T(statusLabelKey)).replace("{level}", T(levelKey)),
            level === "CONFIRMED_REVAL" ? "warn" : "info"
          );
        } catch (_) {
        }
      });
    }
    function renderWorkingCopyBanner() {
      var banner = document.getElementById("wcBanner");
      if (!banner) return;
      if (!_activeWorkingDraftKey) {
        banner.classList.add("hidden");
        return;
      }
      var draft = _workingDrafts[_activeWorkingDraftKey];
      if (!draft) {
        banner.classList.add("hidden");
        return;
      }
      var snap = _history.find(function(s) {
        return s && s.sprintId === _activeWorkingDraftKey;
      });
      if (!snap) {
        banner.classList.add("hidden");
        return;
      }
      var role = ALL_ROLES.find(function(r) {
        return r.key === snap.roleKey;
      });
      var rl = role ? roleLabel(role) : snap.roleKey || "";
      var sn = snap.name || draft.sprint && draft.sprint.name || T("unnamedSprint");
      var dt = fmtDate(snap.confirmedAt);
      var txt = T("wcBannerTextTpl").replace("{sprint}", sn).replace("{role}", rl).replace("{date}", dt);
      var textEl = document.getElementById("wcBannerText");
      if (textEl) textEl.textContent = txt;
      var level = computeRequiredRevalidationLevel(snap, draft);
      var pill = document.getElementById("wcBannerLevelPill");
      if (pill) {
        pill.classList.remove("wc-banner__pill--meta", "wc-banner__pill--allocated", "wc-banner__pill--confirmed");
        if (level === "CONFIRMED_REVAL") {
          pill.classList.add("wc-banner__pill--confirmed");
          pill.textContent = T("wcLevelConfirmedShort");
        } else if (level === "ALLOCATED_REVAL") {
          pill.classList.add("wc-banner__pill--allocated");
          pill.textContent = T("wcLevelAllocatedShort");
        } else {
          pill.classList.add("wc-banner__pill--meta");
          pill.textContent = T("wcLevelMetaOnlyShort");
        }
        pill.title = T("wcLevel_" + level);
      }
      banner.classList.remove("hidden");
    }
    function hideWorkingCopyBanner() {
      var b = document.getElementById("wcBanner");
      if (b) b.classList.add("hidden");
    }
    function diffItemsForUI(snap, working) {
      var rk = snap.roleKey;
      var estK = "estimate_" + rk;
      var allK = "alloc_" + rk;
      var sMap = _mapById(snap.items || []);
      var wMap = _mapById(working.items || []);
      var added = [], removed = [], changed = [];
      Object.keys(wMap).forEach(function(id) {
        if (!sMap[id]) {
          added.push(wMap[id]);
          return;
        }
        var fields = [];
        if (sMap[id].inclusionStatus !== wMap[id].inclusionStatus)
          fields.push({ name: "inclusionStatus", from: sMap[id].inclusionStatus, to: wMap[id].inclusionStatus });
        if (!_numEq(sMap[id][estK], wMap[id][estK]))
          fields.push({ name: estK, from: sMap[id][estK], to: wMap[id][estK] });
        if (!_numEq(sMap[id][allK], wMap[id][allK]))
          fields.push({ name: allK, from: sMap[id][allK], to: wMap[id][allK] });
        if (fields.length) changed.push({ item: wMap[id], fields });
      });
      Object.keys(sMap).forEach(function(id) {
        if (!wMap[id]) removed.push(sMap[id]);
      });
      return { added, removed, changed };
    }
    function showWorkingCopyDiffModal(key) {
      var draft = _workingDrafts[key];
      if (!draft) return;
      var snap = _history.find(function(s) {
        return s && s.sprintId === key;
      });
      if (!snap) return;
      var diff = diffItemsForUI(snap, draft);
      var body = document.getElementById("wcDiffBody");
      if (!body) return;
      body.innerHTML = "";
      function renderSec(cls, titleKey, items, fmtFn) {
        if (!items.length) return;
        var sec = document.createElement("div");
        sec.className = "wc-diff-section wc-diff-section--" + cls;
        var h = document.createElement("h4");
        h.textContent = T(titleKey) + " (" + items.length + ")";
        sec.appendChild(h);
        items.forEach(function(it) {
          var row = document.createElement("div");
          row.className = "wc-diff-item";
          row.innerHTML = fmtFn(it);
          sec.appendChild(row);
        });
        body.appendChild(sec);
      }
      renderSec(
        "added",
        "wcDiffAdded",
        diff.added,
        function(it) {
          return esc(it.title || it.issueId || "");
        }
      );
      renderSec(
        "removed",
        "wcDiffRemoved",
        diff.removed,
        function(it) {
          return esc(it.title || it.issueId || "");
        }
      );
      renderSec(
        "changed",
        "wcDiffChanged",
        diff.changed,
        function(c) {
          return esc(c.item.title || c.item.issueId || "") + c.fields.map(function(f) {
            return '<div class="wc-diff-item__field">' + esc(String(f.name)) + ": " + esc(String(f.from == null ? "\u2014" : f.from)) + " \u2192 " + esc(String(f.to == null ? "\u2014" : f.to)) + "</div>";
          }).join("");
        }
      );
      if (!diff.added.length && !diff.removed.length && !diff.changed.length) {
        body.textContent = T("wcDiffNoChanges");
      }
      _showOverlay("wcDiffOverlay");
    }
    function hideWorkingCopyDiffModal() {
      var o = document.getElementById("wcDiffOverlay");
      if (o) o.classList.add("hidden");
    }
    var _wcConflictDecisionCb = null;
    function showWorkingCopyConflictModal(key, baseSnap, mySnap, callback) {
      _wcConflictDecisionCb = callback || function() {
      };
      var who = baseSnap && baseSnap.confirmedBy || "?";
      var body = document.getElementById("wcConflictBody");
      if (body) body.textContent = T("wcConflictBody").replace("{who}", who);
      var o = document.getElementById("wcConflictOverlay");
      if (o) o.classList.remove("hidden");
    }
    function _resolveWcConflict(decision) {
      var o = document.getElementById("wcConflictOverlay");
      if (o) o.classList.add("hidden");
      var cb = _wcConflictDecisionCb;
      _wcConflictDecisionCb = null;
      if (cb) cb(decision);
    }
    var _wcMultiTabCb = null;
    function showMultiTabConflictModal(key, callback) {
      _wcMultiTabCb = callback || function() {
      };
      var o = document.getElementById("wcMultiTabOverlay");
      if (o) o.classList.remove("hidden");
    }
    function _resolveWcMultiTab(takeOver) {
      var o = document.getElementById("wcMultiTabOverlay");
      if (o) o.classList.add("hidden");
      var cb = _wcMultiTabCb;
      _wcMultiTabCb = null;
      if (cb) cb(takeOver);
    }
    var _wcDiscardCb = null;
    function showDiscardConfirmModal(key, callback) {
      _wcDiscardCb = callback || function() {
      };
      var o = document.getElementById("wcDiscardOverlay");
      if (o) o.classList.remove("hidden");
    }
    function _resolveWcDiscard(confirmed) {
      var o = document.getElementById("wcDiscardOverlay");
      if (o) o.classList.add("hidden");
      var cb = _wcDiscardCb;
      _wcDiscardCb = null;
      if (cb) cb(confirmed);
    }
    function bindWorkingCopyHandlers() {
      var bind = function(id, ev, fn) {
        var el = document.getElementById(id);
        if (!el || el._sspWcBound) return;
        el._sspWcBound = true;
        el.addEventListener(ev, fn);
      };
      bind("wcBannerCloseBtn", "click", function() {
        if (!_activeWorkingDraftKey) return;
        _activeWorkingDraftKey = null;
        hideWorkingCopyBanner();
        apiGet("sprint-data").then(function(r) {
          if (r && r.success) {
            _sprint = r.sprint || null;
            _roleItems = r.roleItems || {};
            if (_sprint && Array.isArray(r.orphanGanttIssues) && r.orphanGanttIssues.length) {
              _sprint._orphanGanttIssues = r.orphanGanttIssues;
            }
            if (typeof renderPlannerRoles === "function") renderPlannerRoles();
            if (typeof renderHistory === "function") renderHistory();
          }
        }).catch(function() {
        });
      });
      bind("wcBannerDiffBtn", "click", function() {
        if (!_activeWorkingDraftKey) return;
        showWorkingCopyDiffModal(_activeWorkingDraftKey);
      });
      bind("wcDiffCloseBtn", "click", hideWorkingCopyDiffModal);
      bind("wcConflictOverwriteBtn", "click", function() {
        _resolveWcConflict("overwrite");
      });
      bind("wcConflictExportBtn", "click", function() {
        _resolveWcConflict("export");
      });
      bind("wcConflictCancelBtn", "click", function() {
        _resolveWcConflict("cancel");
      });
      bind("wcMultiTabContinueBtn", "click", function() {
        _resolveWcMultiTab(true);
      });
      bind("wcMultiTabReadonlyBtn", "click", function() {
        _resolveWcMultiTab(false);
      });
      bind("wcDiscardConfirmBtn", "click", function() {
        _resolveWcDiscard(true);
      });
      bind("wcDiscardCancelBtn", "click", function() {
        _resolveWcDiscard(false);
      });
    }
    try {
      bindWorkingCopyHandlers();
    } catch (e) {
      diag("bindWorkingCopyHandlers failed: " + e, "err");
    }
    function hideReassignModal() {
      var ov = document.getElementById("reassignOverlay");
      if (ov) ov.classList.add("hidden");
    }
    function _hideAllOverlays() {
      var nodes = document.querySelectorAll(".overlay");
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.add("hidden");
      }
    }
    function _scrollFrameIntoView() {
      var any = false;
      try {
        window.scrollTo({ top: 0, behavior: "auto" });
        any = true;
      } catch (_) {
        try {
          window.scrollTo(0, 0);
          any = true;
        } catch (__) {
        }
      }
      try {
        if (window.frameElement && typeof window.frameElement.scrollIntoView === "function") {
          window.frameElement.scrollIntoView({ block: "start", behavior: "smooth" });
          any = true;
        }
      } catch (_) {
      }
      try {
        if (window.parent && window.parent !== window && window.frameElement) {
          var iframeRect = window.frameElement.getBoundingClientRect();
          var parentScrollY = window.parent.pageYOffset || window.parent.document && window.parent.document.documentElement && window.parent.document.documentElement.scrollTop || 0;
          var targetY = parentScrollY + iframeRect.top - 16;
          if (targetY < 0) targetY = 0;
          if (typeof window.parent.scrollTo === "function") {
            try {
              window.parent.scrollTo({ top: targetY, behavior: "smooth" });
            } catch (_) {
              window.parent.scrollTo(0, targetY);
            }
            any = true;
          }
        }
      } catch (_) {
      }
      return any;
    }
    function _showOverlay(idOrEl) {
      var el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
      if (!el) return;
      try {
        el.style.position = "";
        el.style.top = "";
        el.style.left = "";
        el.style.right = "";
        el.style.bottom = "";
        el.style.minHeight = "";
        el.style.height = "";
      } catch (_) {
      }
      el.classList.remove("hidden");
      _scrollFrameIntoView();
      setTimeout(_scrollFrameIntoView, 80);
    }
    function openReassignModal(issueId) {
      if (!_currentRolePP) {
        diag("openReassignModal: no _currentRolePP", "warn");
        return;
      }
      var ra = _currentRolePP.resourcesByAssignee || {};
      var ta = _currentRolePP.taskAssignments || {};
      var current = ta[issueId] && ta[issueId].assignee || "";
      var sel = document.getElementById("reassignSelect");
      var titleEl = document.getElementById("reassignIssueId");
      var ov = document.getElementById("reassignOverlay");
      if (!sel || !ov) return;
      sel.innerHTML = "";
      var optEmpty = document.createElement("option");
      optEmpty.value = "";
      optEmpty.textContent = T("reassignOptionUnassigned");
      if (!current) optEmpty.selected = true;
      sel.appendChild(optEmpty);
      Object.keys(ra).sort().forEach(function(login) {
        var opt = document.createElement("option");
        opt.value = login;
        var nm = ra[login] && ra[login].assigneeName ? ra[login].assigneeName : login;
        opt.textContent = nm + " (" + login + ")";
        if (login === current) opt.selected = true;
        sel.appendChild(opt);
      });
      if (titleEl) titleEl.textContent = issueId;
      var applyBtn = document.getElementById("reassignApplyBtn");
      if (applyBtn) applyBtn.dataset.issueId = issueId;
      _showOverlay(ov);
    }
    (function bindReassignHandlers() {
      function bind() {
        var applyBtn = document.getElementById("reassignApplyBtn");
        if (applyBtn && !applyBtn.dataset.bound) {
          applyBtn.dataset.bound = "1";
          applyBtn.addEventListener("click", function() {
            var issueId = applyBtn.dataset.issueId;
            var sel = document.getElementById("reassignSelect");
            if (!issueId || !sel || !_currentRolePP) {
              hideReassignModal();
              return;
            }
            var login = sel.value || "";
            var ra = _currentRolePP.resourcesByAssignee || {};
            if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
            var entry = _currentRolePP.taskAssignments[issueId] || {};
            entry.assignee = login || "";
            entry.assigneeName = login ? ra[login] && ra[login].assigneeName ? ra[login].assigneeName : login : "";
            delete entry.ganttColor;
            _currentRolePP.taskAssignments[issueId] = entry;
            if (_currentSprintRoleRec) {
              if (!_currentSprintRoleRec.personalPlanning) _currentSprintRoleRec.personalPlanning = {};
              var rk = _activeSubtab || _currentSprintRoleRec.roleKey || null;
              if (!rk && _currentSprintRoleRec.sprintId && _currentSprintId) {
                rk = _currentSprintRoleRec.sprintId.replace(_currentSprintId + "_", "") || null;
              }
              if (rk) _currentSprintRoleRec.personalPlanning[rk] = _currentRolePP;
              if (typeof isActiveSprintRecord === "function" && isActiveSprintRecord(_currentSprintRoleRec)) {
                if (!_sprint.personalPlanning) _sprint.personalPlanning = {};
                if (rk) _sprint.personalPlanning[rk] = _currentRolePP;
              }
            }
            if (_currentSprintRoleRec && _currentSprintRoleRec.sprintId && _currentSprintId) {
              var rkDirty = _currentSprintRoleRec.sprintId.replace(_currentSprintId + "_", "");
              if (rkDirty) _dirtyRoleKeys[rkDirty] = true;
            }
            hideReassignModal();
            if (typeof saveCurrentRoleState === "function") {
              try {
                saveCurrentRoleState();
              } catch (e) {
                diag("saveCurrentRoleState reassign err: " + e, "err");
              }
            }
            try {
              var rkForYt = _currentSprintRoleRec && _currentSprintRoleRec.roleKey || _activeSubtab;
              if (rkForYt && typeof updateIssueAssigneeField === "function") {
                updateIssueAssigneeField(issueId, login || null, rkForYt);
              }
            } catch (e) {
              diag("updateIssueAssigneeField reassign err: " + e, "err");
            }
            if (typeof renderGanttChart === "function") {
              try {
                renderGanttChart();
              } catch (e) {
                diag("renderGanttChart reassign err: " + e, "err");
              }
            }
            var peopleEl = document.getElementById("planning-level-people");
            if (peopleEl && !peopleEl.classList.contains("hidden") && typeof renderCurrentRoleTaskTable === "function") {
              try {
                renderCurrentRoleTaskTable();
              } catch (e) {
                diag("renderCurrentRoleTaskTable reassign err: " + e, "err");
              }
            }
            setTimeout(function() {
              if (_currentSprintRoleRec && _currentSprintRoleRec.sprintId && _currentSprintId) {
                var rkClean = _currentSprintRoleRec.sprintId.replace(_currentSprintId + "_", "");
                if (rkClean) delete _dirtyRoleKeys[rkClean];
              }
            }, 0);
          });
        }
        var cancelBtn = document.getElementById("reassignCancelBtn");
        if (cancelBtn && !cancelBtn.dataset.bound) {
          cancelBtn.dataset.bound = "1";
          cancelBtn.addEventListener("click", hideReassignModal);
        }
      }
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
      else bind();
    })();
    function _buildConflictAOA(snap, otherSnap) {
      var rk = snap && snap.roleKey;
      var role = rk ? ALL_ROLES.find(function(r) {
        return r.key === rk;
      }) : null;
      var roleName = role ? roleLabel(role) : rk || "\u2014";
      var pp = snap && snap.personalPlanning || null;
      var ppRole = pp && rk && pp[rk] ? pp[rk] : null;
      var ta = ppRole && ppRole.taskAssignments || {};
      var otherPP = otherSnap && otherSnap.personalPlanning || null;
      var otherPPRole = otherPP && rk && otherPP[rk] ? otherPP[rk] : null;
      var otherTA = otherPPRole && otherPPRole.taskAssignments || {};
      var meta = [
        [T("excelSprintName"), snap && snap.name || "\u2014"],
        [T("excelRole"), roleName],
        [T("excelPeriod"), (snap && snap.dateStart ? fmtDate(snap.dateStart) : "\u2014") + " \u2014 " + (snap && snap.dateEnd ? fmtDate(snap.dateEnd) : "\u2014")],
        [T("excelStatus"), snap && snap.status ? statusLabel(snap.status) : "\u2014"],
        [T("excelDiffHighlightLegend")],
        /* строка-легенда */
        []
      ];
      var header = [
        "\u0394",
        T("excelColId"),
        T("excelColTitle"),
        T("excelColInclusion"),
        T("excelColEstimate"),
        T("excelColFact"),
        T("excelColResource"),
        T("excelColAlloc"),
        T("excelColAssignee"),
        T("excelColStartDate") || "\u0421\u0442\u0430\u0440\u0442",
        T("excelColEndDate") || "\u0424\u0438\u043D\u0438\u0448"
      ];
      function minToH(m) {
        return m != null ? Math.round(m / 60 * 100) / 100 : "";
      }
      function tsToD(ts) {
        return ts ? fmtDate(ts) : "";
      }
      var items = snap && snap.items || [];
      var rows = items.map(function(item) {
        var iid = item.issueId || "";
        var taE = ta[iid] || {};
        var oE = otherTA[iid] || {};
        var otherItem = otherSnap && otherSnap.items ? otherSnap.items.find(function(x) {
          return x && x.issueId === iid;
        }) : null;
        var diffParts = [];
        if (!otherItem) diffParts.push("item");
        else {
          if ((item["estimate_" + rk] || 0) !== (otherItem["estimate_" + rk] || 0)) diffParts.push("est");
          if (item["alloc_" + rk] !== otherItem["alloc_" + rk]) diffParts.push("alloc");
          if ((item.inclusionStatus || "") !== (otherItem.inclusionStatus || "")) diffParts.push("incl");
        }
        if ((taE.assignee || "") !== (oE.assignee || "")) diffParts.push("assignee");
        if ((taE.dateStart || 0) !== (oE.dateStart || 0)) diffParts.push("start");
        if ((taE.dateEnd || 0) !== (oE.dateEnd || 0)) diffParts.push("end");
        var diff = diffParts.length ? "\u0394 " + diffParts.join(",") : "";
        var resourceMin = Math.max(0, (item["estimate_" + rk] || 0) - (item["fact_" + rk] || 0));
        var allocRaw = item["alloc_" + rk];
        var allocMin = allocRaw !== null && allocRaw !== void 0 ? allocRaw : resourceMin;
        return [
          diff,
          iid,
          item.title || "",
          item.inclusionStatus ? incLabel(item.inclusionStatus) : "",
          minToH(item["estimate_" + rk]),
          minToH(item["fact_" + rk]),
          minToH(resourceMin),
          minToH(allocMin),
          taE.assigneeName || taE.assignee || "",
          tsToD(taE.dateStart),
          tsToD(taE.dateEnd)
        ];
      });
      var ourIds = {};
      items.forEach(function(it) {
        if (it && it.issueId) ourIds[it.issueId] = true;
      });
      var otherItems = otherSnap && otherSnap.items || [];
      otherItems.forEach(function(it) {
        if (!it || !it.issueId) return;
        if (ourIds[it.issueId]) return;
        rows.push(["\u0394 missing", it.issueId, it.title || "", "", "", "", "", "", "", "", ""]);
      });
      return meta.concat([header]).concat(rows);
    }
    function exportConflictToExcel(baseSnap, mySnap) {
      if (typeof XLSX === "undefined") {
        try {
          toast(T("toastXlsxLoading") || "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C XLSX-\u0431\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A\u0443\u2026", "info");
        } catch (_) {
        }
        loadXLSXLib().then(function() {
          exportConflictToExcel(baseSnap, mySnap);
        }).catch(function(e) {
          diag("XLSX load failed: " + (e && e.message ? e.message : e), "err");
          try {
            toast(T("toastXlsxErr"));
          } catch (_) {
          }
        });
        return;
      }
      try {
        var aoaBase = _buildConflictAOA(baseSnap, mySnap);
        var aoaWorking = _buildConflictAOA(mySnap, baseSnap);
        var wsBase = XLSX.utils.aoa_to_sheet(aoaBase);
        var wsWorking = XLSX.utils.aoa_to_sheet(aoaWorking);
        var cols = [{ wch: 14 }, { wch: 14 }, { wch: 42 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 12 }];
        wsBase["!cols"] = cols;
        wsWorking["!cols"] = cols;
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsBase, T("excelSheetBase"));
        XLSX.utils.book_append_sheet(wb, wsWorking, T("excelSheetWorking"));
        var ts = /* @__PURE__ */ new Date();
        var pad = function(n) {
          return String(n).padStart(2, "0");
        };
        var nm = baseSnap && baseSnap.name ? String(baseSnap.name).replace(/[\\\/:*?"<>|]+/g, "_") : "sprint";
        var fn = "Sprint-" + nm + "-conflict-" + ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) + "-" + pad(ts.getHours()) + pad(ts.getMinutes()) + ".xlsx";
        XLSX.writeFile(wb, fn);
        diag("Conflict Excel exported: " + fn, "ok");
      } catch (e) {
        diag("exportConflictToExcel failed: " + (e && e.message ? e.message : e), "err");
        try {
          toast(T("toastXlsxErr"));
        } catch (_) {
        }
      }
    }
    function migrateEditingFromHistoryV52() {
      if (!_settings) return;
      if (_settings.migratedTo === "5.3") return;
      if (_sprint && _sprint.editingFromHistory === true && _sprint.historyIdx != null) {
        var idx = _sprint.historyIdx;
        var existingSnap = _history[idx];
        if (existingSnap && existingSnap.roleKey) {
          diag("v5.2\u2192v5.3 migration: committing in-flight edit as PLANNING for " + existingSnap.sprintId, "info");
          try {
            saveRoleHistorySnapshot(existingSnap.roleKey, idx);
          } catch (e) {
            diag("migration save failed: " + (e && e.message ? e.message : e), "err");
          }
        } else {
          diag("v5.2\u2192v5.3 migration: stale historyIdx=" + idx + ", no snap found, skipping commit", "warn");
        }
        delete _sprint.editingFromHistory;
        delete _sprint.historyIdx;
        apiPost("sprint-data", { sprint: _sprint, roleItems: _roleItems }).catch(function() {
        });
        setTimeout(function() {
          try {
            toast(T("wcMigrationNotice"), "info");
          } catch (_) {
          }
        }, 500);
      }
      _settings.migratedTo = "5.3";
      apiPost("sprint-data", { settings: _settings }).catch(function() {
      });
    }
    function _draftSaveDebounced(suffix, valueGetter, delayMs) {
      if (_draftRestoreInProgress) return;
      clearTimeout(_draftSaveTimers[suffix]);
      _draftSaveTimers[suffix] = setTimeout(function() {
        _draftSet(suffix, valueGetter());
        _draftSet("meta", { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
      }, delayMs || 800);
    }
    function _markDirty(section) {
      if (_draftRestoreInProgress) return;
      var d = _draftGet("dirty") || {};
      d[section] = true;
      _draftSet("dirty", d);
      refreshDirtyIndicator();
      if (_activeWorkingDraftKey) {
        try {
          var rk = _activeSubtab;
          if (!rk) {
            var draft = _workingDrafts[_activeWorkingDraftKey];
            if (draft) {
              var snap = _history.find(function(s) {
                return s && s.sprintId === _activeWorkingDraftKey;
              });
              if (snap) rk = snap.roleKey;
            }
          }
          if (rk) syncWorkingDraftFromMemory(rk);
        } catch (e) {
          diag("syncWorkingDraftFromMemory failed: " + (e && e.message ? e.message : e), "err");
        }
      }
    }
    function _markClean(section) {
      var d = _draftGet("dirty") || {};
      d[section] = false;
      _draftSet("dirty", d);
      refreshDirtyIndicator();
    }
    function _draftIsDirty() {
      var d = _draftGet("dirty") || {};
      return !!(d.sprint || d.roleItems || d.currentRole);
    }
    function computeRevHash(sprint, roleItems) {
      var s = JSON.stringify({ s: sprint, r: roleItems });
      var h = 2166136261;
      for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = h * 16777619 >>> 0;
      }
      return h.toString(16);
    }
    function refreshDirtyIndicator() {
      var any = _draftIsDirty();
      var meta = _draftGet("meta");
      var badge = document.getElementById("dirtyBadge");
      var btn = document.getElementById("clearDraftBtn");
      diag("refreshDirtyIndicator: any=" + any + " meta=" + (meta ? "yes(" + (meta.savedAt || "?") + ")" : "no") + " badge=" + (badge ? "yes" : "no") + " btn=" + (btn ? "yes" : "no"), "info");
      if (badge) {
        badge.classList.remove("dirty-badge--clean");
        if (any) {
          badge.textContent = T("dirtyBadge");
          badge.title = T("tooltipDirtyRow");
          badge.classList.remove("hidden");
        } else if (meta) {
          var ts = "";
          try {
            ts = new Date(meta.savedAt).toLocaleTimeString(_lang === "en" ? "en-US" : "ru-RU", { hour: "2-digit", minute: "2-digit" });
          } catch (_) {
            ts = "";
          }
          badge.textContent = T("draftSavedAt").replace("{ts}", ts);
          badge.title = T("draftSavedAtTitle");
          badge.classList.add("dirty-badge--clean");
          badge.classList.remove("hidden");
        } else {
          badge.classList.add("hidden");
        }
      }
      if (btn) {
        setButtonText(btn, T("btnClearDraft"));
        btn.title = T("btnClearDraftTitle");
        if (meta) btn.classList.remove("hidden");
        else btn.classList.add("hidden");
      }
    }
    function clearDraftStorage() {
      ["meta", "ui", "sprint", "roleItems", "currentRole", "dirty"].forEach(function(suf) {
        _draftDel(suf);
      });
      _currentSprintId = null;
      if (typeof renderWidgetHeader === "function") {
        try {
          renderWidgetHeader();
        } catch (_) {
        }
      }
    }
    function bindSprintHeaderDraftListeners() {
      [
        { id: "sprintName", apply: function(v) {
          _sprint.name = v.trim().substring(0, 60) || null;
        } },
        { id: "dateStart", apply: function(v) {
          _sprint.dateStart = typeof fromDateIn === "function" ? fromDateIn(v) : v;
        } },
        { id: "dateEnd", apply: function(v) {
          _sprint.dateEnd = typeof fromDateIn === "function" ? fromDateIn(v) : v;
        } },
        { id: "sprintFieldVal", apply: function(v) {
          _sprint.sprintFieldVal = v || null;
        } },
        { id: "versionFieldVal", apply: function(v) {
          _sprint.versionFieldVal = v || null;
        } }
      ].forEach(function(spec) {
        var el = document.getElementById(spec.id);
        if (!el || el._sspDraftBound) return;
        el._sspDraftBound = true;
        var handler = function() {
          if (!_sprint || _draftRestoreInProgress) return;
          try {
            spec.apply(el.value);
          } catch (_) {
          }
          _markDirty("sprint");
          _draftSaveDebounced("sprint", function() {
            return _sprint;
          });
        };
        el.addEventListener("input", handler);
        el.addEventListener("change", handler);
      });
    }
    function bindClearDraftHandlers() {
      var btn = document.getElementById("clearDraftBtn");
      var no = document.getElementById("clearDraftNo");
      var yes = document.getElementById("clearDraftYes");
      if (btn && !btn._sspBound) {
        btn._sspBound = true;
        btn.addEventListener("click", function() {
          var dirty = _draftGet("dirty") || {};
          var meta = _draftGet("meta");
          if (!meta || !_draftIsDirty()) {
            clearDraftStorage();
            refreshDirtyIndicator();
            try {
              toast(T("toastDraftCleared"), "info");
            } catch (_) {
            }
            return;
          }
          var ts = "";
          try {
            ts = new Date(meta.savedAt).toLocaleString(_lang === "en" ? "en-US" : "ru-RU");
          } catch (_) {
            ts = String(meta.savedAt);
          }
          var sections = [];
          if (dirty.sprint) sections.push(T("draftSectionSprint"));
          if (dirty.roleItems) sections.push(T("draftSectionRoleItems"));
          if (dirty.currentRole) sections.push(T("draftSectionCurrentRole"));
          var info = T("draftMetaInfo").replace("{ts}", ts).replace("{sections}", sections.join(", "));
          var infoEl = document.getElementById("clearDraftMetaInfo");
          if (infoEl) infoEl.textContent = info;
          _showOverlay("clearDraftOverlay");
        });
      }
      if (no && !no._sspBound) {
        no._sspBound = true;
        no.addEventListener("click", function() {
          document.getElementById("clearDraftOverlay").classList.add("hidden");
        });
      }
      if (yes && !yes._sspBound) {
        yes._sspBound = true;
        yes.addEventListener("click", function() {
          document.getElementById("clearDraftOverlay").classList.add("hidden");
          _draftClearOnBackend().then(function() {
            return loadAllData();
          }).then(function() {
            _serverSnapshotSprint = _sprint ? deepClone(_sprint) : null;
            _serverSnapshotRoleItems = _roleItems ? deepClone(_roleItems) : null;
            _baseRevHash = computeRevHash(_sprint, _roleItems);
            try {
              if (typeof renderPlannerRoles === "function") renderPlannerRoles();
              if (typeof renderHistory === "function") renderHistory();
            } catch (_) {
            }
            refreshDirtyIndicator();
            try {
              toast(T("toastDraftCleared"), "success");
            } catch (_) {
            }
          }).catch(function(e) {
            try {
              toast(T("toastDraftClearErr") + ": " + (e && e.message ? e.message : e), "error");
            } catch (_) {
            }
          });
        });
      }
    }
    function bindResInputDraftListener(rk) {
      var el = document.getElementById("res_" + rk);
      if (!el || el._sspDraftBound) return;
      el._sspDraftBound = true;
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      if (!role) return;
      var handler = function() {
        if (!_sprint || el.readOnly || _draftRestoreInProgress) return;
        _sprint[role.resKey] = typeof parsePeriod === "function" ? parsePeriod(el.value) : el.value;
        _markDirty("sprint");
        _draftSaveDebounced("sprint", function() {
          return _sprint;
        });
      };
      el.addEventListener("input", handler);
      el.addEventListener("change", handler);
    }
    function restoreDraftIfAny() {
      var meta = _draftGet("meta");
      if (!meta) {
        diag("draft: no meta in localStorage", "info");
        return;
      }
      diag("draft: meta found, savedAt=" + meta.savedAt + " version=" + meta.version + " baseRevHash=" + meta.baseRevHash, "info");
      if (meta.version !== DRAFT_VERSION) {
        diag("draft: schema version mismatch, ignoring", "info");
        return;
      }
      var dirty = _draftGet("dirty") || {};
      var hasAny = !!(dirty.sprint || dirty.roleItems || dirty.currentRole);
      diag("draft: dirty=" + JSON.stringify(dirty) + " hasAny=" + hasAny, "info");
      if (!hasAny) return;
      if (meta.baseRevHash && meta.baseRevHash !== _baseRevHash) {
        try {
          toast(T("toastDraftStale"), "warn");
        } catch (_) {
        }
        _markClean("sprint");
        _markClean("roleItems");
        _markClean("currentRole");
        diag("draft: stale, skipping restore (serverHash=" + _baseRevHash + ", draftBase=" + meta.baseRevHash + ")", "info");
        return;
      }
      _draftRestoreInProgress = true;
      try {
        if (dirty.sprint) {
          var d = _draftGet("sprint");
          if (d && typeof d === "object") _sprint = d;
        }
        if (dirty.roleItems) {
          var dr = _draftGet("roleItems");
          if (dr && typeof dr === "object") _roleItems = dr;
        }
        if (dirty.currentRole) {
          var dd = _draftGet("currentRole");
          if (dd && typeof dd === "object") {
            _currentRolePP = dd.pp || null;
            _currentRoleGantt = dd.gantt || null;
            if (dd.nkcKey) _currentRoleNkcKey = dd.nkcKey;
          }
        }
        var ts;
        try {
          ts = new Date(meta.savedAt).toLocaleString(_lang === "en" ? "en-US" : "ru-RU");
        } catch (_) {
          ts = String(meta.savedAt);
        }
        try {
          toast(T("toastDraftRestored").replace("{ts}", ts), "info");
        } catch (_) {
        }
        diag("draft: restored sections " + JSON.stringify(dirty), "ok");
      } finally {
        _draftRestoreInProgress = false;
      }
    }
    function restoreUiState() {
      var ui = _draftGet("ui") || {};
      try {
        try {
          var ids = typeof getLogicalSprintIds === "function" ? getLogicalSprintIds() : [];
          var resolved = null;
          if (ui.currentSprintId && ids.indexOf(ui.currentSprintId) >= 0) {
            resolved = ui.currentSprintId;
          } else if (_sprint && _sprint.sprintId && ids.indexOf(_sprint.sprintId) >= 0) {
            resolved = _sprint.sprintId;
          } else if (ids.length) {
            resolved = ids[0];
          }
          _currentSprintId = resolved;
          if (resolved !== ui.currentSprintId) {
            ui.currentSprintId = resolved;
            _draftSet("ui", ui);
          }
        } catch (e) {
          diag("restoreUiState: currentSprintId migration err: " + e, "err");
        }
        if (ui.activeTab) {
          var tabBtn = document.querySelector('.tab-btn[data-tab="' + ui.activeTab + '"]');
          if (tabBtn && tabBtn.style.display !== "none") tabBtn.click();
        }
        try {
          var lvl = ui.planningLevel;
          if (!lvl) lvl = "roles";
          _planningLevel = lvl;
          if (lvl !== ui.planningLevel) {
            ui.planningLevel = lvl;
            _draftSet("ui", ui);
          }
          document.querySelectorAll(".planning-level-btn").forEach(function(b) {
            b.classList.toggle("active", b.dataset.level === lvl);
          });
          document.querySelectorAll(".planning-level-pane").forEach(function(p) {
            p.classList.toggle("hidden", p.id !== "planning-level-" + lvl);
          });
        } catch (e) {
          diag("restoreUiState: planningLevel migration err: " + e, "err");
        }
        try {
          if (Array.isArray(ui.expandedRoles)) {
            ui.expandedRoles.forEach(function(rk) {
              if (rk) _uiExpandedRoles[rk] = true;
            });
          }
        } catch (e) {
          diag("restoreUiState: expandedRoles err: " + e, "err");
        }
        if (ui.currentRoleNkcKey) {
          var nkcSel = document.getElementById("currentRoleNkcSel");
          if (nkcSel && nkcSel.querySelector('option[value="' + ui.currentRoleNkcKey + '"]')) {
            nkcSel.value = ui.currentRoleNkcKey;
            nkcSel.dispatchEvent(new Event("change"));
          }
        }
        if (typeof renderWidgetHeader === "function") {
          try {
            renderWidgetHeader();
          } catch (_) {
          }
        }
      } catch (e) {
        diag("restoreUiState err: " + e, "err");
      }
    }
    function markSavedAndCleanup(section) {
      _markClean(section);
      if (section === "sprint") {
        _serverSnapshotSprint = _sprint ? deepClone(_sprint) : null;
        _draftSet("sprint", _sprint);
      }
      if (section === "roleItems") {
        _serverSnapshotRoleItems = _roleItems ? deepClone(_roleItems) : null;
        _draftSet("roleItems", _roleItems);
      }
      if (section === "currentRole") {
        _serverSnapshotCurrentRolePP = _currentRolePP ? deepClone(_currentRolePP) : null;
        _serverSnapshotCurrentRoleGantt = _currentRoleGantt ? deepClone(_currentRoleGantt) : null;
        _draftSet("currentRole", {
          pp: _currentRolePP,
          gantt: _currentRoleGantt,
          nkcKey: _currentRoleNkcKey,
          sprintRecKey: _currentSprintRoleRec ? _currentSprintRoleRec.sprintId : null
        });
      }
      _baseRevHash = computeRevHash(_sprint, _roleItems);
      _draftSet("meta", { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
      refreshDirtyIndicator();
      if (_activeSubtab && typeof renderRoleComposition === "function") {
        try {
          renderRoleComposition(_activeSubtab);
        } catch (_) {
        }
      }
    }
    function diag(msg, type) {
      _diagLines.push({ msg, type: type || "info" });
      if (_diagLines.length > 100) _diagLines.shift();
      var log = document.getElementById("diagLog");
      if (!log) return;
      var line = document.createElement("div");
      line.className = "diag-line diag-line--" + (type || "info");
      line.textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString("ru-RU") + " " + msg;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }
    function calcRemForRole(roleKey) {
      var role = ALL_ROLES.find(function(r) {
        return r.key === roleKey;
      });
      if (!role) return 0;
      var items = (_roleItems[roleKey] || []).filter(function(i) {
        return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0;
      });
      var resource = _sprint ? _sprint[role.resKey] || 0 : 0;
      var used = items.reduce(function(s, i) {
        var alloc = i["alloc_" + roleKey];
        if (alloc !== null && alloc !== void 0) {
          return s + Math.max(0, alloc);
        }
        var est = i["estimate_" + roleKey];
        var fact = i["fact_" + roleKey];
        return s + Math.max(0, (est || 0) - (fact || 0));
      }, 0);
      return resource - used;
    }
    function apiGet(path) {
      diag("GET " + path);
      return _host.fetchApp("backend-project/" + path, { scope: true }).then(function(r) {
        diag("OK " + path, "ok");
        return r;
      }).catch(function(e) {
        diag("ERR " + path + ": " + (e && e.message ? e.message : e), "err");
        throw e;
      });
    }
    function apiPost(path, body, query) {
      diag("POST " + path);
      var opts = { scope: true, method: "POST", body };
      if (query && typeof query === "object") opts.query = query;
      return _host.fetchApp("backend-project/" + path, opts).then(function(r) {
        if (r && r.success === false) {
          var reason = r && (r.reason || r.error) || "unknown_error";
          diag("ERR " + path + ": server returned success=false reason=" + reason, "err");
          throw new Error(reason);
        }
        diag("OK " + path, "ok");
        try {
          if (path === "sprint-data" && body) {
            if (body.sprint !== void 0) markSavedAndCleanup("sprint");
            if (body.roleItems !== void 0) markSavedAndCleanup("roleItems");
            var isValidate = query && query.action === "validate";
            var hasSprintData = body.sprint !== void 0 || body.roleItems !== void 0;
            if (hasSprintData && !isValidate && _sprint && _sprint.sprintId && _sprint.status !== STATUS.FINISHED && _activeSubtab) {
              try {
                saveRoleHistorySnapshot(_activeSubtab).catch(function(e) {
                  diag("auto-snapshot history failed: " + (e && e.message ? e.message : e), "err");
                });
              } catch (_) {
              }
            }
          } else if (path === "history") {
            markSavedAndCleanup("currentRole");
            try {
              if (_currentSprintRoleRec && _currentSprintRoleRec.sprintId && Array.isArray(_history)) {
                var freshRec = _history.find(function(h) {
                  return h.sprintId === _currentSprintRoleRec.sprintId;
                });
                if (freshRec && freshRec !== _currentSprintRoleRec) _currentSprintRoleRec = freshRec;
              }
            } catch (_) {
            }
          }
        } catch (_) {
        }
        return r;
      }).catch(function(e) {
        diag("ERR " + path + ": " + (e && e.message ? e.message : e), "err");
        throw e;
      });
    }
    var _ytRegT0 = Date.now();
    diag("YTApp.register START", "info");
    function _ytAppRegisterWithRetry(attempt) {
      attempt = attempt || 1;
      return YTApp.register().catch(function(err) {
        if (attempt >= 3) {
          diag("YTApp.register FAILED after " + attempt + " attempts: " + (err && err.message ? err.message : err), "err");
          try {
            var b = document.getElementById("bannerNotConfigured");
            if (b) {
              b.classList.remove("hidden");
              b.style.background = "rgba(224,90,106,.18)";
              b.style.color = "#b13e4d";
              b.textContent = "\u26A0 \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0432\u0438\u0434\u0436\u0435\u0442 \u0432 YouTrack. \u041F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 (F5). \u0415\u0441\u043B\u0438 \u043E\u0448\u0438\u0431\u043A\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0435\u0442\u0441\u044F \u2014 \u043E\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044C \u043A \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443.";
            }
          } catch (_) {
          }
          throw err;
        }
        var delay = 500 * attempt;
        diag("YTApp.register attempt " + attempt + " failed, retry in " + delay + "ms: " + (err && err.message ? err.message : err), "err");
        return new Promise(function(r) {
          setTimeout(r, delay);
        }).then(function() {
          return _ytAppRegisterWithRetry(attempt + 1);
        });
      });
    }
    _ytAppRegisterWithRetry().then(function(h) {
      diag("YTApp.register OK (" + (Date.now() - _ytRegT0) + "ms)", "ok");
      _host = h;
      _ctx = h.context;
      if (!_ytBase) {
        try {
          var bu = h.getBaseUrl ? h.getBaseUrl() : null;
          if (bu) {
            var bum = bu.match(/^(https?:\/\/[^\/]+)/);
            if (bum) _ytBase = bum[1];
            else if (bu.indexOf("http") === 0) _ytBase = bu.replace(/\/$/, "");
          }
        } catch (ex) {
        }
      }
      diag("YTApp registered. project=" + (_ctx && _ctx.project ? _ctx.project.id : "?"), "info");
      if (_ctx && _ctx.project && (_ctx.project.name || _ctx.project.shortName)) {
        _projectDisplayName = _ctx.project.name || _ctx.project.shortName;
        _updateProjectNameLabel();
      }
      var _initT0 = Date.now();
      diag("init: loadMe + loadProjectFields START", "info");
      return Promise.all([loadMe(), loadProjectFields()]).then(function(arr) {
        diag("init: loadMe+loadProjectFields OK (" + (Date.now() - _initT0) + "ms)", "ok");
        return arr;
      });
    }).then(function() {
      var t = Date.now();
      diag("init: loadAllData START", "info");
      return loadAllData().then(function(r) {
        diag("init: loadAllData OK (" + (Date.now() - t) + "ms)", "ok");
        return r;
      });
    }).then(function() {
      _serverSnapshotSprint = _sprint ? deepClone(_sprint) : null;
      _serverSnapshotRoleItems = _roleItems ? deepClone(_roleItems) : null;
      _baseRevHash = computeRevHash(_sprint, _roleItems);
      return _draftLoadFromBackend();
    }).then(function() {
      restoreDraftIfAny();
      renderPlannerRoles();
      renderHistory();
      maybeShowAllocatedLockHint();
      setTimeout(function() {
        if (typeof applyPersonalResourceToInputs === "function") applyPersonalResourceToInputs();
      }, 50);
      bindSprintHeaderDraftListeners();
      applyPersonalPlanningVisibility();
      restoreUiState();
      refreshOpenSettingsBtn();
      refreshClearHistoryBtn();
      _populateLangSelect(document.getElementById("langSel"));
      _populateLangSelect(document.getElementById("langSelSettings"));
      var langSelEl = document.getElementById("langSel");
      if (langSelEl) {
        langSelEl.value = _lang;
        if (!langSelEl._sspBound) {
          langSelEl.addEventListener("change", function() {
            setLang2(langSelEl.value);
          });
          langSelEl._sspBound = true;
        }
      }
      var langSelSettingsEl = document.getElementById("langSelSettings");
      if (langSelSettingsEl) {
        langSelSettingsEl.value = _lang;
        if (!langSelSettingsEl._sspBound) {
          langSelSettingsEl.addEventListener("change", function() {
            setLang2(langSelSettingsEl.value);
          });
          langSelSettingsEl._sspBound = true;
        }
      }
      applyI18N();
      applyIcons();
      applyRingTheme();
      refreshDirtyIndicator();
      var openBtn = document.getElementById("openSettingsBtn");
      var closeBtn = document.getElementById("closeSettingsBtn");
      if (openBtn && !openBtn._sspBound) {
        openBtn.addEventListener("click", openSettingsOverlay);
        openBtn._sspBound = true;
      }
      if (closeBtn && !closeBtn._sspBound) {
        closeBtn.addEventListener("click", closeSettingsOverlay);
        closeBtn._sspBound = true;
      }
      document.querySelectorAll(".settings-nav__chip").forEach(function(chip) {
        if (chip._sspNavBound) return;
        chip._sspNavBound = true;
        chip.addEventListener("click", function(e) {
          e.preventDefault();
          e.stopPropagation();
          var targetId = chip.getAttribute("data-target");
          if (!targetId) return;
          var target = document.getElementById(targetId);
          if (!target) return;
          try {
            var firstDetails = target.querySelector("details.settings-card");
            if (firstDetails) firstDetails.open = true;
          } catch (_) {
          }
          if (typeof target.scrollIntoView === "function") {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      });
      var saveBtn = document.getElementById("saveSettingsBtn");
      if (saveBtn && !saveBtn._sspBound) {
        saveBtn.addEventListener("click", function(e) {
          e.preventDefault();
          doSaveSettings();
        });
        saveBtn._sspBound = true;
      }
      bindClearDraftHandlers();
      document.addEventListener("keydown", function(e) {
        if (e.key !== "Escape") return;
        var settingsOv = document.getElementById("settingsOverlay");
        if (settingsOv && !settingsOv.classList.contains("hidden")) {
          closeSettingsOverlay();
          return;
        }
        var overlays = document.querySelectorAll(".overlay:not(.hidden)");
        if (!overlays.length) return;
        var topOv = overlays[overlays.length - 1];
        var cancelBtn = topOv.querySelector(
          'button[id$="Cancel"], button[id$="CancelBtn"], button[id$="No"], button[id$="CloseBtn"], button[id$="Close"], button[id^="close"], button[id="cancelPickBtn"], button[id="closePickModal"], button[id="wcMultiTabReadonlyBtn"]'
        );
        if (cancelBtn) {
          try {
            cancelBtn.click();
          } catch (_) {
            topOv.classList.add("hidden");
          }
        } else {
          topOv.classList.add("hidden");
        }
      });
      if (typeof _loadAppVersion === "function") {
        try {
          _loadAppVersion();
        } catch (e) {
          diag("_loadAppVersion err: " + e, "err");
        }
      }
      diag("Init complete", "ok");
    }).catch(function(e) {
      diag("INIT ERROR: " + (e && e.message ? e.message : e), "err");
      toast(T("toastInitError") + (e && e.message ? e.message : e));
    });
    function refreshOpenSettingsBtn() {
      var btn = document.getElementById("openSettingsBtn");
      var banner = document.getElementById("bannerNotConfigured");
      apiGet("check-settings-manager").then(function(r) {
        var canManage = !!(r && r.canManage);
        var configured = !!(r && r.configured);
        diag("check-settings-manager: configured=" + configured + " canManage=" + canManage, "info");
        if (banner) {
          if (configured) banner.classList.add("hidden");
          else banner.classList.remove("hidden");
        }
        if (!btn) return;
        btn.style.display = canManage ? "" : "none";
      }).catch(function(e) {
        diag("refreshOpenSettingsBtn ERR: " + String(e), "err");
        if (btn) btn.style.display = "none";
      });
    }
    function openSettingsOverlay() {
      var overlay = document.getElementById("settingsOverlay");
      var form = document.getElementById("settingsForm");
      var notCfg = document.getElementById("settingsNotConfigured");
      var denied = document.getElementById("settingsAccessDenied");
      var details = document.getElementById("settingsAccessDeniedDetails");
      if (!overlay) return;
      if (form) form.classList.add("hidden");
      if (notCfg) notCfg.classList.add("hidden");
      if (denied) denied.classList.add("hidden");
      if (details) details.textContent = "";
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");
      try {
        overlay.querySelectorAll("details.settings-card").forEach(function(d) {
          d.open = false;
          if (d.dataset.sspAccordionBound) return;
          d.dataset.sspAccordionBound = "1";
          d.addEventListener("toggle", function() {
            if (!d.open) return;
            overlay.querySelectorAll("details.settings-card").forEach(function(other) {
              if (other !== d && other.open) other.open = false;
            });
          });
        });
      } catch (_) {
      }
      if (typeof loadProjectGroups === "function" && !window._sspGroupsLoaded) {
        window._sspGroupsLoaded = true;
        loadProjectGroups().catch(function(e) {
          diag("lazy loadProjectGroups err: " + e, "err");
        });
      }
      apiGet("check-settings-manager").then(function(r) {
        diag("overlay open: configured=" + (r && r.configured) + " canManage=" + (r && r.canManage), "info");
        if (!r || !r.configured) {
          if (notCfg) notCfg.classList.remove("hidden");
          return;
        }
        if (!r.canManage) {
          if (denied) denied.classList.remove("hidden");
          if (details && r.groupName) {
            details.textContent = T("settingsNoAccessGroup").replace("{group}", r.groupName);
          }
          return;
        }
        try {
          applySettingsUI();
          bindSettingsFormHandlers();
          applyI18N();
          _settingsLoaded = true;
          if (form) form.classList.remove("hidden");
        } catch (renderErr) {
          diag("overlay render ERR: " + (renderErr && renderErr.message ? renderErr.message : String(renderErr)), "err");
          if (denied) denied.classList.remove("hidden");
          if (details) {
            details.textContent = T("toastInitError") + (renderErr && renderErr.message ? renderErr.message : String(renderErr));
          }
          toast(T("toastInitError") + (renderErr && renderErr.message ? renderErr.message : ""), "err");
        }
      }).catch(function(e) {
        diag("overlay check ERR: " + String(e), "err");
        if (denied) denied.classList.remove("hidden");
        if (details) details.textContent = T("toastInitError") + (e && e.message ? e.message : String(e));
      });
    }
    function applyPersonalPlanningVisibility() {
      if (typeof _applyPersonalPlanningToSegmentedControl === "function") {
        try {
          _applyPersonalPlanningToSegmentedControl();
        } catch (_) {
        }
      }
    }
    function bindSettingsFormHandlers() {
      ["dynEditCheck", "usePersonalForResourceCheck", "personalPlanningCheck", "manualPersonalResourceCheck"].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el || el._sspBound) return;
        el.addEventListener("click", function() {
          if (id === "usePersonalForResourceCheck" && el.classList.contains("role-check--disabled")) return;
          if (id === "manualPersonalResourceCheck" && el.classList.contains("role-check--disabled")) return;
          el.classList.toggle("active");
          if (id === "personalPlanningCheck") applyModesDependencies();
        });
        el._sspBound = true;
      });
      var saveBtn = document.getElementById("saveSettingsBtn");
      if (saveBtn && !saveBtn._sspBound) {
        saveBtn.addEventListener("click", function(e) {
          e.preventDefault();
          doSaveSettings();
        });
        saveBtn._sspBound = true;
      }
    }
    function applyModesDependencies() {
      var parentEl = document.getElementById("personalPlanningCheck");
      var parentOn = !!(parentEl && parentEl.classList.contains("active"));
      var childEl = document.getElementById("usePersonalForResourceCheck");
      if (childEl) {
        childEl.classList.toggle("role-check--disabled", !parentOn);
      }
      var manualEl = document.getElementById("manualPersonalResourceCheck");
      if (manualEl) {
        manualEl.classList.toggle("role-check--disabled", !parentOn);
      }
      try {
        if (typeof _applyPersonalPlanningToSegmentedControl === "function") _applyPersonalPlanningToSegmentedControl();
      } catch (_) {
      }
    }
    function closeSettingsOverlay() {
      var overlay = document.getElementById("settingsOverlay");
      if (!overlay) return;
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
    }
    function loadMe() {
      return _host.fetchYouTrack("users/me", { query: { fields: "id,login,fullName" } }).then(function(u) {
        _currentUser = u;
        diag("me=" + (u && u.login ? u.login : "?"), "ok");
      }).catch(function(e) {
        _currentUser = { login: "unknown" };
        diag("me ERR: " + String(e), "err");
      });
    }
    function loadProjectFields() {
      return apiGet("project-fields").then(function(r) {
        if (r && r.success) {
          _projectFields = r.fields || [];
          diag("Fields loaded: " + _projectFields.length, "ok");
          if (r.projectName) {
            _projectDisplayName = r.projectName;
            _updateProjectNameLabel();
          }
          _ytBaseFromProject();
        }
      }).catch(function() {
      });
    }
    function loadProjectGroups() {
      return _host.fetchYouTrack("groups", {
        query: { fields: "id,name", $top: 5e3 }
      }).then(function(g) {
        var raw = Array.isArray(g) ? g : [];
        _projectGroups = raw.filter(function(gr) {
          return !!gr.id;
        }).map(function(gr) {
          var name = gr.name && gr.name.trim() ? gr.name.trim() : gr.id;
          return { id: gr.id, name };
        });
        diag("Groups loaded: " + _projectGroups.length, "ok");
      }).catch(function(e) {
        _projectGroups = [];
        diag("Groups ERR: " + String(e), "err");
      });
    }
    function _refreshFeatureStatusBar() {
      var bar = document.getElementById("widgetStatusBar");
      if (!bar) return;
      var s = _settings || {};
      var modules = [
        { id: "ssbInline", on: !!s.dynEditEnabled },
        { id: "ssbPersonal", on: !!s.personalPlanningEnabled },
        { id: "ssbDta", on: !!s.dtaEnabled },
        { id: "ssbCascade", on: !!s.cascadeAggregationEnabled },
        { id: "ssbStateRollup", on: !!s.stateRollupEnabled }
        /* v1.7.0 D128 */
      ];
      modules.forEach(function(m) {
        var el = document.getElementById(m.id);
        if (!el) return;
        el.classList.toggle("ssb-on", m.on);
        el.classList.toggle("ssb-off", !m.on);
        var stateEl = el.querySelector(".ssb-chip__state");
        if (stateEl) {
          var key = m.on ? "ssbOn" : "ssbOff";
          stateEl.setAttribute("data-i18n", key);
          stateEl.textContent = T(key);
        }
      });
    }
    function loadAllData() {
      return apiGet("sprint-data").then(function(r) {
        if (r && r.success) {
          _settings = r.settings || null;
          _syncProjectDefaultLang();
          _refreshFeatureStatusBar();
          _sprint = r.sprint || null;
          if (r.roleItems) {
            _roleItems = r.roleItems;
          } else if (r.items && Array.isArray(r.items)) {
            _roleItems = { analysis: r.items };
          } else {
            _roleItems = {};
          }
          try {
            var rkSummary = Object.keys(_roleItems).map(function(rk) {
              return rk + "=" + (_roleItems[rk] ? _roleItems[rk].length : "null");
            }).join(", ");
            diag("loadAllData: _sprint=" + (_sprint ? _sprint.sprintId : "null") + " _roleItems={" + rkSummary + "}", "info");
          } catch (_) {
          }
          if (!_sprint) {
            _sprint = { sprintId: uid(), dateStart: null, dateEnd: null, status: STATUS.PLANNING };
          }
          if (_sprint.status) _sprint.status = migrateStatus(_sprint.status);
          ALL_ROLES.forEach(function(role) {
            var items = _roleItems[role.key] || [];
            items.forEach(function(item) {
              if (item.inclusionStatus) item.inclusionStatus = migrateInc(item.inclusionStatus);
              if (!item.url || item.url.indexOf("/null/") >= 0 || item.url.indexOf("/undefined/") >= 0) {
                item.url = _ytBase + "/issue/" + item.issueId;
              }
              if (item.sprintId !== void 0) delete item.sprintId;
            });
          });
          _enableDebugLog = !!r.enableDebugLog;
          if (_sprint && Array.isArray(r.orphanGanttIssues) && r.orphanGanttIssues.length) {
            _sprint._orphanGanttIssues = r.orphanGanttIssues;
          }
          var diagWrap = document.getElementById("diagWrap");
          if (diagWrap) diagWrap.style.display = "";
          try {
            _applyDiagLogVisibility();
          } catch (_) {
          }
          diag("Data loaded. settings=" + !!_settings + " debugLog=" + _enableDebugLog, "ok");
        }
      }).then(function() {
        return apiGet("history").then(function(r) {
          if (r && r.success) {
            _history = (r.history || []).sort(function(a, b) {
              return (b.confirmedAt || 0) - (a.confirmedAt || 0);
            });
            var ogMap = r.orphanGanttBySprintId && typeof r.orphanGanttBySprintId === "object" ? r.orphanGanttBySprintId : null;
            _history.forEach(function(rec) {
              if (rec.status) rec.status = migrateStatus(rec.status);
              if (Array.isArray(rec.items)) {
                rec.items.forEach(function(it) {
                  if (it.inclusionStatus) it.inclusionStatus = migrateInc(it.inclusionStatus);
                });
              }
              if (ogMap && rec && rec.sprintId && Array.isArray(ogMap[rec.sprintId]) && ogMap[rec.sprintId].length) {
                rec._orphanGanttIssues = ogMap[rec.sprintId];
              }
            });
          }
        });
      }).then(function() {
        return _workingDraftsLoadFromBackend().then(function() {
          try {
            reconcileHasWorkingCopyFlag();
          } catch (e) {
            diag("reconcile failed: " + e, "err");
          }
          try {
            gcWorkingDrafts();
          } catch (e) {
            diag("gc failed: " + e, "err");
          }
          try {
            migrateEditingFromHistoryV52();
          } catch (e) {
            diag("v5.2 migration failed: " + e, "err");
          }
        });
      }).catch(function(e) {
        diag("loadAllData ERR: " + e, "err");
      });
    }
    (function() {
      var dt = document.getElementById("diagToggle");
      if (dt) {
        dt.addEventListener("click", function() {
          var log = document.getElementById("diagLog");
          var clearBtn = document.getElementById("diagClearBtn");
          if (!log) return;
          log.classList.toggle("open");
          var isOpen = log.classList.contains("open");
          this.textContent = isOpen ? "\u25BC " + T("tabSettings").replace("\u2699 ", "") : "\u25B6 " + T("tabSettings").replace("\u2699 ", "");
          if (clearBtn) clearBtn.style.display = isOpen ? "" : "none";
        });
      }
      var dc = document.getElementById("diagClearBtn");
      if (dc) {
        dc.addEventListener("click", function(e) {
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();
          _diagLines = [];
          var log = document.getElementById("diagLog");
          if (log) log.innerHTML = "";
          diag("\u041B\u043E\u0433 \u043E\u0447\u0438\u0449\u0435\u043D", "ok");
        });
      }
      var de = document.getElementById("diagExportBtn");
      if (de) {
        de.addEventListener("click", function(e) {
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();
          if (!_diagLines || !_diagLines.length) {
            try {
              toast(T("toastLogEmpty"), "warn");
            } catch (_) {
            }
            return;
          }
          try {
            var ts = /* @__PURE__ */ new Date();
            var pad = function(n) {
              return n < 10 ? "0" + n : "" + n;
            };
            var stamp = ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) + "-" + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds());
            var header = "Smart Sprint Planner diag log\nversion: " + (typeof APP_VERSION !== "undefined" ? APP_VERSION : "?") + "\nexported: " + ts.toISOString() + "\nlines: " + _diagLines.length + "\n---\n";
            var body = _diagLines.map(function(line) {
              return "[" + (line.type || "info") + "] " + (line.msg || "");
            }).join("\n");
            var blob = new Blob([header + body + "\n"], { type: "text/plain;charset=utf-8" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = "ssp-diag-" + stamp + ".txt";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() {
              URL.revokeObjectURL(url);
            }, 1e3);
            try {
              toast(T("toastLogExported"), "success");
            } catch (_) {
            }
          } catch (err) {
            diag("diag export err: " + err, "err");
          }
        });
      }
    })();
    function _applyDiagLogVisibility() {
      var wrap = document.getElementById("diagWrap");
      if (!wrap) return;
      var hide = !!(_settings && _settings.hideDiagLogUi);
      wrap.style.display = hide ? "none" : "";
    }
    document.querySelectorAll(".tab-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (typeof _hideAllOverlays === "function") _hideAllOverlays();
        document.querySelectorAll(".tab-btn").forEach(function(b) {
          b.classList.remove("active");
        });
        document.querySelectorAll(".tab-panel").forEach(function(p) {
          p.classList.remove("active");
        });
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
        document.body.classList.toggle(
          "planner-wide",
          btn.dataset.tab === "planning" || btn.dataset.tab === "gantt" || btn.dataset.tab === "history" || btn.dataset.tab === "settings"
        );
        var ui = _draftGet("ui") || {};
        ui.activeTab = btn.dataset.tab;
        _draftSet("ui", ui);
        if (btn.dataset.tab === "history") {
          apiGet("history").then(function(r) {
            if (r && r.history) {
              _history = r.history;
              renderHistory();
              if (typeof renderWidgetHeader === "function") {
                try {
                  renderWidgetHeader();
                } catch (_) {
                }
              }
            }
          }).catch(function(e) {
            diag("history reload err: " + String(e), "err");
          });
        }
        if (btn.dataset.tab === "planning") {
          if (typeof _renderPlanningLevel === "function") {
            try {
              _renderPlanningLevel(_planningLevel);
            } catch (e) {
              diag("planning render err: " + e, "err");
            }
          }
        }
        if (btn.dataset.tab === "gantt") {
          try {
            if (typeof populateGanttRoleSel === "function") populateGanttRoleSel();
          } catch (e) {
            diag("populateGanttRoleSel on tab switch err: " + e, "err");
          }
          try {
            var rkG = safeLs.get("ssp_lastActiveRole") || (typeof getActiveRoles === "function" && getActiveRoles()[0] ? getActiveRoles()[0].key : null);
            if (typeof refreshGanttForCurrentSprint === "function") refreshGanttForCurrentSprint(rkG);
          } catch (e) {
            diag("gantt render on tab switch err: " + e, "err");
          }
        }
        if (btn.dataset.tab === "settings") {
          checkSettingsManager().then(function(canManage) {
            if (!canManage) {
              document.getElementById("tab-settings").innerHTML = '<div class="empty" style="color:var(--muted);padding:60px 20px;">' + T("noRightsSettings") + "</div>";
            }
          });
        }
      });
    });
    function _renderPlanningLevel(level) {
      if (level !== "roles" && level !== "people") level = "roles";
      _planningLevel = level;
      document.querySelectorAll(".planning-level-btn").forEach(function(b) {
        b.classList.toggle("active", b.dataset.level === level);
      });
      document.querySelectorAll(".planning-level-pane").forEach(function(p) {
        p.classList.add("hidden");
      });
      var pane = document.getElementById("planning-level-" + level);
      if (pane) pane.classList.remove("hidden");
      if (level === "roles" && typeof renderPlanningRoles === "function") {
        try {
          renderPlanningRoles();
        } catch (e) {
          diag("planning roles render err: " + e, "err");
        }
      }
      if (level === "people" && typeof refreshPlanningPeopleForCurrentSprint === "function") {
        try {
          refreshPlanningPeopleForCurrentSprint();
        } catch (e) {
          diag("planning people render err: " + e, "err");
        }
      }
      if (level === "standup") {
        _populateStandupRoleSel();
        try {
          renderStandupView();
        } catch (e) {
          diag("standup render err: " + e, "err");
        }
      }
    }
    function _populateStandupRoleSel() {
      var sel = document.getElementById("standupRoleSel");
      if (!sel) return;
      var activeRoles = getActiveRoles();
      sel.innerHTML = "";
      activeRoles.forEach(function(r) {
        var o = document.createElement("option");
        o.value = r.key;
        o.textContent = r.label;
        sel.appendChild(o);
      });
      if (_activeSubtab && activeRoles.some(function(r) {
        return r.key === _activeSubtab;
      })) {
        sel.value = _activeSubtab;
      }
      sel.onchange = function() {
        try {
          renderStandupView();
        } catch (_) {
        }
      };
    }
    document.querySelectorAll(".planning-level-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var lvl = btn.dataset.level || "roles";
        if (lvl === "people" && _sprint && _sprint.sprintId && _currentSprintId !== _sprint.sprintId) {
          try {
            setCurrentSprintId(_sprint.sprintId, { confirmed: true });
          } catch (_) {
          }
        }
        _renderPlanningLevel(lvl);
        var ui = _draftGet("ui") || {};
        ui.planningLevel = lvl;
        _draftSet("ui", ui);
      });
    });
    function checkValidatorNow() {
      return _host.fetchApp("backend-project/check-validator", {
        scope: true,
        method: "GET"
      }).then(function(r) {
        return !!(r && r.isValidator);
      }).catch(function() {
        return false;
      });
    }
    function checkEditorRightsNow() {
      return _host.fetchApp("backend-project/check-editor", {
        scope: true,
        method: "GET"
      }).then(function(r) {
        return !!(r && r.isEditor);
      }).catch(function() {
        return false;
      });
    }
    function checkSettingsManager() {
      diag("checkSettingsManager: \u0437\u0430\u043F\u0440\u043E\u0441...", "info");
      return _host.fetchApp("backend-project/check-settings-manager", {
        scope: true,
        method: "GET"
      }).then(function(r) {
        var msg = "checkSettingsManager: canManage=" + (r && r.canManage) + ' group="' + (r && r.groupName || "") + '"';
        diag(msg, r && r.canManage ? "ok" : "err");
        return !!(r && r.canManage);
      }).catch(function(e) {
        diag("checkSettingsManager ERR: " + String(e) + " \u2014 \u0444\u043E\u043B\u043B\u0431\u0435\u043A: \u0437\u0430\u043F\u0440\u0435\u0449\u0430\u0435\u043C", "err");
        return false;
      });
    }
    function checkValidator() {
      checkValidatorNow().then(function(ok) {
        _isValidator = ok;
        diag("checkValidator: isValidator=" + ok, ok ? "ok" : "err");
      });
    }
    function checkEditorRights() {
      checkEditorRightsNow().then(function(ok) {
        _isEditor = ok;
        diag("checkEditorRights: isEditor=" + ok, ok ? "ok" : "err");
        applyEditorRightsToUI();
      });
    }
    function checkAssignerRightsNow() {
      return _host.fetchApp("backend-project/check-assigner", {
        scope: true,
        method: "GET"
      }).then(function(r) {
        return !!(r && r.isAssigner);
      }).catch(function() {
        return false;
      });
    }
    function checkAssignerRights() {
      checkAssignerRightsNow().then(function(ok) {
        _isAssigner = ok;
        diag("checkAssignerRights: isAssigner=" + ok, ok ? "ok" : "info");
        try {
          document.body.classList.toggle("has-assigner-rights", !!(_isEditor || _isAssigner));
        } catch (_) {
        }
        applyEditorRightsToUI();
      });
    }
    function applyEditorRightsToUI() {
      var roleKey = _activeSubtab;
      var panel = null;
      if (roleKey) {
        panel = document.querySelector('.planning-role-card.expanded[data-role-key="' + roleKey + '"] .planning-role-body');
      }
      if (!panel) {
        panel = document.getElementById("planningPeopleContent");
      }
      if (!panel) {
        var roots = [];
        var p1 = document.getElementById("tab-planning");
        if (p1) roots.push(p1);
        var p2 = document.getElementById("tab-gantt");
        if (p2) roots.push(p2);
        roots.forEach(_applyEditorRightsTo);
      } else {
        _applyEditorRightsTo(panel);
      }
      var ovs = document.querySelectorAll(".overlay:not(.settings-overlay)");
      for (var i = 0; i < ovs.length; i++) _applyEditorRightsTo(ovs[i]);
    }
    function _applyEditorRightsTo(panel) {
      if (!panel) return;
      var editorBtns = panel.querySelectorAll(".editor-btn");
      editorBtns.forEach(function(btn) {
        if (_isEditor) {
          btn.classList.remove("btn--disabled-rights");
          btn.removeAttribute("data-tooltip");
          btn.disabled = false;
        } else {
          btn.classList.add("btn--disabled-rights");
          btn.setAttribute("data-tooltip", T("tooltipNoRightsEdit"));
        }
      });
      var validateBtns = panel.querySelectorAll(".validate-btn");
      validateBtns.forEach(function(btn) {
        if (_isValidator) {
          btn.classList.remove("btn--disabled-rights");
          btn.removeAttribute("data-tooltip");
        } else {
          btn.classList.add("btn--disabled-rights");
          btn.setAttribute("data-tooltip", T("tooltipNoRightsVal"));
        }
      });
      var newSprintBtns = panel.querySelectorAll(".new-sprint-btn");
      newSprintBtns.forEach(function(btn) {
        if (_isEditor) {
          btn.classList.remove("btn--disabled-rights");
          btn.removeAttribute("data-tooltip");
        } else {
          btn.classList.add("btn--disabled-rights");
          btn.setAttribute("data-tooltip", T("tooltipNoRightsEdit"));
        }
      });
      var saveHeaderBtns = panel.querySelectorAll(".save-header-btn");
      saveHeaderBtns.forEach(function(btn) {
        if (_isEditor) {
          btn.classList.remove("btn--disabled-rights");
          btn.removeAttribute("data-tooltip");
        } else {
          btn.classList.add("btn--disabled-rights");
          btn.setAttribute("data-tooltip", T("tooltipNoRightsEdit"));
        }
      });
      var assignerBtns = panel.querySelectorAll(".assigner-btn");
      assignerBtns.forEach(function(el) {
        if (_isEditor || _isAssigner) {
          el.classList.remove("btn--disabled-rights");
          el.removeAttribute("data-tooltip");
          el.disabled = false;
          try {
            el.readOnly = false;
          } catch (_) {
          }
        } else {
          el.classList.add("btn--disabled-rights");
          el.setAttribute("data-tooltip", T("tooltipNoRightsEdit"));
          try {
            el.readOnly = true;
          } catch (_) {
          }
        }
      });
    }
    function renderRolesGrid() {
      var grid = document.getElementById("rolesGrid");
      if (!grid) return;
      var active = _settings && _settings.activeRoles || [];
      var html = "";
      ALL_ROLES.forEach(function(role) {
        var isActive = active.indexOf(role.key) >= 0;
        html += '<div class="role-check' + (isActive ? " active" : "") + '" data-role="' + esc(role.key) + '"><span class="role-check__cb"></span><span class="role-check__label">' + esc(roleLabel(role)) + "</span></div>";
      });
      grid.innerHTML = html;
      grid.querySelectorAll(".role-check").forEach(function(el) {
        el.addEventListener("click", function() {
          el.classList.toggle("active");
          renderDynamicRoleFields();
        });
      });
    }
    function fillFieldSelect(selectEl, allowedTypes, currentValue) {
      if (!selectEl) return;
      var typesArr = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
      var opts = '<option value="">' + esc(T("phNotSelected")) + "</option>";
      var has = false;
      _projectFields.forEach(function(f) {
        var t = (f.type || "").toLowerCase();
        var ok = typesArr.some(function(at) {
          return t.indexOf((at || "").toLowerCase()) >= 0;
        });
        if (!ok) return;
        var sel = f.name === currentValue ? " selected" : "";
        opts += '<option value="' + esc(f.name) + '"' + sel + ">" + esc(f.name) + "</option>";
        has = true;
      });
      if (!has && currentValue) {
        opts += '<option value="' + esc(currentValue) + '" selected>' + esc(currentValue) + " \u26A0</option>";
      }
      selectEl.innerHTML = opts;
    }
    function renderDynamicRoleFields() {
      var activeKeys = [];
      document.querySelectorAll("#rolesGrid .role-check.active").forEach(function(el) {
        activeKeys.push(el.getAttribute("data-role"));
      });
      var active = ALL_ROLES.filter(function(r) {
        return activeKeys.indexOf(r.key) >= 0;
      });
      function renderBlock(gridId, idPrefix) {
        var grid = document.getElementById(gridId);
        if (!grid) return;
        var html = "";
        active.forEach(function(role) {
          var fieldId = "s_" + idPrefix + "_" + role.key;
          html += '<div class="field"><label for="' + esc(fieldId) + '">' + esc(roleLabel(role)) + '</label><select id="' + esc(fieldId) + '"></select></div>';
        });
        grid.innerHTML = html;
      }
      renderBlock("gridFieldEst", "est");
      renderBlock("gridFieldFact", "fact");
      renderBlock("gridUserFields", "user");
      active.forEach(function(role) {
        fillFieldSelect(document.getElementById("s_est_" + role.key), "period", _settings && _settings[role.fieldEst]);
        fillFieldSelect(document.getElementById("s_fact_" + role.key), "period", _settings && _settings[role.fieldFact]);
        fillFieldSelect(document.getElementById("s_user_" + role.key), "user", _settings && _settings[role.userField]);
      });
      ["gridFieldEst", "gridFieldFact"].forEach(function(gid) {
        var grid = document.getElementById(gid);
        if (grid && !grid._sspFieldDupBound) {
          grid._sspFieldDupBound = true;
          grid.addEventListener("change", _recomputeSaveBtnState);
        }
      });
      _recomputeSaveBtnState();
    }
    var _dtaRows = [];
    function _renderDtaMapping() {
      var tbody = document.getElementById("dtaMappingBody");
      if (!tbody) return;
      var active = typeof getActiveRoles === "function" ? getActiveRoles() : ALL_ROLES;
      var html = "";
      _dtaRows.forEach(function(row, idx) {
        var roleOpts = '<option value=""' + (row.role ? "" : " selected") + "></option>";
        active.forEach(function(r) {
          var sel = r.key === row.role ? " selected" : "";
          roleOpts += '<option value="' + esc(r.key) + '"' + sel + ">" + esc(roleLabel(r)) + "</option>";
        });
        html += '<tr data-dta-idx="' + idx + '"><td style="padding:4px 8px;border-bottom:1px solid var(--border)"><input type="text" class="btn btn--sm dta-type-input" data-dta-idx="' + idx + '" value="' + esc(row.type || "") + '" maxlength="200" placeholder="' + esc(T("dtaTypePlaceholder")) + '" style="width:100%;padding:4px 6px;font-size:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius)"/></td><td style="padding:4px 8px;border-bottom:1px solid var(--border)"><select class="btn btn--sm dta-role-sel" data-dta-idx="' + idx + '" style="width:100%;padding:4px 6px;font-size:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius);cursor:pointer">' + roleOpts + '</select></td><td style="padding:4px;border-bottom:1px solid var(--border);text-align:center"><button type="button" class="ring-button-button ring-button-inline ring-button-heightS ring-button-ghost ring-button-flat ring-button-iconOnly dta-del-row" data-dta-idx="' + idx + '" title="' + esc(T("btnDtaRemoveRow")) + '" style="padding:2px 8px;font-size:14px;line-height:1">\xD7</button></td></tr>';
      });
      if (!_dtaRows.length) {
        html = '<tr><td colspan="3" class="empty" style="padding:8px;text-align:center;color:var(--muted);font-size:12px">' + esc(T("dtaEmptyTable")) + "</td></tr>";
      }
      tbody.innerHTML = html;
      _validateDtaMapping();
    }
    function _validateDtaMapping() {
      var rows = document.querySelectorAll("#dtaMappingBody tr[data-dta-idx]");
      var counts = {};
      _dtaRows.forEach(function(r) {
        var t = (r.type || "").trim();
        if (!t) return;
        counts[t] = (counts[t] || 0) + 1;
      });
      var hasDup = false;
      rows.forEach(function(tr) {
        var idx = parseInt(tr.getAttribute("data-dta-idx"), 10);
        var input = tr.querySelector(".dta-type-input");
        if (!input) return;
        var t = (_dtaRows[idx] && _dtaRows[idx].type || "").trim();
        var dup = t && counts[t] > 1;
        input.style.borderColor = dup ? "var(--error)" : "var(--border)";
        if (dup) hasDup = true;
      });
      var hint = document.getElementById("dtaErrHint");
      if (hint) hint.style.display = hasDup ? "block" : "none";
      _recomputeSaveBtnState();
      return !hasDup;
    }
    function _validateRoleFieldsUniqueness() {
      if (!Array.isArray(ALL_ROLES)) return true;
      var activeKeys = [];
      document.querySelectorAll("#rolesGrid .role-check.active").forEach(function(el) {
        var k = el.getAttribute("data-role");
        if (k) activeKeys.push(k);
      });
      var seenEst = {};
      var seenFact = {};
      var dupEst = {};
      var dupFact = {};
      activeKeys.forEach(function(roleKey) {
        var estEl = document.getElementById("s_est_" + roleKey);
        var factEl = document.getElementById("s_fact_" + roleKey);
        var ev = estEl ? estEl.value || "" : "";
        var fv = factEl ? factEl.value || "" : "";
        if (ev) {
          if (seenEst[ev]) dupEst[ev] = true;
          else seenEst[ev] = roleKey;
        }
        if (fv) {
          if (seenFact[fv]) dupFact[fv] = true;
          else seenFact[fv] = roleKey;
        }
      });
      var hasDupEst = false, hasDupFact = false;
      activeKeys.forEach(function(roleKey) {
        var estEl = document.getElementById("s_est_" + roleKey);
        var factEl = document.getElementById("s_fact_" + roleKey);
        if (estEl) {
          var dupE = !!(estEl.value && dupEst[estEl.value]);
          estEl.style.borderColor = dupE ? "var(--error)" : "";
          if (dupE) hasDupEst = true;
        }
        if (factEl) {
          var dupF = !!(factEl.value && dupFact[factEl.value]);
          factEl.style.borderColor = dupF ? "var(--error)" : "";
          if (dupF) hasDupFact = true;
        }
      });
      var hintEst = document.getElementById("errDuplicateEstFieldHint");
      var hintFact = document.getElementById("errDuplicateFactFieldHint");
      if (hintEst) hintEst.style.display = hasDupEst ? "block" : "none";
      if (hintFact) hintFact.style.display = hasDupFact ? "block" : "none";
      return !hasDupEst && !hasDupFact;
    }
    function _recomputeSaveBtnState() {
      var saveBtn = document.getElementById("saveSettingsBtn");
      if (!saveBtn) return;
      var dtaOk = _validateDtaMappingFlag();
      var fieldsOk = _validateRoleFieldsUniqueness();
      saveBtn.disabled = !(dtaOk && fieldsOk);
    }
    function _validateDtaMappingFlag() {
      var counts = {};
      (_dtaRows || []).forEach(function(r) {
        var t = (r && r.type || "").trim();
        if (!t) return;
        counts[t] = (counts[t] || 0) + 1;
      });
      for (var k in counts) {
        if (counts[k] > 1) return false;
      }
      return true;
    }
    function _bindDtaMappingEvents() {
      var tbody = document.getElementById("dtaMappingBody");
      var addBtn = document.getElementById("dtaAddRowBtn");
      if (tbody && !tbody._sspDtaBound) {
        tbody._sspDtaBound = true;
        tbody.addEventListener("input", function(e) {
          var t = e.target;
          if (!t || !t.classList) return;
          if (t.classList.contains("dta-type-input")) {
            var idx = parseInt(t.getAttribute("data-dta-idx"), 10);
            if (_dtaRows[idx]) {
              _dtaRows[idx].type = t.value;
            }
            _validateDtaMapping();
          }
        });
        tbody.addEventListener("change", function(e) {
          var t = e.target;
          if (t && t.classList && t.classList.contains("dta-role-sel")) {
            var idx = parseInt(t.getAttribute("data-dta-idx"), 10);
            if (_dtaRows[idx]) {
              _dtaRows[idx].role = t.value || "";
            }
          }
        });
        tbody.addEventListener("click", function(e) {
          var t = e.target;
          if (t && t.classList && t.classList.contains("dta-del-row")) {
            var idx = parseInt(t.getAttribute("data-dta-idx"), 10);
            _dtaRows.splice(idx, 1);
            _renderDtaMapping();
          }
        });
      }
      if (addBtn && !addBtn._sspDtaBound) {
        addBtn._sspDtaBound = true;
        addBtn.addEventListener("click", function() {
          _dtaRows.push({ type: "", role: "" });
          _renderDtaMapping();
          setTimeout(function() {
            var rows = document.querySelectorAll("#dtaMappingBody .dta-type-input");
            var last = rows[rows.length - 1];
            if (last && typeof last.focus === "function") last.focus();
          }, 0);
        });
      }
    }
    function _cascadeStrOrNull(el) {
      if (!el || typeof el.value !== "string") return null;
      var v = el.value.trim();
      if (!v) return null;
      return v.length > 200 ? v.slice(0, 200) : v;
    }
    function _cascadeMultiSelectValues(selEl) {
      if (!selEl || !selEl.options) return [];
      var out = [];
      var seen = {};
      for (var i = 0; i < selEl.options.length && out.length < 50; i++) {
        var opt = selEl.options[i];
        if (!opt || !opt.selected) continue;
        var v = String(opt.value || "").trim();
        if (!v) continue;
        if (v.length > 200) v = v.slice(0, 200);
        if (seen[v]) continue;
        seen[v] = true;
        out.push(v);
      }
      return out;
    }
    function _fillCascadeBundleSelect(selId, fieldName, selectedSet) {
      var sel = document.getElementById(selId);
      if (!sel) return Promise.resolve();
      var preselect = Array.isArray(selectedSet) ? selectedSet.slice() : [];
      function applyOptions(values) {
        var arr = (values || []).slice();
        preselect.forEach(function(v) {
          if (arr.indexOf(v) < 0) arr.push(v);
        });
        sel.innerHTML = "";
        arr.forEach(function(name) {
          var o = document.createElement("option");
          o.value = name;
          o.textContent = name;
          if (preselect.indexOf(name) >= 0) o.selected = true;
          sel.appendChild(o);
        });
      }
      if (!fieldName) {
        applyOptions([]);
        return Promise.resolve();
      }
      if (_fieldValuesCache[fieldName]) {
        var r = _fieldValuesCache[fieldName];
        applyOptions(r && r.values || []);
        return Promise.resolve();
      }
      var p = apiGet("field-values?fieldName=" + encodeURIComponent(fieldName)).then(function(r2) {
        if (r2 && r2.success && r2.values) _fieldValuesCache[fieldName] = r2;
        applyOptions(r2 && r2.values || []);
        return r2;
      }).catch(function(_) {
        applyOptions([]);
      });
      return p;
    }
    function _refreshCascadeWarning() {
      var cascadeChk = document.getElementById("cascadeAggregationCheck");
      var forbidChk = document.getElementById("forbidContainerWorkItemsCheck");
      var warn = document.getElementById("warnCascadeWithoutForbid");
      if (warn) {
        var dangerous = !!(cascadeChk && cascadeChk.checked) && !(forbidChk && forbidChk.checked);
        warn.style.display = dangerous ? "" : "none";
      }
      var lvl2 = _cascadeMultiSelectValues(document.getElementById("cascadeLevel2Sel"));
      var lvl3 = _cascadeMultiSelectValues(document.getElementById("cascadeLevel3Sel"));
      var overlap = lvl2.some(function(v) {
        return lvl3.indexOf(v) >= 0;
      });
      var warnOv = document.getElementById("warnCascadeLevelsOverlap");
      if (warnOv) warnOv.style.display = overlap ? "" : "none";
    }
    function _bindCascadeWarning() {
      ["cascadeAggregationCheck", "forbidContainerWorkItemsCheck", "cascadeLevel2Sel", "cascadeLevel3Sel"].forEach(function(id) {
        var el = document.getElementById(id);
        if (el && !el._sspCascadeBound) {
          el._sspCascadeBound = true;
          el.addEventListener("change", _refreshCascadeWarning);
        }
      });
      var kf = document.getElementById("cascadeKindFieldSel");
      if (kf && !kf._sspCascadeKindBound) {
        kf._sspCascadeKindBound = true;
        kf.addEventListener("change", function() {
          var fname = kf.value || "";
          Promise.all([
            _fillCascadeBundleSelect("cascadeLevel2Sel", fname, []),
            _fillCascadeBundleSelect("cascadeLevel3Sel", fname, [])
          ]).then(_refreshCascadeWarning);
        });
      }
    }
    function _stateRollupBundleStates() {
      var fname = _settings && typeof _settings.fieldState === "string" && _settings.fieldState ? _settings.fieldState : "State";
      if (_fieldValuesCache[fname]) {
        return Promise.resolve(_fieldValuesCache[fname].values || []);
      }
      return apiGet("field-values?fieldName=" + encodeURIComponent(fname)).then(function(r) {
        if (r && r.success && r.values) _fieldValuesCache[fname] = r;
        return r && r.values || [];
      }).catch(function() {
        return [];
      });
    }
    function _fillStateRollupBundleSel(bundleStates, currentOrder) {
      var sel = document.getElementById("stateRollupBundleSel");
      if (!sel) return;
      sel.innerHTML = "";
      (bundleStates || []).forEach(function(name) {
        if (currentOrder.indexOf(name) >= 0) return;
        var o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        sel.appendChild(o);
      });
    }
    function _fillStateRollupOrderList(orderArray) {
      var sel = document.getElementById("stateRollupOrderList");
      if (!sel) return;
      sel.innerHTML = "";
      (orderArray || []).forEach(function(name) {
        var o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        sel.appendChild(o);
      });
    }
    function _fillStateRollupResolvedSel(bundleStates, currentResolved) {
      var sel = document.getElementById("stateRollupResolvedSel");
      if (!sel) return;
      sel.innerHTML = "";
      (bundleStates || []).forEach(function(name) {
        var o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        if ((currentResolved || []).indexOf(name) >= 0) o.selected = true;
        sel.appendChild(o);
      });
    }
    function _fillStandupDoneStatesSel(bundleStates, currentDone) {
      var sel = document.getElementById("standupDoneStatesList");
      if (!sel) return;
      sel.innerHTML = "";
      (bundleStates || []).forEach(function(name) {
        var o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        if ((currentDone || []).indexOf(name) >= 0) o.selected = true;
        sel.appendChild(o);
      });
    }
    function _stateRollupFallbackDone() {
      var order = _settings && Array.isArray(_settings.stateRollupOrder) ? _settings.stateRollupOrder : [];
      return order.length >= 2 ? order.slice(-2) : order.length === 1 ? order.slice(-1) : [];
    }
    function _classifyStandupBuckets(taskAssignmentsMap, doneStates) {
      var done = [], inflight = [], notStarted = [];
      Object.keys(taskAssignmentsMap || {}).forEach(function(issueId) {
        var a = taskAssignmentsMap[issueId];
        if (!a) return;
        var state = (a.state || "").trim();
        var isDone = doneStates.length > 0 && doneStates.indexOf(state) >= 0;
        if (isDone) {
          done.push(issueId);
          return;
        }
        var factSum = 0;
        Object.keys(a).forEach(function(k) {
          if (/^fact_/.test(k)) factSum += a[k] || 0;
        });
        if (factSum > 0 || a.inclusionStatus === "IN_PROGRESS") {
          inflight.push(issueId);
        } else {
          notStarted.push(issueId);
        }
      });
      return { done, inflight, notStarted };
    }
    function _renderStandupBucket(containerId, titleKey, issueIds, rk) {
      var el = document.getElementById(containerId);
      if (!el) return;
      var pp = _sprint && _sprint.personalPlanning && _sprint.personalPlanning[rk];
      var assignments = pp && pp.taskAssignments || {};
      var roleItems = _roleItems && _roleItems[rk] || [];
      el.innerHTML = "";
      var hdr = document.createElement("div");
      hdr.style.cssText = "font-weight:600;font-size:12px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border,#e0e0e0)";
      hdr.textContent = T(titleKey) + " (" + issueIds.length + ")";
      el.appendChild(hdr);
      if (!issueIds.length) {
        var emp = document.createElement("div");
        emp.style.cssText = "font-size:11px;color:var(--muted,#888);text-align:center;padding:12px 0";
        emp.textContent = "\u2014";
        el.appendChild(emp);
        return;
      }
      issueIds.forEach(function(issueId) {
        var a = assignments[issueId] || {};
        var item = roleItems.find(function(i) {
          return i.issueId === issueId;
        });
        var title = item && item.title || issueId;
        var url = item && item.url || "";
        var factSum = 0;
        Object.keys(a).forEach(function(k) {
          if (/^fact_/.test(k)) factSum += a[k] || 0;
        });
        var planH = a["estimate_" + rk] || item && item["estimate_" + rk] || 0;
        var row = document.createElement("div");
        row.style.cssText = "padding:5px 0;border-bottom:1px solid var(--border,#e0e0e0);font-size:12px;";
        var idHtml = url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" style="font-weight:600;color:var(--primary)">' + esc(issueId) + "</a>" : '<span style="font-weight:600">' + esc(issueId) + "</span>";
        var titleTrunc = title.length > 60 ? title.substring(0, 57) + "\u2026" : title;
        var hoursHtml = planH ? '<span style="color:var(--muted,#888);font-size:11px;float:right">' + fmtHours(factSum) + "/" + fmtHours(planH) + "</span>" : factSum ? '<span style="color:var(--muted,#888);font-size:11px;float:right">' + fmtHours(factSum) + "</span>" : "";
        var assignee = a.assignee || item && item.assignee || "";
        var assigneeHtml = assignee ? '<div style="font-size:11px;color:var(--muted,#888);margin-top:2px">@' + esc(assignee) + "</div>" : "";
        row.innerHTML = hoursHtml + idHtml + ' <span title="' + esc(title) + '" style="color:var(--text)">' + esc(titleTrunc) + "</span>" + assigneeHtml;
        el.appendChild(row);
      });
    }
    function renderStandupView() {
      var noSprint = document.getElementById("standupNoSprint");
      var emptyRole = document.getElementById("standupEmptyRole");
      var buckets = document.getElementById("standupBuckets");
      var noDoneHint = document.getElementById("standupNoDoneStatesHint");
      var goalBanner = document.getElementById("standupGoalBanner");
      var goalMissing = document.getElementById("standupGoalMissingHint");
      var goalText = document.getElementById("standupGoalText");
      if (!_sprint) {
        if (noSprint) noSprint.classList.remove("hidden");
        if (emptyRole) emptyRole.classList.add("hidden");
        if (buckets) buckets.style.display = "none";
        if (noDoneHint) noDoneHint.style.display = "none";
        if (goalBanner) goalBanner.style.display = "none";
        if (goalMissing) goalMissing.style.display = "none";
        return;
      }
      if (noSprint) noSprint.classList.add("hidden");
      var sel = document.getElementById("standupRoleSel");
      var rk = sel ? sel.value : _activeSubtab || "";
      if (!rk) {
        var activeRoles = getActiveRoles();
        rk = activeRoles.length ? activeRoles[0].key : "";
      }
      if (_sprint.sprintGoal) {
        if (goalBanner) {
          goalBanner.style.display = "";
          if (goalText) goalText.textContent = _sprint.sprintGoal;
        }
        if (goalMissing) goalMissing.style.display = "none";
      } else {
        if (goalBanner) goalBanner.style.display = "none";
        if (goalMissing) goalMissing.style.display = "";
      }
      var pp = _sprint.personalPlanning && _sprint.personalPlanning[rk];
      var assignments = pp && pp.taskAssignments || {};
      var hasItems = Object.keys(assignments).length > 0;
      var roleItems = _roleItems && _roleItems[rk] || [];
      if (!hasItems && !roleItems.length) {
        if (emptyRole) emptyRole.classList.remove("hidden");
        if (buckets) buckets.style.display = "none";
        if (noDoneHint) noDoneHint.style.display = "none";
        return;
      }
      if (emptyRole) emptyRole.classList.add("hidden");
      if (buckets) buckets.style.display = "";
      var doneStates = _settings && Array.isArray(_settings.standupDoneStates) && _settings.standupDoneStates.length ? _settings.standupDoneStates : _stateRollupFallbackDone();
      if (noDoneHint) noDoneHint.style.display = doneStates.length ? "none" : "";
      var unifiedMap = {};
      roleItems.forEach(function(item) {
        unifiedMap[item.issueId] = { state: item.state, inclusionStatus: item.inclusionStatus };
        Object.keys(item).forEach(function(k) {
          if (/^(fact_|estimate_|alloc_)/.test(k)) unifiedMap[item.issueId][k] = item[k];
        });
      });
      Object.keys(assignments).forEach(function(id) {
        if (!unifiedMap[id]) unifiedMap[id] = {};
        var a = assignments[id];
        if (a.state) unifiedMap[id].state = a.state;
        if (a.assignee) unifiedMap[id].assignee = a.assignee;
      });
      var classified = _classifyStandupBuckets(unifiedMap, doneStates);
      _renderStandupBucket("standupBucketDone", "standupBucketDone", classified.done, rk);
      _renderStandupBucket("standupBucketInflight", "standupBucketInflight", classified.inflight, rk);
      _renderStandupBucket("standupBucketNotStarted", "standupBucketNotStarted", classified.notStarted, rk);
    }
    function doStandupRefresh() {
      if (!_sprint) return;
      var btn = document.getElementById("standupRefreshBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = T("toastSaving");
      }
      apiPost("refresh-assignees", { sprintId: _sprint.sprintId }).then(function(res) {
        if (res && res.sprint) _sprint = res.sprint;
        renderStandupView();
        toast(T("toastStandupRefreshed"), "success");
      }).catch(function(e) {
        diag("standup refresh err: " + e, "err");
      }).finally(function() {
        if (btn) {
          btn.disabled = false;
          btn.textContent = T("btnStandupRefresh");
        }
      });
    }
    function _fillStateRollupFloorSel(orderArray, currentFloor) {
      var sel = document.getElementById("stateRollupFloorSel");
      if (!sel) return;
      var firstOpt = sel.querySelector('option[value=""]');
      sel.innerHTML = "";
      if (firstOpt) sel.appendChild(firstOpt);
      (orderArray || []).forEach(function(name) {
        var o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        if (name === currentFloor) o.selected = true;
        sel.appendChild(o);
      });
    }
    function _stateRollupCurrentOrder() {
      var sel = document.getElementById("stateRollupOrderList");
      if (!sel) return [];
      var out = [];
      for (var i = 0; i < sel.options.length; i++) out.push(sel.options[i].value);
      return out;
    }
    function _stateRollupCurrentResolved() {
      var sel = document.getElementById("stateRollupResolvedSel");
      if (!sel) return [];
      var out = [];
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].selected) out.push(sel.options[i].value);
      }
      return out;
    }
    function _refreshStateRollupValidation() {
      var order = _stateRollupCurrentOrder();
      var warn = document.getElementById("warnStateRollupOrderShort");
      if (warn) warn.style.display = order.length > 0 && order.length < 2 ? "" : "none";
      var lvl2 = _settings && Array.isArray(_settings.cascadeLevel2Values) ? _settings.cascadeLevel2Values : [];
      var lvl3 = _settings && Array.isArray(_settings.cascadeLevel3Values) ? _settings.cascadeLevel3Values : [];
      var enabledChk = document.getElementById("stateRollupEnabledCheck");
      var hint = document.getElementById("hintStateRollupNoHierarchy");
      if (hint && enabledChk) {
        hint.style.display = enabledChk.checked && !lvl2.length && !lvl3.length ? "" : "none";
      }
    }
    function _bindStateRollupButtons() {
      var addBtn = document.getElementById("stateRollupAddBtn");
      var upBtn = document.getElementById("stateRollupUpBtn");
      var downBtn = document.getElementById("stateRollupDownBtn");
      var removeBtn = document.getElementById("stateRollupRemoveBtn");
      if (addBtn && !addBtn._sspBound) {
        addBtn._sspBound = true;
        addBtn.addEventListener("click", function() {
          var bundleSel = document.getElementById("stateRollupBundleSel");
          var orderList = document.getElementById("stateRollupOrderList");
          if (!bundleSel || !orderList) return;
          var toAdd = [];
          for (var i = 0; i < bundleSel.options.length; i++) {
            if (bundleSel.options[i].selected) toAdd.push(bundleSel.options[i].value);
          }
          toAdd.forEach(function(name) {
            var o = document.createElement("option");
            o.value = name;
            o.textContent = name;
            orderList.appendChild(o);
          });
          var curOrder = _stateRollupCurrentOrder();
          var floorVal = (document.getElementById("stateRollupFloorSel") || {}).value || "";
          _stateRollupBundleStates().then(function(states) {
            _fillStateRollupBundleSel(states, curOrder);
            _fillStateRollupFloorSel(curOrder, floorVal);
          });
          _refreshStateRollupValidation();
        });
      }
      if (upBtn && !upBtn._sspBound) {
        upBtn._sspBound = true;
        upBtn.addEventListener("click", function() {
          var sel = document.getElementById("stateRollupOrderList");
          if (!sel || sel.selectedIndex <= 0) return;
          var idx = sel.selectedIndex;
          var opt = sel.options[idx];
          sel.removeChild(opt);
          sel.insertBefore(opt, sel.options[idx - 1]);
          sel.selectedIndex = idx - 1;
          _fillStateRollupFloorSel(_stateRollupCurrentOrder(), (document.getElementById("stateRollupFloorSel") || {}).value || "");
        });
      }
      if (downBtn && !downBtn._sspBound) {
        downBtn._sspBound = true;
        downBtn.addEventListener("click", function() {
          var sel = document.getElementById("stateRollupOrderList");
          if (!sel || sel.selectedIndex < 0 || sel.selectedIndex >= sel.options.length - 1) return;
          var idx = sel.selectedIndex;
          var opt = sel.options[idx];
          var next = sel.options[idx + 1];
          sel.removeChild(next);
          sel.insertBefore(next, opt);
          sel.selectedIndex = idx + 1;
          _fillStateRollupFloorSel(_stateRollupCurrentOrder(), (document.getElementById("stateRollupFloorSel") || {}).value || "");
        });
      }
      if (removeBtn && !removeBtn._sspBound) {
        removeBtn._sspBound = true;
        removeBtn.addEventListener("click", function() {
          var sel = document.getElementById("stateRollupOrderList");
          if (!sel || sel.selectedIndex < 0) return;
          sel.removeChild(sel.options[sel.selectedIndex]);
          var curOrder = _stateRollupCurrentOrder();
          var floorVal = (document.getElementById("stateRollupFloorSel") || {}).value || "";
          _stateRollupBundleStates().then(function(states) {
            _fillStateRollupBundleSel(states, curOrder);
            _fillStateRollupFloorSel(curOrder, floorVal);
          });
          _refreshStateRollupValidation();
        });
      }
    }
    function applySettingsUI() {
      if (!_valGroupsState || typeof _valGroupsState !== "object") _valGroupsState = { ids: [], names: [] };
      if (!_editGroupsState || typeof _editGroupsState !== "object") _editGroupsState = { ids: [], names: [] };
      if (!_histClearGroupsState || typeof _histClearGroupsState !== "object") _histClearGroupsState = { ids: [], names: [] };
      if (!_assignerGroupsState || typeof _assignerGroupsState !== "object") _assignerGroupsState = { ids: [], names: [] };
      if (!Array.isArray(_valGroupsState.ids)) _valGroupsState.ids = [];
      if (!Array.isArray(_valGroupsState.names)) _valGroupsState.names = [];
      if (!Array.isArray(_editGroupsState.ids)) _editGroupsState.ids = [];
      if (!Array.isArray(_editGroupsState.names)) _editGroupsState.names = [];
      if (!Array.isArray(_histClearGroupsState.ids)) _histClearGroupsState.ids = [];
      if (!Array.isArray(_histClearGroupsState.names)) _histClearGroupsState.names = [];
      if (!Array.isArray(_assignerGroupsState.ids)) _assignerGroupsState.ids = [];
      if (!Array.isArray(_assignerGroupsState.names)) _assignerGroupsState.names = [];
      renderRolesGrid();
      renderDynamicRoleFields();
      fillFieldSelect(document.getElementById("s_priority"), ["enum"], _settings && _settings.fieldPriority);
      fillFieldSelect(document.getElementById("s_xpriority"), ["enum"], _settings && _settings.fieldXPriority);
      fillFieldSelect(document.getElementById("s_state"), ["state", "enum"], _settings && _settings.fieldState);
      fillFieldSelect(document.getElementById("s_system"), ["enum", "owned"], _settings && _settings.fieldSystem);
      fillFieldSelect(document.getElementById("s_external_ticket_id"), ["string"], _settings && _settings.fieldExternalTicketId);
      fillFieldSelect(document.getElementById("s_sprint_field"), ["enum"], _settings && _settings.fieldSprint);
      fillFieldSelect(document.getElementById("s_version_field"), ["version", "build"], _settings && _settings.fieldVersion);
      setCheck("dynEditCheck", !!(_settings && _settings.dynEditEnabled));
      setCheck("usePersonalForResourceCheck", !!(_settings && _settings.usePersonalForResource));
      setCheck("personalPlanningCheck", !!(_settings && _settings.personalPlanningEnabled));
      setCheck("manualPersonalResourceCheck", !!(_settings && _settings.manualPersonalResource));
      var hideDiagLogChk = document.getElementById("hideDiagLogUiCheck");
      if (hideDiagLogChk) hideDiagLogChk.checked = !!(_settings && _settings.hideDiagLogUi);
      var dtaChk = document.getElementById("dtaEnabledCheck");
      if (dtaChk) dtaChk.checked = !!(_settings && _settings.dtaEnabled);
      var dtaWarnChk = document.getElementById("dtaWarningsCheck");
      if (dtaWarnChk) dtaWarnChk.checked = !!(_settings && _settings.dtaWarningsEnabled);
      _dtaRows = [];
      var mapping = _settings && _settings.workItemTypeMapping || {};
      Object.keys(mapping).forEach(function(t) {
        _dtaRows.push({ type: t, role: mapping[t] || "" });
      });
      _renderDtaMapping();
      _bindDtaMappingEvents();
      var cascadeChk = document.getElementById("cascadeAggregationCheck");
      if (cascadeChk) cascadeChk.checked = !!(_settings && _settings.cascadeAggregationEnabled);
      var forbidChk = document.getElementById("forbidContainerWorkItemsCheck");
      if (forbidChk) forbidChk.checked = !!(_settings && _settings.forbidContainerWorkItems);
      var kindFieldSel = document.getElementById("cascadeKindFieldSel");
      var kindFieldName = _settings && typeof _settings.cascadeKindField === "string" ? _settings.cascadeKindField : "";
      if (kindFieldSel) fillFieldSelect(kindFieldSel, ["enum"], kindFieldName);
      var lvl2Sel = _settings && Array.isArray(_settings.cascadeLevel2Values) ? _settings.cascadeLevel2Values : [];
      var lvl3Sel = _settings && Array.isArray(_settings.cascadeLevel3Values) ? _settings.cascadeLevel3Values : [];
      _fillCascadeBundleSelect("cascadeLevel2Sel", kindFieldName, lvl2Sel);
      _fillCascadeBundleSelect("cascadeLevel3Sel", kindFieldName, lvl3Sel);
      var linkInEl = document.getElementById("cascadeLinkInwardInput");
      if (linkInEl) linkInEl.value = _settings && typeof _settings.cascadeParentLinkInward === "string" ? _settings.cascadeParentLinkInward : "";
      var linkOutEl = document.getElementById("cascadeLinkOutwardInput");
      if (linkOutEl) linkOutEl.value = _settings && typeof _settings.cascadeParentLinkOutward === "string" ? _settings.cascadeParentLinkOutward : "";
      _bindCascadeWarning();
      _refreshCascadeWarning();
      var srEnabledChk = document.getElementById("stateRollupEnabledCheck");
      if (srEnabledChk) srEnabledChk.checked = !!(_settings && _settings.stateRollupEnabled);
      var srOrder = _settings && Array.isArray(_settings.stateRollupOrder) ? _settings.stateRollupOrder : [];
      var srResolved = _settings && Array.isArray(_settings.stateRollupResolvedStates) ? _settings.stateRollupResolvedStates : [];
      var srFloor = _settings && typeof _settings.stateRollupFloor === "string" ? _settings.stateRollupFloor : "";
      _fillStateRollupOrderList(srOrder);
      _stateRollupBundleStates().then(function(bundleStates) {
        _fillStateRollupBundleSel(bundleStates, srOrder);
        _fillStateRollupResolvedSel(bundleStates, srResolved);
        _fillStateRollupFloorSel(srOrder, srFloor);
        _refreshStateRollupValidation();
        _fillStandupDoneStatesSel(bundleStates, _settings && Array.isArray(_settings.standupDoneStates) ? _settings.standupDoneStates : []);
      });
      _bindStateRollupButtons();
      var defLangSel = document.getElementById("defaultLangSel");
      if (defLangSel) {
        _populateDefaultLangSelect(defLangSel);
        defLangSel.value = _settings && typeof _settings.defaultLang === "string" ? _settings.defaultLang : "";
      }
      if (typeof applyModesDependencies === "function") applyModesDependencies();
      setVal("s_nkc_january", _settings && _settings.nkcJanuary || 105);
      setVal("s_nkc_may", _settings && _settings.nkcMay || 119);
      setVal("s_nkc_other", _settings && _settings.nkcOther || 145);
      setVal("s_rate", _settings && _settings.rate !== void 0 ? _settings.rate : 1);
      setVal("s_participation", _settings && _settings.participation !== void 0 ? _settings.participation : 1);
      var kpe = _migrateKpeObject(_settings && _settings.kpe || {});
      setVal("s_kpe_intern", kpe.Intern !== void 0 ? kpe.Intern : 0);
      setVal("s_kpe_jun", kpe.Junior !== void 0 ? kpe.Junior : 0.5);
      setVal("s_kpe_mid", kpe.Middle !== void 0 ? kpe.Middle : 0.65);
      setVal("s_kpe_senior", kpe.Senior !== void 0 ? kpe.Senior : 0.75);
      _valGroupsState.ids = (_settings && _settings.validationGroups || []).slice();
      _valGroupsState.names = (_settings && _settings.validationGroupNames || []).slice();
      _editGroupsState.ids = (_settings && _settings.editGroups || []).slice();
      _editGroupsState.names = (_settings && _settings.editGroupNames || []).slice();
      _histClearGroupsState.ids = (_settings && _settings.historyClearGroups || []).slice();
      _histClearGroupsState.names = (_settings && _settings.historyClearGroupNames || []).slice();
      _assignerGroupsState.ids = (_settings && _settings.assignerGroups || []).slice();
      _assignerGroupsState.names = (_settings && _settings.assignerGroupNames || []).slice();
      renderGrpMultiselect("val");
      renderGrpMultiselect("edit");
      renderGrpMultiselect("histClear");
      renderGrpMultiselect("assigner");
    }
    function setCheck(id, on) {
      var el = document.getElementById(id);
      if (!el) return;
      if (on) el.classList.add("active");
      else el.classList.remove("active");
    }
    function setVal(id, v) {
      var el = document.getElementById(id);
      if (!el) return;
      el.value = v === null || v === void 0 ? "" : v;
    }
    var GRP_ICON = '<svg class="grp-ms__item-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>';
    function renderGrpMultiselect(target) {
      var prefix;
      var state;
      if (target === "val") {
        prefix = "val";
        state = _valGroupsState;
      } else if (target === "histClear") {
        prefix = "histClear";
        state = _histClearGroupsState;
      } else if (target === "assigner") {
        prefix = "assigner";
        state = _assignerGroupsState;
      } else {
        prefix = "edit";
        state = _editGroupsState;
      }
      var ms = document.getElementById(prefix + "GrpMs");
      var control = document.getElementById(prefix + "GrpControl");
      var input = document.getElementById(prefix + "GrpInput");
      var dropdown = document.getElementById(prefix + "GrpDropdown");
      var items = document.getElementById(prefix + "GrpItems");
      var resetBtn = document.getElementById(prefix + "GrpReset");
      if (!ms || !control || !input || !dropdown || !items) return;
      function rerender() {
        Array.prototype.forEach.call(control.querySelectorAll(".grp-ms__tag"), function(n) {
          n.remove();
        });
        var tagsHtml = "";
        state.ids.forEach(function(gid, i) {
          var nm = state.names[i] || gid;
          tagsHtml += '<span class="grp-ms__tag" data-gid="' + esc(gid) + '">' + GRP_ICON + "<span>" + esc(nm) + '</span><button type="button" class="grp-ms__tag-rm" data-gid="' + esc(gid) + '" title="\u0423\u0434\u0430\u043B\u0438\u0442\u044C">\xD7</button></span>';
        });
        control.insertAdjacentHTML("afterbegin", tagsHtml);
        control.querySelectorAll(".grp-ms__tag-rm").forEach(function(x) {
          x.addEventListener("click", function(e) {
            e.stopPropagation();
            var gid = x.getAttribute("data-gid");
            var idx = state.ids.indexOf(gid);
            if (idx >= 0) {
              state.ids.splice(idx, 1);
              state.names.splice(idx, 1);
              rerender();
            }
          });
        });
        var q = (input.value || "").trim().toLowerCase();
        var html = "";
        if (!_projectGroups.length) {
          html = '<div class="grp-ms__empty">' + esc(T("grpsNotLoaded")) + "</div>";
        } else {
          var matches = _projectGroups.filter(function(g) {
            if (!q) return true;
            return (g.name || "").toLowerCase().indexOf(q) >= 0;
          }).slice(0, 200);
          if (!matches.length) {
            html = '<div class="grp-ms__empty">' + esc(T("grpsNotFound")) + "</div>";
          } else {
            matches.forEach(function(g) {
              var checked = state.ids.indexOf(g.id) >= 0;
              html += '<div class="grp-ms__item' + (checked ? " grp-ms__item--checked" : "") + '" data-gid="' + esc(g.id) + '" data-gname="' + esc(g.name) + '"><span class="grp-ms__item-cb"></span>' + GRP_ICON + '<span class="grp-ms__item-name">' + esc(g.name) + "</span></div>";
            });
          }
        }
        items.innerHTML = html;
        items.querySelectorAll(".grp-ms__item[data-gid]").forEach(function(it) {
          it.addEventListener("click", function(e) {
            e.stopPropagation();
            var gid = it.getAttribute("data-gid");
            var nm = it.getAttribute("data-gname");
            if (!gid) return;
            var idx = state.ids.indexOf(gid);
            if (idx >= 0) {
              state.ids.splice(idx, 1);
              state.names.splice(idx, 1);
            } else {
              if (state.ids.length >= 100) {
                toast(T("toastMaxGroupsReached"), "err");
                return;
              }
              state.ids.push(gid);
              state.names.push(nm);
            }
            rerender();
          });
        });
      }
      if (!ms._bound) {
        control.addEventListener("click", function(e) {
          if (e.target && e.target.classList && e.target.classList.contains("grp-ms__tag-rm")) return;
          dropdown.classList.add("open");
          input.focus();
          rerender();
          loadProjectGroups().then(rerender);
        });
        document.addEventListener("click", function(e) {
          if (!ms.contains(e.target)) dropdown.classList.remove("open");
        });
        input.addEventListener("input", rerender);
        input.addEventListener("focus", function() {
          dropdown.classList.add("open");
          rerender();
        });
        if (resetBtn) {
          resetBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            state.ids = [];
            state.names = [];
            rerender();
          });
        }
        ms._bound = true;
      }
      rerender();
    }
    function collectSettings() {
      var activeRoles = [];
      document.querySelectorAll("#rolesGrid .role-check.active").forEach(function(el) {
        var k = el.getAttribute("data-role");
        if (k) activeRoles.push(k);
      });
      var data = {
        activeRoles,
        dynEditEnabled: document.getElementById("dynEditCheck").classList.contains("active"),
        personalPlanningEnabled: document.getElementById("personalPlanningCheck").classList.contains("active"),
        usePersonalForResource: document.getElementById("usePersonalForResourceCheck").classList.contains("active"),
        /* v1.4.0 — ручной ввод ресурса по исполнителям; дочерний к personalPlanning. */
        manualPersonalResource: document.getElementById("manualPersonalResourceCheck").classList.contains("active"),
        /* v6.3.0 D110 — нативный input.checked. */
        hideDiagLogUi: !!(document.getElementById("hideDiagLogUiCheck") && document.getElementById("hideDiagLogUiCheck").checked),
        /* v1.2.0 DTA — feature flag + mapping. Mapping собирается из _dtaRows;
           пустые type-name строки скипаются. Дубликаты фильтруются на уровне
           object-shape (последний выигрывает); UI-валидация блокирует save при
           duplicate, поэтому до этого места не доходим если duplicate exists. */
        dtaEnabled: !!(document.getElementById("dtaEnabledCheck") && document.getElementById("dtaEnabledCheck").checked),
        dtaWarningsEnabled: !!(document.getElementById("dtaWarningsCheck") && document.getElementById("dtaWarningsCheck").checked),
        workItemTypeMapping: function() {
          var out = {};
          (Array.isArray(_dtaRows) ? _dtaRows : []).forEach(function(r) {
            var t = (r && r.type || "").trim();
            if (!t) return;
            if (!r.role) return;
            out[t] = r.role;
          });
          return out;
        }(),
        /* v1.3.0 Cascade — 7 ключей. Empty-strings для kind-field/links заменяем
           на null, чтобы backend assertStr принял (он допускает null). Empty
           arrays для level-values — отправляем как пустой массив (== «cascade
           выключен по факту, нет container-kinds»), валидация isStrArr допускает 0. */
        cascadeAggregationEnabled: !!(document.getElementById("cascadeAggregationCheck") && document.getElementById("cascadeAggregationCheck").checked),
        forbidContainerWorkItems: !!(document.getElementById("forbidContainerWorkItemsCheck") && document.getElementById("forbidContainerWorkItemsCheck").checked),
        cascadeKindField: _cascadeStrOrNull(document.getElementById("cascadeKindFieldSel")),
        cascadeLevel2Values: _cascadeMultiSelectValues(document.getElementById("cascadeLevel2Sel")),
        cascadeLevel3Values: _cascadeMultiSelectValues(document.getElementById("cascadeLevel3Sel")),
        cascadeParentLinkInward: _cascadeStrOrNull(document.getElementById("cascadeLinkInwardInput")),
        cascadeParentLinkOutward: _cascadeStrOrNull(document.getElementById("cascadeLinkOutwardInput")),
        /* v1.7.0 D128 — State Rollup. rescanRequested/At не сохраняем здесь
           (управляются кнопкой Rescan; в v1.7.0 кнопка disabled — ключи не трогаем). */
        stateRollupEnabled: !!(document.getElementById("stateRollupEnabledCheck") && document.getElementById("stateRollupEnabledCheck").checked),
        stateRollupOrder: _stateRollupCurrentOrder(),
        stateRollupResolvedStates: _stateRollupCurrentResolved(),
        stateRollupFloor: function() {
          var v = document.getElementById("stateRollupFloorSel");
          return v && v.value ? v.value : null;
        }(),
        stateRollupStrategy: "min",
        /* v1.1.0 — project-default язык. Пустая строка из <option value=""> → undefined,
           чтобы whitelist не отверг (defaultLang допускает только валидные ISO-коды или отсутствие). */
        defaultLang: function() {
          var sel = document.getElementById("defaultLangSel");
          var v = sel ? sel.value : "";
          return v ? v : void 0;
        }(),
        nkcJanuary: parseFloat(document.getElementById("s_nkc_january").value) || 105,
        nkcMay: parseFloat(document.getElementById("s_nkc_may").value) || 119,
        nkcOther: parseFloat(document.getElementById("s_nkc_other").value) || 145,
        rate: isFinite(parseFloat(document.getElementById("s_rate").value)) ? parseFloat(document.getElementById("s_rate").value) : 1,
        participation: isFinite(parseFloat(document.getElementById("s_participation").value)) ? parseFloat(document.getElementById("s_participation").value) : 1,
        kpe: {
          Intern: parseFloat(document.getElementById("s_kpe_intern").value) || 0,
          Junior: parseFloat(document.getElementById("s_kpe_jun").value) || 0.5,
          Middle: parseFloat(document.getElementById("s_kpe_mid").value) || 0.65,
          Senior: parseFloat(document.getElementById("s_kpe_senior").value) || 0.75
        },
        fieldPriority: document.getElementById("s_priority").value || null,
        fieldXPriority: document.getElementById("s_xpriority").value || null,
        fieldState: document.getElementById("s_state").value || null,
        fieldSystem: document.getElementById("s_system").value || null,
        /* v1.8.0 D130 — Etap В.2 — external ticket ID field name. */
        fieldExternalTicketId: document.getElementById("s_external_ticket_id").value || null,
        fieldSprint: document.getElementById("s_sprint_field").value || null,
        fieldVersion: document.getElementById("s_version_field").value || null,
        validationGroups: _valGroupsState.ids.slice(),
        validationGroupNames: _valGroupsState.names.slice(),
        editGroups: _editGroupsState.ids.slice(),
        editGroupNames: _editGroupsState.names.slice(),
        historyClearGroups: _histClearGroupsState.ids.slice(),
        historyClearGroupNames: _histClearGroupsState.names.slice(),
        /* v6.1.0 D82 (F5) — assigner-роль (variant b: assignee + start/end-dates). */
        assignerGroups: _assignerGroupsState.ids.slice(),
        assignerGroupNames: _assignerGroupsState.names.slice(),
        /* v1.9.0 D132 — Stand-up done states: selected options from multi-select. */
        standupDoneStates: function() {
          var sel = document.getElementById("standupDoneStatesList");
          if (!sel) return [];
          return Array.from(sel.selectedOptions).map(function(o) {
            return o.value;
          });
        }(),
        savedAt: Date.now()
      };
      ALL_ROLES.forEach(function(role) {
        var estEl = document.getElementById("s_est_" + role.key);
        var factEl = document.getElementById("s_fact_" + role.key);
        var userEl = document.getElementById("s_user_" + role.key);
        data[role.fieldEst] = estEl ? estEl.value || null : null;
        data[role.fieldFact] = factEl ? factEl.value || null : null;
        data[role.userField] = userEl ? userEl.value || null : null;
      });
      return data;
    }
    function doSaveSettings() {
      var btn = document.getElementById("saveSettingsBtn");
      var hint = document.getElementById("saveSettingsHint");
      var data = collectSettings();
      diag("saveSettings: collected " + Object.keys(data).length + " keys", "info");
      if (btn) {
        btn.disabled = true;
        btn.textContent = T("toastSaving");
      }
      if (hint) {
        hint.className = "save-hint";
        hint.textContent = T("toastSaving");
      }
      apiPost("sprint-data", { settings: data }).then(function(resp) {
        if (!resp || !resp.success) {
          var reason = resp && resp.reason || resp && resp.error || "unknown";
          throw new Error(reason);
        }
        try {
          if (_settings && _settings.fieldSprint !== data.fieldSprint) invalidateFieldValuesCache(_settings.fieldSprint);
          if (_settings && _settings.fieldVersion !== data.fieldVersion) invalidateFieldValuesCache(_settings.fieldVersion);
        } catch (_) {
        }
        _settings = data;
        _syncProjectDefaultLang();
        _refreshFeatureStatusBar();
        if (btn) {
          btn.disabled = false;
          btn.textContent = T("btnSaveSettings");
        }
        if (hint) {
          hint.className = "save-ok";
          hint.textContent = T("toastSettingsSaved");
          setTimeout(function() {
            if (hint) hint.classList.add("fade");
          }, 4e3);
          setTimeout(function() {
            if (hint) {
              hint.className = "save-hint";
              hint.textContent = "";
            }
          }, 4500);
        }
        var bc = document.getElementById("bannerCfg");
        if (bc) bc.classList.add("hidden");
        toast(T("toastSettingsSaved"), "success");
        var missingRequired = [];
        if (!data.fieldPriority) missingRequired.push(T("fldPriority"));
        if (!data.fieldState) missingRequired.push(T("fldState"));
        if (missingRequired.length) {
          setTimeout(function() {
            toast(T("toastRequiredFieldsMissing") + ": " + missingRequired.join(", "), "warn");
          }, 400);
        }
        checkValidator();
        checkEditorRights();
        checkAssignerRights();
        applyPersonalPlanningVisibility();
        refreshClearHistoryBtn();
        renderPlannerRoles();
        try {
          _applyDiagLogVisibility();
        } catch (_) {
        }
      }).catch(function(e) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = T("btnSaveSettings");
        }
        var msg = e && e.message ? e.message : String(e);
        if (hint) {
          hint.className = "save-err";
          hint.textContent = T("toastSettingsErr") + ": " + msg;
        }
        diag("saveSettings ERR: " + msg, "err");
        toast(T("toastSettingsErr"), "err");
      });
    }
    function fmtThLabel(label) {
      if (!label) return T("resColLabel");
      var m = label.match(/^(Разработка)\s+(.+)$/);
      if (m) return T("resColLabel") + "<br>" + esc(m[1]) + "<br>" + esc(m[2]);
      return T("resColLabel") + "<br>" + esc(label);
    }
    function renderPlannerRoles() {
      if (typeof renderSprintIntroExtras === "function") {
        try {
          renderSprintIntroExtras();
        } catch (_) {
        }
      }
      if (typeof renderPlanningRoles === "function") {
        try {
          renderPlanningRoles();
        } catch (e) {
          diag("renderPlanningRoles err: " + e, "err");
        }
      }
      if (typeof checkValidatorNow === "function") {
        checkValidatorNow().then(function(ok) {
          _isValidator = ok;
          if (typeof applyEditorRightsToUI === "function") try {
            applyEditorRightsToUI();
          } catch (_) {
          }
        });
      }
      if (typeof checkEditorRightsNow === "function") {
        checkEditorRightsNow().then(function(ok) {
          _isEditor = ok;
          if (typeof applyEditorRightsToUI === "function") try {
            applyEditorRightsToUI();
          } catch (_) {
          }
        });
      }
      if (typeof checkAssignerRightsNow === "function") {
        checkAssignerRightsNow().then(function(ok) {
          _isAssigner = ok;
          try {
            document.body.classList.toggle("has-assigner-rights", !!(_isEditor || _isAssigner));
          } catch (_) {
          }
          if (typeof applyEditorRightsToUI === "function") try {
            applyEditorRightsToUI();
          } catch (_) {
          }
        });
      }
    }
    var _uiExpandedRoles = /* @__PURE__ */ Object.create(null);
    function computeRoleQuickStats(rk) {
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      var isHistoricalView = _currentSprintId && _sprint && _currentSprintId !== _sprint.sprintId;
      if (isHistoricalView) {
        var histSnap = (Array.isArray(_history) ? _history : []).find(function(h) {
          return h && h.sprintId === _currentSprintId + "_" + rk;
        });
        if (histSnap) {
          var resH = role && histSnap[role.resKey] != null ? Number(histSnap[role.resKey]) : 0;
          if (!isFinite(resH)) resH = 0;
          var itemsH = Array.isArray(histSnap.items) ? histSnap.items : [];
          var totH = 0;
          itemsH.forEach(function(it) {
            var a = it && (it["alloc_" + rk] != null ? it["alloc_" + rk] : it.alloc);
            if (typeof a === "number" && !isNaN(a)) totH += a;
          });
          return { resource: resH, totalAlloc: totH, taskCount: itemsH.length, overlimit: resH > 0 && totH > resH + 1e-3 };
        }
        return { resource: 0, totalAlloc: 0, taskCount: 0, overlimit: false };
      }
      var resource = 0;
      if (_sprint && _sprint.roles && _sprint.roles[rk] && typeof _sprint.roles[rk].resource === "number") {
        resource = _sprint.roles[rk].resource;
      } else if (_settings && role && _settings[role.userField]) {
        resource = 0;
      }
      var items = typeof getRoleItemsArr === "function" ? getRoleItemsArr(rk) || [] : [];
      var totalAlloc = 0;
      items.forEach(function(it) {
        var a = it && (it["alloc_" + rk] != null ? it["alloc_" + rk] : it.alloc);
        if (typeof a === "number" && !isNaN(a)) totalAlloc += a;
      });
      var overlimit = resource > 0 && totalAlloc > resource + 1e-3;
      return { resource, totalAlloc, taskCount: items.length, overlimit };
    }
    function _formatHoursLight(n) {
      if (n === null || n === void 0 || isNaN(n)) return "0";
      var rounded = Math.round(n * 100) / 100;
      return rounded === Math.floor(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    }
    function renderRoleAccordion(rk) {
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      if (!role) return "";
      var stats = computeRoleQuickStats(rk);
      var expanded = !!_uiExpandedRoles[rk];
      var label = typeof roleLabel === "function" ? roleLabel(role) : role.label || rk;
      var resStr = _formatHoursLight(stats.resource);
      var allocStr = _formatHoursLight(stats.totalAlloc);
      var html = '<div class="planning-role-card' + (expanded ? " expanded" : "") + '" data-role-key="' + rk + '"><button class="planning-role-toggle" type="button" data-role-key="' + rk + '"><span class="planning-role-chevron">' + (expanded ? "\u25BC" : "\u25B6") + '</span><span class="planning-role-name">' + esc(label) + '</span><span class="planning-role-stat">' + esc(T("planningRoleStatResource")) + ': <span class="planning-role-stat__num">' + esc(resStr) + "</span> " + esc(T("planningRoleStatHourSuffix")) + '</span><span class="planning-role-stat">' + esc(T("planningRoleStatAlloc")) + ': <span class="planning-role-stat__num">' + esc(allocStr) + " / " + esc(resStr) + "</span> " + esc(T("planningRoleStatHourSuffix")) + '</span><span class="planning-role-stat"><span class="planning-role-stat__num">' + stats.taskCount + "</span> " + esc(T("planningRoleStatTasks")) + "</span>" + (stats.overlimit ? '<span class="planning-role-warn" title="' + esc(T("planningRoleStatOverlimit")) + '">\u26A0</span>' : "") + '</button><div class="planning-role-body" data-role-body="' + rk + '"><div class="planning-role-body__actions"><button class="ring-button-button ring-button-block ring-button-heightS ring-button-primaryBlock ring-button-flat ring-button-whiteText planning-role-jumpPeople" data-role-key="' + rk + '">' + esc(T("btnJumpToPeople")) + "</button></div></div></div>";
      return html;
    }
    function _updateRoleAccordionStats(rk) {
      var card = document.querySelector('.planning-role-card[data-role-key="' + rk + '"]');
      if (!card) return;
      var stats = computeRoleQuickStats(rk);
      var resStr = _formatHoursLight(stats.resource);
      var allocStr = _formatHoursLight(stats.totalAlloc);
      var nums = card.querySelectorAll(".planning-role-toggle .planning-role-stat__num");
      if (nums[0]) nums[0].textContent = resStr;
      if (nums[1]) nums[1].textContent = allocStr + " / " + resStr;
      if (nums[2]) nums[2].textContent = String(stats.taskCount);
      var warn = card.querySelector(".planning-role-toggle .planning-role-warn");
      if (stats.overlimit) {
        if (!warn) {
          warn = document.createElement("span");
          warn.className = "planning-role-warn";
          warn.title = T("planningRoleStatOverlimit");
          warn.textContent = "\u26A0";
          card.querySelector(".planning-role-toggle").appendChild(warn);
        }
      } else if (warn) {
        warn.parentNode.removeChild(warn);
      }
    }
    function renderPlanningRoles() {
      var container = document.getElementById("roleAccordions");
      var noSprintEl = document.getElementById("planningRolesNoSprint");
      var noActiveEl = document.getElementById("planningRolesNoActive");
      if (!container) return;
      var activeRoles = typeof getActiveRoles === "function" ? getActiveRoles() : [];
      if (!activeRoles.length) {
        container.innerHTML = "";
        if (noActiveEl) noActiveEl.classList.remove("hidden");
        if (noSprintEl) noSprintEl.classList.add("hidden");
        return;
      }
      if (noActiveEl) noActiveEl.classList.add("hidden");
      if (!_currentSprintId) {
        container.innerHTML = "";
        if (noSprintEl) noSprintEl.classList.remove("hidden");
        return;
      }
      if (noSprintEl) noSprintEl.classList.add("hidden");
      var html = activeRoles.map(function(role) {
        return renderRoleAccordion(role.key);
      }).join("");
      container.innerHTML = html;
      _bindAccordionHandlers();
    }
    function _bindAccordionHandlers() {
      document.querySelectorAll("#roleAccordions .planning-role-toggle").forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          if (e && e.preventDefault) e.preventDefault();
          var rk = btn.dataset.roleKey;
          if (!rk) return;
          _uiExpandedRoles[rk] = !_uiExpandedRoles[rk];
          var expandedList = Object.keys(_uiExpandedRoles).filter(function(k) {
            return _uiExpandedRoles[k];
          });
          var ui = _draftGet("ui") || {};
          ui.expandedRoles = expandedList;
          _draftSet("ui", ui);
          var card = btn.closest(".planning-role-card");
          if (card) {
            card.classList.toggle("expanded", !!_uiExpandedRoles[rk]);
            var chev = card.querySelector(".planning-role-chevron");
            if (chev) chev.textContent = _uiExpandedRoles[rk] ? "\u25BC" : "\u25B6";
            if (_uiExpandedRoles[rk]) {
              var bodyEl = card.querySelector(".planning-role-body");
              if (!bodyEl) {
                bodyEl = document.createElement("div");
                bodyEl.className = "planning-role-body";
                bodyEl.setAttribute("data-role-body", rk);
                card.appendChild(bodyEl);
              }
            }
          }
          if (typeof _mountExpandedRoleBodies === "function") {
            try {
              _mountExpandedRoleBodies();
            } catch (err) {
              diag("mount role bodies on toggle err: " + err, "err");
            }
          }
        });
      });
      document.querySelectorAll("#roleAccordions .planning-role-jumpPeople").forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          if (e && e.stopPropagation) e.stopPropagation();
          var rk = btn.dataset.roleKey;
          safeLs.set("ssp_lastActiveRole", rk);
          _activeSubtab = rk;
          var peopleSel = document.getElementById("planningRoleSel");
          if (peopleSel) {
            if (!peopleSel.options.length && typeof populatePlanningRoleSel === "function") {
              try {
                populatePlanningRoleSel();
              } catch (_) {
              }
            }
            if (peopleSel.querySelector('option[value="' + rk + '"]')) peopleSel.value = rk;
          }
          var lvlBtn = document.querySelector('.planning-level-btn[data-level="people"]');
          if (lvlBtn && lvlBtn.style.display !== "none" && !lvlBtn.classList.contains("hidden")) lvlBtn.click();
          if (typeof refreshPlanningPeopleForCurrentSprint === "function") {
            try {
              refreshPlanningPeopleForCurrentSprint(rk);
            } catch (_) {
            }
          }
        });
      });
      if (typeof _mountExpandedRoleBodies === "function") {
        try {
          _mountExpandedRoleBodies();
        } catch (e) {
          diag("mount role bodies err: " + e, "err");
        }
      }
    }
    function _mountExpandedRoleBodies() {
      document.querySelectorAll(".planning-role-card.expanded .planning-role-body").forEach(function(host) {
        var rk = host.getAttribute("data-role-body");
        if (!rk) return;
        if (host.dataset.mounted === "1") return;
        var role = ALL_ROLES.find(function(r) {
          return r.key === rk;
        });
        if (!role) return;
        try {
          var keepActions = host.querySelector(".planning-role-body__actions");
          host.innerHTML = "";
          host.appendChild(buildRolePanel(role));
          if (keepActions) host.appendChild(keepActions);
          host.dataset.mounted = "1";
          _activeSubtab = rk;
          if (typeof applyEditorRightsToUI === "function") applyEditorRightsToUI();
        } catch (e) {
          diag("_mountExpandedRoleBodies err for rk=" + rk + ": " + e, "err");
        }
      });
      document.querySelectorAll(".planning-role-card:not(.expanded) .planning-role-body").forEach(function(host) {
        if (host.dataset.mounted === "1") {
          host.dataset.mounted = "";
          host.innerHTML = "";
        }
      });
    }
    function populatePlanningRoleSel() {
      var sel = document.getElementById("planningRoleSel");
      if (!sel) return;
      var prev = sel.value;
      sel.innerHTML = "";
      var activeRoles = typeof getActiveRoles === "function" ? getActiveRoles() : [];
      activeRoles.forEach(function(role) {
        var opt = document.createElement("option");
        opt.value = role.key;
        opt.textContent = typeof roleLabel === "function" ? roleLabel(role) : role.label || role.key;
        sel.appendChild(opt);
      });
      var lastRole = safeLs.get("ssp_lastActiveRole") || "";
      var pick = prev && activeRoles.some(function(r) {
        return r.key === prev;
      }) ? prev : lastRole && activeRoles.some(function(r) {
        return r.key === lastRole;
      }) ? lastRole : activeRoles[0] && activeRoles[0].key || "";
      if (pick) sel.value = pick;
    }
    function _findHistRecForCurrent(rk) {
      if (!_currentSprintId || !rk) return null;
      var key = _currentSprintId + "_" + rk;
      return _history.find(function(r) {
        return r && r.sprintId === key;
      }) || null;
    }
    function _getPersonalPlanningForCurrent(rk) {
      if (!_currentSprintId || !rk) return null;
      var rec = _findHistRecForCurrent(rk);
      if (rec && rec.personalPlanning) return rec.personalPlanning;
      if (_sprint && _sprint.sprintId === _currentSprintId && _sprint.personalPlanning && _sprint.personalPlanning[rk]) {
        return _sprint.personalPlanning[rk];
      }
      return null;
    }
    function _renderResourceModeIndicator(rk, pp) {
      var el = document.getElementById("planningResModeIndicator");
      if (!el) return;
      var manualMode = !(_settings && _settings.usePersonalForResource);
      if (!manualMode) {
        el.classList.add("hidden");
        el.innerHTML = "";
        return;
      }
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      var roleResMin = role && _sprint && _sprint[role.resKey] ? _sprint[role.resKey] || 0 : 0;
      var roleRes = roleResMin / 60;
      var peopleSum = 0;
      if (pp && pp.resourcesByAssignee) {
        Object.keys(pp.resourcesByAssignee).forEach(function(login) {
          var r = pp.resourcesByAssignee[login] && pp.resourcesByAssignee[login].resource;
          if (typeof r === "number" && !isNaN(r)) peopleSum += r;
        });
      }
      var diff = +(roleRes - peopleSum).toFixed(2);
      var statusCls, statusTxt;
      if (Math.abs(diff) < 0.01) {
        statusCls = "ok";
        statusTxt = T("resStatusOk");
      } else if (diff > 0) {
        statusCls = "under";
        statusTxt = T("resStatusUnderTpl").replace("{n}", _formatHoursLight(diff));
      } else {
        statusCls = "over";
        statusTxt = T("resStatusOverTpl").replace("{n}", _formatHoursLight(-diff));
      }
      el.classList.remove("hidden");
      el.innerHTML = '<div class="resource-indicator__row"><span>' + esc(T("lblRoleResourceManual")) + "</span><span>" + esc(_formatHoursLight(roleRes)) + " " + esc(T("planningRoleStatHourSuffix")) + '</span></div><div class="resource-indicator__row"><span>' + esc(T("lblPeopleSum")) + "</span><span>" + esc(_formatHoursLight(peopleSum)) + " " + esc(T("planningRoleStatHourSuffix")) + '</span></div><div class="resource-indicator__status resource-indicator__status--' + statusCls + '">' + esc(statusTxt) + "</div>";
    }
    (function bindOrphanGanttDismiss() {
      function bind() {
        var btn = document.getElementById("bannerOrphanGanttDismissBtn");
        if (btn && !btn.dataset.bound) {
          btn.dataset.bound = "1";
          btn.addEventListener("click", function() {
            var b = document.getElementById("bannerOrphanGanttColors");
            if (b) b.classList.add("hidden");
          });
        }
      }
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
      else bind();
    })();
    function _renderOrphanGanttBanner(sprintRec) {
      var banner = document.getElementById("bannerOrphanGanttColors");
      var listEl = document.getElementById("bannerOrphanGanttList");
      if (!banner) return;
      var orphans = sprintRec && Array.isArray(sprintRec._orphanGanttIssues) ? sprintRec._orphanGanttIssues : [];
      if (!orphans.length) {
        banner.classList.add("hidden");
        if (listEl) listEl.textContent = "";
        return;
      }
      var preview = orphans.slice(0, 5);
      var rest = orphans.length - preview.length;
      var text = preview.join(", ") + (rest > 0 ? " (+" + rest + ")" : "");
      if (listEl) listEl.textContent = text;
      banner.classList.remove("hidden");
    }
    function refreshPlanningPeopleForCurrentSprint(roleKey) {
      var sel = document.getElementById("planningRoleSel");
      if (!sel) return;
      if (!sel.options.length) populatePlanningRoleSel();
      var rk = roleKey || sel.value || _activeSubtab || safeLs.get("ssp_lastActiveRole") || "";
      if (rk && sel.value !== rk) sel.value = rk;
      if (!rk) return;
      safeLs.set("ssp_lastActiveRole", rk);
      var noSprintEl = document.getElementById("planningPeopleNoSprint");
      var emptyEl = document.getElementById("planningPeopleEmpty");
      var contentEl = document.getElementById("planningPeopleContent");
      if (!_currentSprintId) {
        if (noSprintEl) noSprintEl.classList.remove("hidden");
        if (emptyEl) emptyEl.classList.add("hidden");
        if (contentEl) contentEl.classList.add("hidden");
        _currentSprintRoleRec = null;
        _currentRolePP = null;
        _currentRoleGantt = null;
        return;
      }
      if (noSprintEl) noSprintEl.classList.add("hidden");
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      var roleName = role ? typeof roleLabel === "function" ? roleLabel(role) : role.label || rk : rk;
      var pp = _getPersonalPlanningForCurrent(rk);
      var hasPP = pp && pp.resourcesByAssignee && Object.keys(pp.resourcesByAssignee).length > 0;
      if (!hasPP) {
        if (emptyEl) {
          emptyEl.classList.remove("hidden");
          var titleEl = document.getElementById("planningPeopleEmptyTitle");
          if (titleEl) titleEl.textContent = T("planningPeopleEmptyTitleTpl").replace("{role}", roleName);
        }
        if (contentEl) contentEl.classList.add("hidden");
        _currentSprintRoleRec = _findHistRecForCurrent(rk);
        _currentRolePP = _currentSprintRoleRec && _currentSprintRoleRec.personalPlanning ? deepClone(_currentSprintRoleRec.personalPlanning) : typeof emptyPP === "function" ? emptyPP() : { resourcesByAssignee: {}, taskAssignments: {} };
        _currentRoleGantt = _currentSprintRoleRec && _currentSprintRoleRec.gantt ? deepClone(_currentSprintRoleRec.gantt) : { tasks: {}, updatedAt: null };
        _activeSubtab = rk;
        _renderOrphanGanttBanner(_currentSprintRoleRec);
        return;
      }
      if (emptyEl) emptyEl.classList.add("hidden");
      if (contentEl) contentEl.classList.remove("hidden");
      _currentSprintRoleRec = _findHistRecForCurrent(rk);
      _currentRolePP = deepClone(pp);
      _currentRoleGantt = _currentSprintRoleRec && _currentSprintRoleRec.gantt ? deepClone(_currentSprintRoleRec.gantt) : { tasks: {}, updatedAt: null };
      _currentRoleNkcKey = _currentRolePP.nkcKey || _currentRoleNkcKey || "other";
      var nkcSel = document.getElementById("currentRoleNkcSel");
      if (nkcSel && nkcSel.querySelector('option[value="' + _currentRoleNkcKey + '"]')) {
        nkcSel.value = _currentRoleNkcKey;
      }
      _activeSubtab = rk;
      if (typeof renderCurrentRoleAssigneeTable === "function") {
        try {
          renderCurrentRoleAssigneeTable();
        } catch (e) {
          diag("renderCurrentRoleAssigneeTable err: " + e, "err");
        }
      }
      if (typeof renderCurrentRoleTaskTable === "function") {
        try {
          renderCurrentRoleTaskTable();
        } catch (e) {
          diag("renderCurrentRoleTaskTable err: " + e, "err");
        }
      }
      if (typeof updateCurrentRoleTotals === "function") {
        try {
          updateCurrentRoleTotals();
        } catch (e) {
          diag("updateCurrentRoleTotals err: " + e, "err");
        }
      }
      _renderResourceModeIndicator(rk, _currentRolePP);
      _renderOrphanGanttBanner(_currentSprintRoleRec);
      if (typeof applyEditorRightsToUI === "function") {
        try {
          applyEditorRightsToUI();
        } catch (_) {
        }
      }
    }
    (function bindPlanningPeopleHandlers() {
      function bind() {
        var sel = document.getElementById("planningRoleSel");
        if (sel && !sel.dataset.bound) {
          sel.dataset.bound = "1";
          sel.addEventListener("change", function() {
            var newRk = sel.value;
            var prevRk = safeLs.get("ssp_lastActiveRole") || "";
            if (prevRk && prevRk !== newRk && _dirtyRoleKeys[prevRk]) {
              var role = ALL_ROLES.find(function(r) {
                return r.key === prevRk;
              });
              var roleName = role ? typeof roleLabel === "function" ? roleLabel(role) : role.label || prevRk : prevRk;
              var ok = window.confirm(T("roleSwitchDirtyText").replace("{role}", roleName));
              if (!ok) {
                sel.value = prevRk;
                return;
              }
              delete _dirtyRoleKeys[prevRk];
            }
            safeLs.set("ssp_lastActiveRole", newRk);
            refreshPlanningPeopleForCurrentSprint(newRk);
          });
        }
        var ctaBtn = document.getElementById("planningPeopleEmptyCta");
        if (ctaBtn && !ctaBtn.dataset.bound) {
          ctaBtn.dataset.bound = "1";
          ctaBtn.addEventListener("click", function() {
            var sel2 = document.getElementById("planningRoleSel");
            var rk = sel2 ? sel2.value : "";
            if (!rk) return;
            safeLs.set("ssp_lastActiveRole", rk);
            _activeSubtab = rk;
            var pickBtn = document.getElementById("currentRolePickBtn");
            if (pickBtn) {
              pickBtn.click();
            } else if (typeof doCurrentRoleCalc === "function") {
              try {
                doCurrentRoleCalc();
              } catch (e) {
                diag("doCurrentRoleCalc from CTA err: " + e, "err");
              }
            }
          });
        }
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bind);
      } else {
        bind();
      }
    })();
    function populateGanttRoleSel() {
      var sel = document.getElementById("ganttRoleSel");
      if (!sel) return;
      var prev = sel.value;
      sel.innerHTML = "";
      var roles = typeof getActiveRoles === "function" ? getActiveRoles() : [];
      roles.forEach(function(role) {
        var opt = document.createElement("option");
        opt.value = role.key;
        opt.textContent = typeof roleLabel === "function" ? roleLabel(role) : role.label || role.key;
        sel.appendChild(opt);
      });
      var last = safeLs.get("ssp_lastActiveRole") || "";
      var pick = prev && roles.some(function(r) {
        return r.key === prev;
      }) ? prev : last && roles.some(function(r) {
        return r.key === last;
      }) ? last : (roles[0] || {}).key || "";
      if (pick) sel.value = pick;
    }
    function refreshGanttForCurrentSprint(roleKey) {
      populateGanttRoleSel();
      var sel = document.getElementById("ganttRoleSel");
      var rk = roleKey || sel && sel.value || null;
      if (!rk && typeof getActiveRoles === "function") {
        var ar = getActiveRoles();
        rk = ar[0] && ar[0].key || null;
      }
      if (sel && rk) sel.value = rk;
      if (rk) safeLs.set("ssp_lastActiveRole", rk);
      var emptyEl = document.getElementById("ganttEmpty");
      var c = document.getElementById("ganttContainer");
      if (!_currentSprintId || !rk) {
        if (emptyEl) {
          emptyEl.classList.remove("hidden");
          emptyEl.textContent = T("emptyGantt");
        }
        if (c) c.innerHTML = "";
        _currentSprintRoleRec = null;
        _currentRolePP = null;
        _currentRoleGantt = null;
        return;
      }
      var rec = _findHistRecForCurrent(rk);
      if (!rec) {
        if (emptyEl) {
          emptyEl.classList.remove("hidden");
          emptyEl.textContent = T("emptyGantt");
        }
        if (c) c.innerHTML = "";
        _currentSprintRoleRec = null;
        _currentRolePP = null;
        _currentRoleGantt = null;
        return;
      }
      _currentSprintRoleRec = rec;
      _currentRolePP = rec.personalPlanning ? deepClone(rec.personalPlanning) : typeof emptyPP === "function" ? emptyPP() : { resourcesByAssignee: {}, taskAssignments: {} };
      _currentRoleGantt = rec.gantt ? deepClone(rec.gantt) : { tasks: {}, updatedAt: null };
      _activeSubtab = rk;
      if (emptyEl) emptyEl.classList.add("hidden");
      _renderOrphanGanttBanner(rec);
      if (typeof renderGanttChart === "function") {
        try {
          renderGanttChart();
        } catch (e) {
          diag("renderGanttChart err: " + e, "err");
        }
      }
      if (typeof applyEditorRightsToUI === "function") {
        try {
          applyEditorRightsToUI();
        } catch (_) {
        }
      }
    }
    (function bindGanttHandlers() {
      function bind() {
        var sel = document.getElementById("ganttRoleSel");
        if (sel && !sel.dataset.bound) {
          sel.dataset.bound = "1";
          sel.addEventListener("change", function() {
            var newRk = sel.value;
            var prevRk = safeLs.get("ssp_lastActiveRole") || "";
            if (prevRk && prevRk !== newRk && _dirtyRoleKeys[prevRk + ":gantt"]) {
              var ok = window.confirm(T("ganttRoleSwitchDirtyText"));
              if (!ok) {
                sel.value = prevRk;
                return;
              }
              delete _dirtyRoleKeys[prevRk + ":gantt"];
            }
            refreshGanttForCurrentSprint(newRk);
          });
        }
        var updBtn = document.getElementById("ganttUpdateBtn");
        if (updBtn && !updBtn.dataset.bound) {
          updBtn.dataset.bound = "1";
          updBtn.addEventListener("click", function() {
            var s = document.getElementById("ganttRoleSel");
            var rk = s ? s.value : null;
            refreshGanttForCurrentSprint(rk);
          });
        }
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bind);
      } else {
        bind();
      }
    })();
    function _hasMyActiveWcForSprint(sprintId) {
      if (!sprintId) return false;
      if (typeof _workingDrafts !== "object" || _workingDrafts === null) return false;
      var myLogin = _currentUser && _currentUser.login ? _currentUser.login : null;
      var roles = typeof getActiveRoles === "function" ? getActiveRoles() : [];
      for (var i = 0; i < roles.length; i++) {
        var k = sprintId + "_" + roles[i].key;
        var wd = _workingDrafts[k];
        if (wd && (!myLogin || wd.editorLogin === myLogin)) return true;
      }
      return false;
    }
    function _setHistoricalReadOnly(on) {
      var p1 = document.getElementById("tab-planning");
      if (p1) p1.classList.toggle("readonly-mode", !!on);
      var p2 = document.getElementById("tab-gantt");
      if (p2) p2.classList.toggle("readonly-mode", !!on);
      if (on && typeof hideReassignModal === "function") {
        try {
          hideReassignModal();
        } catch (_) {
        }
      }
    }
    function _applyHybridSprintMode(newId) {
      var isHistorical = !!(newId && _sprint && _sprint.sprintId && newId !== _sprint.sprintId);
      if (!isHistorical) {
        _setHistoricalReadOnly(false);
        return;
      }
      var hasMyWc = _hasMyActiveWcForSprint(newId);
      _setHistoricalReadOnly(!hasMyWc);
    }
    function _onCrossTabWcEvent(e) {
      if (!e || !e.key) return;
      if (e.key.indexOf("ssp:wc-touched:") !== 0) return;
      try {
        if (typeof renderWidgetHeader === "function") renderWidgetHeader();
        if (_planningLevel === "people") {
          _renderPlanningLevel("people");
        }
        var ganttBtn = document.querySelector('.tab-btn[data-tab="gantt"].active');
        if (ganttBtn && typeof refreshGanttForCurrentSprint === "function") {
          var rk = safeLs.get("ssp_lastActiveRole");
          refreshGanttForCurrentSprint(rk);
        }
      } catch (err) {
        diag("cross-tab WC event err: " + err, "err");
      }
    }
    try {
      window.addEventListener("storage", _onCrossTabWcEvent);
    } catch (_) {
    }
    function _applyPersonalPlanningToSegmentedControl() {
      var on = !!(_settings && _settings.personalPlanningEnabled);
      var btn = document.querySelector('.planning-level-btn[data-level="people"]');
      if (!btn) return;
      btn.classList.toggle("hidden", !on);
      if (!on && _planningLevel === "people") {
        _renderPlanningLevel("roles");
        var ui = _draftGet("ui") || {};
        ui.planningLevel = "roles";
        _draftSet("ui", ui);
      }
    }
    function renderSprintIntroExtras() {
      var hasSprint = _settings && _settings.fieldSprint;
      var hasVersion = _settings && _settings.fieldVersion;
      var extrasEl = document.getElementById("sprintExtraFields");
      var sprintEl = document.getElementById("fieldSprintVal");
      var versionEl = document.getElementById("fieldVersionVal");
      if (!hasSprint && !hasVersion) {
        extrasEl.style.display = "none";
        return;
      }
      extrasEl.style.display = "";
      var loaders = [];
      if (hasSprint) {
        sprintEl.style.display = "";
        loaders.push(loadFieldBundle(_settings.fieldSprint, "sprintFieldVal"));
      } else {
        sprintEl.style.display = "none";
      }
      if (hasVersion) {
        versionEl.style.display = "";
        loaders.push(loadFieldBundle(_settings.fieldVersion, "versionFieldVal"));
      } else {
        versionEl.style.display = "none";
      }
      Promise.all(loaders).then(function() {
        if (!_sprint) return;
        [
          { v: _sprint.sprintFieldVal, id: "sprintFieldVal" },
          { v: _sprint.versionFieldVal, id: "versionFieldVal" }
        ].forEach(function(spec) {
          if (!spec.v) return;
          var sel = document.getElementById(spec.id);
          if (!sel) return;
          if (!sel.querySelector('option[value="' + CSS.escape(spec.v) + '"]')) {
            var o = document.createElement("option");
            o.value = spec.v;
            o.textContent = spec.v + " *";
            o.title = "\u0417\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E, \u043D\u043E \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0432 \u0442\u0435\u043A\u0443\u0449\u0435\u043C \u0431\u0430\u043D\u0434\u043B\u0435";
            sel.appendChild(o);
          }
          sel.value = spec.v;
        });
      }).catch(function(e) {
        diag("renderSprintIntroExtras setVal err: " + e, "err");
      });
    }
    var _fieldValuesCache = {};
    var _fieldValuesInflight = {};
    function loadFieldBundle(fieldName, selId) {
      var sel = document.getElementById(selId);
      if (!sel || !fieldName) return Promise.resolve();
      function applyToSel(r) {
        if (!r || !r.success || !r.values || !r.values.length) return;
        var prev = sel.value;
        sel.innerHTML = '<option value="">' + T("phNotSelected") + "</option>";
        r.values.forEach(function(name) {
          var o = document.createElement("option");
          o.value = name;
          o.textContent = name;
          sel.appendChild(o);
        });
        if (prev) sel.value = prev;
      }
      if (_fieldValuesCache[fieldName]) {
        applyToSel(_fieldValuesCache[fieldName]);
        return Promise.resolve();
      }
      if (_fieldValuesInflight[fieldName]) {
        return _fieldValuesInflight[fieldName].then(function(r) {
          applyToSel(r);
        });
      }
      var p = apiGet("field-values?fieldName=" + encodeURIComponent(fieldName)).catch(function(e) {
        diag("field-values [" + fieldName + "] FETCH ERR: " + (e && e.message ? e.message : String(e)), "err");
        return null;
      }).then(function(r) {
        var dbg = r && r.debug;
        var diagMsg = "field-values [" + fieldName + "]: success=" + !!(r && r.success) + " count=" + (r && r.values ? r.values.length : 0) + " typeName=" + (dbg && dbg.typeName || "?") + " method=" + (dbg && dbg.method || "?") + (dbg && dbg.error ? " ERR=" + dbg.error : "") + (dbg && dbg.findFieldError ? " findErr=" + dbg.findFieldError : "") + (dbg && dbg.allFieldNames ? " fields=[" + dbg.allFieldNames.slice(0, 5).join(",") + ("..." + (dbg.allFieldNames.length - 5) + " more") + "  searched=" + fieldName + "]" : "");
        diag(diagMsg, r && r.success && r.values && r.values.length ? "ok" : "warn");
        if (r && r.success && r.values) _fieldValuesCache[fieldName] = r;
        delete _fieldValuesInflight[fieldName];
        applyToSel(r);
        return r;
      }).catch(function(e) {
        delete _fieldValuesInflight[fieldName];
        diag("field-values [" + fieldName + "] ERR: " + String(e && e.message ? e.message : e), "err");
      });
      _fieldValuesInflight[fieldName] = p;
      return p;
    }
    function invalidateFieldValuesCache(fieldName) {
      if (fieldName) {
        delete _fieldValuesCache[fieldName];
        delete _fieldValuesInflight[fieldName];
      } else {
        _fieldValuesCache = {};
        _fieldValuesInflight = {};
      }
    }
    function buildRolePanel(role) {
      var dynEdit = _settings && _settings.dynEditEnabled;
      var frag = document.createDocumentFragment();
      var cols = document.createElement("div");
      cols.className = "planner-cols";
      var colStatus = document.createElement("div");
      colStatus.className = "card";
      colStatus.style.marginBottom = "0";
      colStatus.innerHTML = '<div class="card-title">' + T("cardStatusPlanning") + "</div>";
      var statusRow = document.createElement("div");
      statusRow.className = "status-row";
      statusRow.style.flexDirection = "column";
      statusRow.style.alignItems = "flex-start";
      statusRow.style.gap = "10px";
      var statusBadge = document.createElement("span");
      statusBadge.id = "statusBadge_" + role.key;
      statusBadge.className = "s-badge s-badge--planning";
      statusBadge.textContent = statusLabel(STATUS.PLANNING);
      var newSprintBtn = document.createElement("button");
      newSprintBtn.className = "ring-button-button ring-button-block ring-button-heightS new-sprint-btn";
      newSprintBtn.id = "newSprintBtn_" + role.key;
      newSprintBtn.style.display = "none";
      newSprintBtn.textContent = T("btnNewSprint");
      var saveHeaderBtn = document.createElement("button");
      saveHeaderBtn.className = "ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText save-header-btn";
      saveHeaderBtn.id = "saveHeaderBtn_" + role.key;
      saveHeaderBtn.textContent = T("btnSaveParams");
      statusRow.appendChild(statusBadge);
      statusRow.appendChild(newSprintBtn);
      statusRow.appendChild(saveHeaderBtn);
      colStatus.appendChild(statusRow);
      var colRes = document.createElement("div");
      colRes.className = "card";
      colRes.style.marginBottom = "0";
      colRes.innerHTML = '<div class="card-title">' + T("cardAvailRes") + "</div>";
      var resField = document.createElement("div");
      resField.className = "field";
      resField.innerHTML = '<label for="res_' + role.key + '">' + esc(roleLabel(role)) + '</label><input type="text" id="res_' + role.key + '" placeholder="' + T("phResource") + '"/>';
      colRes.appendChild(resField);
      var colRem = document.createElement("div");
      colRem.className = "card";
      colRem.style.marginBottom = "0";
      colRem.innerHTML = '<div class="card-title">' + T("cardRemRes") + "</div>";
      var remCard = document.createElement("div");
      remCard.className = "remain-card";
      remCard.id = "rc_" + role.key;
      remCard.innerHTML = '<div class="remain-card__label">' + esc(roleLabel(role)) + '</div><div class="remain-card__val" id="rem_' + role.key + '">\u2014</div>';
      colRem.appendChild(remCard);
      cols.appendChild(colStatus);
      cols.appendChild(colRes);
      cols.appendChild(colRem);
      frag.appendChild(cols);
      var compCard = document.createElement("div");
      compCard.className = "card";
      var compTitle = document.createElement("div");
      compTitle.className = "card-title";
      compTitle.textContent = T("cardComposition") + " \u2014 " + roleLabel(role);
      compCard.appendChild(compTitle);
      var toolbar = document.createElement("div");
      toolbar.className = "toolbar";
      toolbar.style.marginBottom = "14px";
      var pickBtn = document.createElement("button");
      pickBtn.className = "ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText editor-btn";
      pickBtn.id = "pickBtn_" + role.key;
      pickBtn.textContent = T("btnPickTasks");
      var refreshBtn = null;
      if (!dynEdit) {
        refreshBtn = document.createElement("button");
        refreshBtn.className = "ring-button-button ring-button-block ring-button-heightS editor-btn";
        refreshBtn.id = "refreshBtn_" + role.key;
        refreshBtn.disabled = true;
        refreshBtn.textContent = T("btnRefreshTasks");
      }
      var recalcBtn = document.createElement("button");
      recalcBtn.className = "ring-button-button ring-button-block ring-button-heightS editor-btn";
      recalcBtn.id = "recalcBtn_" + role.key;
      recalcBtn.disabled = true;
      recalcBtn.textContent = T("btnRecalc");
      var clearBtn = document.createElement("button");
      clearBtn.className = "ring-button-button ring-button-block ring-button-heightS ring-button-danger editor-btn";
      clearBtn.id = "clearBtn_" + role.key;
      clearBtn.disabled = true;
      clearBtn.textContent = T("btnClear");
      var spacer = document.createElement("div");
      spacer.style.flex = "1";
      var validateBtn = document.createElement("button");
      validateBtn.className = "ring-button-button ring-button-block ring-button-heightM ring-button-primaryBlock ring-button-flat ring-button-whiteText validate-btn";
      validateBtn.id = "validateBtn_" + role.key;
      validateBtn.textContent = T("btnValidate");
      toolbar.appendChild(pickBtn);
      if (refreshBtn) toolbar.appendChild(refreshBtn);
      toolbar.appendChild(recalcBtn);
      toolbar.appendChild(clearBtn);
      toolbar.appendChild(spacer);
      toolbar.appendChild(validateBtn);
      compCard.appendChild(toolbar);
      var tblWrap = document.createElement("div");
      tblWrap.className = "tbl-wrap";
      var tbl = document.createElement("table");
      tbl.className = "tbl";
      tbl.id = "compTable_" + role.key;
      var thead = document.createElement("thead");
      thead.id = "compHead_" + role.key;
      var tbody = document.createElement("tbody");
      tbody.id = "compBody_" + role.key;
      buildRoleTableHeader(thead, role, dynEdit);
      tbody.innerHTML = '<tr><td colspan="9" class="empty">' + T("compEmpty") + "</td></tr>";
      tbl.appendChild(thead);
      tbl.appendChild(tbody);
      tblWrap.appendChild(tbl);
      compCard.appendChild(tblWrap);
      var pag = document.createElement("div");
      pag.className = "pagination";
      pag.id = "planPag_" + role.key;
      pag.style.display = "none";
      pag.innerHTML = '<button class="ring-button-button ring-button-block ring-button-heightS" id="planPrev_' + role.key + '">\u2039</button><span id="planPageInfo_' + role.key + '"></span><button class="ring-button-button ring-button-block ring-button-heightS" id="planNext_' + role.key + '">\u203A</button>';
      compCard.appendChild(pag);
      frag.appendChild(compCard);
      setTimeout(function() {
        wireRolePanel(role, dynEdit);
        renderRolePlannerHeader(role.key);
        renderRoleComposition(role.key);
        updateRoleRemaining(role.key);
      }, 0);
      return frag;
    }
    function buildRoleTableHeader(thead, role, dynEdit) {
      var numCols = dynEdit ? '<th class="td-num th-dev" style="min-width:80px">' + T("thEstimate") + '</th><th class="td-num th-dev" style="min-width:80px">' + T("thFact") + '</th><th class="td-num th-dev" style="min-width:80px">' + T("thResource") + '</th><th class="td-num th-dev" style="min-width:80px">' + T("thAllocation") + "</th>" : '<th class="td-num th-dev">' + fmtThLabel(roleLabel(role)) + '</th><th class="td-num th-dev" style="min-width:80px">' + T("thAllocation") + "</th>";
      var _sk = typeof getSortKey === "function" ? getSortKey() : "off";
      function _sortIcon(active) {
        return '<span class="sort-icon">' + (active ? "\u25BC" : "\u2195") + "</span>";
      }
      thead.innerHTML = '<tr><th class="sortable' + (_sk === "id" ? " sortable--active" : "") + '" data-sort-key="id" title="' + esc(T("thSortClickHint")) + '" style="min-width:90px">' + T("thId") + _sortIcon(_sk === "id") + "</th>" + /* v1.8.0 D130 — externalTicketId column header (2nd position, right after issue ID link). */
      (_settings && _settings.fieldExternalTicketId ? '<th class="sortable' + (_sk === "externalTicketId" ? " sortable--active" : "") + '" data-sort-key="externalTicketId" title="' + esc(T("thSortClickHint")) + '" style="min-width:120px">' + T("thExternalTicketId") + _sortIcon(_sk === "externalTicketId") + "</th>" : "") + (_settings && _settings.fieldSystem ? '<th style="min-width:80px">' + T("thSystem") + "</th>" : "") + '<th class="sortable' + (_sk === "priority" ? " sortable--active" : "") + '" data-sort-key="priority" title="' + esc(T("thSortClickHint")) + '" style="min-width:80px">' + T("thPriority") + _sortIcon(_sk === "priority") + "</th>" + (_settings && _settings.fieldXPriority ? '<th class="th-dev sortable' + (_sk === "xpriority" ? " sortable--active" : "") + '" data-sort-key="xpriority" title="' + esc(T("thSortClickHint")) + '">' + T("thXpriority") + _sortIcon(_sk === "xpriority") + "</th>" : "") + '<th class="th-dev">' + T("thState") + '</th><th style="min-width:160px">' + T("thTitle") + "</th>" + numCols + '<th style="min-width:160px">' + T("thIncStatus") + "</th><th></th></tr>";
      if (typeof _bindSortHeaders === "function") {
        try {
          _bindSortHeaders(thead);
        } catch (_) {
        }
      }
    }
    function wireRolePanel(role, dynEdit) {
      var rk = role.key;
      var pickBtn = document.getElementById("pickBtn_" + rk);
      if (pickBtn) {
        pickBtn.addEventListener("click", function() {
          if (!_isEditor) {
            toast(T("toastNoEditRights"), "warn");
            return;
          }
          _currentPickRole = rk;
          _selectedIds = /* @__PURE__ */ new Set();
          _pickPage = 1;
          _pickResults = [];
          _pickAllResults = /* @__PURE__ */ new Map();
          _pickQueryFingerprint = "";
          _pickAllInFlight = false;
          document.getElementById("pickModalTitle").textContent = T("pickModalTitle") + " \u2014 " + roleLabel(role);
          document.getElementById("pickQuery").value = "";
          document.getElementById("pickResults").innerHTML = '<div class="empty">' + T("emptyPickResults") + "</div>";
          document.getElementById("pickPag").style.display = "none";
          _showOverlay("pickOverlay");
        });
      }
      var refreshBtn = document.getElementById("refreshBtn_" + rk);
      if (refreshBtn) {
        refreshBtn.addEventListener("click", function() {
          if (!_isEditor) {
            toast(T("toastNoRightsShort"), "warn");
            return;
          }
          refreshRoleEstimates(rk);
        });
      }
      var recalcBtn = document.getElementById("recalcBtn_" + rk);
      if (recalcBtn) {
        recalcBtn.addEventListener("click", function() {
          if (!_isEditor) {
            toast(T("toastNoRightsShort"), "warn");
            return;
          }
          updateRoleRemaining(rk);
          toast(T("toastRecalcDone"), "success");
        });
      }
      var clearBtn = document.getElementById("clearBtn_" + rk);
      if (clearBtn) {
        clearBtn.addEventListener("click", function() {
          if (!_isEditor) {
            toast(T("toastNoRightsShort"), "warn");
            return;
          }
          _showOverlay("clearOverlay");
          document.getElementById("clearYes").dataset.roleKey = rk;
        });
      }
      var validateBtn = document.getElementById("validateBtn_" + rk);
      if (validateBtn) {
        validateBtn.addEventListener("click", function() {
          if (!_isValidator) {
            toast(T("toastNoValidRights"), "warn");
            return;
          }
          doValidateRole(rk);
        });
      }
      var newSprintBtn = document.getElementById("newSprintBtn_" + rk);
      if (newSprintBtn) {
        newSprintBtn.addEventListener("click", function() {
          if (!_isEditor) {
            toast(T("toastNoRightsShort"), "warn");
            return;
          }
          doNewSprint(rk);
        });
      }
      var saveHeaderBtn = document.getElementById("saveHeaderBtn_" + rk);
      if (saveHeaderBtn) {
        saveHeaderBtn.addEventListener("click", function() {
          if (!_isEditor) {
            toast(T("toastNoRightsShort"), "warn");
            return;
          }
          doSaveRoleHeader(rk);
        });
      }
      var prevBtn = document.getElementById("planPrev_" + rk);
      var nextBtn = document.getElementById("planNext_" + rk);
      if (prevBtn) prevBtn.addEventListener("click", function() {
        var page = _roleItems[rk] && _roleItems[rk]._page || 1;
        if (!_roleItems[rk]) return;
        _roleItems[rk]._page = Math.max(1, page - 1);
        renderRoleComposition(rk);
      });
      if (nextBtn) nextBtn.addEventListener("click", function() {
        var page = _roleItems[rk] && _roleItems[rk]._page || 1;
        if (!_roleItems[rk]) return;
        _roleItems[rk]._page = page + 1;
        renderRoleComposition(rk);
      });
    }
    function renderRolePlannerHeader(rk) {
      var ok = _settings && getActiveRoles().some(function(r) {
        return r.key === rk && _settings[r.fieldEst];
      });
      document.getElementById("bannerPlanner").classList.toggle("hidden", !!ok || !_settings);
      if (!_sprint) return;
      document.getElementById("sprintName").value = _sprint.name || "";
      document.getElementById("dateStart").value = toDateIn(_sprint.dateStart);
      document.getElementById("dateEnd").value = toDateIn(_sprint.dateEnd);
      var goalEl = document.getElementById("sprintGoal");
      if (goalEl) goalEl.value = _sprint.sprintGoal || "";
      var resEl = document.getElementById("res_" + rk);
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      if (resEl && role) {
        if (_settings && _settings.usePersonalForResource) {
          var totalH5 = typeof getPersonalPlanningResourceForRole === "function" ? getPersonalPlanningResourceForRole(rk) : 0;
          if (_sprint) _sprint[role.resKey] = Math.round(totalH5 * 60);
          resEl.value = fmtPeriod(Math.round(totalH5 * 60));
          resEl.readOnly = true;
          resEl.style.opacity = "0.6";
          resEl.title = T("resManagedByCurrentRole");
        } else {
          resEl.value = _sprint[role.resKey] ? fmtPeriod(_sprint[role.resKey]) : "";
          resEl.readOnly = false;
          resEl.style.opacity = "";
          resEl.title = "";
        }
        bindResInputDraftListener(rk);
      }
      bindSprintHeaderDraftListeners();
      var ss = document.getElementById("sprintStatus_" + rk);
      var newBtn = document.getElementById("newSprintBtn_" + rk);
      if (_sprint.status === STATUS.CONFIRMED || _sprint.status === STATUS.ALLOCATED) {
        if (ss) ss.style.display = "none";
        if (newBtn) newBtn.style.display = "";
      } else {
        if (ss) {
          ss.style.display = "";
          ss.value = _sprint.status || STATUS.PLANNING;
        }
        if (newBtn) newBtn.style.display = "none";
      }
      renderRoleStatusBadge(rk);
      renderSprintIntroExtras();
    }
    function renderRoleStatusBadge(rk) {
      var b = document.getElementById("statusBadge_" + rk);
      if (!b) return;
      var s = STATUS.PLANNING;
      if (_sprint && _sprint.sprintId) {
        var roleSnapId = _sprint.sprintId + "_" + rk;
        var rec = _history && _history.find(function(r) {
          return r && r.sprintId === roleSnapId;
        });
        if (rec && rec.status) s = rec.status;
      }
      b.textContent = statusLabel(s);
      b.className = "s-badge";
      b.removeAttribute("title");
      if (s === STATUS.ALLOCATED) {
        b.classList.add("s-badge--allocated");
        b.setAttribute("title", T("tooltipStatusAllocated"));
      } else if (s === STATUS.CONFIRMED) b.classList.add("s-badge--confirmed");
      else if (s === STATUS.FINISHED) b.classList.add("s-badge--finished");
      else b.classList.add("s-badge--planning");
    }
    function updateRoleRemaining(rk) {
      var rem = calcRemForRole(rk);
      var card = document.getElementById("rc_" + rk);
      var val = document.getElementById("rem_" + rk);
      if (!card || !val) return;
      card.classList.toggle("remain-card--over", rem < 0);
      val.textContent = fmtHours(rem);
    }
    function doSaveRoleHeader(rk) {
      function _clearFieldErrors() {
        ["sprintName", "dateStart", "dateEnd"].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) el.classList.remove("field-err-input");
        });
        var en = document.getElementById("errName");
        if (en) en.textContent = "";
        var ed = document.getElementById("errDate");
        if (ed) ed.textContent = "";
      }
      function _showFieldError(fieldId, errSpanId, msgKey) {
        var fld = document.getElementById(fieldId);
        var err = document.getElementById(errSpanId);
        if (err) err.textContent = T(msgKey);
        if (fld) {
          fld.classList.add("field-err-input");
          try {
            fld.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch (_) {
          }
          try {
            fld.focus();
          } catch (_) {
          }
        }
        toast(T(msgKey), "warn");
      }
      _clearFieldErrors();
      var s = document.getElementById("dateStart").value;
      var e = document.getElementById("dateEnd").value;
      var nameVal = (document.getElementById("sprintName").value || "").trim();
      var draftName = T("newSprintDraftName");
      if (!nameVal || nameVal === draftName) {
        _showFieldError("sprintName", "errName", "toastSprintNameRequired");
        return;
      }
      if (!s) {
        _showFieldError("dateStart", "errDate", "toastSprintDateStartRequired");
        return;
      }
      if (!e) {
        _showFieldError("dateEnd", "errDate", "toastSprintDateEndRequired");
        return;
      }
      if (s && e && fromDateIn(e) < fromDateIn(s)) {
        _showFieldError("dateEnd", "errDate", "toastDateError");
        return;
      }
      _clearFieldErrors();
      _sprint.name = nameVal.substring(0, 60);
      _sprint.dateStart = fromDateIn(s);
      _sprint.dateEnd = fromDateIn(e);
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      if (role) {
        var resEl = document.getElementById("res_" + rk);
        if (resEl) _sprint[role.resKey] = parsePeriod(resEl.value);
      }
      var ss = document.getElementById("sprintStatus_" + rk);
      if (_sprint.status !== STATUS.CONFIRMED && _sprint.status !== STATUS.ALLOCATED && ss) _sprint.status = ss.value;
      var sprintFv = document.getElementById("sprintFieldVal");
      var versionFv = document.getElementById("versionFieldVal");
      if (sprintFv) _sprint.sprintFieldVal = sprintFv.value || null;
      if (versionFv) _sprint.versionFieldVal = versionFv.value || null;
      var _goalEl = document.getElementById("sprintGoal");
      var _goalVal = _goalEl ? (_goalEl.value || "").trim() : "";
      _sprint.sprintGoal = _goalVal || void 0;
      _sprint.updatedAt = Date.now();
      _sprint.updatedBy = _currentUser ? _currentUser.login : null;
      var btn = document.getElementById("saveHeaderBtn_" + rk);
      if (btn) {
        btn.disabled = true;
        btn.textContent = T("toastSaving");
      }
      _markDirty("sprint");
      _draftSet("sprint", _sprint);
      _draftSet("meta", { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
      apiPost("sprint-data", { sprint: _sprint }).then(function() {
        updateRoleRemaining(rk);
        renderRoleStatusBadge(rk);
        if (btn) {
          btn.disabled = false;
          btn.textContent = T("btnSaveParams");
        }
        toast(T("toastSprintSaved"), "success");
        if (_sprint && _sprint.sprintId && _currentSprintId !== _sprint.sprintId) {
          _currentSprintId = _sprint.sprintId;
          var _uiNew = _draftGet("ui") || {};
          _uiNew.currentSprintId = _currentSprintId;
          _draftSet("ui", _uiNew);
        }
        if (typeof renderWidgetHeader === "function") {
          try {
            renderWidgetHeader();
          } catch (_) {
          }
        }
      }).catch(function(e2) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = T("btnSaveParams");
        }
        toast(T("toastSaveError") + ": " + (e2 && e2.message ? e2.message : e2));
      });
    }
    function doSaveSprintIntro() {
      function _clearFieldErrors() {
        ["sprintName", "dateStart", "dateEnd"].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) el.classList.remove("field-err-input");
        });
        var en = document.getElementById("errName");
        if (en) en.textContent = "";
        var ed = document.getElementById("errDate");
        if (ed) ed.textContent = "";
        var ei = document.getElementById("errSprintIntro");
        if (ei) ei.textContent = "";
      }
      function _showFieldError(fieldId, errSpanId, msgKey) {
        var fld = document.getElementById(fieldId);
        var err = document.getElementById(errSpanId);
        if (err) err.textContent = T(msgKey);
        if (fld) {
          fld.classList.add("field-err-input");
          try {
            fld.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch (_) {
          }
          try {
            fld.focus();
          } catch (_) {
          }
        }
        toast(T(msgKey), "warn");
      }
      _clearFieldErrors();
      var s = document.getElementById("dateStart").value;
      var e = document.getElementById("dateEnd").value;
      var nameVal = (document.getElementById("sprintName").value || "").trim();
      var draftName = T("newSprintDraftName");
      if (!nameVal || nameVal === draftName) {
        _showFieldError("sprintName", "errName", "toastSprintNameRequired");
        return;
      }
      if (!s) {
        _showFieldError("dateStart", "errDate", "toastSprintDateStartRequired");
        return;
      }
      if (!e) {
        _showFieldError("dateEnd", "errDate", "toastSprintDateEndRequired");
        return;
      }
      if (s && e && fromDateIn(e) < fromDateIn(s)) {
        _showFieldError("dateEnd", "errDate", "toastDateError");
        return;
      }
      _clearFieldErrors();
      _sprint.name = nameVal.substring(0, 60);
      _sprint.dateStart = fromDateIn(s);
      _sprint.dateEnd = fromDateIn(e);
      var sprintFv = document.getElementById("sprintFieldVal");
      var versionFv = document.getElementById("versionFieldVal");
      if (sprintFv) _sprint.sprintFieldVal = sprintFv.value || null;
      if (versionFv) _sprint.versionFieldVal = versionFv.value || null;
      var _goalElI = document.getElementById("sprintGoal");
      var _goalValI = _goalElI ? (_goalElI.value || "").trim() : "";
      _sprint.sprintGoal = _goalValI || void 0;
      _sprint.updatedAt = Date.now();
      _sprint.updatedBy = _currentUser ? _currentUser.login : null;
      var btn = document.getElementById("saveSprintIntroBtn");
      var origLabel = btn ? btn.textContent : null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = T("toastSaving");
      }
      _markDirty("sprint");
      _draftSet("sprint", _sprint);
      _draftSet("meta", { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
      apiPost("sprint-data", { sprint: _sprint }).then(function() {
        if (btn) {
          btn.disabled = false;
          btn.textContent = origLabel || T("btnSaveSprintIntro");
        }
        toast(T("toastSprintSaved"), "success");
        if (!_goalValI) {
          setTimeout(function() {
            toast(T("toastSprintGoalMissing"), "warn");
          }, 400);
        }
        if (_sprint && _sprint.sprintId && _currentSprintId !== _sprint.sprintId) {
          _currentSprintId = _sprint.sprintId;
          var _uiNew = _draftGet("ui") || {};
          _uiNew.currentSprintId = _currentSprintId;
          _draftSet("ui", _uiNew);
        }
        if (typeof renderWidgetHeader === "function") {
          try {
            renderWidgetHeader();
          } catch (_) {
          }
        }
      }).catch(function(err) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = origLabel || T("btnSaveSprintIntro");
        }
        toast(T("toastSaveError") + ": " + (err && err.message ? err.message : err));
      });
    }
    function openConfirmGoalDialog(sprintGoalText, existingOutcome) {
      return new Promise(function(resolve) {
        var overlay = document.getElementById("confirmGoalOverlay");
        if (!overlay) {
          resolve({ goalOutcome: "achieved", goalRetroNote: "" });
          return;
        }
        var goalDisplay = document.getElementById("confirmGoalDisplay");
        var goalNotSet = document.getElementById("confirmGoalNotSet");
        var goalText = document.getElementById("confirmGoalText");
        var goalVal = sprintGoalText;
        if (goalVal) {
          if (goalDisplay) {
            goalDisplay.style.display = "";
          }
          if (goalNotSet) {
            goalNotSet.style.display = "none";
          }
          if (goalText) {
            goalText.textContent = goalVal;
          }
        } else {
          if (goalDisplay) {
            goalDisplay.style.display = "none";
          }
          if (goalNotSet) {
            goalNotSet.style.display = "";
          }
        }
        var radios = overlay.querySelectorAll('input[name="goalOutcomeRadio"]');
        radios.forEach(function(r) {
          r.checked = existingOutcome ? r.value === existingOutcome : false;
        });
        var retroEl = document.getElementById("goalRetroNote");
        if (retroEl) retroEl.value = "";
        var okBtn = document.getElementById("confirmGoalOk");
        if (okBtn) okBtn.disabled = !existingOutcome;
        if (retroEl) retroEl.placeholder = T("phGoalRetroNote");
        function onRadioChange() {
          if (okBtn) okBtn.disabled = !Array.from(radios).some(function(r) {
            return r.checked;
          });
        }
        radios.forEach(function(r) {
          r.addEventListener("change", onRadioChange);
        });
        var cancelBtn = document.getElementById("confirmGoalCancel");
        function cleanup() {
          overlay.classList.add("hidden");
          radios.forEach(function(r) {
            r.removeEventListener("change", onRadioChange);
          });
          if (okBtn) okBtn.removeEventListener("click", onOk);
          if (cancelBtn) cancelBtn.removeEventListener("click", onCancel);
        }
        function onOk() {
          var chosen = Array.from(radios).find(function(r) {
            return r.checked;
          });
          if (!chosen) return;
          var retroVal = retroEl ? (retroEl.value || "").trim() : "";
          cleanup();
          resolve({ goalOutcome: chosen.value, goalRetroNote: retroVal || void 0 });
        }
        function onCancel() {
          cleanup();
          resolve(null);
        }
        if (okBtn) okBtn.addEventListener("click", onOk);
        if (cancelBtn) cancelBtn.addEventListener("click", onCancel);
        try {
          _showOverlay(overlay);
        } catch (_) {
          overlay.classList.remove("hidden");
        }
      });
    }
    (function bindStandupRefreshHandler() {
      function bind() {
        var btn = document.getElementById("standupRefreshBtn");
        if (btn && !btn.dataset.bound) {
          btn.dataset.bound = "1";
          btn.addEventListener("click", function() {
            doStandupRefresh();
          });
        }
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bind);
      } else {
        bind();
      }
    })();
    (function bindSaveSprintIntroHandler() {
      function bind() {
        var btn = document.getElementById("saveSprintIntroBtn");
        if (btn && !btn.dataset.bound) {
          btn.dataset.bound = "1";
          btn.addEventListener("click", function() {
            doSaveSprintIntro();
          });
        }
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bind);
      } else {
        bind();
      }
    })();
    function doNewSprint(rk) {
      var draftName = T("newSprintDraftName");
      var isActiveDraft = _sprint && _sprint.status === STATUS.PLANNING && (!_sprint.name || _sprint.name === draftName);
      if (isActiveDraft) {
        _sprint.name = draftName;
        _sprint.dateStart = null;
        _sprint.dateEnd = null;
        ALL_ROLES.forEach(function(r) {
          _sprint[r.resKey] = 0;
        });
      } else {
        _sprint = {
          sprintId: uid(),
          name: draftName,
          dateStart: null,
          dateEnd: null,
          status: STATUS.PLANNING
        };
        ALL_ROLES.forEach(function(r) {
          _sprint[r.resKey] = 0;
        });
      }
      _roleItems = {};
      var editBanner = document.getElementById("editHistBanner");
      if (editBanner) {
        editBanner.style.display = "none";
        editBanner.textContent = "";
      }
      if (_sprint && _sprint.sprintId) {
        _currentSprintId = _sprint.sprintId;
        var _uiNS = _draftGet("ui") || {};
        _uiNS.currentSprintId = _currentSprintId;
        _draftSet("ui", _uiNS);
      }
      var planBtn = document.querySelector('.tab-btn[data-tab="planning"]');
      if (planBtn && !planBtn.classList.contains("active")) planBtn.click();
      var rolesBtn = document.querySelector('.planning-level-btn[data-level="roles"]');
      if (rolesBtn) rolesBtn.click();
      var postData = { sprint: _sprint, roleItems: _roleItems };
      apiPost("sprint-data", postData).then(function() {
        getActiveRoles().forEach(function(r) {
          renderRolePlannerHeader(r.key);
          renderRoleComposition(r.key);
          updateRoleRemaining(r.key);
        });
        if (typeof renderWidgetHeader === "function") {
          try {
            renderWidgetHeader();
          } catch (_) {
          }
        }
        toast(T("toastSprintCreated"), "success");
        setTimeout(function() {
          var nameEl = document.getElementById("sprintName");
          if (nameEl) {
            try {
              nameEl.focus();
              nameEl.select();
            } catch (_) {
            }
          }
        }, 50);
      });
    }
    function _renderExternalTicketCell(val) {
      if (!val) return '<td style="color:var(--muted)">\u2014</td>';
      var safe = esc(String(val));
      var style = 'style="max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"';
      if (/^https?:\/\//i.test(val)) {
        return "<td " + style + ' title="' + safe + '"><a href="' + safeUrl(val) + '" target="_blank" rel="noopener noreferrer" class="link">' + safe + "</a></td>";
      }
      return "<td " + style + ' title="' + safe + '">' + safe + "</td>";
    }
    function getRoleItemsArr(rk) {
      if (!_roleItems[rk]) _roleItems[rk] = [];
      return _roleItems[rk];
    }
    function renderRoleComposition(rk) {
      var tbody = document.getElementById("compBody_" + rk);
      if (!tbody) {
        diag("renderRoleComposition(" + rk + "): tbody NOT FOUND", "err");
        return;
      }
      var items = getRoleItemsArr(rk);
      var has = items.length > 0;
      diag("renderRoleComposition(" + rk + "): items.length=" + items.length + " tbody=yes has=" + has, "info");
      var clearBtn = document.getElementById("clearBtn_" + rk);
      var recalcBtn = document.getElementById("recalcBtn_" + rk);
      var refreshBtn = document.getElementById("refreshBtn_" + rk);
      if (clearBtn) clearBtn.disabled = !has;
      if (recalcBtn) recalcBtn.disabled = !has;
      if (refreshBtn) refreshBtn.disabled = !has;
      if (!has) {
        var extColInc = _settings && _settings.fieldExternalTicketId ? 1 : 0;
        var sysColInc = _settings && _settings.fieldSystem ? 1 : 0;
        var xpColInc = _settings && _settings.fieldXPriority ? 1 : 0;
        var baseCount = _settings && _settings.dynEditEnabled ? 10 : 8;
        var colCount = baseCount + extColInc + sysColInc + xpColInc;
        tbody.innerHTML = '<tr><td colspan="' + colCount + '" class="empty">' + T("compSprintEmpty") + "</td></tr>";
        var pagEl = document.getElementById("planPag_" + rk);
        if (pagEl) pagEl.style.display = "none";
        return;
      }
      var thead = document.getElementById("compHead_" + rk);
      var _roleForHead = thead ? ALL_ROLES.find(function(r) {
        return r.key === rk;
      }) : null;
      if (thead && _roleForHead) {
        buildRoleTableHeader(thead, _roleForHead, _settings && _settings.dynEditEnabled);
        _bindSortHeaders(thead);
      }
      var pageNum = items._page || 1;
      var total = Math.ceil(items.length / PAGE_SIZE);
      pageNum = Math.min(pageNum, total);
      items._page = pageNum;
      var sortedItems = typeof multiKeySort === "function" ? multiKeySort(items) : items;
      var start = (pageNum - 1) * PAGE_SIZE;
      var page = sortedItems.slice(start, start + PAGE_SIZE);
      var dynEdit = _settings && _settings.dynEditEnabled;
      function fmtDelta(val) {
        if (val === null || val === void 0) return '<span style="color:var(--muted)">\u2014</span>';
        var s = fmtHoursOnly(Math.abs(val));
        if (val < 0) return '<span class="delta-neg">\u2212' + s + "</span>";
        return s;
      }
      tbody.innerHTML = "";
      var snapItems = _serverSnapshotRoleItems && _serverSnapshotRoleItems[rk] || [];
      var snapByIssue = {};
      snapItems.forEach(function(it) {
        if (it && it.issueId) snapByIssue[it.issueId] = it;
      });
      var isLocked = !!(_sprint && _sprint.status === STATUS.ALLOCATED);
      var roAttr = isLocked ? ' readonly="readonly" tabindex="-1"' : "";
      page.forEach(function(item, li) {
        var gi = start + li;
        var est = item["estimate_" + rk];
        var fact = item["fact_" + rk];
        var delta = est !== null && est !== void 0 ? fact !== null && fact !== void 0 ? (est || 0) - (fact || 0) : est || 0 : null;
        var tr = document.createElement("tr");
        var snap = snapByIssue[item.issueId];
        if (!snap || JSON.stringify({ a: item["alloc_" + rk], i: item.inclusionStatus, e: item["estimate_" + rk], f: item["fact_" + rk] }) !== JSON.stringify({ a: snap["alloc_" + rk], i: snap.inclusionStatus, e: snap["estimate_" + rk], f: snap["fact_" + rk] })) {
          tr.classList.add("tr--dirty-row");
          tr.setAttribute("title", T("tooltipDirtyRow"));
        }
        if (isLocked) {
          tr.classList.add("tr--locked");
          tr.setAttribute("title", T("tooltipRowLocked"));
        }
        var alloc = item["alloc_" + rk];
        var allocDefault = delta !== null && delta !== void 0 ? Math.max(0, delta) : null;
        var allocVal = alloc !== null && alloc !== void 0 ? alloc : allocDefault;
        var allocDisplay = allocVal !== null && allocVal !== void 0 ? fmtPeriod(allocVal) : "";
        var iidAttr = esc(item.issueId || "");
        var allocCell = '<td class="td-num"><input type="text" class="alloc-input" data-iid="' + iidAttr + '" data-rk="' + rk + '" value="' + esc(allocDisplay) + '" placeholder="\u2014"' + roAttr + "/></td>";
        var resCell;
        if (dynEdit) {
          var estDisplay = est !== null && est !== void 0 ? fmtPeriod(est) : "";
          var factDisplay = fact !== null && fact !== void 0 ? fmtHoursOnly(fact) : '<span style="color:var(--muted)">\u2014</span>';
          resCell = '<td class="td-num"><input type="text" class="dyn-period-input" data-iid="' + iidAttr + '" data-rk="' + rk + '" value="' + esc(estDisplay) + '" placeholder="\u2014" style="min-width:70px"' + roAttr + '/></td><td class="td-num">' + factDisplay + '</td><td class="td-num">' + fmtDelta(delta) + "</td>" + allocCell;
        } else {
          resCell = '<td class="td-num">' + fmtDelta(delta) + "</td>" + allocCell;
        }
        var stateCell;
        if (dynEdit && _settings && _settings.fieldState) {
          stateCell = '<td><span class="dyn-enum-cell" data-iid="' + iidAttr + '" data-rk="' + rk + '" data-field="fieldState" style="cursor:pointer;text-decoration:underline dotted;color:var(--primary)">' + esc(localizeEnumVal(item.state) || "\u2014") + "</span></td>";
        } else {
          stateCell = "<td>" + esc(localizeEnumVal(item.state) || "\u2014") + "</td>";
        }
        var systemCell, priorityCell, xpriorityCell;
        var dynStyle = "cursor:pointer;text-decoration:underline dotted;color:var(--primary)";
        if (dynEdit && _settings && _settings.fieldSystem) {
          systemCell = '<td><span class="dyn-enum-cell" data-iid="' + iidAttr + '" data-rk="' + rk + '" data-field="fieldSystem" style="' + dynStyle + '">' + esc(item.system || "\u2014") + "</span></td>";
        } else {
          systemCell = "<td>" + esc(item.system || "\u2014") + "</td>";
        }
        if (dynEdit && _settings && _settings.fieldPriority) {
          priorityCell = '<td><span class="dyn-enum-cell" data-iid="' + iidAttr + '" data-rk="' + rk + '" data-field="fieldPriority" style="' + dynStyle + '">' + esc(localizeEnumVal(item.priority) || "\u2014") + "</span></td>";
        } else {
          priorityCell = "<td>" + esc(localizeEnumVal(item.priority) || "\u2014") + "</td>";
        }
        if (dynEdit && _settings && _settings.fieldXPriority) {
          xpriorityCell = '<td><span class="dyn-enum-cell" data-iid="' + iidAttr + '" data-rk="' + rk + '" data-field="fieldXPriority" style="' + dynStyle + '">' + esc(localizeEnumVal(item.xpriority) || "\u2014") + "</span></td>";
        } else {
          xpriorityCell = "<td>" + esc(localizeEnumVal(item.xpriority) || "\u2014") + "</td>";
        }
        tr.innerHTML = '<td class="td-id"><a href="' + safeUrl(item.url) + '" target="_blank" class="link">' + esc(item.issueId) + "</a></td>" + /* v1.8.0 D130 — externalTicketId cell (2nd position, right after issue ID link). */
        (_settings && _settings.fieldExternalTicketId ? _renderExternalTicketCell(item.externalTicketId) : "") + /* v1.8.1 — System / XPriority cells показываются только если поле настроено. */
        (_settings && _settings.fieldSystem ? systemCell : "") + priorityCell + (_settings && _settings.fieldXPriority ? xpriorityCell : "") + stateCell + '<td class="td-title">' + esc(item.title || "") + "</td>" + resCell + '<td><select class="inc-sel" data-iid="' + iidAttr + '" data-rk="' + rk + '">' + Object.values(INC).map(function(v) {
          return '<option value="' + v + '"' + (item.inclusionStatus === v ? " selected" : "") + ">" + esc(incLabel(v)) + "</option>";
        }).join("") + '</select></td><td><button class="ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly del-item-btn" data-iid="' + iidAttr + '" data-rk="' + rk + '" title="' + T("btnDeleteTitle") + '" aria-label="' + T("aria.btnDeleteRow") + '">' + icon("trash", T("aria.btnDeleteRow")).outerHTML + "</button></td>";
        tbody.appendChild(tr);
      });
      function _findIdxByIid(rkx, iidx) {
        var arr = getRoleItemsArr(rkx);
        for (var __i = 0; __i < arr.length; __i++) {
          if (arr[__i] && arr[__i].issueId === iidx) return __i;
        }
        return -1;
      }
      tbody.querySelectorAll(".inc-sel").forEach(function(sel) {
        sel.addEventListener("change", function(e) {
          var rk2 = e.target.dataset.rk;
          var iid = e.target.dataset.iid;
          var idx = _findIdxByIid(rk2, iid);
          if (idx < 0) {
            diag("inc-sel change: item iid=" + iid + " not found in role " + rk2, "warn");
            return;
          }
          getRoleItemsArr(rk2)[idx].inclusionStatus = e.target.value;
          updateRoleRemaining(rk2);
          _markDirty("roleItems");
          _draftSaveDebounced("roleItems", function() {
            return _roleItems;
          });
          apiPost("sprint-data", { roleItems: _roleItems });
        });
      });
      tbody.querySelectorAll(".del-item-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var rk2 = btn.dataset.rk;
          var iid = btn.dataset.iid;
          var idx = _findIdxByIid(rk2, iid);
          if (idx < 0) {
            diag("del-item-btn click: item iid=" + iid + " not found in role " + rk2, "warn");
            return;
          }
          getRoleItemsArr(rk2).splice(idx, 1);
          renderRoleComposition(rk2);
          updateRoleRemaining(rk2);
          _markDirty("roleItems");
          _draftSaveDebounced("roleItems", function() {
            return _roleItems;
          });
          apiPost("sprint-data", { roleItems: _roleItems });
        });
      });
      tbody.querySelectorAll(".alloc-input").forEach(function(inp) {
        inp.addEventListener("blur", function() {
          if (inp.readOnly) return;
          var rk2 = inp.dataset.rk;
          var iid = inp.dataset.iid;
          var idx = _findIdxByIid(rk2, iid);
          if (idx < 0) {
            diag("alloc-input blur: item iid=" + iid + " not found in role " + rk2, "warn");
            return;
          }
          var item = getRoleItemsArr(rk2)[idx];
          if (!item) return;
          var newVal = parsePeriod(inp.value);
          var oldVal = item["alloc_" + rk2];
          if (inp.value.trim() === "") newVal = null;
          if (newVal === oldVal) return;
          item["alloc_" + rk2] = newVal;
          if (newVal === null) {
            var est = item["estimate_" + rk2];
            var fact = item["fact_" + rk2];
            var delta = est !== null && est !== void 0 ? Math.max(0, (est || 0) - (fact || 0)) : null;
            inp.value = delta !== null ? fmtPeriod(delta) : "";
          } else {
            inp.value = fmtPeriod(newVal);
          }
          updateRoleRemaining(rk2);
          _markDirty("roleItems");
          _draftSaveDebounced("roleItems", function() {
            return _roleItems;
          });
          apiPost("sprint-data", { roleItems: _roleItems });
        });
      });
      if (dynEdit) {
        tbody.querySelectorAll(".dyn-period-input").forEach(function(inp) {
          inp.addEventListener("blur", function() {
            if (inp.readOnly) return;
            var rk2 = inp.dataset.rk;
            var iid = inp.dataset.iid;
            var idx = _findIdxByIid(rk2, iid);
            if (idx < 0) {
              diag("dyn-period-input blur: item iid=" + iid + " not found in role " + rk2, "warn");
              return;
            }
            var newVal = parsePeriod(inp.value);
            var item = getRoleItemsArr(rk2)[idx];
            var oldVal = item["estimate_" + rk2];
            if (newVal === oldVal) return;
            showDynFieldConfirm(
              T("dynModalTitle"),
              T("dynConfirmEst") + " " + item.issueId + " " + T("dynConfirmEstTo") + fmtPeriod(newVal) + "\xBB?",
              null,
              null,
              function(confirmed) {
                if (confirmed) {
                  item["estimate_" + rk2] = newVal;
                  updateIssueField(item.issueId, _settings[ALL_ROLES.find(function(r) {
                    return r.key === rk2;
                  }).fieldEst], newVal, "period");
                  updateRoleRemaining(rk2);
                  renderRoleComposition(rk2);
                  apiPost("sprint-data", { roleItems: _roleItems }).then(function() {
                    renderRoleComposition(rk2);
                  });
                } else {
                  inp.value = oldVal !== null && oldVal !== void 0 ? fmtPeriod(oldVal) : "";
                }
              }
            );
          });
        });
        tbody.querySelectorAll(".dyn-enum-cell").forEach(function(cell) {
          cell.addEventListener("click", /* @__PURE__ */ function(c) {
            return function() {
              var rk2 = c.dataset.rk;
              var iid = c.dataset.iid;
              var idx = _findIdxByIid(rk2, iid);
              if (idx < 0) {
                diag("dyn-enum-cell click: item iid=" + iid + " not found in role " + rk2, "warn");
                return;
              }
              var dataField = c.dataset.field;
              var item = getRoleItemsArr(rk2)[idx];
              var fieldName = _settings && _settings[dataField];
              if (!fieldName) return;
              var fieldTitleMap = { fieldState: T("dynFieldState"), fieldPriority: T("dynFieldPriority"), fieldXPriority: T("dynFieldXpriority"), fieldSystem: T("dynFieldSystem") };
              var itemKeyMap = { fieldState: "state", fieldPriority: "priority", fieldXPriority: "xpriority", fieldSystem: "system" };
              var fieldTitle = fieldTitleMap[dataField] || dataField;
              var itemKey = itemKeyMap[dataField] || dataField;
              var curVal = item[itemKey];
              loadEnumBundle(fieldName, function(values) {
                showDynFieldConfirm(
                  T("dynModalTitle") + " \xAB" + fieldTitle + "\xBB",
                  T("dynIssuePrefix") + item.issueId,
                  values,
                  curVal,
                  function(confirmed, newVal) {
                    if (confirmed && newVal !== null) {
                      item[itemKey] = newVal;
                      c.textContent = localizeEnumVal(newVal) || newVal;
                      updateIssueField(item.issueId, fieldName, newVal, "enum");
                      apiPost("sprint-data", { roleItems: _roleItems }).then(function() {
                        renderRoleComposition(rk2);
                      });
                    }
                  }
                );
              });
            };
          }(cell));
        });
      }
      var pagEl = document.getElementById("planPag_" + rk);
      if (pagEl) {
        if (total > 1) {
          pagEl.style.display = "flex";
          var infoEl = document.getElementById("planPageInfo_" + rk);
          if (infoEl) infoEl.textContent = T("pageOf") + pageNum + T("pageOfSep") + total;
          var prevEl = document.getElementById("planPrev_" + rk);
          var nextEl = document.getElementById("planNext_" + rk);
          if (prevEl) prevEl.disabled = pageNum <= 1;
          if (nextEl) nextEl.disabled = pageNum >= total;
        } else {
          pagEl.style.display = "none";
        }
      }
      _updateRoleAccordionStats(rk);
    }
    function showDynFieldConfirm(title, desc, enumValues, currentVal, callback) {
      _dynFieldCallback = callback;
      document.getElementById("dynFieldTitle").textContent = title;
      document.getElementById("dynFieldDesc").textContent = desc;
      var selEl = document.getElementById("dynFieldSelect");
      var inpEl = document.getElementById("dynFieldInput");
      if (enumValues) {
        selEl.style.display = "";
        inpEl.style.display = "none";
        selEl.innerHTML = "";
        enumValues.forEach(function(v) {
          var o = document.createElement("option");
          o.value = v;
          o.textContent = localizeEnumVal(v) || v;
          if (v === currentVal) o.selected = true;
          selEl.appendChild(o);
        });
      } else {
        selEl.style.display = "none";
        inpEl.style.display = "";
        inpEl.value = currentVal ? fmtPeriod(currentVal) : "";
        inpEl.focus();
      }
      _showOverlay("dynFieldOverlay");
    }
    document.getElementById("dynFieldNo").addEventListener("click", function() {
      document.getElementById("dynFieldOverlay").classList.add("hidden");
      if (_dynFieldCallback) {
        _dynFieldCallback(false, null);
        _dynFieldCallback = null;
      }
    });
    document.getElementById("dynFieldYes").addEventListener("click", function() {
      document.getElementById("dynFieldOverlay").classList.add("hidden");
      if (_dynFieldCallback) {
        var selEl = document.getElementById("dynFieldSelect");
        var inpEl = document.getElementById("dynFieldInput");
        var val = selEl.style.display !== "none" ? selEl.value : parsePeriod(inpEl.value);
        _dynFieldCallback(true, val);
        _dynFieldCallback = null;
      }
    });
    function loadEnumBundle(fieldName, cb) {
      if (!fieldName) {
        cb([]);
        return;
      }
      apiGet("field-values?fieldName=" + encodeURIComponent(fieldName)).then(function(r) {
        var edbg = r && r.debug;
        diag(
          "enum-bundle [" + fieldName + "]: success=" + !!(r && r.success) + " count=" + (r && r.values ? r.values.length : 0) + " typeName=" + (edbg && edbg.typeName || "?") + (edbg && edbg.error ? " ERR=" + edbg.error : "") + (edbg && edbg.method ? " method=" + edbg.method : "") + (edbg && edbg.allFieldNames ? " fields=" + edbg.allFieldNames.length : "") + (edbg && !edbg.found && edbg.allFieldNames ? " NOT in [" + edbg.allFieldNames.slice(0, 3).join(",") + "]" : ""),
          r && r.success && r.values && r.values.length ? "ok" : "warn"
        );
        if (r && r.success && r.values && r.values.length) {
          cb(r.values);
        } else {
          cb([]);
        }
      }).catch(function(e) {
        diag("enum-bundle [" + fieldName + "] ERR: " + String(e && e.message ? e.message : e), "err");
        cb([]);
      });
    }
    function updateIssueField(issueId, fieldName, value, type) {
      apiPost("update-issue-field", { issueId, fieldName, value, type: type || "enum" }).then(function(r) {
        if (!r || !r.success) diag("updateIssueField WARN: " + (r && r.error ? r.error : "unknown"), "err");
        else diag("updateIssueField OK: " + issueId + " " + fieldName + "=" + value, "ok");
      }).catch(function(e) {
        diag("updateIssueField ERR: " + String(e && e.message ? e.message : e), "err");
      });
    }
    function refreshRoleEstimates(rk) {
      var items = getRoleItemsArr(rk);
      if (!items.length) return;
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      if (!role) return;
      var btn = document.getElementById("refreshBtn_" + rk);
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> ' + T("btnRefreshLoading");
      }
      var p = Promise.resolve();
      items.forEach(function(item) {
        p = p.then(function() {
          return _host.fetchYouTrack("issues/" + item.issueId, {
            query: { fields: "id,idReadable,summary,customFields(name,projectCustomField(field(name)),value(name,localizedName,presentation,minutes,login))" }
          }).then(function(issue) {
            if (!issue) return;
            var cfs = issue.customFields || [];
            function findCf(fname) {
              return cfs.find(function(cf) {
                var fn = cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name || cf.name || "";
                return fn === fname;
              });
            }
            function getMin(fname) {
              var f = findCf(fname);
              return f && f.value && f.value.minutes !== void 0 ? f.value.minutes : null;
            }
            function getStr(fname) {
              var f = findCf(fname);
              if (!f || f.value === null || f.value === void 0) return "";
              var v = f.value;
              if (typeof v === "string") return v;
              return v.localizedName || v.presentation || v.name || "";
            }
            if (_settings && _settings[role.fieldEst]) item["estimate_" + rk] = getMin(_settings[role.fieldEst]);
            if (_settings && _settings[role.fieldFact]) item["fact_" + rk] = getMin(_settings[role.fieldFact]);
            if (_settings && _settings.fieldPriority) item.priority = getStr(_settings.fieldPriority);
            if (_settings && _settings.fieldXPriority) item.xpriority = getStr(_settings.fieldXPriority);
            if (_settings && _settings.fieldState) item.state = getStr(_settings.fieldState);
            if (_settings && _settings.fieldSystem) item.system = getStr(_settings.fieldSystem);
            if (_settings && _settings.fieldExternalTicketId) item.externalTicketId = getStr(_settings.fieldExternalTicketId);
            if (!item.url || item.url.indexOf("/null/") >= 0) {
              item.url = _ytBase + "/issue/" + (issue.idReadable || item.issueId);
            }
            if (!item.title || item.title === item.issueId) {
              item.title = issue.summary || item.issueId;
            }
          }).catch(function() {
          });
        });
      });
      p.then(function() {
        return apiPost("sprint-data", { roleItems: _roleItems });
      }).then(function() {
        renderRoleComposition(rk);
        updateRoleRemaining(rk);
        toast(T("toastEstUpdated"), "success");
      }).finally(function() {
        if (btn) {
          btn.disabled = items.length === 0;
          btn.textContent = T("btnRefreshTasks");
        }
      });
    }
    function doValidateRole(rk) {
      if (!_settings) {
        toast(T("toastFillSettings"));
        return;
      }
      if (!_sprint || !_sprint.dateStart || !_sprint.dateEnd) {
        toast(T("toastFillDates"));
        return;
      }
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      if (!role) return;
      if (!(_sprint[role.resKey] > 0)) {
        toast(T("toastFillResource"));
        return;
      }
      var active = getRoleItemsArr(rk).filter(function(i) {
        return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0;
      });
      if (!active.length) {
        toast(T("toastNoActiveTasks"));
        return;
      }
      var btn = document.getElementById("validateBtn_" + rk);
      if (btn) {
        btn.disabled = true;
        btn.textContent = T("toastChecking");
      }
      checkValidatorNow().then(function(ok) {
        _isValidator = ok;
        if (btn) {
          btn.disabled = false;
          btn.textContent = T("btnValidate");
        }
        if (!ok) {
          toast(T("toastNoValidRights"));
          return;
        }
        _sprint.status = STATUS.CONFIRMED;
        diag("[VALIDATE-COMPOSITION] role=" + rk + " set _sprint.status=" + _sprint.status + " wcKey=" + _activeWorkingDraftKey, "info");
        apiPost("sprint-data", { sprint: _sprint, roleItems: _roleItems }, { action: "validate" }).then(function(resp) {
          if (resp && Array.isArray(resp.warnings) && resp.warnings.length) {
            resp.warnings.forEach(function(w) {
              if (typeof w === "string" && w.indexOf("overlimit:") === 0) {
                var rkw = w.split(":")[1] || "";
                var roleW = ALL_ROLES.find(function(r) {
                  return r.key === rkw;
                });
                var label = roleW ? roleW.label : rkw;
                toast(T("overlimitWarnSrv").replace("{role}", label), "err");
              }
            });
          }
          return saveRoleHistorySnapshot(
            rk,
            void 0,
            void 0,
            /* wasValidated */
            true
          );
        }).then(function() {
          var _diagSnap = _history.find(function(h) {
            return h && h.sprintId === _sprint.sprintId + "_" + rk;
          });
          diag("[VALIDATE-COMPOSITION] role=" + rk + " after snap: _history.status=" + (_diagSnap ? _diagSnap.status : "NOT_FOUND") + " _sprint.status=" + _sprint.status, "info");
          if (_sprint) {
            _sprint.editingFromHistory = false;
            delete _sprint.historyIdx;
          }
          _activeWorkingDraftKey = null;
          if (typeof hideWorkingCopyBanner === "function") hideWorkingCopyBanner();
          var editBanner = document.getElementById("editHistBanner");
          if (editBanner) {
            editBanner.style.display = "none";
            editBanner.textContent = "";
          }
          renderRoleStatusBadge(rk);
          if (typeof renderWidgetHeader === "function") {
            try {
              renderWidgetHeader();
            } catch (_) {
            }
          }
          var ss = document.getElementById("sprintStatus_" + rk);
          if (ss) ss.style.display = "none";
          var newBtn = document.getElementById("newSprintBtn_" + rk);
          if (newBtn) newBtn.style.display = "";
          if (btn) {
            btn.disabled = false;
            btn.textContent = T("btnValidate");
          }
          toast(T("toastSprintConfirmed").replace("{role}", roleLabel(role)), "success");
        }).catch(function(e) {
          if (btn) {
            btn.disabled = false;
            btn.textContent = T("btnValidate");
          }
          toast(T("toastSaveError") + ": " + (e && e.message ? e.message : String(e)), "error");
        });
      }).catch(function() {
        if (btn) {
          btn.disabled = false;
          btn.textContent = T("btnValidate");
        }
        toast(T("toastCheckError"));
      });
    }
    function saveRoleHistorySnapshot(rk, overrideIdx, goalFields, wasValidated) {
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      if (!role || !_sprint) return Promise.resolve();
      var items = getRoleItemsArr(rk);
      var activeItems = items.filter(function(i) {
        return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0;
      });
      var rem = calcRemForRole(rk);
      var isOverLimit = rem < 0;
      var resolvedStatus;
      if (wasValidated === true) {
        resolvedStatus = STATUS.CONFIRMED;
      } else {
        var existingSnap = _history.find(function(s) {
          return s && s.sprintId === _sprint.sprintId + "_" + rk;
        });
        resolvedStatus = existingSnap && existingSnap.status ? existingSnap.status : STATUS.PLANNING;
      }
      var snap = {
        sprintId: _sprint.sprintId + "_" + rk,
        roleKey: rk,
        roleLabel: role.label,
        dateStart: _sprint.dateStart,
        dateEnd: _sprint.dateEnd,
        name: _sprint.name || null,
        status: resolvedStatus,
        confirmedAt: Date.now(),
        confirmedBy: _currentUser ? _currentUser.fullName || _currentUser.login : null,
        isOverLimit,
        settings: _settings,
        sprintFieldVal: _sprint.sprintFieldVal || null,
        versionFieldVal: _sprint.versionFieldVal || null
      };
      snap[role.resKey] = _sprint[role.resKey] || 0;
      snap[role.remKey] = rem;
      snap.items = activeItems.map(function(i) {
        var obj = {
          issueId: i.issueId,
          url: i.url,
          title: i.title,
          priority: i.priority,
          xpriority: i.xpriority,
          state: i.state,
          system: i.system,
          inclusionStatus: i.inclusionStatus
        };
        if (i.externalTicketId !== void 0 && i.externalTicketId !== null && i.externalTicketId !== "") {
          obj.externalTicketId = i.externalTicketId;
        }
        obj["estimate_" + rk] = i["estimate_" + rk];
        obj["fact_" + rk] = i["fact_" + rk];
        obj["alloc_" + rk] = i["alloc_" + rk] !== void 0 ? i["alloc_" + rk] : null;
        return obj;
      });
      var ppToSnap = isActiveSprintRecord(_currentSprintRoleRec) && _currentRolePP ? _currentRolePP : _sprint.personalPlanning || null;
      snap.personalPlanning = deepClone(ppToSnap);
      if (_sprint.sprintGoal) snap.sprintGoal = _sprint.sprintGoal;
      if (goalFields) {
        if (goalFields.goalOutcome) snap.goalOutcome = goalFields.goalOutcome;
        if (goalFields.goalRetroNote) snap.goalRetroNote = goalFields.goalRetroNote;
      }
      var snapKey = snap.sprintId;
      if (overrideIdx === void 0 && _activeWorkingDraftKey === snapKey && _workingDrafts[snapKey]) {
        var draft = _workingDrafts[snapKey];
        var commitIdx = _history.findIndex(function(h) {
          return h.sprintId === snapKey;
        });
        if (commitIdx >= 0) {
          var baseSnap = _history[commitIdx];
          var currentHash = computeBaseSnapshotHash(baseSnap);
          if (draft.baseSnapshotHash && currentHash !== draft.baseSnapshotHash) {
            if (typeof showWorkingCopyConflictModal === "function") {
              showWorkingCopyConflictModal(snapKey, baseSnap, snap, function(decision) {
                if (decision === "overwrite") {
                  _commitWorkingCopy(rk, commitIdx, draft, snap);
                } else if (decision === "export" && typeof exportConflictToExcel === "function") {
                  exportConflictToExcel(baseSnap, snap);
                }
              });
              return Promise.resolve();
            }
          }
          return _commitWorkingCopy(rk, commitIdx, draft, snap);
        }
        diag("saveRoleHistorySnapshot: working copy without base snap, fallback to insert", "warn");
      }
      var idx = -1;
      if (overrideIdx !== void 0) {
        idx = overrideIdx;
      } else {
        idx = _history.findIndex(function(h) {
          return h.sprintId === snap.sprintId;
        });
      }
      if (idx >= 0) _history[idx] = snap;
      else _history.unshift(snap);
      return apiPost("history", { history: _history }).then(function() {
        renderHistory();
      });
    }
    document.getElementById("clearNo").addEventListener("click", function() {
      document.getElementById("clearOverlay").classList.add("hidden");
    });
    document.getElementById("clearYes").addEventListener("click", function() {
      document.getElementById("clearOverlay").classList.add("hidden");
      var rk = document.getElementById("clearYes").dataset.roleKey;
      if (!rk) return;
      _roleItems[rk] = [];
      apiPost("sprint-data", { roleItems: _roleItems }).then(function() {
        renderRoleComposition(rk);
        updateRoleRemaining(rk);
        toast(T("toastCleared"), "success");
      });
    });
    document.getElementById("closePickModal").addEventListener("click", function() {
      document.getElementById("pickOverlay").classList.add("hidden");
      _pickAllResults = /* @__PURE__ */ new Map();
      _pickQueryFingerprint = "";
    });
    document.getElementById("cancelPickBtn").addEventListener("click", function() {
      document.getElementById("pickOverlay").classList.add("hidden");
      _pickAllResults = /* @__PURE__ */ new Map();
      _pickQueryFingerprint = "";
    });
    document.getElementById("pickSearchBtn").addEventListener("click", function() {
      _pickPage = 1;
      doPickSearch();
    });
    document.getElementById("pickQuery").addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        _pickPage = 1;
        doPickSearch();
      }
    });
    function _buildPickQuery() {
      var q = document.getElementById("pickQuery").value.trim();
      var projectId = _ctx && _ctx.project ? _ctx.project.shortName || _ctx.project.id : null;
      var fullQuery = q;
      if (projectId && q.toLowerCase().indexOf("project:") < 0) {
        fullQuery = "project: " + projectId + (q ? " " + q : "");
      }
      return { fullQuery, fingerprint: fullQuery + "|" + (projectId || "") };
    }
    function _mapIssueMeta(iss) {
      var cfs = iss.customFields || [];
      function cfValPres(names) {
        if (!names || !names.length) return null;
        for (var ni = 0; ni < names.length; ni++) {
          var target = names[ni];
          if (!target) continue;
          var f = null;
          for (var ci = 0; ci < cfs.length; ci++) {
            var cf = cfs[ci];
            var fn = cf.projectCustomField && cf.projectCustomField.field && cf.projectCustomField.field.name || cf.name || "";
            if (fn === target) {
              f = cf;
              break;
            }
          }
          if (f && f.value !== null && f.value !== void 0) {
            var v = f.value;
            if (typeof v === "string") return v;
            if (v && v.localizedName) return v.localizedName;
            if (v && v.presentation) return v.presentation;
            if (v && v.name) return v.name;
          }
        }
        return null;
      }
      var stateField = _settings && _settings.fieldState || null;
      var priorityField = _settings && _settings.fieldPriority || null;
      var xpField = _settings && _settings.fieldXPriority || null;
      var systemField = _settings && _settings.fieldSystem || null;
      var extTicketField = _settings && _settings.fieldExternalTicketId || null;
      return {
        id: iss.id,
        idReadable: iss.idReadable || iss.id,
        summary: iss.summary && iss.summary.trim() || null,
        state: { name: cfValPres(stateField ? [stateField, "State", "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435"] : ["State", "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435"]) || "\u2014" },
        priority: cfValPres(priorityField ? [priorityField, "Priority", "\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442"] : ["Priority", "\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442"]),
        xpriority: cfValPres(xpField ? [xpField, "\u0421\u043A\u0432\u043E\u0437\u043D\u043E\u0439 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442"] : ["\u0421\u043A\u0432\u043E\u0437\u043D\u043E\u0439 \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442"]),
        system: systemField ? cfValPres([systemField]) : null,
        externalTicketId: extTicketField ? cfValPres([extTicketField]) : null
      };
    }
    function doPickSearch() {
      document.getElementById("pickResults").innerHTML = '<div class="empty"><span class="spinner"></span> ' + T("pickSearching") + "</div>";
      var qInfo = _buildPickQuery();
      if (qInfo.fingerprint !== _pickQueryFingerprint) {
        _pickAllResults = /* @__PURE__ */ new Map();
        _selectedIds = /* @__PURE__ */ new Set();
        _pickQueryFingerprint = qInfo.fingerprint;
      }
      var skip = (_pickPage - 1) * PICK_PAGE;
      _host.fetchYouTrack("issues", {
        query: {
          fields: "id,idReadable,summary,customFields(name,projectCustomField(field(name)),value(name,localizedName,presentation,minutes,login))",
          query: qInfo.fullQuery,
          $skip: skip,
          $top: PICK_PAGE + 1
        }
      }).then(function(issues) {
        if (!Array.isArray(issues) || !issues.length) {
          document.getElementById("pickResults").innerHTML = '<div class="empty">' + T("tasksNotFound") + "</div>";
          document.getElementById("pickPag").style.display = "none";
          _pickResults = [];
          return;
        }
        _pickHasMore = issues.length > PICK_PAGE;
        if (_pickHasMore) issues = issues.slice(0, PICK_PAGE);
        _pickResults = issues.map(_mapIssueMeta);
        _pickResults.forEach(function(it) {
          _pickAllResults.set(it.idReadable, it);
        });
        renderPickResults();
      }).catch(function(e) {
        var msg = e && e.message ? e.message : String(e);
        document.getElementById("pickResults").innerHTML = '<div class="empty" style="color:var(--error)">' + T("pickError") + esc(msg) + "</div>";
        document.getElementById("pickPag").style.display = "none";
      });
    }
    function loadAllPickPages() {
      var qInfo = _buildPickQuery();
      if (qInfo.fingerprint !== _pickQueryFingerprint) {
        _pickAllResults = /* @__PURE__ */ new Map();
        _selectedIds = /* @__PURE__ */ new Set();
        _pickQueryFingerprint = qInfo.fingerprint;
      }
      var pageIdx = Math.ceil(_pickAllResults.size / PICK_PAGE) || 0;
      var capped = false;
      function loop() {
        if (_pickAllResults.size >= MAX_PICK_TOTAL) {
          capped = true;
          return Promise.resolve();
        }
        return _host.fetchYouTrack("issues", {
          query: {
            fields: "id,idReadable,summary,customFields(name,projectCustomField(field(name)),value(name,localizedName,presentation,minutes,login))",
            query: qInfo.fullQuery,
            $skip: pageIdx * PICK_PAGE,
            $top: PICK_PAGE + 1
          }
        }).then(function(issues) {
          if (!Array.isArray(issues) || !issues.length) return;
          var hasMore = issues.length > PICK_PAGE;
          if (hasMore) issues = issues.slice(0, PICK_PAGE);
          issues.map(_mapIssueMeta).forEach(function(it) {
            _pickAllResults.set(it.idReadable, it);
          });
          pageIdx++;
          if (hasMore) return loop();
        });
      }
      return loop().then(function() {
        return { totalLoaded: _pickAllResults.size, capped };
      });
    }
    function updatePickAllIndicator() {
      var pickAll = document.getElementById("pickAll");
      if (!pickAll) return;
      var rk = _currentPickRole;
      var existingInRole = new Set((rk ? getRoleItemsArr(rk) : []).map(function(i) {
        return i.issueId;
      }));
      var enabledTotal = 0, enabledChecked = 0;
      _pickAllResults.forEach(function(_, id) {
        if (existingInRole.has(id)) return;
        enabledTotal++;
        if (_selectedIds.has(id)) enabledChecked++;
      });
      if (enabledTotal === 0) {
        pickAll.checked = false;
        pickAll.indeterminate = false;
      } else if (enabledChecked === 0) {
        pickAll.checked = false;
        pickAll.indeterminate = false;
      } else if (enabledChecked === enabledTotal) {
        pickAll.checked = true;
        pickAll.indeterminate = false;
      } else {
        pickAll.checked = false;
        pickAll.indeterminate = true;
      }
    }
    function renderPickResults() {
      var container = document.getElementById("pickResults");
      if (!_pickResults.length) {
        container.innerHTML = '<div class="empty">' + T("tasksNotFound") + "</div>";
        document.getElementById("pickPag").style.display = "none";
        return;
      }
      var rk = _currentPickRole;
      var existingInRole = new Set(getRoleItemsArr(rk).map(function(i) {
        return i.issueId;
      }));
      var wrap = document.createElement("div");
      wrap.className = "tbl-wrap";
      var tbl = document.createElement("table");
      tbl.className = "tbl";
      tbl.innerHTML = '<thead><tr><th style="width:36px"><input type="checkbox" id="pickAll" title="' + esc(T("titlePickAll")) + '"/></th><th>ID</th><th>' + T("thState") + '</th><th style="min-width:220px">' + T("thTitle") + "</th><th>" + T("thPriority") + "</th></tr></thead><tbody></tbody>";
      var tbody = tbl.querySelector("tbody");
      _pickResults.forEach(function(issue) {
        var isAdded = existingInRole.has(issue.idReadable);
        var tr = document.createElement("tr");
        if (isAdded) tr.style.opacity = ".5";
        tr.innerHTML = '<td style="text-align:center"><input type="checkbox" class="pick-cb" data-id="' + esc(issue.idReadable) + '"' + (_selectedIds.has(issue.idReadable) ? " checked" : "") + (isAdded ? ' disabled title="' + T("alreadyInSprint") + '"' : "") + '/></td><td class="td-id"><span style="color:var(--primary);font-weight:600">' + esc(issue.idReadable) + '</span></td><td style="font-size:12px">' + esc(issue.state && issue.state.name ? issue.state.name : "\u2014") + '</td><td class="td-title">' + esc(issue.summary || issue.idReadable || "") + "</td><td>" + (issue.priority ? esc(issue.priority) : "\u2014") + "</td>";
        tbody.appendChild(tr);
      });
      wrap.appendChild(tbl);
      container.innerHTML = "";
      container.appendChild(wrap);
      tbl.querySelectorAll(".pick-cb").forEach(function(cb) {
        cb.addEventListener("change", function(e) {
          if (e.target.checked) _selectedIds.add(e.target.dataset.id);
          else _selectedIds.delete(e.target.dataset.id);
          updatePickAllIndicator();
        });
      });
      document.getElementById("pickAll").addEventListener("change", function(e) {
        var pickAll = e.target;
        var wantSelectAll = pickAll.checked;
        if (_pickAllInFlight) {
          pickAll.checked = !wantSelectAll;
          return;
        }
        if (!wantSelectAll) {
          _pickAllResults.forEach(function(_, id) {
            _selectedIds.delete(id);
          });
          renderPickResults();
          return;
        }
        _pickAllInFlight = true;
        pickAll.disabled = true;
        pickAll.indeterminate = false;
        toast(T("toastPickAllLoading"), "info");
        loadAllPickPages().then(function(res) {
          var existingInRole2 = new Set(getRoleItemsArr(_currentPickRole || "").map(function(i) {
            return i.issueId;
          }));
          _pickAllResults.forEach(function(_, id) {
            if (!existingInRole2.has(id)) _selectedIds.add(id);
          });
          _pickAllInFlight = false;
          pickAll.disabled = false;
          renderPickResults();
          if (res.capped) toast(T("toastPickAllLimit").replace("{n}", String(MAX_PICK_TOTAL)), "warn");
          else toast(T("toastPickAllLoaded").replace("{n}", String(_selectedIds.size)), "success");
        }).catch(function(e2) {
          _pickAllInFlight = false;
          pickAll.disabled = false;
          pickAll.checked = false;
          toast(T("toastPickAllErr") + ": " + (e2 && e2.message ? e2.message : e2), "error");
        });
      });
      var pag = document.getElementById("pickPag");
      pag.style.display = "flex";
      document.getElementById("pickPageInfo").textContent = T("pageOf") + _pickPage;
      document.getElementById("pickPrev").disabled = _pickPage <= 1;
      document.getElementById("pickNext").disabled = !_pickHasMore;
      updatePickAllIndicator();
    }
    document.getElementById("pickPrev").addEventListener("click", function() {
      _pickPage--;
      doPickSearch();
    });
    document.getElementById("pickNext").addEventListener("click", function() {
      _pickPage++;
      doPickSearch();
    });
    document.getElementById("addPickedBtn").addEventListener("click", function() {
      if (!_selectedIds.size) {
        toast(T("toastPickAtLeastOne"));
        return;
      }
      var rk = _currentPickRole;
      if (!rk) return;
      var existing = new Set(getRoleItemsArr(rk).map(function(i) {
        return i.issueId;
      }));
      var newIds = Array.from(_selectedIds).filter(function(id) {
        return !existing.has(id);
      });
      newIds.forEach(function(issueId) {
        var issue = _pickAllResults.get(issueId) || _pickResults.find(function(i) {
          return i.idReadable === issueId;
        });
        if (!issue) {
          diag("addPickedBtn: missing meta for " + issueId + " \u2014 using stub", "err");
          toast(T("toastPickPageMetaLost"), "warn");
          issue = { idReadable: issueId, summary: issueId, priority: "", state: { name: "" }, xpriority: "", system: "" };
        }
        var role = ALL_ROLES.find(function(r) {
          return r.key === rk;
        });
        var newItem = {
          issueId,
          url: _ytBase + "/issue/" + issueId,
          title: issue && issue.summary ? issue.summary : issueId,
          priority: issue && issue.priority ? issue.priority : "",
          xpriority: issue && issue.xpriority ? issue.xpriority : "",
          state: issue && issue.state ? issue.state.name : "",
          system: issue && issue.system ? issue.system : "",
          inclusionStatus: INC.PLANNED,
          addedAt: Date.now(),
          addedBy: _currentUser ? _currentUser.login : null
        };
        if (_settings && _settings.fieldExternalTicketId && issue && issue.externalTicketId) {
          newItem.externalTicketId = issue.externalTicketId;
        }
        newItem["estimate_" + rk] = null;
        newItem["fact_" + rk] = null;
        newItem["alloc_" + rk] = null;
        getRoleItemsArr(rk).push(newItem);
      });
      document.getElementById("pickOverlay").classList.add("hidden");
      var skipped = _selectedIds.size - newIds.length;
      _pickAllResults = /* @__PURE__ */ new Map();
      _pickQueryFingerprint = "";
      _selectedIds = /* @__PURE__ */ new Set();
      if (newIds.length) {
        _markDirty("roleItems");
        _draftSet("roleItems", _roleItems);
        _draftSet("meta", { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
      }
      apiPost("sprint-data", { sprint: _sprint, roleItems: _roleItems }).then(function() {
        renderRoleComposition(rk);
        updateRoleRemaining(rk);
        toast(T("toastPickDone") + ": " + newIds.length + (skipped ? " (" + T("toastDuplicates") + ": " + skipped + ")" : ""), "success");
        if (newIds.length) refreshRoleEstimates(rk);
      });
    });
    function renderHistory() {
      var container = document.getElementById("historyList");
      if (!_history.length) {
        container.innerHTML = '<div class="empty">' + T("emptyHistory") + "</div>";
        document.getElementById("histPag").style.display = "none";
        return;
      }
      _history.forEach(function(rec) {
        if (!rec.roleKey) {
          var fallbackRole = ALL_ROLES.find(function(r) {
            return r.key === (_settings && _settings.activeRoles && _settings.activeRoles[0] || "analysis");
          }) || ALL_ROLES[0];
          rec.roleKey = rec.roleKey || fallbackRole.key;
          rec.roleLabel = rec.roleLabel || fallbackRole.label;
        }
      });
      var sorted = _history.slice().sort(function(a, b) {
        return (b.confirmedAt || 0) - (a.confirmedAt || 0);
      });
      var total = Math.ceil(sorted.length / HIST_PAGE);
      _histPage = Math.min(_histPage, total);
      var start = (_histPage - 1) * HIST_PAGE;
      var page = sorted.slice(start, start + HIST_PAGE);
      container.innerHTML = "";
      page.forEach(function(rec, li) {
        container.appendChild(buildSpoiler(rec, start + li));
      });
      var pag = document.getElementById("histPag");
      if (total > 1) {
        pag.style.display = "flex";
        document.getElementById("histPageInfo").textContent = T("pageOf") + _histPage + T("pageOfSep") + total;
        document.getElementById("histPrev").disabled = _histPage <= 1;
        document.getElementById("histNext").disabled = _histPage >= total;
      } else {
        pag.style.display = "none";
      }
    }
    function buildSpoiler(rec, idx) {
      var role = ALL_ROLES.find(function(r) {
        return r.key === rec.roleKey;
      });
      var wrap = document.createElement("div");
      wrap.className = "spoiler";
      var head = document.createElement("div");
      head.className = "spoiler__head";
      var meta = document.createElement("div");
      meta.className = "spoiler__meta";
      var badgeClass = "s-badge--planning";
      if (rec.status === STATUS.CONFIRMED) badgeClass = "s-badge--confirmed";
      if (rec.status === STATUS.ALLOCATED) badgeClass = "s-badge--allocated";
      if (rec.isOverLimit) badgeClass = "s-badge--overlimit";
      if (rec.status === STATUS.FINISHED) badgeClass = "s-badge--finished";
      var badgeTitle = rec.status === STATUS.ALLOCATED ? T("tooltipStatusAllocated") : "";
      var remKey = role ? role.remKey : "remainAnalysis";
      var remVal = rec[remKey];
      var wcPill = "";
      if (rec.hasWorkingCopy && _workingDrafts[rec.sprintId]) {
        var d = _workingDrafts[rec.sprintId];
        var pillTitle = T("wcEditedBy").replace("{who}", d.editorLogin || "?").replace("{when}", fmtDT(d.updatedAt));
        wcPill = '<span class="wc-has-copy-pill" title="' + esc(pillTitle) + '">' + esc(T("wcHasCopyPill")) + "</span>";
      }
      var sprintNameInline = rec.name ? '<div class="spoiler__mi"><span class="spoiler__ml">' + T("histSpoilerName") + '</span><span class="spoiler__mv" style="font-weight:600">' + esc(rec.name) + "</span></div>" : "";
      var roleInline = rec.roleLabel ? '<div class="spoiler__mi"><span class="spoiler__ml">' + T("histSpoilerRole") + '</span><span class="spoiler__mv">' + esc(rec.roleLabel) + "</span></div>" : "";
      var outcomeInline = "";
      if (rec.goalOutcome) {
        var _outMap = { achieved: T("optGoalAchieved"), partial: T("optGoalPartial"), missed: T("optGoalMissed") };
        outcomeInline = '<div class="spoiler__mi"><span class="spoiler__ml">' + T("histOutcomeLabel") + '</span><span class="spoiler__mv">' + esc(_outMap[rec.goalOutcome] || rec.goalOutcome) + "</span></div>";
      }
      var goalHeadInline = "";
      if (rec.sprintGoal) {
        var _truncGoal = rec.sprintGoal.length > 80 ? rec.sprintGoal.substring(0, 77) + "\u2026" : rec.sprintGoal;
        goalHeadInline = '<div class="spoiler__mi" title="' + esc(rec.sprintGoal) + '"><span class="spoiler__ml">' + T("histGoalLabel") + '</span><span class="spoiler__mv" style="font-style:italic">' + esc(_truncGoal) + "</span></div>";
      }
      meta.innerHTML = sprintNameInline + roleInline + outcomeInline + goalHeadInline + '<div class="spoiler__mi"><span class="spoiler__ml">' + T("histSpoilerStart") + '</span><span class="spoiler__mv">' + fmtDate(rec.dateStart) + '</span></div><div class="spoiler__mi"><span class="spoiler__ml">' + T("histSpoilerEnd") + '</span><span class="spoiler__mv">' + fmtDate(rec.dateEnd) + '</span></div><div class="spoiler__mi"><span class="spoiler__ml">' + T("histSpoilerStatus") + '</span><span class="spoiler__mv"><span class="s-badge ' + badgeClass + '"' + (badgeTitle ? ' title="' + esc(badgeTitle) + '"' : "") + ">" + esc(statusLabel(rec.status)) + "</span>" + (rec.isOverLimit ? '<span class="overlimit-tag">' + T("overlimitTag") + "</span>" : "") + wcPill + '</span></div><div class="spoiler__mi"><span class="spoiler__ml">' + T("histSpoilerTasks") + '</span><span class="spoiler__mv">' + (rec.items ? rec.items.length : 0) + "</span></div>" + (remVal !== void 0 && remVal !== null ? '<div class="spoiler__mi"><span class="spoiler__ml">' + T("histSpoilerRem") + '</span><span class="spoiler__mv" style="color:' + (remVal < 0 ? "var(--error)" : "var(--success)") + '">' + fmtHours(remVal) + "</span></div>" : "");
      var ctrl = document.createElement("div");
      ctrl.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0;";
      var xlsBtn = document.createElement("button");
      xlsBtn.className = "btn--excel";
      xlsBtn.title = T("btnExcelTitle");
      xlsBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg> Excel';
      xlsBtn.addEventListener("click", /* @__PURE__ */ function(r) {
        return function(e) {
          e.stopPropagation();
          exportSprintToExcel(r);
        };
      }(rec));
      if (_isValidator && rec.status !== STATUS.FINISHED) {
        var wcDraft = rec.hasWorkingCopy && _workingDrafts[rec.sprintId] ? _workingDrafts[rec.sprintId] : null;
        var myLogin = _currentUser && _currentUser.login || "";
        var editBtn = document.createElement("button");
        editBtn.className = "btn--edit-hist";
        if (wcDraft && wcDraft.editorLogin && wcDraft.editorLogin !== myLogin) {
          editBtn.disabled = true;
          editBtn.title = T("wcLockedByOther").replace("{who}", wcDraft.editorLogin);
          editBtn.textContent = T("btnEditHist");
        } else if (wcDraft) {
          editBtn.textContent = T("wcResume");
        } else {
          editBtn.textContent = T("btnEditHist");
        }
        editBtn.addEventListener("click", /* @__PURE__ */ function(r, i) {
          return function(e) {
            e.stopPropagation();
            editHistorySprint(r, i);
          };
        }(rec, idx));
        ctrl.appendChild(editBtn);
        if (wcDraft && wcDraft.editorLogin === myLogin) {
          var discardBtn = document.createElement("button");
          discardBtn.className = "btn--edit-hist";
          discardBtn.style.borderColor = "var(--error,#e05a6a)";
          discardBtn.style.color = "var(--error,#e05a6a)";
          discardBtn.textContent = T("wcDiscard");
          discardBtn.addEventListener("click", /* @__PURE__ */ function(k) {
            return function(e) {
              e.stopPropagation();
              discardWorkingDraft(k);
            };
          }(rec.sprintId));
          ctrl.appendChild(discardBtn);
        }
      }
      if (rec.status !== STATUS.FINISHED) {
        var finBtn = document.createElement("button");
        finBtn.className = "btn--finish-hist";
        finBtn.textContent = T("btnFinishSprint");
        finBtn.addEventListener("click", /* @__PURE__ */ function(r, i) {
          return function(e) {
            e.stopPropagation();
            finishHistorySprint(r, i);
          };
        }(rec, idx));
        ctrl.appendChild(finBtn);
      }
      var del = document.createElement("button");
      del.className = "ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly";
      del.title = T("btnDeleteTitle");
      del.setAttribute("aria-label", T("aria.btnDeleteRow"));
      del.appendChild(icon("trash", T("aria.btnDeleteRow")));
      del.addEventListener("click", /* @__PURE__ */ function(i) {
        return function(e) {
          e.stopPropagation();
          _pendingDelHist = i;
          _showOverlay("delHistOverlay");
        };
      }(idx));
      var arr = document.createElement("span");
      arr.className = "spoiler__arrow";
      arr.textContent = "\u25B6";
      ctrl.appendChild(xlsBtn);
      ctrl.appendChild(del);
      ctrl.appendChild(arr);
      head.appendChild(meta);
      head.appendChild(ctrl);
      head.addEventListener("click", function() {
        wrap.classList.toggle("open");
      });
      var body = document.createElement("div");
      body.className = "spoiler__body";
      if (rec.name) {
        var nameDiv = document.createElement("div");
        nameDiv.className = "spoiler__name";
        nameDiv.textContent = rec.name;
        body.appendChild(nameDiv);
      }
      if (rec.roleLabel) {
        var roleLabel2 = document.createElement("div");
        roleLabel2.className = "spoiler__role-label";
        roleLabel2.textContent = rec.roleLabel;
        body.appendChild(roleLabel2);
      }
      if (rec.sprintFieldVal || rec.versionFieldVal) {
        var sfDiv = document.createElement("div");
        sfDiv.style.cssText = "padding:6px 16px 0;font-size:12px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap;";
        if (rec.sprintFieldVal) sfDiv.innerHTML += "<span><b>" + T("histSprintLabel") + ":</b> " + esc(rec.sprintFieldVal) + "</span>";
        if (rec.versionFieldVal) sfDiv.innerHTML += "<span><b>" + T("histVersionLabel") + ":</b> " + esc(rec.versionFieldVal) + "</span>";
        body.appendChild(sfDiv);
      }
      if (rec.sprintGoal || rec.goalOutcome) {
        var _goalCard = document.createElement("div");
        _goalCard.style.cssText = "margin:10px 16px 0;padding:10px 12px;background:var(--surface-light,#f5f5f5);border-radius:6px;font-size:12px;line-height:1.5;";
        var _goalCardHtml = "";
        if (rec.sprintGoal) {
          _goalCardHtml += '<div style="margin-bottom:' + (rec.goalOutcome ? "8px" : "0") + '"><span style="color:var(--muted,#888);font-size:11px;display:block">' + esc(T("histGoalLabel")) + '</span><span style="font-weight:500">' + esc(rec.sprintGoal) + "</span></div>";
        }
        if (rec.goalOutcome) {
          var _outMapB = { achieved: T("optGoalAchieved"), partial: T("optGoalPartial"), missed: T("optGoalMissed") };
          _goalCardHtml += '<div style="margin-bottom:' + (rec.goalRetroNote ? "8px" : "0") + '"><span style="color:var(--muted,#888);font-size:11px;display:block">' + esc(T("histOutcomeLabel")) + "</span>" + esc(_outMapB[rec.goalOutcome] || rec.goalOutcome) + "</div>";
        }
        if (rec.goalRetroNote) {
          _goalCardHtml += '<div><span style="color:var(--muted,#888);font-size:11px;display:block">' + esc(T("histRetroLabel")) + '</span><span style="font-style:italic">' + esc(rec.goalRetroNote) + "</span></div>";
        }
        _goalCard.innerHTML = _goalCardHtml;
        body.appendChild(_goalCard);
      }
      var conf = document.createElement("div");
      conf.className = "spoiler__confirmed";
      conf.textContent = T("currentRoleConfirmedAt") + ": " + (rec.confirmedBy || "\u2014") + " \xB7 " + fmtDT(rec.confirmedAt);
      if (rec.finishedAt) conf.textContent += " \xB7 " + T("histSpoilerEnd") + ": " + fmtDT(rec.finishedAt);
      body.appendChild(conf);
      var wcDraftForToggle = rec.hasWorkingCopy && _workingDrafts && _workingDrafts[rec.sprintId] ? _workingDrafts[rec.sprintId] : null;
      var noticeEl = null;
      var itemsSlot = document.createElement("div");
      if (wcDraftForToggle) {
        var toggleWrap = document.createElement("div");
        toggleWrap.className = "wc-spoiler-toggle";
        toggleWrap.style.cssText = "display:flex;gap:14px;align-items:center;padding:6px 16px 0;font-size:12px;";
        var radioName = "wc-source-" + esc(rec.sprintId);
        toggleWrap.innerHTML = '<label style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;"><input type="radio" name="' + radioName + '" value="snap" checked><span>' + esc(T("wcSourceSnapshot")) + '</span></label><label style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;"><input type="radio" name="' + radioName + '" value="wc"><span>' + esc(T("wcSourceWorkingCopy")) + "</span></label>";
        body.appendChild(toggleWrap);
        noticeEl = document.createElement("div");
        noticeEl.className = "wc-spoiler-notice hidden";
        noticeEl.style.cssText = "margin:6px 16px 0;padding:6px 10px;border-radius:4px;background:rgba(255,200,80,.18);color:#8a6500;font-size:11px;";
        noticeEl.innerHTML = T("wcSpoilerNotice").replace("{who}", esc(wcDraftForToggle.editorLogin || "?")).replace("{when}", fmtDT(wcDraftForToggle.updatedAt));
        body.appendChild(noticeEl);
      }
      body.appendChild(itemsSlot);
      function __renderHistoryItemsBlock(items, rk) {
        itemsSlot.innerHTML = "";
        if (items && items.length) {
          var sumDiv = document.createElement("div");
          sumDiv.className = "spoiler__summary";
          var sD = items.reduce(function(s, i) {
            return s + (i["estimate_" + rk] || 0);
          }, 0);
          sumDiv.innerHTML = "<span><b>" + esc(rec.roleLabel || rk) + ":</b> " + fmtPeriod(sD) + "</span>";
          itemsSlot.appendChild(sumDiv);
        }
        var tw = document.createElement("div");
        tw.className = "tbl-wrap";
        if (!items || !items.length) {
          tw.innerHTML = '<div class="empty">' + T("histNoTasks") + "</div>";
        } else {
          var hasExtTicket = !!(_settings && _settings.fieldExternalTicketId);
          var hasXPri = !!(_settings && _settings.fieldXPriority);
          var tbl = document.createElement("table");
          tbl.className = "tbl";
          tbl.innerHTML = '<thead><tr><th style="min-width:90px">' + T("histColNum") + "</th>" + /* 2nd position, right after issue ID. */
          (hasExtTicket ? '<th style="min-width:120px">' + T("thExternalTicketId") + "</th>" : "") + '<th style="min-width:120px">' + T("histColTitle") + '</th><th style="min-width:80px">' + T("histColPriority") + "</th>" + (hasXPri ? '<th class="th-dev">' + T("histColXpriority") + "</th>" : "") + '<th style="min-width:80px">' + T("histColState") + '</th><th style="min-width:120px">' + T("histColIncStatus") + '</th><th class="td-num th-dev">' + fmtThLabel(rec.roleLabel || rk) + "</th></tr></thead><tbody></tbody>";
          var tb = tbl.querySelector("tbody");
          items.forEach(function(item) {
            var est = item["estimate_" + rk];
            var fact = item["fact_" + rk];
            var delta = est !== null && est !== void 0 ? fact !== null && fact !== void 0 ? (est || 0) - (fact || 0) : est || 0 : null;
            function histDelta(v) {
              if (v === null || v === void 0) return '<span style="color:var(--muted)">\u2014</span>';
              var s = fmtHoursOnly(Math.abs(v));
              return v < 0 ? '<span class="delta-neg">\u2212' + s + "</span>" : s;
            }
            var tr = document.createElement("tr");
            tr.innerHTML = '<td class="td-id"><a href="' + safeUrl(item.url) + '" target="_blank" rel="noopener noreferrer" class="link">' + esc(item.issueId) + "</a></td>" + /* v1.8.0 D130 — externalTicketId cell (2nd position, right after issue ID link). */
            (hasExtTicket ? _renderExternalTicketCell(item.externalTicketId) : "") + '<td class="td-title">' + esc(item.title || "") + "</td><td>" + esc(localizeEnumVal(item.priority) || "\u2014") + "</td>" + /* v1.8.1 — XPriority cell in history (optional). */
            (hasXPri ? "<td>" + esc(localizeEnumVal(item.xpriority) || "\u2014") + "</td>" : "") + "<td>" + esc(localizeEnumVal(item.state) || "\u2014") + "</td><td>" + esc(item.inclusionStatus ? incLabel(item.inclusionStatus) : "\u2014") + '</td><td class="td-num">' + histDelta(delta) + "</td>";
            tb.appendChild(tr);
          });
          tw.appendChild(tbl);
        }
        itemsSlot.appendChild(tw);
      }
      __renderHistoryItemsBlock(rec.items, rec.roleKey);
      if (wcDraftForToggle) {
        var radios = body.querySelectorAll('.wc-spoiler-toggle input[type="radio"]');
        Array.prototype.forEach.call(radios, function(rb) {
          rb.addEventListener("change", function(ev) {
            ev.stopPropagation();
            if (rb.value === "wc" && rb.checked) {
              __renderHistoryItemsBlock(wcDraftForToggle.items || [], rec.roleKey);
              if (noticeEl) noticeEl.classList.remove("hidden");
            } else if (rb.value === "snap" && rb.checked) {
              __renderHistoryItemsBlock(rec.items, rec.roleKey);
              if (noticeEl) noticeEl.classList.add("hidden");
            }
          });
        });
        var ws = body.querySelector(".wc-spoiler-toggle");
        if (ws) ws.addEventListener("click", function(ev) {
          ev.stopPropagation();
        });
      }
      wrap.appendChild(head);
      wrap.appendChild(body);
      return wrap;
    }
    document.getElementById("histPrev").addEventListener("click", function() {
      _histPage--;
      renderHistory();
    });
    document.getElementById("histNext").addEventListener("click", function() {
      _histPage++;
      renderHistory();
    });
    function editHistorySprint(rec, idx) {
      checkValidatorNow().then(function(ok) {
        if (!ok) {
          toast(T("toastNoEditRights"));
          return;
        }
        if (!rec || !rec.sprintId) return;
        if (rec.status === STATUS.FINISHED) {
          try {
            toast(T("cannotEditFinished"), "warn");
          } catch (_) {
          }
          return;
        }
        var role = ALL_ROLES.find(function(r) {
          return r.key === rec.roleKey;
        });
        if (!role) return;
        var key = rec.sprintId;
        var existing = _workingDrafts[key];
        var login = _currentUser && _currentUser.login || "";
        if (existing) {
          if (existing.editorLogin && existing.editorLogin !== login) {
            try {
              toast(T("wcLockedByOther").replace("{who}", existing.editorLogin), "warn");
            } catch (_) {
            }
            return;
          }
          if (existing.editorTabToken && existing.editorTabToken !== _thisTabToken) {
            if (typeof showMultiTabConflictModal === "function") {
              showMultiTabConflictModal(key, function(takeOver) {
                if (takeOver) {
                  existing.editorTabToken = _thisTabToken;
                  existing.updatedAt = Date.now();
                  _workingDraftsScheduleFlush();
                  resumeWorkingDraft(key, idx);
                }
              });
              return;
            }
            existing.editorTabToken = _thisTabToken;
            existing.updatedAt = Date.now();
            _workingDraftsScheduleFlush();
          }
          resumeWorkingDraft(key, idx);
          return;
        }
        createWorkingDraftFromSnapshot(rec, idx);
        resumeWorkingDraft(key, idx);
      });
    }
    function finishHistorySprint(rec, idx) {
      _pendingFinishHist = idx;
      _showOverlay("finishHistOverlay");
    }
    (function() {
      var cancelBtn = document.getElementById("overlimitCancel");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", function() {
          hideOverlimitModal();
        });
      }
      var downgradeBtn = document.getElementById("overlimitDowngrade");
      if (downgradeBtn) {
        downgradeBtn.addEventListener("click", function() {
          if (_sprint) {
            _sprint.status = STATUS.PLANNING;
            if (typeof _markDirty === "function") _markDirty("sprint");
            if (typeof _draftSaveDebounced === "function") {
              _draftSaveDebounced("sprint", function() {
                return _sprint;
              });
            }
            ALL_ROLES.forEach(function(r) {
              var active = _settings && _settings.activeRoles && _settings.activeRoles[r.key];
              if (active && document.getElementById("statusBadge_" + r.key)) {
                renderRoleStatusBadge(r.key);
              }
            });
            if (typeof renderWidgetHeader === "function") {
              try {
                renderWidgetHeader();
              } catch (_) {
              }
            }
            diag("Status downgraded to PLANNING by user (overlimit modal)", "info");
            toast(T("toastOverlimitDowngraded"), "warn");
          }
          hideOverlimitModal();
        });
      }
    })();
    document.getElementById("finishHistNo").addEventListener("click", function() {
      document.getElementById("finishHistOverlay").classList.add("hidden");
      _pendingFinishHist = -1;
    });
    document.getElementById("finishHistYes").addEventListener("click", function() {
      document.getElementById("finishHistOverlay").classList.add("hidden");
      if (_pendingFinishHist < 0) return;
      if (!_isValidator) {
        toast(T("toastNoValidRights"), "warn");
        _pendingFinishHist = -1;
        return;
      }
      var idx = _pendingFinishHist;
      _pendingFinishHist = -1;
      if (!_history[idx]) return;
      var rec = _history[idx];
      openConfirmGoalDialog(rec.sprintGoal, rec.goalOutcome).then(function(goalFields) {
        if (!goalFields) return;
        rec.status = STATUS.FINISHED;
        rec.finishedAt = Date.now();
        if (goalFields.goalOutcome) rec.goalOutcome = goalFields.goalOutcome;
        if (goalFields.goalRetroNote) rec.goalRetroNote = goalFields.goalRetroNote;
        apiPost("history", { history: _history }).then(function() {
          renderHistory();
          toast(T("toastSprintFinished"), "success");
        });
      });
    });
    document.getElementById("delHistNo").addEventListener("click", function() {
      document.getElementById("delHistOverlay").classList.add("hidden");
      _pendingDelHist = -1;
    });
    document.getElementById("delHistYes").addEventListener("click", function() {
      document.getElementById("delHistOverlay").classList.add("hidden");
      if (_pendingDelHist < 0) return;
      if (!_isValidator) {
        toast(T("toastNoValidRights"), "warn");
        _pendingDelHist = -1;
        return;
      }
      _history.splice(_pendingDelHist, 1);
      _pendingDelHist = -1;
      apiPost("history", { history: _history }).then(function() {
        renderHistory();
        try {
          if (_currentSprintId) {
            var stillHas = _history.some(function(h) {
              return h && typeof h.sprintId === "string" && h.sprintId.indexOf(_currentSprintId + "_") === 0;
            });
            var isActive = _sprint && _sprint.sprintId === _currentSprintId;
            if (!stillHas && !isActive) {
              var ids = typeof getLogicalSprintIds === "function" ? getLogicalSprintIds() : [];
              setCurrentSprintId(ids.length > 0 ? ids[0] : null, { confirmed: true });
            } else if (typeof renderWidgetHeader === "function") {
              renderWidgetHeader();
            }
          }
        } catch (e) {
          diag("delHist sync header err: " + e, "err");
        }
        toast(T("toastHistDeleted"), "success");
      });
    });
    (function() {
      var btn = document.getElementById("clearAllHistoryBtn");
      if (btn) btn.addEventListener("click", function() {
        _showOverlay("clearAllHistOverlay");
      });
      var no = document.getElementById("clearAllHistNo");
      if (no) no.addEventListener("click", function() {
        document.getElementById("clearAllHistOverlay").classList.add("hidden");
      });
      var yes = document.getElementById("clearAllHistYes");
      if (yes) yes.addEventListener("click", function() {
        document.getElementById("clearAllHistOverlay").classList.add("hidden");
        apiPost("history", null, { action: "clear" }).then(function(r) {
          if (!r || !r.success) {
            var reason = r && r.reason || "unknown";
            if (reason === "history_manager_rights_required") {
              toast(T("toastNoHistClearRights"), "err");
              return;
            }
            throw new Error(reason);
          }
          _history = [];
          renderHistory();
          try {
            var isActiveAfterClear = _sprint && _sprint.sprintId === _currentSprintId;
            if (!isActiveAfterClear) {
              setCurrentSprintId(_sprint && _sprint.sprintId ? _sprint.sprintId : null, { confirmed: true });
            } else if (typeof renderWidgetHeader === "function") {
              renderWidgetHeader();
            }
          } catch (e) {
            diag("clearAll sync header err: " + e, "err");
          }
          toast(T("toastHistoryCleared"), "success");
        }).catch(function(e) {
          var msg = e && e.message ? e.message : String(e);
          if (msg.indexOf("history_manager_rights_required") >= 0 || msg.indexOf("403") >= 0) {
            toast(T("toastNoHistClearRights"), "err");
          } else {
            toast(T("toastHistoryClearErr") + ": " + msg, "err");
          }
        });
      });
    })();
    function refreshClearHistoryBtn() {
      var btn = document.getElementById("clearAllHistoryBtn");
      if (!btn) return;
      apiGet("check-history-manager").then(function(r) {
        var ok = !!(r && r.isHistoryManager);
        btn.style.display = ok ? "" : "none";
        diag("check-history-manager: isHistoryManager=" + ok, "info");
      }).catch(function() {
        btn.style.display = "none";
      });
    }
    var _xlsxLoadPromise = null;
    function loadXLSXLib() {
      if (typeof XLSX !== "undefined") return Promise.resolve();
      if (_xlsxLoadPromise) return _xlsxLoadPromise;
      _xlsxLoadPromise = new Promise(function(resolve, reject) {
        var s = document.createElement("script");
        s.src = "lib/xlsx.mini.min.js";
        s.onload = function() {
          diag("XLSX lib loaded (bundled)", "ok");
          resolve();
        };
        s.onerror = function(e) {
          _xlsxLoadPromise = null;
          reject(new Error("XLSX bundled load failed"));
        };
        document.head.appendChild(s);
      });
      return _xlsxLoadPromise;
    }
    function exportSprintToExcel(rec) {
      if (typeof XLSX === "undefined") {
        toast(T("toastXlsxLoading") || "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C XLSX-\u0431\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A\u0443\u2026", "info");
        loadXLSXLib().then(function() {
          exportSprintToExcel(rec);
        }).catch(function(e) {
          diag("XLSX load failed: " + (e && e.message ? e.message : e), "err");
          toast(T("toastXlsxErr"));
        });
        return;
      }
      var rk = rec.roleKey;
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      var meta = [
        [T("excelSprintName"), rec.name || "\u2014"],
        [T("excelRole"), rec.roleLabel || rk],
        [T("excelPeriod"), fmtDate(rec.dateStart) + " \u2014 " + fmtDate(rec.dateEnd)],
        [T("excelStatus"), rec.status ? statusLabel(rec.status) : "\u2014"],
        [T("currentRoleConfirmedAt"), (rec.confirmedBy || "\u2014") + " \xB7 " + fmtDT(rec.confirmedAt)],
        [T("excelQtyTasks"), rec.items ? rec.items.length : 0],
        []
      ];
      if (role) {
        meta.push([T("excelResource") + " " + roleLabel(role), fmtPeriod(rec[role.resKey] || 0), T("excelRemain"), fmtHours(rec[role.remKey] !== void 0 ? rec[role.remKey] : 0)]);
      }
      if (rec.sprintFieldVal) meta.push([T("excelSprint"), rec.sprintFieldVal]);
      if (rec.versionFieldVal) meta.push([T("excelVersion"), rec.versionFieldVal]);
      meta.push([]);
      var roleSuffixHdr = " " + (role ? roleLabel(role) : rk) + " (\u0447)";
      var ppTaskAssignments = rec.personalPlanning && rec.personalPlanning.taskAssignments || {};
      var hasAssignees = Object.keys(ppTaskAssignments).some(function(id) {
        var ta = ppTaskAssignments[id];
        if (!ta) return false;
        if (Array.isArray(ta)) return ta.some(function(x) {
          return x && x.assignee;
        });
        return !!ta.assignee;
      });
      function _formatAssigneeCell(item) {
        var ta = ppTaskAssignments[item.issueId];
        if (!ta) return "";
        if (Array.isArray(ta)) {
          var names = ta.filter(function(x) {
            return x && x.assignee;
          }).map(function(x) {
            return x.assigneeName || x.assignee;
          });
          return names.join(", ");
        }
        return ta.assigneeName || ta.assignee || "";
      }
      var header = [
        T("excelColId"),
        T("excelColTitle"),
        T("excelColSystem"),
        T("excelColPriority"),
        T("excelColXpriority"),
        T("excelColState"),
        T("excelColInclusion"),
        T("excelColEstimate") + roleSuffixHdr,
        T("excelColFact") + roleSuffixHdr,
        T("excelColResource") + roleSuffixHdr,
        T("excelColAlloc") + roleSuffixHdr
      ];
      if (hasAssignees) header.push(T("excelColAssignee"));
      header.push(T("excelColLink"));
      function minToH(m) {
        return m != null ? Math.round(m / 60 * 100) / 100 : "";
      }
      var rows = (rec.items || []).map(function(item) {
        var est = item["estimate_" + rk] || 0;
        var fact = item["fact_" + rk] || 0;
        var resourceMin = Math.max(0, est - fact);
        var allocRaw = item["alloc_" + rk];
        var allocMin = allocRaw !== null && allocRaw !== void 0 ? allocRaw : resourceMin;
        var row = [
          item.issueId || "",
          item.title || "",
          item.system || "",
          item.priority || "",
          item.xpriority || "",
          item.state || "",
          item.inclusionStatus ? incLabel(item.inclusionStatus) : "",
          minToH(item["estimate_" + rk]),
          minToH(item["fact_" + rk]),
          minToH(resourceMin),
          minToH(allocMin)
        ];
        if (hasAssignees) row.push(_formatAssigneeCell(item));
        row.push(item.url || "");
        return row;
      });
      var totalsBase = [
        "",
        T("excelTotal"),
        "",
        "",
        "",
        "",
        "",
        Math.round((rec.items || []).reduce(function(s, i) {
          return s + (i["estimate_" + rk] || 0);
        }, 0) / 60 * 100) / 100,
        /* v6.1.0 D78 (F1) — итог по колонке «Факт». */
        Math.round((rec.items || []).reduce(function(s, i) {
          return s + (i["fact_" + rk] || 0);
        }, 0) / 60 * 100) / 100,
        Math.round((rec.items || []).reduce(function(s, i) {
          var est = i["estimate_" + rk] || 0;
          var fact = i["fact_" + rk] || 0;
          return s + Math.max(0, est - fact);
        }, 0) / 60 * 100) / 100,
        Math.round((rec.items || []).reduce(function(s, i) {
          var est = i["estimate_" + rk] || 0;
          var fact = i["fact_" + rk] || 0;
          var raw = i["alloc_" + rk];
          var resMin = Math.max(0, est - fact);
          return s + (raw !== null && raw !== void 0 ? raw : resMin);
        }, 0) / 60 * 100) / 100
      ];
      if (hasAssignees) totalsBase.push("");
      totalsBase.push("");
      var totals = totalsBase;
      var wsData = meta.concat([header]).concat(rows).concat([totals]);
      var ws = XLSX.utils.aoa_to_sheet(wsData);
      var cols = [{ wch: 16 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      if (hasAssignees) cols.push({ wch: 24 });
      cols.push({ wch: 40 });
      ws["!cols"] = cols;
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, T("excelSprint"));
      var roleSuffix = role ? "_" + roleLabel(role).replace(/\s+/g, "_").replace(/[\\/:*?"<>|]/g, "") : "";
      var fileName = (rec.name ? rec.name.replace(/[\\/:*?"<>|]/g, "_") : T("excelSprint").toLowerCase()) + roleSuffix + "_" + fmtDate(rec.dateStart).replace(/\./g, "-") + ".xlsx";
      XLSX.writeFile(wb, fileName);
      diag("Excel exported: " + fileName, "ok");
    }
    function checkAllocOverlimit(rk) {
      var items = getRoleItemsArr(rk);
      var overlimit = [];
      items.forEach(function(item, idx) {
        if (ACTIVE_INC.indexOf(item.inclusionStatus) < 0) return;
        var alloc = item["alloc_" + rk];
        var est = item["estimate_" + rk] || 0;
        var fact = item["fact_" + rk] || 0;
        var delta = Math.max(0, est - fact);
        var allocVal = alloc !== null && alloc !== void 0 ? alloc : delta;
        if (delta > 0 && allocVal > delta) overlimit.push(idx);
      });
      return overlimit;
    }
    function updateAllocOverlimitUI(rk) {
      var tbody = document.getElementById("compBody_" + rk);
      if (!tbody) return;
      var items = getRoleItemsArr(rk);
      var pageNum = items._page || 1;
      var start = (pageNum - 1) * PAGE_SIZE;
      var anyOverlimit = false;
      var rows = tbody.querySelectorAll("tr[data-alloc-gi]");
      rows.forEach(function(tr) {
        var gi = parseInt(tr.getAttribute("data-alloc-gi"));
        var item = items[gi];
        if (!item) return;
        if (ACTIVE_INC.indexOf(item.inclusionStatus) < 0) {
          tr.removeAttribute("data-overlimit");
          var badge = tr.querySelector(".overlimit-badge");
          if (badge) badge.remove();
          return;
        }
        var alloc = item["alloc_" + rk];
        var est = item["estimate_" + rk];
        var fact = item["fact_" + rk];
        var delta = Math.max(0, (est || 0) - (fact || 0));
        var allocVal = alloc !== null && alloc !== void 0 ? alloc : delta;
        var isOver = delta > 0 && allocVal > delta;
        if (isOver) anyOverlimit = true;
        tr.setAttribute("data-overlimit", isOver ? "1" : "0");
        var allocCell = tr.querySelector(".alloc-input");
        if (allocCell) {
          allocCell.style.borderColor = isOver ? "var(--error)" : "";
        }
        var existBadge = tr.querySelector(".overlimit-badge");
        if (isOver && !existBadge) {
          var badgeEl = document.createElement("span");
          badgeEl.className = "overlimit-badge";
          badgeEl.textContent = T("overlimitBadge");
          badgeEl.style.cssText = "display:inline-block;margin-left:6px;font-size:11px;font-weight:600;color:var(--error);background:rgba(224,90,106,.12);border:1px solid rgba(224,90,106,.4);border-radius:4px;padding:1px 6px;vertical-align:middle;";
          var titleCell = tr.querySelector(".td-title");
          if (titleCell) titleCell.appendChild(badgeEl);
        } else if (!isOver && existBadge) {
          existBadge.remove();
        }
      });
      if (!rows.length) {
        anyOverlimit = checkAllocOverlimit(rk).length > 0;
      }
      var validateBtn = document.getElementById("validateBtn_" + rk);
      if (validateBtn) {
        if (anyOverlimit) {
          validateBtn.disabled = true;
          validateBtn.title = T("overlimitTooltip");
          validateBtn.classList.add("btn--disabled-overlimit");
          if (_sprint && (_sprint.status === STATUS.CONFIRMED || _sprint.status === STATUS.ALLOCATED)) {
            var modalKey = rk + ":" + (_sprint.sprintId || _sprint.dateStart || "cur");
            if (!_overlimitModalShownFor[modalKey]) {
              showOverlimitModal(rk);
              _overlimitModalShownFor[modalKey] = true;
            }
          }
        } else {
          validateBtn.disabled = false;
          validateBtn.title = "";
          validateBtn.classList.remove("btn--disabled-overlimit");
          if (_sprint) {
            var modalKey2 = rk + ":" + (_sprint.sprintId || _sprint.dateStart || "cur");
            delete _overlimitModalShownFor[modalKey2];
          }
        }
      }
    }
    function showOverlimitModal(rk) {
      var overlay = document.getElementById("overlimitOverlay");
      if (!overlay) return;
      var body = document.getElementById("overlimitOverlayBody");
      if (body) {
        var role = ALL_ROLES.find(function(r) {
          return r.key === rk;
        });
        var rl = role ? roleLabel(role) : rk;
        body.textContent = T("overlimitModalBodyTpl").replace("{role}", rl);
      }
      overlay._overlimitRoleKey = rk;
      _showOverlay(overlay);
    }
    function hideOverlimitModal() {
      var overlay = document.getElementById("overlimitOverlay");
      if (!overlay) return;
      overlay.classList.add("hidden");
    }
    function maybeShowAllocatedLockHint() {
      if (safeLs.get("ssp_allocLockHintShown")) return;
      if (!_sprint || _sprint.status !== STATUS.ALLOCATED) return;
      toast(T("toastAllocatedLockHint"), "info");
      safeLs.set("ssp_allocLockHintShown", "1");
    }
    var _origRenderRoleComposition = renderRoleComposition;
    renderRoleComposition = function(rk) {
      _origRenderRoleComposition(rk);
      var tbody = document.getElementById("compBody_" + rk);
      if (!tbody) return;
      var items = getRoleItemsArr(rk);
      var pageNum = items._page || 1;
      var start = (pageNum - 1) * PAGE_SIZE;
      var trs = tbody.querySelectorAll("tr");
      trs.forEach(function(tr, i) {
        tr.setAttribute("data-alloc-gi", start + i);
      });
      updateAllocOverlimitUI(rk);
    };
    document.addEventListener("blur", function(e) {
      if (e.target && e.target.classList && e.target.classList.contains("alloc-input")) {
        var rk2 = e.target.dataset.rk;
        if (rk2) {
          setTimeout(function() {
            updateAllocOverlimitUI(rk2);
          }, 50);
        }
      }
    }, true);
    document.addEventListener("change", function(e) {
      if (e.target && e.target.classList && e.target.classList.contains("inc-sel")) {
        var rk2 = e.target.dataset.rk;
        if (rk2) setTimeout(function() {
          updateAllocOverlimitUI(rk2);
        }, 50);
      }
    }, true);
    var _origBuildSpoiler = buildSpoiler;
    buildSpoiler = function(rec, idx) {
      var wrap = _origBuildSpoiler(rec, idx);
      if (rec.status === STATUS.FINISHED) {
        var editBtn = wrap.querySelector(".btn--edit-hist");
        if (editBtn) editBtn.style.display = "none";
      }
      var tbl = wrap.querySelector("table.tbl");
      if (!tbl) return wrap;
      var thead = tbl.querySelector("thead tr");
      if (thead) {
        var thAlloc = document.createElement("th");
        thAlloc.textContent = T("histColAlloc");
        thAlloc.style.cssText = "min-width:90px";
        var thAssignee = document.createElement("th");
        thAssignee.textContent = T("histColAssignee");
        thAssignee.style.cssText = "min-width:110px";
        thead.appendChild(thAlloc);
        thead.appendChild(thAssignee);
      }
      var rk = rec.roleKey;
      var pp = rec.personalPlanning || null;
      var taskAssignments = pp ? pp.taskAssignments || {} : {};
      var trs = tbl.querySelectorAll("tbody tr");
      trs.forEach(function(tr, i) {
        var item = rec.items ? rec.items[i] : null;
        var issueId = item ? item.issueId : null;
        var tdAlloc = document.createElement("td");
        tdAlloc.className = "td-num";
        var allocVal = item ? item["alloc_" + rk] : null;
        tdAlloc.textContent = allocVal !== null && allocVal !== void 0 ? fmtPeriod(allocVal) : "\u2014";
        tr.appendChild(tdAlloc);
        var tdAssignee = document.createElement("td");
        if (issueId && taskAssignments[issueId]) {
          tdAssignee.textContent = taskAssignments[issueId].assigneeName || taskAssignments[issueId].assignee || "\u2014";
        } else {
          tdAssignee.textContent = "\u2014";
          tdAssignee.style.color = "var(--muted)";
        }
        tr.appendChild(tdAssignee);
      });
      return wrap;
    };
    var STATUS_RANK = { PLANNING: 0, CONFIRMED: 1, ALLOCATED: 2, FINISHED: 3 };
    function getLogicalSprintIds() {
      var seen = {};
      var entries = [];
      if (_sprint && _sprint.sprintId) {
        seen[_sprint.sprintId] = true;
        entries.push({ id: _sprint.sprintId, sortKey: Date.now() });
      }
      if (Array.isArray(_history)) {
        _history.forEach(function(rec) {
          if (!rec || !rec.sprintId) return;
          var logical = String(rec.sprintId).split("_")[0];
          if (seen[logical]) return;
          seen[logical] = true;
          entries.push({ id: logical, sortKey: rec.confirmedAt || 0 });
        });
      }
      entries.sort(function(a, b) {
        return b.sortKey - a.sortKey;
      });
      return entries.map(function(e) {
        return e.id;
      });
    }
    function getSprintRolesEntries(logicalId) {
      if (!logicalId || !Array.isArray(_history)) return [];
      return _history.filter(function(rec) {
        return rec && rec.sprintId && String(rec.sprintId).indexOf(logicalId + "_") === 0;
      });
    }
    function getSprintMeta(logicalId) {
      if (!logicalId) return null;
      var entries = getSprintRolesEntries(logicalId);
      var meta = {
        name: "",
        dateStart: null,
        dateEnd: null,
        status: "PLANNING",
        statusByRole: {}
      };
      if (_sprint && _sprint.sprintId === logicalId) {
        meta.name = _sprint.name || "";
        meta.dateStart = _sprint.dateStart || null;
        meta.dateEnd = _sprint.dateEnd || null;
      }
      var minRank = Infinity;
      entries.forEach(function(rec) {
        if (!rec.status || rec.status === STATUS.FINISHED) return;
        if (!meta.name && rec.name) meta.name = rec.name;
        if (!meta.dateStart && rec.dateStart) meta.dateStart = rec.dateStart;
        if (!meta.dateEnd && rec.dateEnd) meta.dateEnd = rec.dateEnd;
        var rank = STATUS_RANK[rec.status];
        if (rank != null && rank < minRank) {
          minRank = rank;
          meta.status = rec.status;
        }
        if (rec.roleKey) meta.statusByRole[rec.roleKey] = rec.status;
      });
      if (minRank === Infinity) {
        if (_sprint && _sprint.sprintId === logicalId && meta.name) {
          meta.status = _sprint.status || "PLANNING";
          return meta;
        }
        return null;
      }
      return meta;
    }
    function hasWorkingCopyForSprint(logicalId) {
      if (!logicalId || !_workingDrafts) return false;
      var keys = Object.keys(_workingDrafts);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf(logicalId + "_") === 0) return true;
      }
      return false;
    }
    function setCurrentSprintId(newId, opts) {
      opts = opts || {};
      if (newId === _currentSprintId) return true;
      if (_activeWorkingDraftKey && !opts.confirmed) {
        showCloseWorkingCopyModal(function(ok) {
          if (!ok) return;
          _activeWorkingDraftKey = null;
          if (typeof updateWorkingCopyBanner === "function") {
            try {
              updateWorkingCopyBanner();
            } catch (_) {
            }
          }
          setCurrentSprintId(newId, { confirmed: true });
        });
        return false;
      }
      _currentSprintId = newId || null;
      var ui = _draftGet("ui") || {};
      ui.currentSprintId = _currentSprintId;
      _draftSet("ui", ui);
      if (typeof renderWidgetHeader === "function") {
        try {
          renderWidgetHeader();
        } catch (e) {
          diag("renderWidgetHeader err: " + e, "err");
        }
      }
      var activeBtn = document.querySelector(".tab-btn.active");
      var activeTab = activeBtn ? activeBtn.dataset.tab : null;
      if (activeTab === "planning") {
        try {
          _renderPlanningLevel(_planningLevel);
        } catch (e) {
          diag("planning re-render err: " + e, "err");
        }
      } else if (activeTab === "gantt") {
        try {
          var rkG = safeLs.get("ssp_lastActiveRole") || (typeof getActiveRoles === "function" && getActiveRoles()[0] ? getActiveRoles()[0].key : null);
          if (typeof refreshGanttForCurrentSprint === "function") refreshGanttForCurrentSprint(rkG);
        } catch (e) {
          diag("gantt re-render err: " + e, "err");
        }
      } else if (activeTab === "history") {
        try {
          renderHistory();
        } catch (e) {
          diag("renderHistory err: " + e, "err");
        }
      }
      try {
        _applyHybridSprintMode(_currentSprintId);
      } catch (e) {
        diag("hybrid sprint mode err: " + e, "err");
      }
      return true;
    }
    function showCloseWorkingCopyModal(cb) {
      var ov = document.getElementById("closeWcOverlay");
      if (!ov) {
        cb(true);
        return;
      }
      _showOverlay(ov);
      var cancelBtn = document.getElementById("closeWcCancel");
      var confirmBtn = document.getElementById("closeWcConfirm");
      function done(ok) {
        ov.classList.add("hidden");
        if (cancelBtn) cancelBtn.removeEventListener("click", onCancel);
        if (confirmBtn) confirmBtn.removeEventListener("click", onConfirm);
        cb(ok);
      }
      function onCancel() {
        done(false);
      }
      function onConfirm() {
        done(true);
      }
      if (cancelBtn) cancelBtn.addEventListener("click", onCancel);
      if (confirmBtn) confirmBtn.addEventListener("click", onConfirm);
    }
    function renderWidgetHeader() {
      var headerEl = document.getElementById("widgetHeader");
      if (!headerEl) return;
      var sel = document.getElementById("widgetSprintSel");
      var badge = document.getElementById("widgetSprintBadge");
      var wcInd = document.getElementById("widgetWcIndicator");
      if (!sel || !badge || !wcInd) return;
      var ids = getLogicalSprintIds();
      var visibleIds = [];
      var metaCache = {};
      ids.forEach(function(id) {
        var m = getSprintMeta(id);
        if (m) {
          visibleIds.push(id);
          metaCache[id] = m;
        }
      });
      sel.innerHTML = "";
      if (!visibleIds.length) {
        if (_currentSprintId) {
          _currentSprintId = null;
          var ui0 = _draftGet("ui") || {};
          ui0.currentSprintId = null;
          _draftSet("ui", ui0);
        }
        var opt0 = document.createElement("option");
        opt0.value = "";
        opt0.disabled = true;
        opt0.selected = true;
        opt0.textContent = T("phNoSprintsActive");
        sel.appendChild(opt0);
        sel.disabled = true;
      } else {
        sel.disabled = false;
        visibleIds.forEach(function(id) {
          var m = metaCache[id];
          var opt = document.createElement("option");
          opt.value = id;
          opt.textContent = (m.name || id) + (m.dateStart ? " \xB7 " + fmtDate(m.dateStart) : "") + (m.dateEnd ? " \u2014 " + fmtDate(m.dateEnd) : "");
          sel.appendChild(opt);
        });
        if (_currentSprintId && visibleIds.indexOf(_currentSprintId) >= 0) {
          sel.value = _currentSprintId;
        } else {
          sel.value = visibleIds[0];
          _currentSprintId = visibleIds[0];
          var ui = _draftGet("ui") || {};
          ui.currentSprintId = _currentSprintId;
          _draftSet("ui", ui);
        }
      }
      if (_currentSprintId) {
        var activeRoles = typeof getActiveRoles === "function" && getActiveRoles().length ? getActiveRoles() : ALL_ROLES;
        var entries = typeof getSprintRolesEntries === "function" ? getSprintRolesEntries(_currentSprintId) : [];
        var statusByRole = {};
        entries.forEach(function(rec) {
          if (rec && rec.roleKey && rec.status) statusByRole[rec.roleKey] = rec.status;
        });
        badge.classList.remove("hidden");
        badge.classList.remove(
          "widget-header__badge--planning",
          "widget-header__badge--confirmed",
          "widget-header__badge--allocated",
          "widget-header__badge--finished"
        );
        badge.removeAttribute("title");
        badge.removeAttribute("style");
        var _diagDump = activeRoles.map(function(role) {
          return role.key + "=" + (statusByRole[role.key] || "PLANNING(default)");
        }).join(", ");
        diag("[RENDER-HEADER] sprintId=" + _currentSprintId + " entries=" + entries.length + " roles=[" + _diagDump + "]", "info");
        badge.innerHTML = activeRoles.map(function(role) {
          var st = statusByRole[role.key] || "PLANNING";
          var stLabel = typeof statusLabel === "function" ? statusLabel(st) : st;
          var rLabel = typeof roleLabel === "function" ? roleLabel(role) : role.label || role.key;
          var cls = "s-badge s-badge--" + String(st).toLowerCase();
          return '<span class="' + cls + '" title="' + esc(rLabel + ": " + stLabel) + '"><span style="opacity:.7">' + esc(rLabel) + ":</span> " + esc(stLabel) + "</span>";
        }).join("");
      } else {
        badge.classList.add("hidden");
        badge.innerHTML = "";
      }
      if (_currentSprintId && hasWorkingCopyForSprint(_currentSprintId)) {
        wcInd.classList.remove("hidden");
      } else {
        wcInd.classList.add("hidden");
      }
    }
    (function bindWidgetHeader() {
      var sel = document.getElementById("widgetSprintSel");
      if (sel && !sel.dataset.bound) {
        sel.dataset.bound = "1";
        sel.addEventListener("change", function() {
          var newId = this.value;
          var ok = setCurrentSprintId(newId);
          if (ok === false) {
            this.value = _currentSprintId || "";
          }
        });
      }
      var wcInd = document.getElementById("widgetWcIndicator");
      if (wcInd && !wcInd.dataset.bound) {
        wcInd.dataset.bound = "1";
        var goPlanner = function() {
          var plannerBtn = document.querySelector('.tab-btn[data-tab="planning"]');
          if (plannerBtn && !plannerBtn.classList.contains("active")) plannerBtn.click();
          var rolesBtn = document.querySelector('.planning-level-btn[data-level="roles"]');
          if (rolesBtn) rolesBtn.click();
          var b = document.getElementById("wcBanner");
          if (b && b.scrollIntoView) {
            try {
              b.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (_) {
              b.scrollIntoView();
            }
          }
        };
        wcInd.addEventListener("click", goPlanner);
        wcInd.addEventListener("keydown", function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            goPlanner();
          }
        });
      }
      var newBtn = document.getElementById("widgetNewSprintBtn");
      if (newBtn && !newBtn.dataset.bound) {
        newBtn.dataset.bound = "1";
        newBtn.addEventListener("click", function() {
          var roles = typeof getActiveRoles === "function" ? getActiveRoles() : [];
          if (!roles.length) {
            if (typeof toast === "function") toast(T("toastSelectRole") || "Select a role", "warn");
            return;
          }
          if (typeof doNewSprint === "function") doNewSprint(roles[0].key);
        });
      }
    })();
    var _currentSprintRoleRec = null;
    var _currentRolePP = null;
    var _currentRoleGantt = null;
    var _currentRoleNkcKey = "other";
    function isActiveSprintRecord(rec) {
      if (!rec || !rec.sprintId || !_sprint || !_sprint.sprintId) return false;
      return rec.sprintId.indexOf(_sprint.sprintId + "_") === 0;
    }
    function isCurrentSprintRoleEntry(rec, rk) {
      if (!rec || !rec.sprintId || !_currentSprintId || !rk) return false;
      return rec.sprintId === _currentSprintId + "_" + rk;
    }
    function getNkcKeyLocal(dateStart, dateEnd) {
      if (!dateStart) return { key: "other", crossMonth: false };
      var ds = new Date(dateStart);
      var de = dateEnd ? new Date(dateEnd) : new Date(dateStart);
      if (isNaN(ds.getTime()) || isNaN(de.getTime()) || de < ds) {
        return { key: "other", crossMonth: false };
      }
      var counts = { january: 0, may: 0, other: 0 };
      var seenMonths = {};
      var d = new Date(ds.getFullYear(), ds.getMonth(), ds.getDate());
      var endTs = new Date(de.getFullYear(), de.getMonth(), de.getDate()).getTime();
      var safety = 0;
      while (d.getTime() <= endTs && safety < 366) {
        var m = d.getMonth();
        seenMonths[m] = true;
        if (m === 0) counts.january++;
        else if (m === 4) counts.may++;
        else counts.other++;
        d.setDate(d.getDate() + 1);
        safety++;
      }
      var key = "other";
      if (counts.january >= counts.may && counts.january >= counts.other && counts.january > 0) key = "january";
      else if (counts.may >= counts.january && counts.may >= counts.other && counts.may > 0) key = "may";
      var crossMonth = Object.keys(seenMonths).length > 1;
      return { key, crossMonth };
    }
    function _getNkcKeyLegacy(dateStart) {
      return getNkcKeyLocal(dateStart, dateStart).key;
    }
    document.getElementById("currentRoleNkcSel").addEventListener("change", function() {
      _currentRoleNkcKey = this.value;
      if (_currentRolePP) {
        _currentRolePP.nkcKey = _currentRoleNkcKey;
        saveCurrentRoleState();
      }
      updateCurrentRoleTotals();
      renderCurrentRoleAssigneeTable();
      var ui = _draftGet("ui") || {};
      ui.currentRoleNkcKey = _currentRoleNkcKey;
      _draftSet("ui", ui);
      _markDirty("currentRole");
      _draftSaveDebounced("currentRole", function() {
        return {
          pp: _currentRolePP,
          gantt: _currentRoleGantt,
          nkcKey: _currentRoleNkcKey,
          sprintRecKey: _currentSprintRoleRec ? _currentSprintRoleRec.sprintId : null
        };
      });
    });
    function getCurrentRoleNkcHours() {
      if (!_settings) return 145;
      if (_currentRoleNkcKey === "january") return _settings.nkcJanuary || 105;
      if (_currentRoleNkcKey === "may") return _settings.nkcMay || 119;
      return _settings.nkcOther || 145;
    }
    function getPersonalPlanningResourceForRole(rk) {
      if (!_sprint || !_sprint.sprintId) return 0;
      var histId = _sprint.sprintId + "_" + rk;
      var pp = null;
      if (_currentSprintRoleRec && _currentSprintRoleRec.sprintId === histId && _currentRolePP) {
        pp = _currentRolePP;
      } else if (Array.isArray(_history)) {
        var rec = _history.find(function(h) {
          return h.sprintId === histId;
        });
        pp = rec && rec.personalPlanning ? rec.personalPlanning : null;
      }
      if (!pp || !pp.resourcesByAssignee) return 0;
      var sum = 0;
      Object.keys(pp.resourcesByAssignee).forEach(function(login) {
        var r = pp.resourcesByAssignee[login] && pp.resourcesByAssignee[login].resource;
        if (typeof r === "number" && isFinite(r)) sum += r;
      });
      return sum;
    }
    function applyPersonalResourceToInputs() {
      if (!_sprint || !_settings || !_settings.usePersonalForResource) return;
      var activeRoles = getActiveRoles();
      activeRoles.forEach(function(role) {
        var totalH = getPersonalPlanningResourceForRole(role.key);
        var totalMin = Math.round(totalH * 60);
        _sprint[role.resKey] = totalMin;
        var resEl = document.getElementById("res_" + role.key);
        if (resEl) {
          resEl.value = fmtPeriod(totalMin);
          resEl.readOnly = true;
          resEl.style.opacity = "0.6";
          resEl.title = T("resManagedByCurrentRole");
        }
        if (typeof updateRoleRemaining === "function") {
          try {
            updateRoleRemaining(role.key);
          } catch (_) {
          }
        }
      });
      if (typeof _markDirty === "function") {
        try {
          _markDirty("sprint");
        } catch (_) {
        }
      }
      if (typeof _draftSaveDebounced === "function") {
        try {
          _draftSaveDebounced("sprint", function() {
            return _sprint;
          });
        } catch (_) {
        }
      }
    }
    document.getElementById("currentRoleCalcBtn").addEventListener("click", function() {
      if (!_currentSprintRoleRec) {
        toast(T("toastSelectSprint"));
        return;
      }
      if (!_settings) {
        toast(T("toastFillSettings"));
        return;
      }
      doRecalcResource();
    });
    (function bindCurrentRoleSaveParamsBtn() {
      var btn = document.getElementById("currentRoleSaveParamsBtn");
      if (!btn || btn._sspBound) return;
      btn._sspBound = true;
      btn.addEventListener("click", function() {
        if (!_currentSprintRoleRec) {
          toast(T("toastSelectSprint"));
          return;
        }
        if (!_isEditor) {
          toast(T("toastNoEditRights"), "warn");
          return;
        }
        btn.disabled = true;
        var origText = btn.textContent;
        btn.textContent = T("toastSaving");
        _markDirty("currentRole");
        _draftSet("currentRole", {
          pp: _currentRolePP,
          gantt: _currentRoleGantt,
          nkcKey: _currentRoleNkcKey,
          sprintRecKey: _currentSprintRoleRec ? _currentSprintRoleRec.sprintId : null
        });
        _draftSet("meta", { savedAt: Date.now(), version: DRAFT_VERSION, baseRevHash: _baseRevHash });
        _draftFlushNow();
        saveCurrentRoleState();
        setTimeout(function() {
          btn.disabled = false;
          btn.textContent = origText;
          toast(T("toastCurrentRoleParamsSaved"), "success");
        }, 600);
      });
    })();
    function doRecalcResource() {
      if (!_currentRolePP || !Object.keys(_currentRolePP.resourcesByAssignee || {}).length) {
        toast(T("toastAssigneesEmpty"));
        return;
      }
      var nkc = getCurrentRoleNkcHours();
      var kpeMap = _migrateKpeObject(_settings.kpe || {});
      Object.keys(_currentRolePP.resourcesByAssignee).forEach(function(login) {
        var entry = _currentRolePP.resourcesByAssignee[login];
        var g = _migrateGrade(entry.grade);
        var kpe = kpeMap[g] !== void 0 ? kpeMap[g] : KPE_DEFAULTS_LOCAL[g] || 0.65;
        var rate = _settings.rate !== void 0 ? _settings.rate : 1;
        var parti = _settings.participation !== void 0 ? _settings.participation : 1;
        entry.resource = nkc * kpe * rate * parti;
      });
      _currentRolePP.nkcKey = _currentRoleNkcKey;
      _currentRolePP.calculatedAt = Date.now();
      renderCurrentRoleAssigneeTable();
      updateCurrentRoleTotals();
      saveCurrentRoleState();
      toast(T("toastResourceRecalc"), "success");
    }
    function doCurrentRoleCalc() {
      if (!_currentSprintRoleRec) {
        toast(T("toastSelectSprint"));
        return;
      }
      if (!_settings) {
        toast(T("toastFillSettings"));
        return;
      }
      var rec = _currentSprintRoleRec;
      var nkc = getCurrentRoleNkcHours();
      var savedGrades = {};
      if (_currentRolePP && _currentRolePP.resourcesByAssignee) {
        Object.keys(_currentRolePP.resourcesByAssignee).forEach(function(login) {
          savedGrades[login] = _migrateGrade(_currentRolePP.resourcesByAssignee[login].grade) || "Middle";
        });
      }
      var roles;
      if (rec.roleKey) {
        var singleRole = ALL_ROLES.find(function(r) {
          return r.key === rec.roleKey;
        });
        roles = singleRole ? [singleRole] : [];
      } else {
        var selectedRoleKey = _activeSubtab;
        if (!selectedRoleKey) {
          selectedRoleKey = safeLs.get("ssp_lastActiveRole") || "";
        }
        if (selectedRoleKey) {
          var selectedRole = ALL_ROLES.find(function(r) {
            return r.key === selectedRoleKey;
          });
          roles = selectedRole ? [selectedRole] : getActiveRoles();
        } else {
          toast(T("toastSelectRoleFirst"));
          return;
        }
      }
      if (roles.length === 1 && _currentRolePP) {
        _currentRolePP.roleKey = roles[0].key;
      }
      var fieldNames = [];
      roles.forEach(function(role) {
        var fn = _settings && role ? _settings[role.userField] || null : null;
        if (fn && fieldNames.indexOf(fn) < 0) fieldNames.push(fn);
      });
      if (!fieldNames.length) {
        toast(T("toastNoUserField"));
        return;
      }
      var pickBtn = document.getElementById("currentRolePickBtn");
      var calcBtn = document.getElementById("currentRoleCalcBtn");
      if (pickBtn) {
        pickBtn.disabled = true;
        pickBtn.textContent = T("toastPickLoading");
      }
      if (calcBtn) {
        calcBtn.disabled = true;
      }
      var promises = fieldNames.map(function(fn) {
        return apiGet("get-user-field-values?fieldName=" + encodeURIComponent(fn)).then(function(r) {
          diag("get-user-field-values [" + fn + "]: " + (r && r.users ? r.users.length : 0) + " users", r && r.users && r.users.length ? "ok" : "warn");
          return r && r.users ? r.users : [];
        }).catch(function(e) {
          diag("get-user-field-values [" + fn + "] ERR: " + String(e), "err");
          return [];
        });
      });
      Promise.all(promises).then(function(bundleResults) {
        var assigneeSet = {};
        bundleResults.forEach(function(users) {
          users.forEach(function(u) {
            var login = u.login || "";
            if (!login || assigneeSet[login]) return;
            var grade = savedGrades[login] || "Middle";
            var kpeMap = _migrateKpeObject(_settings.kpe || {});
            var kpe = kpeMap[grade] !== void 0 ? kpeMap[grade] : KPE_DEFAULTS_LOCAL[grade] || 0.65;
            var rate = _settings.rate !== void 0 ? _settings.rate : 1;
            var parti = _settings.participation !== void 0 ? _settings.participation : 1;
            assigneeSet[login] = {
              login,
              assigneeName: u.fullName || login,
              grade,
              resource: nkc * kpe * rate * parti
            };
          });
        });
        if (_currentRolePP && _currentRolePP.taskAssignments) {
          Object.keys(_currentRolePP.taskAssignments).forEach(function(issueId) {
            var ta = _currentRolePP.taskAssignments[issueId];
            if (!ta || !ta.assignee || assigneeSet[ta.assignee]) return;
            var grade = savedGrades[ta.assignee] || "Middle";
            var kpeMap = _migrateKpeObject(_settings.kpe || {});
            var kpe = kpeMap[grade] !== void 0 ? kpeMap[grade] : KPE_DEFAULTS_LOCAL[grade] || 0.65;
            var rate = _settings.rate !== void 0 ? _settings.rate : 1;
            var parti = _settings.participation !== void 0 ? _settings.participation : 1;
            assigneeSet[ta.assignee] = {
              login: ta.assignee,
              assigneeName: ta.assigneeName || ta.assignee,
              grade,
              resource: nkc * kpe * rate * parti
            };
          });
        }
        if (!Object.keys(assigneeSet).length) {
          toast(T("toastPickEmpty"));
        } else {
          toast(T("toastPickDone") + ": " + Object.keys(assigneeSet).length, "success");
        }
        _currentRolePP.resourcesByAssignee = assigneeSet;
        _currentRolePP.nkcKey = _currentRoleNkcKey;
        _currentRolePP.calculatedAt = Date.now();
        renderCurrentRoleAssigneeTable();
        renderCurrentRoleTaskTable();
        updateCurrentRoleTotals();
        saveCurrentRoleState();
        var _rk = _currentSprintRoleRec ? _currentSprintRoleRec.roleKey : null;
        if (_rk && typeof refreshPlanningPeopleForCurrentSprint === "function") {
          try {
            refreshPlanningPeopleForCurrentSprint(_rk);
          } catch (_) {
          }
        }
      }).catch(function(e) {
        toast(T("toastPickErr") + ": " + (e && e.message ? e.message : String(e)));
        diag("doCurrentRoleCalc ERR: " + String(e), "err");
      }).finally(function() {
        if (pickBtn) {
          pickBtn.disabled = false;
          pickBtn.textContent = T("btnPickAssignees");
        }
        if (calcBtn) {
          calcBtn.disabled = false;
        }
      });
    }
    function deepClone(obj) {
      if (obj === null || obj === void 0) return obj;
      try {
        return JSON.parse(JSON.stringify(obj));
      } catch (e) {
        return obj;
      }
    }
    function emptyPP() {
      return { nkcKey: "other", resourcesByAssignee: {}, taskAssignments: {}, calculatedAt: null, validatedAt: null, validatedBy: null };
    }
    var GRADES_LOCAL = ["Intern", "Junior", "Middle", "Senior"];
    var KPE_DEFAULTS_LOCAL = { Intern: 0, Junior: 0.5, Middle: 0.65, Senior: 0.75 };
    var _GRADE_LEGACY_MAP = {
      "\u0421\u0442\u0430\u0436\u0451\u0440": "Intern",
      "\u0414\u0436\u0443\u043D": "Junior",
      "\u041C\u0438\u0434\u043B": "Middle",
      "\u0421\u0438\u043D\u044C\u043E\u0440": "Senior"
    };
    function _migrateGrade(g) {
      if (!g) return g;
      return _GRADE_LEGACY_MAP[g] || g;
    }
    function _migrateKpeObject(kpe) {
      if (!kpe || typeof kpe !== "object") return kpe;
      var out = {};
      for (var k in kpe) {
        if (!Object.prototype.hasOwnProperty.call(kpe, k)) continue;
        var nk = _migrateGrade(k);
        out[nk] = kpe[k];
      }
      return out;
    }
    var _pendingDelAssigneeLogin = null;
    function calcAssigneeAllocByProject(login) {
      if (!_currentSprintRoleRec || !_currentRolePP) return [];
      var rec = _currentSprintRoleRec;
      var rk = rec.roleKey || _currentRolePP && _currentRolePP.roleKey || (getActiveRoles()[0] || ALL_ROLES[0]).key;
      var items = isActiveSprintRecord(rec) ? getRoleItemsArr(rk) : rec.items || [];
      var ta = _currentRolePP.taskAssignments || {};
      var byKey = {};
      items.forEach(function(item) {
        if (ACTIVE_INC.indexOf(item.inclusionStatus) < 0) return;
        if (!ta[item.issueId] || ta[item.issueId].assignee !== login) return;
        var alloc = item["alloc_" + rk];
        var est = item["estimate_" + rk];
        var fact = item["fact_" + rk];
        var allocVal = alloc !== null && alloc !== void 0 ? alloc / 60 : Math.max(0, (est || 0) - (fact || 0)) / 60;
        var key = item.system ? String(item.system) : "__none__";
        byKey[key] = (byKey[key] || 0) + allocVal;
      });
      var entry = _currentRolePP.resourcesByAssignee[login];
      var totalRes = entry && typeof entry.resource === "number" ? entry.resource : 0;
      var rows = Object.keys(byKey).map(function(k) {
        var hours = Math.round(byKey[k] * 100) / 100;
        var percent = totalRes > 0 ? Math.round(hours / totalRes * 100) : null;
        return { system: k, hours, percent };
      });
      rows.sort(function(a, b) {
        return b.hours - a.hours;
      });
      return rows;
    }
    function renderCurrentRoleAssigneeTable() {
      var tbody = document.getElementById("currentRoleAssigneeBody");
      if (!tbody) return;
      var manualMode = !!(_settings && _settings.manualPersonalResource);
      var showByProj = !!(_settings && _settings.fieldSystem && _settings.personalPlanningEnabled);
      var colCount = showByProj ? 6 : 5;
      var ttable = document.getElementById("currentRoleAssigneeTable");
      var thead = ttable ? ttable.querySelector("thead") : null;
      if (thead) {
        thead.innerHTML = "<tr><th>" + T("thTeamMember") + "</th><th>" + T("thGrade") + '</th><th class="td-num">' + T("thResourceH") + "</th>" + (showByProj ? "<th>" + T("thAllocByProject") + "</th>" : "") + '<th class="td-num">' + T("thRemainH") + '</th><th style="width:36px"></th></tr>';
      }
      if (!_currentRolePP || !Object.keys(_currentRolePP.resourcesByAssignee || {}).length) {
        tbody.innerHTML = '<tr><td colspan="' + colCount + '" class="empty">' + T("emptyAssignees") + "</td></tr>";
        return;
      }
      tbody.innerHTML = "";
      Object.keys(_currentRolePP.resourcesByAssignee).forEach(function(login) {
        var entry = _currentRolePP.resourcesByAssignee[login];
        var used = calcAssigneeUsed(login);
        var remain = Math.round((entry.resource - used) * 100) / 100;
        var tr = document.createElement("tr");
        var resCellHtml;
        if (manualMode) {
          var manualVal = typeof entry.manualResource === "number" ? entry.manualResource : typeof entry.resource === "number" ? entry.resource : 0;
          resCellHtml = '<td class="td-num" id="currentRole_res_' + encodeLogin(login) + '"><input type="number" min="0" step="0.25" class="currentRole-manual-res" data-login="' + esc(login) + '" value="' + round2(manualVal) + '" style="width:80px;font-size:12px;padding:2px 4px;text-align:right;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text)"/></td>';
        } else {
          resCellHtml = '<td class="td-num" id="currentRole_res_' + encodeLogin(login) + '">' + round2(entry.resource) + "</td>";
        }
        var byProjCellHtml = "";
        if (showByProj) {
          var rows = calcAssigneeAllocByProject(login);
          if (!rows.length) {
            byProjCellHtml = '<td class="td-alloc-by-sys"><span style="color:var(--muted)">\u2014</span></td>';
          } else {
            var hSuf = T("hourShort");
            var rowsHtml = rows.map(function(r) {
              var sysLabel = r.system === "__none__" ? T("allocBySysNoProject") : r.system;
              var pctStr = r.percent === null ? "" : " \xB7 " + r.percent + "%";
              var over = r.percent !== null && r.percent > 100;
              var cls = "alloc-by-sys-row" + (over ? " alloc-by-sys-row--over" : "") + (r.system === "__none__" ? " alloc-by-sys-row--nosys" : "");
              return '<div class="' + cls + '">' + esc(sysLabel) + " \xB7 " + round2(r.hours) + hSuf + pctStr + (over ? " \u26A0" : "") + "</div>";
            }).join("");
            byProjCellHtml = '<td class="td-alloc-by-sys">' + rowsHtml + "</td>";
          }
        }
        tr.innerHTML = "<td>" + esc(entry.assigneeName || login) + '</td><td><select class="currentRole-grade-sel" data-login="' + esc(login) + '" style="width:100%;font-size:12px">' + GRADES_LOCAL.map(function(g) {
          var currentGrade = _migrateGrade(entry.grade);
          return '<option value="' + g + '"' + (currentGrade === g ? " selected" : "") + ">" + esc(T("grade" + g)) + "</option>";
        }).join("") + "</select></td>" + resCellHtml + byProjCellHtml + '<td class="td-num" style="color:' + (remain < 0 ? "var(--error)" : "var(--success)") + '" id="currentRole_rem_' + encodeLogin(login) + '">' + round2(remain) + '</td><td style="text-align:center"><button class="ring-button-button ring-button-inline ring-button-heightM ring-button-ghost ring-button-flat ring-button-iconOnly currentRole-del-assignee" data-login="' + esc(login) + '" title="' + T("confirmDelAssignee").replace("?", "") + '" aria-label="' + T("aria.btnDeleteRow") + '">' + icon("trash", T("aria.btnDeleteRow")).outerHTML + "</button></td>";
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll(".currentRole-grade-sel").forEach(function(sel) {
        sel.addEventListener("change", function() {
          var login = sel.getAttribute("data-login");
          if (!_currentRolePP.resourcesByAssignee[login]) return;
          _currentRolePP.resourcesByAssignee[login].grade = sel.value;
          if (!manualMode) {
            var nkc2 = getCurrentRoleNkcHours();
            var kpeMap = _migrateKpeObject(_settings.kpe || {});
            var kpe = kpeMap[sel.value] !== void 0 ? kpeMap[sel.value] : KPE_DEFAULTS_LOCAL[sel.value] || 0.65;
            var rate = _settings.rate !== void 0 ? _settings.rate : 1;
            var parti = _settings.participation !== void 0 ? _settings.participation : 1;
            _currentRolePP.resourcesByAssignee[login].resource = nkc2 * kpe * rate * parti;
            var resEl = document.getElementById("currentRole_res_" + encodeLogin(login));
            if (resEl) resEl.textContent = round2(_currentRolePP.resourcesByAssignee[login].resource);
            var used2 = calcAssigneeUsed(login);
            var rem2 = Math.round((_currentRolePP.resourcesByAssignee[login].resource - used2) * 100) / 100;
            var remEl = document.getElementById("currentRole_rem_" + encodeLogin(login));
            if (remEl) {
              remEl.textContent = round2(rem2);
              remEl.style.color = rem2 < 0 ? "var(--error)" : "var(--success)";
            }
            updateCurrentRoleTotals();
          }
          saveCurrentRoleState();
        });
      });
      tbody.querySelectorAll(".currentRole-manual-res").forEach(function(inp) {
        inp.addEventListener("change", function() {
          var login = inp.getAttribute("data-login");
          if (!_currentRolePP.resourcesByAssignee[login]) return;
          var v = parseFloat(inp.value);
          if (!isFinite(v) || v < 0) v = 0;
          _currentRolePP.resourcesByAssignee[login].manualResource = v;
          _currentRolePP.resourcesByAssignee[login].resource = v;
          var used2 = calcAssigneeUsed(login);
          var rem2 = Math.round((v - used2) * 100) / 100;
          var remEl = document.getElementById("currentRole_rem_" + encodeLogin(login));
          if (remEl) {
            remEl.textContent = round2(rem2);
            remEl.style.color = rem2 < 0 ? "var(--error)" : "var(--success)";
          }
          updateCurrentRoleTotals();
          if (showByProj) renderCurrentRoleAssigneeTable();
          saveCurrentRoleState();
        });
      });
      tbody.querySelectorAll(".currentRole-del-assignee").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var login = btn.getAttribute("data-login");
          var name = (_currentRolePP.resourcesByAssignee[login] || {}).assigneeName || login;
          _pendingDelAssigneeLogin = login;
          document.getElementById("delAssigneeMsg").textContent = T("confirmDelAssignee").replace("?", "") + " \xAB" + name + "\xBB " + T("fromList") + "?";
          _showOverlay("delAssigneeOverlay");
        });
      });
    }
    function encodeLogin(login) {
      return (login || "").replace(/[^a-zA-Z0-9_]/g, "_");
    }
    function round2(v) {
      return (Math.round((v || 0) * 100) / 100).toFixed(2);
    }
    function calcAssigneeUsed(login) {
      if (!_currentSprintRoleRec || !_currentRolePP) return 0;
      var rec = _currentSprintRoleRec;
      var rk = rec.roleKey || _currentRolePP && _currentRolePP.roleKey || (getActiveRoles()[0] || ALL_ROLES[0]).key;
      var items = isActiveSprintRecord(rec) ? getRoleItemsArr(rk) : rec.items || [];
      var ta = _currentRolePP.taskAssignments || {};
      return items.reduce(function(sum, item) {
        if (!ta[item.issueId]) return sum;
        if (ta[item.issueId].assignee !== login) return sum;
        if (ACTIVE_INC.indexOf(item.inclusionStatus) < 0) return sum;
        var alloc = item["alloc_" + rk];
        var est = item["estimate_" + rk];
        var fact = item["fact_" + rk];
        var allocVal = alloc !== null && alloc !== void 0 ? alloc / 60 : Math.max(0, (est || 0) - (fact || 0)) / 60;
        return sum + allocVal;
      }, 0);
    }
    function updateCurrentRoleTotals() {
      if (!_currentRolePP) {
        document.getElementById("currentRoleTotalResource").textContent = "\u2014";
        document.getElementById("currentRoleTotalRemain").textContent = "\u2014";
        return;
      }
      var totalRes = 0;
      Object.keys(_currentRolePP.resourcesByAssignee || {}).forEach(function(login) {
        totalRes += _currentRolePP.resourcesByAssignee[login].resource || 0;
      });
      var totalUsed = 0;
      Object.keys(_currentRolePP.resourcesByAssignee || {}).forEach(function(login) {
        var used = calcAssigneeUsed(login);
        totalUsed += used;
      });
      var totalRemain = totalRes - totalUsed;
      document.getElementById("currentRoleTotalResource").textContent = round2(totalRes);
      var remEl = document.getElementById("currentRoleTotalRemain");
      remEl.textContent = round2(totalRemain);
      remEl.style.color = totalRemain < 0 ? "var(--error)" : "var(--success)";
    }
    function renderCurrentRoleTaskTable() {
      var tbody = document.getElementById("currentRoleTaskBody");
      if (!tbody) return;
      var ttable = document.getElementById("currentRoleTaskTable");
      var thead = ttable ? ttable.querySelector("thead") : null;
      if (thead) {
        let _sortIc = function(active2) {
          return '<span class="sort-icon">' + (active2 ? "\u25BC" : "\u2195") + "</span>";
        };
        var _sk = getSortKey();
        thead.innerHTML = '<tr><th class="td-id sortable' + (_sk === "id" ? " sortable--active" : "") + '" data-sort-key="id" title="' + esc(T("thSortClickHint")) + '">' + T("thId") + _sortIc(_sk === "id") + "</th>" + /* v1.8.0 D130 — externalTicketId column (2nd position, right after issue ID link). */
        (_settings && _settings.fieldExternalTicketId ? '<th class="sortable' + (_sk === "externalTicketId" ? " sortable--active" : "") + '" data-sort-key="externalTicketId" title="' + esc(T("thSortClickHint")) + '" style="white-space:nowrap;min-width:120px">' + T("thExternalTicketId") + _sortIc(_sk === "externalTicketId") + "</th>" : "") + "<th>" + T("thTitle") + '</th><th class="sortable' + (_sk === "priority" ? " sortable--active" : "") + '" data-sort-key="priority" title="' + esc(T("thSortClickHint")) + '" style="white-space:nowrap">' + T("thPriority") + _sortIc(_sk === "priority") + "</th>" + /* v1.8.1 — XPriority опциональна. */
        (_settings && _settings.fieldXPriority ? '<th class="sortable' + (_sk === "xpriority" ? " sortable--active" : "") + '" data-sort-key="xpriority" title="' + esc(T("thSortClickHint")) + '" style="white-space:nowrap">' + T("thXpriority") + _sortIc(_sk === "xpriority") + "</th>" : "") + '<th style="white-space:nowrap">' + T("thAllocH") + "</th>" + /* v1.4.0 — System column (read-only, sortable). v1.8.1 — опциональна. */
        (_settings && _settings.fieldSystem ? '<th class="sortable' + (_sk === "system" ? " sortable--active" : "") + '" data-sort-key="system" title="' + esc(T("thSortClickHint")) + '" style="white-space:nowrap">' + T("thSystem") + _sortIc(_sk === "system") + "</th>" : "") + '<th style="min-width:160px">' + T("thAssignee") + '</th><th style="min-width:130px">' + T("thStart") + '</th><th style="min-width:130px">' + T("thFinish") + "</th></tr>";
        _bindSortHeaders(thead);
      }
      var extColInc = _settings && _settings.fieldExternalTicketId ? 1 : 0;
      var sysColInc = _settings && _settings.fieldSystem ? 1 : 0;
      var xpColInc = _settings && _settings.fieldXPriority ? 1 : 0;
      var peopleBase = 7;
      if (!_currentSprintRoleRec) {
        tbody.innerHTML = '<tr><td colspan="' + (peopleBase + extColInc + sysColInc + xpColInc) + '" class="empty">' + T("emptyTaskCurrentRole") + "</td></tr>";
        return;
      }
      var rec = _currentSprintRoleRec;
      var rk = rec.roleKey || _currentRolePP && _currentRolePP.roleKey || (getActiveRoles()[0] || ALL_ROLES[0]).key;
      var items = isActiveSprintRecord(rec) ? getRoleItemsArr(rk) : rec.items || [];
      var active = items.filter(function(i) {
        return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0;
      });
      if (typeof multiKeySort === "function") active = multiKeySort(active);
      if (!active.length) {
        tbody.innerHTML = '<tr><td colspan="' + (peopleBase + extColInc + sysColInc + xpColInc) + '" class="empty">' + T("currentRoleNoTasks") + "</td></tr>";
        return;
      }
      var ta = _currentRolePP && _currentRolePP.taskAssignments ? _currentRolePP.taskAssignments : {};
      var rba = _currentRolePP && _currentRolePP.resourcesByAssignee ? _currentRolePP.resourcesByAssignee : {};
      var assigneeOptions = Object.keys(rba);
      tbody.innerHTML = "";
      active.forEach(function(item, idx) {
        var issueId = item.issueId;
        var ta_entry = ta[issueId] || {};
        var alloc = item["alloc_" + rk];
        var est = item["estimate_" + rk];
        var fact = item["fact_" + rk];
        var allocVal = alloc !== null && alloc !== void 0 ? alloc : Math.max(0, (est || 0) - (fact || 0));
        var allocH = (allocVal / 60).toFixed(2);
        var sprintStart = rec.dateStart || _sprint && _sprint.dateStart;
        var sprintEnd = rec.dateEnd || _sprint && _sprint.dateEnd;
        var ta_start = ta_entry.dateStart || null;
        var ta_end = ta_entry.dateEnd || null;
        var outOfRange = ta_start && sprintStart && ta_start < sprintStart || ta_end && sprintEnd && ta_end > sprintEnd;
        var tr = document.createElement("tr");
        if (outOfRange) tr.style.background = "rgba(224,90,106,.08)";
        var assigneeSel = '<select class="currentRole-task-assignee assigner-btn" data-issue="' + esc(issueId) + '" style="width:100%;font-size:12px"><option value="">' + T("phNotAssigned") + "</option>" + assigneeOptions.map(function(login) {
          var entry = rba[login];
          return '<option value="' + esc(login) + '"' + (ta_entry.assignee === login ? " selected" : "") + ">" + esc(entry.assigneeName || login) + "</option>";
        }).join("") + "</select>";
        var sprintStartDate = sprintStart ? toDateIn(sprintStart) : "";
        var sprintEndDate = sprintEnd ? toDateIn(sprintEnd) : "";
        tr.innerHTML = '<td class="td-id"><a href="' + safeUrl(item.url || "") + '" target="_blank" class="link">' + esc(issueId) + "</a></td>" + /* v1.8.0 D130 — externalTicketId cell (2nd position, right after issue ID link). */
        (_settings && _settings.fieldExternalTicketId ? _renderExternalTicketCell(item.externalTicketId) : "") + '<td class="td-title">' + esc(item.title || "") + (outOfRange ? '<span style="color:var(--error);font-size:11px;margin-left:4px">\u26A0 \u0432\u043D\u0435 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430</span>' : "") + '</td><td class="td-priority">' + esc(item.priority || "\u2014") + "</td>" + (_settings && _settings.fieldXPriority ? '<td class="td-xpriority">' + esc(item.xpriority || "\u2014") + "</td>" : "") + '<td class="td-num">' + allocH + "</td>" + /* v1.4.0 — System cell (read-only). v1.8.1 — опциональна. */
        (_settings && _settings.fieldSystem ? '<td class="td-system">' + esc(item.system || "\u2014") + "</td>" : "") + "<td>" + assigneeSel + '</td><td><input type="text" readonly data-ssp-datepicker class="currentRole-task-date currentRole-task-start assigner-btn" data-issue="' + esc(issueId) + '" value="' + (ta_start ? toDateIn(ta_start) : sprintStartDate) + '" min="' + sprintStartDate + '" max="' + sprintEndDate + '" style="width:130px;font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);cursor:pointer"/></td><td><input type="text" readonly data-ssp-datepicker class="currentRole-task-date currentRole-task-end   assigner-btn" data-issue="' + esc(issueId) + '" value="' + (ta_end ? toDateIn(ta_end) : sprintEndDate) + '" min="' + sprintStartDate + '" max="' + sprintEndDate + '" style="width:130px;font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);cursor:pointer"/></td>';
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll(".currentRole-task-assignee").forEach(function(sel) {
        sel.addEventListener("change", function() {
          var issueId = sel.getAttribute("data-issue");
          if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
          if (!_currentRolePP.taskAssignments[issueId]) _currentRolePP.taskAssignments[issueId] = {};
          var login = sel.value;
          _currentRolePP.taskAssignments[issueId].assignee = login;
          _currentRolePP.taskAssignments[issueId].assigneeName = login ? rba[login] && rba[login].assigneeName || login : "";
          delete _currentRolePP.taskAssignments[issueId].ganttColor;
          var ganttTab = document.getElementById("tab-gantt");
          if (ganttTab && !ganttTab.classList.contains("hidden") && typeof renderGanttChart === "function") {
            try {
              renderGanttChart();
            } catch (e) {
              diag("renderGanttChart sync err: " + e, "err");
            }
          }
          updateCurrentRoleTotals();
          updateCurrentRoleAssigneeRemain();
          if (_settings && _settings.fieldSystem && _settings.personalPlanningEnabled) {
            try {
              renderCurrentRoleAssigneeTable();
            } catch (_) {
            }
          }
          saveCurrentRoleState();
          updateIssueAssigneeField(issueId, login, rec.roleKey);
        });
      });
      tbody.querySelectorAll(".currentRole-task-date").forEach(function(inp) {
        inp.addEventListener("change", function() {
          var issueId = inp.getAttribute("data-issue");
          if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
          if (!_currentRolePP.taskAssignments[issueId]) _currentRolePP.taskAssignments[issueId] = {};
          var isStart = inp.classList.contains("currentRole-task-start");
          var ts = inp.value ? new Date(inp.value).getTime() : null;
          if (isStart) {
            _currentRolePP.taskAssignments[issueId].dateStart = ts;
          } else {
            _currentRolePP.taskAssignments[issueId].dateEnd = ts;
          }
          var sprintStart = rec.dateStart || _sprint && _sprint.dateStart;
          var sprintEnd = rec.dateEnd || _sprint && _sprint.dateEnd;
          var outOfRange = ts && isStart && sprintStart && ts < sprintStart || ts && !isStart && sprintEnd && ts > sprintEnd;
          inp.style.borderColor = outOfRange ? "var(--error)" : "";
          saveCurrentRoleState();
        });
      });
    }
    function toDateIn(ts) {
      if (!ts) return "";
      var d = new Date(ts);
      var mm = String(d.getMonth() + 1).padStart(2, "0");
      var dd = String(d.getDate()).padStart(2, "0");
      return d.getFullYear() + "-" + mm + "-" + dd;
    }
    function updateCurrentRoleAssigneeRemain() {
      if (!_currentRolePP) return;
      Object.keys(_currentRolePP.resourcesByAssignee || {}).forEach(function(login) {
        var used = calcAssigneeUsed(login);
        var res = _currentRolePP.resourcesByAssignee[login].resource || 0;
        var rem = Math.round((res - used) * 100) / 100;
        var el = document.getElementById("currentRole_rem_" + encodeLogin(login));
        if (el) {
          el.textContent = round2(rem);
          el.style.color = rem < 0 ? "var(--error)" : "var(--success)";
        }
      });
      updateCurrentRoleTotals();
    }
    function updateIssueAssigneeField(issueId, login, rk) {
      if (!issueId || !_settings) return;
      var roleForUpdate = ALL_ROLES.find(function(r) {
        return r.key === (rk || "");
      });
      if (!roleForUpdate) return;
      var fieldName = _settings[roleForUpdate.userField];
      if (!fieldName) return;
      apiPost("update-issue-field", { issueId, fieldName, value: login || null, type: "user" }).catch(function(e) {
        diag("update-issue-field failed: " + e, "err");
      });
    }
    function saveCurrentRoleState() {
      if (!_currentSprintRoleRec) return;
      _markDirty("currentRole");
      _draftSaveDebounced("currentRole", function() {
        return {
          pp: _currentRolePP,
          gantt: _currentRoleGantt,
          nkcKey: _currentRoleNkcKey,
          sprintRecKey: _currentSprintRoleRec ? _currentSprintRoleRec.sprintId : null
        };
      });
      try {
        if (typeof updateCurrentRoleTotals === "function") updateCurrentRoleTotals();
        var _rkForStats = _currentSprintRoleRec && _currentSprintRoleRec.roleKey;
        if (_rkForStats && typeof _updateRoleAccordionStats === "function") {
          _updateRoleAccordionStats(_rkForStats);
        }
      } catch (e) {
        diag("saveCurrentRoleState stats refresh err: " + e, "err");
      }
      var assignerOnly = !_isEditor && _isAssigner;
      var histRec = _history.find(function(r) {
        return r.sprintId === _currentSprintRoleRec.sprintId;
      });
      if (histRec) {
        histRec.personalPlanning = deepClone(_currentRolePP);
      }
      if (assignerOnly) {
        var minimalHistory = histRec ? [{ sprintId: histRec.sprintId, personalPlanning: deepClone(_currentRolePP) }] : [];
        apiPost("history", { history: minimalHistory }, { action: "assignerSync" }).catch(function(e) {
          diag("saveCurrentRoleState(history,assignerSync) failed: " + e, "err");
        });
      } else {
        apiPost("history", { history: _history }).catch(function(e) {
          diag("saveCurrentRoleState(history) failed: " + e, "err");
        });
      }
      if (isActiveSprintRecord(_currentSprintRoleRec)) {
        _sprint.personalPlanning = deepClone(_currentRolePP);
        if (assignerOnly) {
          apiPost("sprint-data", { sprint: { personalPlanning: deepClone(_currentRolePP) } }, { action: "assignerSync" }).catch(function(e) {
            diag("saveCurrentRoleState(sprint,assignerSync) failed: " + e, "err");
          });
        } else {
          apiPost("sprint-data", { sprint: _sprint }).then(function() {
            if (_settings && _settings.usePersonalForResource && typeof applyPersonalResourceToInputs === "function") {
              applyPersonalResourceToInputs();
            }
          }).catch(function(e) {
            diag("saveCurrentRoleState(active-sync) failed: " + e, "err");
          });
        }
      }
    }
    document.getElementById("currentRoleValidateBtn").addEventListener("click", function() {
      if (!_currentSprintRoleRec) {
        toast(T("toastSelectSprint"));
        return;
      }
      if (!_currentRolePP) {
        toast(T("toastFillResource"));
        return;
      }
      checkValidatorNow().then(function(ok) {
        if (!ok) {
          toast(T("toastNoValidRights"));
          return;
        }
        _currentRolePP.validatedAt = Date.now();
        _currentRolePP.validatedBy = _currentUser ? _currentUser.fullName || _currentUser.login : null;
        var _diagBeforeRec = _currentSprintRoleRec ? _currentSprintRoleRec.status : "NULL";
        var _diagBeforeWc = _activeWorkingDraftKey;
        if (_currentSprintRoleRec) _currentSprintRoleRec.status = STATUS.ALLOCATED;
        if (isActiveSprintRecord(_currentSprintRoleRec)) _sprint.status = STATUS.ALLOCATED;
        diag("[VALIDATE-PEOPLE] role=" + (_currentSprintRoleRec ? _currentSprintRoleRec.roleKey : "?") + " before=" + _diagBeforeRec + " wc=" + _diagBeforeWc + " set rec.status=ALLOCATED active=" + isActiveSprintRecord(_currentSprintRoleRec), "info");
        if (typeof renderWidgetHeader === "function") {
          try {
            renderWidgetHeader();
          } catch (_) {
          }
        }
        saveCurrentRoleState();
        var histIdx = _history.findIndex(function(h) {
          return h.sprintId === _currentSprintRoleRec.sprintId;
        });
        if (histIdx >= 0) {
          _history[histIdx].personalPlanning = deepClone(_currentRolePP);
          _history[histIdx].status = STATUS.ALLOCATED;
          diag("[VALIDATE-PEOPLE] post-set _history[" + histIdx + "].status=" + _history[histIdx].status + " sprintId=" + _history[histIdx].sprintId, "info");
          apiPost("history", { history: _history }).then(function() {
            var _diagAfter = _history[histIdx] ? _history[histIdx].status : "GONE";
            diag("[VALIDATE-PEOPLE] post-apiPost _history[" + histIdx + "].status=" + _diagAfter, "info");
            renderHistory();
            if (typeof renderWidgetHeader === "function") {
              try {
                renderWidgetHeader();
              } catch (_) {
              }
            }
          }).catch(function(e) {
            diag("currentRoleValidate history update failed: " + e, "err");
          });
        }
        toast(T("toastCurrentRoleAllocated"), "success");
      }).catch(function() {
        toast(T("toastCheckError"));
      });
    });
    document.getElementById("ganttUpdateBtn").addEventListener("click", function() {
      renderGanttChart();
    });
    function toggleGanttCellColor(issueId) {
      if (!_currentRolePP) return;
      if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
      if (!_currentRolePP.taskAssignments[issueId]) _currentRolePP.taskAssignments[issueId] = {};
      var cur = _currentRolePP.taskAssignments[issueId].userColorOverride || null;
      _currentRolePP.taskAssignments[issueId].userColorOverride = cur === null ? "red" : cur === "red" ? "blue" : null;
      saveCurrentRoleState();
      renderGanttChart();
    }
    function renderGanttChart() {
      var container = document.getElementById("ganttContainer");
      var emptyEl = document.getElementById("ganttEmpty");
      if (!_currentSprintRoleRec || !_currentRolePP) {
        if (emptyEl) emptyEl.style.display = "";
        return;
      }
      var rec = _currentSprintRoleRec;
      var rk = rec.roleKey || (getActiveRoles()[0] || ALL_ROLES[0]).key;
      var items = isActiveSprintRecord(rec) ? getRoleItemsArr(rk) : rec.items || [];
      var active = items.filter(function(i) {
        return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0;
      });
      if (typeof multiKeySort === "function") active = multiKeySort(active);
      var ta = _currentRolePP.taskAssignments || {};
      var gt = _currentRoleGantt && _currentRoleGantt.tasks ? _currentRoleGantt.tasks : {};
      var ra = _currentRolePP.resourcesByAssignee || {};
      var allLogins = Object.keys(ra);
      var ganttItems = active.map(function(item) {
        var issueId = item.issueId;
        var ta_entry = ta[issueId] || {};
        var sprintStart = rec.dateStart || _sprint && _sprint.dateStart;
        var sprintEnd = rec.dateEnd || _sprint && _sprint.dateEnd;
        var start = ta_entry.dateStart || sprintStart;
        var end = ta_entry.dateEnd || sprintEnd;
        var bg;
        var _colorOverride = ta_entry.userColorOverride || null;
        if (_colorOverride === "red") {
          bg = "rgba(224, 90, 106, 0.85)";
        } else if (_colorOverride === "blue") {
          bg = "rgba(120, 180, 255, 0.85)";
        } else if (ta_entry.assignee) {
          bg = ta_entry.ganttColor && /^#[0-9a-fA-F]{6}$/.test(ta_entry.ganttColor) ? ta_entry.ganttColor : assigneeColorOf(ta_entry.assignee, allLogins);
        } else if (gt[issueId] && gt[issueId].color === "red") {
          bg = "#e05a6a";
        } else if (gt[issueId] && gt[issueId].color === "blue") {
          bg = "#5b7de8";
        } else {
          bg = ASSIGNEE_FALLBACK_COLOR;
        }
        return {
          issueId,
          title: item.title || issueId,
          url: item.url || "",
          assignee: ta_entry.assigneeName || ta_entry.assignee || T("ganttBarTooltipUnassigned"),
          start,
          end,
          bg
        };
      }).filter(function(g) {
        return g.start && g.end;
      });
      if (!ganttItems.length) {
        if (emptyEl) emptyEl.style.display = "";
        container.innerHTML = "";
        container.appendChild(emptyEl || document.createTextNode(T("histNoDates")));
        return;
      }
      if (emptyEl) emptyEl.style.display = "none";
      var minTs = Math.min.apply(null, ganttItems.map(function(g) {
        return g.start;
      }));
      var maxTs = Math.max.apply(null, ganttItems.map(function(g) {
        return g.end;
      }));
      var dayMs = 864e5;
      var totalDays = Math.max(1, Math.ceil((maxTs - minTs) / dayMs)) + 1;
      var html = '<table style="border-collapse:collapse;min-width:600px;font-size:12px">';
      html += "<thead><tr>";
      html += '<th style="min-width:180px;max-width:220px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);position:sticky;left:0;z-index:2;white-space:nowrap;font-weight:600;font-size:12px">' + T("ganttColTask") + "</th>";
      for (var d = 0; d < totalDays; d++) {
        var dayTs = minTs + d * dayMs;
        var dayDate = new Date(dayTs);
        var dayLabel = dayDate.getDate() + "." + String(dayDate.getMonth() + 1).padStart(2, "0");
        var isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
        var dateColor = isWeekend ? "var(--muted)" : "var(--text)";
        var dateBg = isWeekend ? "rgba(255,255,255,.03)" : "var(--surface2)";
        html += '<th style="min-width:34px;padding:4px 3px;background:' + dateBg + ";border:1px solid var(--border);font-weight:700;font-size:11px;color:" + dateColor + ';text-align:center;white-space:nowrap">' + dayLabel + "</th>";
      }
      html += "</tr></thead><tbody>";
      ganttItems.forEach(function(g) {
        var startDay = Math.round((g.start - minTs) / dayMs);
        var endDay = Math.round((g.end - minTs) / dayMs);
        html += '<tr data-gantt-issue="' + esc(g.issueId) + '">';
        html += '<td style="padding:4px 8px;border:1px solid var(--border);position:sticky;left:0;background:var(--surface);z-index:1;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(g.title) + '"><a href="' + safeUrl(g.url) + '" target="_blank" class="link" style="font-weight:600">' + esc(g.issueId) + '</a><div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis">' + esc(g.assignee) + "</div></td>";
        for (var d2 = 0; d2 < totalDays; d2++) {
          var inBar = d2 >= startDay && d2 <= endDay;
          var isStart = d2 === startDay;
          var isEnd = d2 === endDay;
          var isSingle = isStart && isEnd;
          var cellStyle = "padding:0;border:1px solid var(--border);min-width:34px;height:36px;cursor:" + (inBar ? "pointer" : "default") + ";position:relative;overflow:hidden;";
          var innerDiv = "";
          if (inBar) {
            var r = "999px";
            var br;
            if (isSingle) {
              br = r;
            } else if (isStart) {
              br = r + " 0 0 " + r;
            } else if (isEnd) {
              br = "0 " + r + " " + r + " 0";
            } else {
              br = "0";
            }
            var pl = isStart ? "4px" : "0";
            var pr = isEnd ? "4px" : "0";
            innerDiv = '<div style="position:absolute;top:50%;left:' + pl + ";right:" + pr + ";transform:translateY(-50%);height:60%;background:" + g.bg + ";border-radius:" + br + ';box-shadow:0 2px 6px rgba(0,0,0,.18);pointer-events:none"></div>';
          }
          html += '<td class="gantt-cell" data-issue="' + esc(g.issueId) + '" data-inbar="' + (inBar ? "1" : "0") + '" style="' + cellStyle + '">' + innerDiv + "</td>";
        }
        html += "</tr>";
      });
      html += "</tbody></table>";
      container.innerHTML = html;
      var _ganttCells = container.querySelectorAll('.gantt-cell[data-inbar="1"]');
      _ganttCells.forEach(function(cell) {
        var _clickTimer = null;
        cell.addEventListener("click", function() {
          if (_clickTimer) return;
          var issueId = cell.getAttribute("data-issue");
          _clickTimer = setTimeout(function() {
            _clickTimer = null;
            if (!(_settings && _settings.dynEditEnabled)) {
              try {
                toast(T("ganttReassignDisabledByInlineEdit"), "warn");
              } catch (_) {
              }
              return;
            }
            if (typeof _isEditor !== "undefined" && _isEditor === false) {
              try {
                toast(T("ganttReassignNoRights"), "warn");
              } catch (_) {
              }
              return;
            }
            var ganttPanel = document.getElementById("tab-gantt");
            if (ganttPanel && ganttPanel.classList.contains("readonly-mode")) {
              try {
                toast(T("ganttReassignNoRights"), "warn");
              } catch (_) {
              }
              return;
            }
            if (typeof openReassignModal === "function") openReassignModal(issueId);
          }, 250);
        });
        cell.addEventListener("dblclick", function() {
          if (_clickTimer) {
            clearTimeout(_clickTimer);
            _clickTimer = null;
          }
          var issueId = cell.getAttribute("data-issue");
          toggleGanttCellColor(issueId);
        });
      });
    }
    document.getElementById("currentRolePickBtn").addEventListener("click", function() {
      doCurrentRoleCalc();
    });
    document.getElementById("currentRoleClearAssigneesBtn").addEventListener("click", function() {
      _showOverlay("clearAssigneesOverlay");
    });
    function syncAssigneesFromYouTrack() {
      if (!_currentSprintRoleRec) {
        toast(T("toastSelectSprint"));
        return;
      }
      var rk = _currentSprintRoleRec.roleKey || _activeSubtab;
      var role = ALL_ROLES.find(function(r) {
        return r.key === rk;
      });
      if (!role) {
        toast(T("toastSyncFromYtErr"));
        return;
      }
      var fieldName = _settings && _settings[role.userField];
      if (!fieldName) {
        toast(T("toastSyncFromYtNoField"), "warn");
        return;
      }
      var items = isActiveSprintRecord(_currentSprintRoleRec) ? getRoleItemsArr(rk) : _currentSprintRoleRec.items || [];
      var active = (items || []).filter(function(i) {
        return ACTIVE_INC.indexOf(i.inclusionStatus) >= 0;
      });
      var ids = active.map(function(i) {
        return i.issueId;
      }).filter(function(x) {
        return !!x;
      });
      if (!ids.length) {
        toast(T("toastSyncFromYtNoTasks"), "info");
        return;
      }
      apiPost("refresh-assignees", { issueIds: ids, fieldName }).then(function(resp) {
        if (!resp || !resp.success) {
          toast(T("toastSyncFromYtErr"));
          return;
        }
        var assignees = resp.assignees || {};
        if (!_currentRolePP) _currentRolePP = { resourcesByAssignee: {}, taskAssignments: {} };
        if (!_currentRolePP.taskAssignments) _currentRolePP.taskAssignments = {};
        var changed = 0;
        Object.keys(assignees).forEach(function(issueId) {
          var ytEntry = assignees[issueId];
          var ytLogin = ytEntry && ytEntry.login;
          var ytFull = ytEntry && (ytEntry.fullName || ytEntry.login);
          var prevTa = _currentRolePP.taskAssignments[issueId] || {};
          var prevLogin = prevTa.assignee || null;
          if ((prevLogin || null) !== (ytLogin || null)) {
            _currentRolePP.taskAssignments[issueId] = _currentRolePP.taskAssignments[issueId] || {};
            _currentRolePP.taskAssignments[issueId].assignee = ytLogin || null;
            _currentRolePP.taskAssignments[issueId].assigneeName = ytLogin ? ytFull || ytLogin : "";
            delete _currentRolePP.taskAssignments[issueId].ganttColor;
            changed++;
          }
        });
        if (!changed) {
          toast(T("toastSyncFromYtNoChange"), "info");
          return;
        }
        _markDirty("currentRole");
        try {
          renderCurrentRoleAssigneeTable();
        } catch (_) {
        }
        try {
          renderCurrentRoleTaskTable();
        } catch (_) {
        }
        try {
          if (typeof updateCurrentRoleTotals === "function") updateCurrentRoleTotals();
        } catch (_) {
        }
        try {
          if (typeof renderGanttChart === "function") renderGanttChart();
        } catch (_) {
        }
        saveCurrentRoleState();
        toast(T("toastSyncFromYtUpdated").replace("{n}", String(changed)), "success");
      }).catch(function(e) {
        diag("refresh-assignees failed: " + (e && e.message ? e.message : e), "err");
        toast(T("toastSyncFromYtErr"));
      });
    }
    var _peopleSyncBtn = document.getElementById("currentRoleSyncFromYtBtn");
    if (_peopleSyncBtn) _peopleSyncBtn.addEventListener("click", syncAssigneesFromYouTrack);
    var _ganttSyncBtn = document.getElementById("ganttSyncFromYtBtn");
    if (_ganttSyncBtn) _ganttSyncBtn.addEventListener("click", syncAssigneesFromYouTrack);
    document.getElementById("delAssigneeNo").addEventListener("click", function() {
      document.getElementById("delAssigneeOverlay").classList.add("hidden");
      _pendingDelAssigneeLogin = null;
    });
    document.getElementById("delAssigneeYes").addEventListener("click", function() {
      if (_pendingDelAssigneeLogin && _currentRolePP && _currentRolePP.resourcesByAssignee) {
        delete _currentRolePP.resourcesByAssignee[_pendingDelAssigneeLogin];
      }
      document.getElementById("delAssigneeOverlay").classList.add("hidden");
      _pendingDelAssigneeLogin = null;
      renderCurrentRoleAssigneeTable();
      renderCurrentRoleTaskTable();
      updateCurrentRoleTotals();
      saveCurrentRoleState();
      toast(T("toastAssigneeDeleted"), "success");
    });
    document.getElementById("clearAssigneesNo").addEventListener("click", function() {
      document.getElementById("clearAssigneesOverlay").classList.add("hidden");
    });
    document.getElementById("clearAssigneesYes").addEventListener("click", function() {
      if (_currentRolePP) {
        _currentRolePP.resourcesByAssignee = {};
      }
      document.getElementById("clearAssigneesOverlay").classList.add("hidden");
      renderCurrentRoleAssigneeTable();
      renderCurrentRoleTaskTable();
      updateCurrentRoleTotals();
      saveCurrentRoleState();
      toast(T("toastAssigneesCleared"), "success");
    });
  })();
})();
