# История изменений

> 🇬🇧 [Read in English](CHANGELOG.md) · 🇷🇺 По-русски

Все значимые изменения в **Smart Sprint Planner** документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), проект придерживается [Semantic Versioning](https://semver.org/lang/ru/).

---

## [1.4.1] — 2026-05-12

### Fixed
- **Суффиксы часов и минут теперь следуют активному языку UI.** Три внутренних форматтера времени (`fmtPeriod`, `fmtHours`, `fmtHoursOnly`) содержали захардкоженные литералы `'ч'` и `'м'`, из-за чего во всех плашках capacity, plan/fact и allocations суффиксы оставались русскими независимо от выбранного языка интерфейса. Теперь суффиксы читаются из пары словарных ключей: `hourShort` (был и раньше) и нового `minuteShort`, добавленного во все 15 локалей.
- **Имя проекта в шапке виджета теперь перерисовывается при смене языка.** Раньше префикс «Проект: …» записывался в `projectNameLabel` единожды на регистрации приложения и больше не обновлялся, поэтому смена языка во время работы оставляла префикс в исходном языке. Теперь label обновляется на каждом полном rerender через хелпер, читающий кешированное имя проекта и применяющий `T('labelProject')` повторно.
- **Native date picker теперь наследует язык плагина.** Четыре элемента `<input type="date">` в полях дат спринта и задач получают атрибут `lang`, синхронизированный с активным языком UI. В Chromium-браузерах (рантайм, на котором работает YouTrack) это переключает локаль всплывающего календаря — названия месяцев, заголовки дней недели и кнопки «Очистить / Сегодня» — на язык плагина, вместо OS locale.

### Compatibility
- **Без breaking changes.** Только косметика локализации поверх v1.4.0; никаких изменений схемы, настроек или workflow. Существующие установки v1.4.0 апгрейдятся in place.

---

## [1.4.0] — 2026-05-12

### Добавлено
- **Колонка «Система» в таблице «Распределение задач».** Новая read-only сортируемая колонка показывает `item.system` по каждой активной задаче и вставляется между «Аллокацией» и «Исполнителем». В multi-key sort добавлен primary key `system` (asc, tie-breaker — XPriority); подключён через `_sortKeyMemo` и общий header-delegate, как остальные sort-колонки. Колонка отображается всегда; если поле System не настроено — рендерится «—».
- **Опция «Ручной ввод ресурса по исполнителям»** (`manualPersonalResource`). Новый дочерний чекбокс к `personalPlanningEnabled` в разделе «Режимы планирования». При включении ячейка «Ресурс (ч)» в таблице «Ресурсы по исполнителям» становится числовым полем ввода, привязанным к `entry.manualResource`; и `entry.resource`, и тоталы следуют за ручным значением. Dropdown грейда остаётся редактируемым, но больше не запускает авторасчёт `NKC × KPE × rate × participation` — грейд становится информационным. Backend-whitelist расширен новым boolean-ключом; UI-зависимость (disabled при `personalPlanningEnabled=false`) повторяет поведение существующего `usePersonalForResource`.
- **Колонка «Аллокации по проектам» в «Ресурсы по исполнителям».** Новая опциональная колонка показывается, когда одновременно настроено `_settings.fieldSystem` **и** включён `personalPlanningEnabled`. В каждой строке — компактный per-system breakdown `система · часы · процент` — строится из активных (`PLANNED`/`UNPLANNED`) задач, отфильтрованных по `taskAssignments[id].assignee === login` и сгруппированных по `item.system`. Задачи без системы попадают в «Вне проектов/систем» приглушённым стилем; строки свыше 100 % ресурса исполнителя получают класс `--over` и пометку ⚠. Таблица пере-рендерится автоматически после переназначений, ручных правок ресурса и любых изменений totals.

### Изменено
- **Кнопка «Обновить из YouTrack» переименована в «Обновить из задач»** — и в шапке таблицы исполнителей, и над диаграммой Ганта. Локализовано во всех 15 словарях с культурно-адаптированными формулировками.
- **Лейбл режима «Inline-редактирование полей YouTrack» переписан в «Прямое редактирование полей задач YouTrack».** Изменены ключи `lblDynEdit` и `hintSsbInline`; tooltip/описание оставлены в прежней редакции. Локализовано во всех 15 словарях.

### Совместимость
- **Без breaking changes.** Старые snapshot'ы без `manualResource` корректно подхватываются: фолбэк на авторасчётный `resource`. Колонки «Система» и «Аллокации по проектам» — additive only.

### Точки синхронизации
- Этот релиз — sync point v7.1.0 ↔ v1.4.0 с internal-веткой партнёра: набор фич идентичен, различается только идентичность (vendor, repo, license).

---

## [1.3.0] — Unreleased

### Добавлено
- **Каскадная агрегация parent ← child** (`cascadeAggregationEnabled`). Новое self-contained workflow-правило `workflow-cascade-aggregation.js` поставляется в корне YT-app. При включённом флаге правило суммирует поля плана и факта по ролям (берутся из существующего DTA-маппинга «Поля → Оценка/Факт» через `FIELD_FACT_KEY_BY_ROLE` + `FIELD_EST_KEY_BY_ROLE`) с дочерних задач в их parent'ы 2-го (story-like) и 3-го (epic-like) уровней по настроенной родительской связи. Иерархия ограничена 2 уровнями (task → level-2 → level-3); рекурсия 4-го+ уровня — out of scope. Идемпотентность через diff `cur !== target` — повторное срабатывание правила на parent безопасно от бесконечного цикла.
- **Запрет прямого списания трудозатрат на контейнерные задачи** (`forbidContainerWorkItems`). Новое self-contained workflow-правило `workflow-forbid-container.js`. При включённом флаге `workflow.check(false, …)` отклоняет save если пользователь пытается добавить или отредактировать workItem на задаче, тип которой попадает в `cascadeLevel2Values` или `cascadeLevel3Values`. Блокируются и `workItems.added`, и `editedWorkItems` — половинчатый блок (только added) создавал бы лазейку через edit. Без bypass-групп в v1.3.0.
- **Блок настроек UI «Каскадная агрегация трудозатрат»** с 7 контролами: чекбокс каскада, чекбокс запрета, имя kind-поля (default `Type`), comma-separated списки значений 2-го и 3-го уровней (defaults `Story` / `Epic`), inward / outward имена parent-связи (defaults совпадают с встроенной связью YouTrack «Subtask»: `subtask of` / `parent for`). Live-warning подсвечивает опасную комбинацию cascade=on + forbid=off (прямое списание на контейнере будет перезатёрто следующей агрегацией) без блокировки save — soft pairing.
- **Backend-whitelist** расширен 7 новыми ключами (`cascadeAggregationEnabled`, `forbidContainerWorkItems`, `cascadeKindField`, `cascadeLevel2Values`, `cascadeLevel3Values`, `cascadeParentLinkInward`, `cascadeParentLinkOutward`); массивы ограничены 50 элементами × 200 символов, строки — 200 символов.
- **Все новые workflow- и UI-строки локализованы на 15 языках.** Workflow-ключи: `cascadeUpdated`, `cascadeFieldChange`, `errForbidContainer`. UI-ключи (13): `secCascade`, `cardCascade`, `lblCascadeEnabled`, `hintCascade`, `lblForbidContainer`, `hintForbidContainer`, `warnCascadeWithoutForbid`, `lblCascadeKindField`, `lblCascadeLevel2`, `lblCascadeLevel3`, `lblCascadeLinkInward`, `lblCascadeLinkOutward`, `hintCascadeLinks`. Placeholder'ы (5) — Type/Story/Epic/subtask of/parent for — оставлены каноническими английскими, чтобы совпадать с встроенными значениями YouTrack.

### Тесты
- **19 новых unit-тестов** (cascade: 11, forbid: 8): shape `exports.rule`, short-circuit'ы guard'а, агрегация на 1 и 2 уровня, idempotency, no-op без parent'а, агрегация плана и факта в один проход, обнаружение container-kind для `Story` / `Epic`, локализованные сообщения `workflow.check`.
- **3 новых Playwright UI-теста** для cascade-блока settings: render-and-load (7 контролов), переключение live-warning, round-trip ввода в text-инпуты.
- Общее количество тестов проекта: **70/70 зелёных** (28 Playwright + 42 unit).

### Совместимость
- **Без breaking changes.** Каскад и запрет выключены по умолчанию; существующие v1.2.4 инсталляции не затронуты, пока администратор явно не включит новые toggle'ы в настройках плагина.

---

## [1.2.4] — Unreleased

### Добавлено
- **Обязательная проверка типа work-item.** При включённом DTA каждое добавленное или отредактированное списание трудозатрат без `type` блокируется `workflow.check` с локализованным сообщением («Укажите тип работы!»). Save не пройдёт, пока пользователь не выберет тип. Повторяет одноимённую проверку из исходного 1C-правила агрегации.
- **Уведомления о соотношении план/факт (`dtaWarningsEnabled`).** Новая настройка проекта и отдельный чекбокс **«Включить уведомления контроля план-фактного соотношения трудозатрат»** в настройках плагина. При включённом флаге после каждого списания трудозатрат workflow выдаёт по каждой роли сообщение о соотношении агрегированного факта к плану. План берётся из `ssp_settings.fieldX` (имена полей оценок задаются в settings UI «Поля → Оценка»). Три порога:
  - `< 90%` — информационный процент: «Выработано на frontend-разработку: 1ч 30м из плановых 8ч (18.75%)».
  - `90–100%` — предупреждение «⚠️ Остаток менее 10%!» + role-aware подсказка.
  - `> 100%` — алерт «🚨 ПЕРЕЛИМИТ!» + role-aware подсказка.
  Подсказка зависит от типа роли: роль `analysis` получает «Пора декомпозировать задачу!», все исполнительские роли — «Необходимо связаться с аналитиком!». Снятие чекбокса оставляет агрегацию fact-полей, но отключает уведомления — полезно для проектов, которым нужен только тихий учёт.
- **Все новые workflow-строки локализованы во всех 15 поддерживаемых языках** (en, ru — оригинал; cs, de, es, fr, hu, it, ja, ko, nl, pl, pt, tr, zh — машинный перевод, помечен теми же маркерами, что и UI-словари). Новые ключи: `errMissingType`, `progressNoEstimate / Under90 / NearLimit / OverLimit`, `adviceAnalysis / adviceExecutor`, лейблы ролей (`roleLabel_analysis`, `roleLabel_devFront`, …), единицы времени `unitH` / `unitM`. UI-лейблы чекбокса (`lblDtaWarnings`, `hintDtaWarnings`) добавлены во все 15 frontend-словарей.

### Изменено
- **Путь пересчёта: full vs delta.** Если `editedWorkItems` не пуст (пользователь сменил тип или длительность существующего work-item) — workflow делает full recompute по `issue.workItems` (необходимо, так как предыдущий `type` отредактированного item уже недоступен). Иначе — delta: стартуя с текущих значений `fieldFact*`, прибавляет длительности `workItems.added` и вычитает `workItems.removed`. Идемпотентность (diff cur-vs-target) сохраняется, паттерн соответствует 1C-правилу.
- **Guard ужесточён.** Workflow теперь пропускает draft-задачи (`!isReported`), resolved-задачи (`isResolved`) и любые срабатывания без изменения work-items — устраняет no-op runs, которые раньше происходили при любом стороннем апдейте issue.

---

## [1.2.3] — Unreleased

### Исправлено
- **Workflow регистрировался как «экспортируемый скрипт», а не как on-change rule.** В v1.2.1 был введён dual-export `exports.issueRule` / `exports.workItemRule`, но YT scripting распознаёт workflow rule только под каноническим именем `exports.rule` (см. наш VK Workspace Notifier как in-house референс). С кастомными именами экспортов entry в YT Admin → Workflows появлялся без on-change триггера и не срабатывал на изменения issue / work-item. Вернулись к одиночному `exports.rule = entities.Issue.onChange(...)`. Спекуляция о dual-trigger снята — Issue.onChange ловит add/remove work-item как часть issue-update каскада, тем же способом, что и `comments.added` / `tags.added` в VK Notifier. Feature-detect IssueWorkItem.onChange из v1.2.2 больше не нужен и удалён.

---

## [1.2.2] — Unreleased

### Исправлено
- **App падал при загрузке в YT 2024.3 с ошибкой `TypeError: entities.IssueWorkItem.onChange is not a function`.** Введённая в v1.2.1 dual-trigger регистрация безусловно вызывала `entities.IssueWorkItem.onChange(...)`, но на этом YT-билде у entity `IssueWorkItem` нет метода `onChange` (API surface различается между сборками YT 2024.3). Теперь workflow делает feature-detect при загрузке модуля — `exports.workItemRule` регистрируется только если `entities.IssueWorkItem.onChange` callable; иначе workflow работает только через `Issue.onChange`, который ловит add/remove work-item как часть issue-update event (тот же cascading-mutation механизм, что и для `comments.added` / `tags.added` в нашем VK Workspace Notifier). Агрегация остаётся идемпотентной (diff cur-vs-target), поведение при обоих сработавших rule'ах не меняется.

---

## [1.2.1] — Unreleased

### Исправлено
- **Bug A — workflow.message выходило на английском при русской локали юзера.** В контексте YT-workflow `ctx.currentUser.profile.locale.language` часто либо `undefined`, либо в формате `ru-RU` (а ключи словаря — `ru`/`en`/…). Локаль-пикер теперь берёт **primary** значение из `ssp_settings.defaultLang` (project-level, детерминировано, заполнено сразу после первого сохранения settings-виджета), и только если оно отсутствует/не поддерживается — fallback на нормализованный `currentUser.profile.locale.language` (префикс до `-`/`_`).
- **Bug B — fact-поля не обновлялись после списания трудозатрат.** В v1.2.0 workflow пытался писать в синтетическое имя вида `factDevFront`, которого ни в одном проекте нет. Теперь имя реального YT custom-field берётся из `ssp_settings.fieldFact*` (тех самых ключей, что заполняются в settings UI «Поля → Факт»). Если роль есть в маппинге типов work-item, но соответствующий `fieldFact*` пуст — workflow показывает локализованное предупреждение `errFieldMissing` вместо тихого пропуска. Лишний/неиспользуемый ключ `fieldFactByRole` удалён из backend-whitelist.
- **Bug C — `entities.Issue.onChange` не всегда срабатывает на add/remove work-item в YT 2024.3.** Теперь workflow регистрирует **два** правила (`exports.issueRule` через `Issue.onChange` и `exports.workItemRule` через `IssueWorkItem.onChange`); агрегация идемпотентна (diff cur-vs-target), поэтому двойное срабатывание на одно изменение безопасно, а пользователь гарантированно получает хотя бы один триггер в любом из двух YT Server/Cloud билдов.

---

## [1.2.0] — Unreleased

### Добавлено
- **Дифференцированный учёт трудозатрат (DTA)** — workflow-rule (`workflow-dta-aggregation.js`, поставляется внутри этого YT-app zip и регистрируется автоматически при установке) агрегирует workItems задачи по типу и записывает результат в fact-поля соответствующих ролей согласно маппингу проекта в настройках плагина (один тип → одна роль, валидируется). Generic по списку активных ролей; локализованные сообщения (15 языков с EN-fallback). Шаги настройки — в USER-GUIDE §3.5.

### Исправлено
- **Bug #4 (MEDIUM):** пиктограммы сортировки в таблицах composition и personal-distribution снова реагируют на клик. Поэлементные `<th>`-listeners из `_bindSortHeaders` уничтожались при каждом перепринтире `thead.innerHTML` в render-цикле; в iframe YouTrack, где `localStorage` изолирован, `getSortKey()` дополнительно скатывался к `'off'`, потому что `setItem` молча падал с `SecurityError`. Фикс заменяет поэлементные bind'ы на одноразовое document-level click-delegation (устойчивое к re-render и к CSS `pointer-events` на child-элементах вроде `.sort-icon`) и добавляет in-memory memo для sort-key, чтобы toggle работал в пределах сессии даже при заблокированном storage. Применимо к двум composition-таблицам (Планирование → Роли) и таблице распределения задач (Планирование → Люди).
- **Bug #5 (LOW, найден во время приёмки v1.2.0):** в верхнем меню быстрого перехода в настройках появился chip для новой DTA-секции. Первоначальный v1.2.0 билд по ошибке заменил содержимое существующей секции «Прочее» (`secMisc` / `cardMisc`) на DTA, а «Прочее» добавил как отдельную секцию без id — chip `secMisc` вёл на DTA, реальная «Прочее» была недостижима. Теперь DTA — это собственная секция `secDta` с собственным chip; «Прочее» восстановлена под исходным якорем.
- **Bug #6 (HIGH, найден во время приёмки v1.2.0):** настроенные маппинги DTA не обновляли fact-поля задач при списании трудозатрат. Две корневые причины: (1) workflow-rule был задекларирован через нестандартное поле `"workflows": [...]` в YT-app manifest — YT 2024.3 это поле не распознаёт, и правило вообще не регистрировалось; (2) правило использовало `entities.IssueWorkItem.onChange`, который не во всех версиях YT триггерится на add/remove workItem. Фикс следует тому же паттерну, что и наш собственный YT-app **VK Workspace Notifier**: workflow-файл (`workflow-dta-aggregation.js`) лежит **в корне YT-app zip** рядом с `manifest.json` и `backend-project.js`, где YT автоматически регистрирует его через implicit `exports.rule` соглашение — никакого отдельного workflow-архива, никакого шага *Администрирование сервера → Workflows → Import*. Триггер — `entities.Issue.onChange`, он ловит add/remove/update workItem как часть issue-update event во всех поддерживаемых версиях YT. `readSettings` стал устойчив к обоим вариантам payload в `project.extensionProperties` (string или object).

### Переименовано
- **Термин DTA:** «Differentiated Time Accounting» / «Дифференцированный учёт времени» → «Differentiated time tracking» / «Дифференцированный учёт трудозатрат» во всех UI-строках, manifest changeNotes и документации. Акроним **DTA** сохранён как внутренний идентификатор.

[1.2.0]: https://github.com/Letsrollamigo/smart-sprint-planner/releases/tag/v1.2.0

---

## [1.1.0] — 2026-05-09

### Добавлено
- **Интернационализация (i18n) — 15 языков, полное покрытие.** UI-строки вынесены в JSON-словари (`widgets/main/i18n/{lang}.json`) и подгружаются async-loader'ом. Английский и русский остаются inline в бандле для быстрого старта; остальные 13 языков (cs, de, es, fr, hu, it, ja, ko, nl, pl, pt, tr, zh) подгружаются по требованию из ассетов бандла. **Все 459 UI-ключей переведены на каждый язык** (модальные окна, тосты, сервисные сообщения, тултипы доступности). Машинные словари помечены `_meta.auto_translated: true, review_status: "machine_full"`; review носителем языка через PR приветствуется.
- **Термин «КПЕ» расшифрован/локализован.** Русское `cardKpe` расширено до «КПЕ (коэффициент полезной эффективности) по грейдам». Остальные языки используют локализованный эквивалент (Productivity Factor / Faktor produktivity / Produktivitätsfaktor / Factor de productividad / Facteur de productivité / Termelékenységi tényező / Fattore di produttività / 生産性係数 / 생산성 계수 / Productiviteitsfactor / Współczynnik produktywności / Fator de produtividade / Verimlilik faktörü / 生产力系数), сокращённый как PF / FP / TT / WP / VF в подписях полей.
- **Переименование кнопки `btnJumpToPeople`.** «Открыть в режиме «Люди»» → «Открыть в режиме распределения по исполнителям» (с локалезависимыми переводами) для ясности.
- **Селектор языка в шапке виджета** — сортировка EN → RU → остальные ISO-коды. Сохраняет выбор в `localStorage.ssp_lang`.
- **Параметр `defaultLang` на уровне проекта** — settings-менеджер задаёт язык по умолчанию; пользователи без персонального `ssp_lang` наследуют его. Валидируется backend-whitelist'ом из 15 языков.
- **CLDR-плюрали** через `Intl.PluralRules` (корректные one/few/many/other для славянских языков).
- Машинно-переведённые словари помечены `_meta.auto_translated: true` и `review_status: 'needs_human_review'`; PR'ы от сообщества приветствуются.

### Исправлено
- **Bug #1 (HIGH):** `checkAssignerRightsNow` в виджете теперь вызывает `_host.fetchApp` с `{scope: true, method: 'GET'}` вместо `{query: {'$top': 1}}`. Раньше запрос уходил по unscoped extensionEndpoints-пути и возвращал 404, поэтому assigner-роль фактически не работала в UI даже при корректной выдаче на backend.
- **Bug #2 (MEDIUM, defense-in-depth):** `userInGroups` (backend) теперь применяет `.trim()` к обеим сторонам сравнения имени группы. Ранее YouTrack-группа с trailing/leading whitespace в имени проваливала strict-equality против trimmed-записи в `ssp_settings.*GroupNames` — пользователь получал ложный `not_in_group` несмотря на реальное членство.

### Изменено
- **SECURITY.md / SECURITY.ru.md:** уточнён success-flag response pattern — клиент ОБЯЗАН проверять `success` flag, не HTTP-статус. Inline-упоминания `403 plugin_not_configured` и `403 not_owner` заменены на фактическую форму `{success: false, reason: '<machine-readable>'}`.

---

## [1.0.0] — 2026-05-08

### Добавлено
- Первый публичный релиз Smart Sprint Planner под лицензией MIT.
- Ролевое планирование состава спринта по 9 функциональным ролям (анализ, тестирование, платформенная разработка, backend, frontend, iOS, Android, fullstack, базы данных).
- Таблицы назначений по каждой роли с трекингом capacity vs. load и overlimit-защитой.
- История спринтов с подтверждёнными снимками, рабочими черновиками и персональными черновиками каждого пользователя.
- Gantt-таймлайн по ролям с фильтрацией по спринтам.
- Excel-экспорт для вкладок планирования и истории.
- Settings-overlay (доступ по `settingsManagerGroup`, deny-by-default до настройки).
- Двуязычный UI: русский и английский (авто-детект, ручное переключение).
- Server-side авторизация на каждом мутирующем эндпоинте через проектные `ssp_settings`.
- Cross-tab синхронизация через `localStorage`-сигнал `ssp:wc-touched:*`.

### Изменено
- Префикс хранилища приведён к namespace'у `ssp_*` (extension properties + localStorage-ключи).
- Универсальная роль **платформенной разработки** (`devPlatform`) — команды могут мапить её на собственные custom-поля под любой стек (1C, SAP, Salesforce, Oracle, low-code) через настройки плагина.
- Vendor-метаданные, заголовок виджета и имя бандла приведены к **Smart Sprint Planner**.

### Безопасность
- `settingsManagerGroup` обязателен при первой установке; пока группа не задана — все мутации запрещены.
- Server-side whitelist (`ALLOWED_SETTINGS_KEYS`) на `POST /save-settings` блокирует сохранение неизвестных ключей.
- Имена resource/remainder-полей валидируются регулярным выражением `^(resource|remain)[A-Za-z0-9_]*$`.

[1.1.0]: https://github.com/Letsrollamigo/smart-sprint-planner/releases/tag/v1.1.0
[1.0.0]: https://github.com/Letsrollamigo/smart-sprint-planner/releases/tag/v1.0.0
