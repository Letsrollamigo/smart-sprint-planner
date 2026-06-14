# Как контрибьютить в Smart Sprint Planner

> 🇬🇧 [Read in English](CONTRIBUTING.md) · 🇷🇺 По-русски

Спасибо за интерес к проекту! Smart Sprint Planner распространяется под лицензией MIT; отправляя код, вы соглашаетесь лицензировать свой вклад на тех же условиях.

## Быстрый старт

```bash
git clone https://github.com/Letsrollamigo/smart-sprint-planner.git
cd smart-sprint-planner
npm ci
npm run build:check       # syntax-проверка bundle и workflow-файлов
npm test                  # unit + golden (Node test runner, jsdom — без браузера и YouTrack)
```

Что понадобится:
- Node.js 20+ (esbuild + встроенный test runner Node).
- Инстанс YouTrack 2024.3+ только для **ручной** end-to-end проверки (опционально) — см. [Запуск в локальном YouTrack](../docs/LOCAL_YT.md). Автоматический набор YouTrack не требует.

## Структура репозитория

```
backend-core.js                   — общий бэкенд: схема/миграции, APP_VERSION, общие обработчики
backend-project.js                — проектные обработчики, авторизация, whitelist
backend-global.js                 — глобальные (main-menu) обработчики, вкл. GET /app-version
manifest.json                     — манифест YouTrack-приложения (версия, vendor, widget keys)
settings.json                     — JSON Schema для проектных настроек
entity-extensions.json            — декларации extension properties (ssp_*)
workflow-dta-aggregation.js       — DTA workflow-rule (маппинг типа work-item → роль)
workflow-cascade-aggregation.js   — каскадная агрегация parent ← child план/факт
workflow-forbid-container.js      — запрет work-item на контейнерных задачах
workflow-state-rollup.js          — parent.State ← min(children.State)
widgets/main/index.html           — DOM виджета, i18n-атрибуты, дефолтные тексты
widgets/main/main.js              — esbuild-бандл (коммитится)
widgets/main/src/                 — исходники фронтенда, по архитектурным слоям:
    core.js · index.js              — композиционный корень + entry
    domain/ infra/ pure/ data/ i18n/ react/  — модули, сгруппированные по слою
widgets/main/i18n/                — JSON-файлы для 15 языков
tests/unit/                       — unit-набор (pure-функции, view-models)
tests/golden/                     — golden-набор jsdom-снапшотов DOM/view-model
tests/arch/                       — architecture fitness checks (+ module-registry.json)
tests/mirror/                     — межфорковый паритет (maintainer-only; нужен sibling-форк)
```

> **Важно:** в публичный релиз попадает собранный `widgets/main/main.js` И исходники `widgets/main/src/`. После правки исходников всегда пересобирайте (`npm run build`) и коммитьте регенерированный бандл. Для крупных фронтенд-изменений сначала откройте issue для координации.

## Процесс работы

1. Сделайте fork репозитория и создайте topic-ветку от `main`.
2. Внесите изменения и добавьте/обновите golden- или unit-тесты для нового флоу.
3. Запустите `npm run build:check` и убедитесь, что и бандл, и workflow-файлы парсятся чисто.
4. Запустите `npm test` — все тесты должны пройти.
5. Обновите `CHANGELOG.md` (и `CHANGELOG.ru.md`) под секцией `[Unreleased]` или следующей запланированной версии.
6. Откройте PR в `main`.

## Тест-модель

Виджет тестируется на детерминированных слоях через встроенный runner Node — **без браузера и без живого YouTrack**:

- `npm run test:unit` — pure-функции, view-models, парсеры, бэкенд-хелперы.
- `npm run test:golden` — сериализованные **снапшоты** DOM / view-model каждого вида, отрисованные в jsdom-хосте. Эта сетка — ваш основной интерфейс: diff снапшота — самое точное описание того, что ваше изменение делает с UI.
- `node --test tests/arch/*.test.js` — architecture fitness (размер модулей, топология «звезды», локализация стейта, полнота реестра).
- `npm test` (unit + golden) — зелёная планка для любого клона; `npm run gate` добавляет arch + межфорковый mirror (mirror требует приватный sibling-форк → maintainer-only).

**Регенерация снапшотов — поимённо, с обоснованием:**

```bash
GOLDEN_UPDATE=1 node --test tests/golden/<изменённый-файл>.test.js
```

Ревьюйте каждый diff (`git diff tests/golden/snapshots/`) — каждая изменённая строка должна объясняться вашей правкой — и поясните *почему* в PR (напр. «добавлен `aria-expanded` в шапку спойлера»). Никогда не обновляйте «оптом», чтобы позеленить планку.

**Стабы детерминизма** (переиспользуйте, не изобретайте новые): recording-стабы для I/O (`apiGet`/`apiPost`), управляемый планировщик (`setTimeout`/`clearTimeout`) для синхронного срабатывания debounce, фиксированное время (передавать timestamp явно), синтетические DOM-события (`dispatchEvent`/`click()` на jsdom-узлах).

**Architecture fitness:** `tests/arch/` проверяет структурные инварианты против `module-registry.json`. **Если добавляете, удаляете или переименовываете модуль в `widgets/main/src/`, обновите `module-registry.json` в том же изменении** — иначе arch-тесты упадут.

Чтобы увидеть изменение в живом YouTrack (интеграционный слой, который автотесты не достают), см. [Запуск в локальном YouTrack](../docs/LOCAL_YT.md).

## Сообщения коммитов

Используем [Conventional Commits](https://www.conventionalcommits.org/ru/v1.0.0/):

- `feat: <scope>: <summary>` — пользовательская фича.
- `fix: <scope>: <summary>` — багфикс.
- `docs: <summary>` — изменение только документации.
- `refactor: <summary>` — реструктуризация без изменения поведения.
- `test: <summary>` — изменение только тестов.
- `chore: <summary>` — сборка, CI, зависимости, мета-репозиторий.

Breaking-изменения помечайте в теле коммита через `BREAKING CHANGE:`.

Требуется [Developer Certificate of Origin](https://developercertificate.org/) sign-off на каждом коммите:

```bash
git commit -s -m "feat: ..."
```

Это добавит строку `Signed-off-by:` — лёгкое подтверждение, что вы автор изменения и имеете право лицензировать его на условиях проекта. Отдельный CLA не требуется.

## Стиль кода

- Frontend — единый IIFE-бандл (`widgets/main/main.js`), собранный из `widgets/main/src/`. Новые флоу идут в подходящий модуль слоя (`domain/`, `infra/`, `pure/`, `data/`, `i18n/`) или в `core.js` (композиционный корень), подключаются через `index.js`. Модули общаются через window-мосты (`__SSP_*`), не через прямые cross-import'ы.
- Multi-language UI: любая новая user-facing строка ОБЯЗАНА быть добавлена во все 15 JSON-файлов под `widgets/main/i18n/` и использоваться через `T('key')` или атрибут `data-i18n`. English — source of truth и runtime fallback.
- Bump версии затрагивает одним коммитом: `manifest.json:version`, `package.json:version`, константу `APP_VERSION` в frontend-бандле и литерал `APP_VERSION` в `backend-core.js` (отдаёт `GET /app-version`). Запустите `npm run release-check` — он проверяет синхронность этих точек, а также имена zip и бейдж README.
- Комментарии — только для не-очевидного **WHY**: скрытых ограничений, тонких инвариантов, workaround'ов со ссылкой. Не описывайте **WHAT**.

## Quality gates (перед merge)

- `npm run build:check` — `node --check` проходит для бандла и workflow-файлов.
- `npm test` — все unit- и golden-spec'и проходят.
- `node --test tests/arch/*.test.js` — architecture fitness проходит (и `module-registry.json` синхронен).
- `manifest.json` валиден через `JSON.parse`.
- Версия поднята синхронно в точках выше (если применимо; `npm run release-check`).
- `CHANGELOG.md` и `CHANGELOG.ru.md` обновлены.

## Багрепорты и фичи

Используйте [GitHub Issues](https://github.com/Letsrollamigo/smart-sprint-planner/issues). Шаблоны для багрепортов и feature-request'ов уже подготовлены.

Для security-issues следуйте процессу в [SECURITY.ru.md](SECURITY.ru.md).
