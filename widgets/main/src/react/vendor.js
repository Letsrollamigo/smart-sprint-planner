import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import * as Recharts from 'recharts';   /* #50 S9-VIZ — чарт-либа (MIT, React+SVG), доступ как SSP_VENDORED.Recharts */
import * as GanttTaskReact from 'gantt-task-react';   /* #20-v2 (v3.2.0) — Гант-либа (MIT, React+SVG): drag дат, зум Day/Week/Month; CSS — widgets/main/gantt-task.css (vendored копия dist/index.css + тем-оверрайды) */
import Dialog from '@jetbrains/ring-ui-built/components/dialog/dialog';
import LoaderInline from '@jetbrains/ring-ui-built/components/loader-inline/loader-inline';
import DatePicker from '@jetbrains/ring-ui-built/components/date-picker/date-picker';
import DatePopup from '@jetbrains/ring-ui-built/components/date-picker/date-popup';

/* #56+ Ring 7.0.108: при пустом date конструктор DatePopup кладёт scrollDate={date:null}
   (truthy-объект) — рендер-фолбэк «|| {date: new Date()}» не срабатывает, и календарь
   открывается на эпохе (ноябрь 1969). Нормализуем до рендера: date:null → scrollDate:null,
   дальше Ring сам подставляет сегодня. Убрать при апгрейде ring-ui с фиксом. */
const _dpRender = DatePopup.prototype.render;
DatePopup.prototype.render = function () {
  if (this.state && this.state.scrollDate && this.state.scrollDate.date == null) {
    this.state = Object.assign({}, this.state, { scrollDate: null });
  }
  return _dpRender.call(this);
};
import Checkbox from '@jetbrains/ring-ui-built/components/checkbox/checkbox';
import Radio from '@jetbrains/ring-ui-built/components/radio/radio';
import Tabs from '@jetbrains/ring-ui-built/components/tabs/dumb-tabs';
import Tab from '@jetbrains/ring-ui-built/components/tabs/tab';
import Table from '@jetbrains/ring-ui-built/components/table/table';
import Selection from '@jetbrains/ring-ui-built/components/table/selection';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Select from '@jetbrains/ring-ui-built/components/select/select';
import QueryAssist from '@jetbrains/ring-ui-built/components/query-assist/query-assist';
import Collapse from '@jetbrains/ring-ui-built/components/collapse/collapse';
import CollapseControl from '@jetbrains/ring-ui-built/components/collapse/collapse-control';
import CollapseContent from '@jetbrains/ring-ui-built/components/collapse/collapse-content';
import alertService from '@jetbrains/ring-ui-built/components/alert-service/alert-service';
import Toggle from '@jetbrains/ring-ui-built/components/toggle/toggle';   /* #57-2 — тумблер блокировки создания спринтов (CSS-сабсет ring-toggle-* добавлен в ring-subset.css) */
import { enUS } from 'date-fns/locale/en-US';
import { ru } from 'date-fns/locale/ru';
import { fr } from 'date-fns/locale/fr';
import { de } from 'date-fns/locale/de';
import { zhCN } from 'date-fns/locale/zh-CN';
import { it } from 'date-fns/locale/it';
import { pl } from 'date-fns/locale/pl';
import { tr } from 'date-fns/locale/tr';
import { ja } from 'date-fns/locale/ja';
import { ko } from 'date-fns/locale/ko';
import { cs } from 'date-fns/locale/cs';
import { nl } from 'date-fns/locale/nl';
import { pt } from 'date-fns/locale/pt';
import { hu } from 'date-fns/locale/hu';
import { es } from 'date-fns/locale/es';
const DateFnsLocales = { en: enUS, ru, fr, de, 'zh-CN': zhCN, it, pl, tr, ja, ko, cs, nl, pt, hu, es };
globalThis.SSP_VENDORED = { React, ReactDOMClient, jsxRuntime, Dialog, LoaderInline, DatePicker, Checkbox, Radio, Tabs, Tab, Table, TableSelection: Selection, Input, Select, Collapse, CollapseControl, CollapseContent, alertService, QueryAssist, Toggle, DateFnsLocales, Recharts, GanttTaskReact };
