# Как контрибьютить в Smart Sprint Planner

> 🇬🇧 [Read in English](CONTRIBUTING.md) · 🇷🇺 По-русски

Спасибо за интерес к проекту! Smart Sprint Planner распространяется под лицензией MIT; отправляя код, вы соглашаетесь лицензировать свой вклад на тех же условиях.

## Быстрый старт

```bash
git clone https://github.com/Letsrollamigo/smart-sprint-planner.git
cd smart-sprint-planner
npm install
npm run build:check       # syntax-проверка bundle и workflow-файлов
npm test                  # Playwright-набор (mock-бэкенд, YouTrack не требуется)
node --test tests/unit/*.test.js   # unit-набор
```

Что понадобится:
- Node.js 18+ (требуется для esbuild и Playwright).
- Инстанс YouTrack 2024.3+ для end-to-end ручной проверки (опционально; Playwright-набор использует mock-бэкенд).

## Структура репозитория

```
backend-project.js                — серверные обработчики, авторизация, whitelist (один файл)
manifest.json                     — манифест YouTrack-приложения (версия, vendor, widget key)
settings.json                     — JSON Schema для проектных настроек
entity-extensions.json            — декларации extension properties (ssp_*)
workflow-dta-aggregation.js       — DTA workflow-rule (маппинг типа work-item → роль)
workflow-cascade-aggregation.js   — каскадная агрегация parent ← child план/факт
workflow-forbid-container.js      — запрет work-item на контейнерных задачах
widgets/main/index.html           — DOM виджета, i18n-атрибуты, дефолтные тексты
widgets/main/main.js              — esbuild-бандл (коммитится)
widgets/main/i18n/                — JSON-файлы для 15 языков
tests/playwright/                 — end-to-end тесты на собранный виджет
tests/unit/                       — unit-набор (Node test runner)
```

> **Важно:** в публичный релиз попадает уже собранный `widgets/main/main.js` без исходников `widgets/main/src/`. PR с правкой бандла принимаются; для крупных фронтенд-изменений сначала откройте issue для координации.

## Процесс работы

1. Сделайте fork репозитория и создайте topic-ветку от `main`.
2. Внесите изменения и добавьте/обновите Playwright или unit-тесты для нового флоу.
3. Запустите `npm run build:check` и убедитесь, что и бандл, и workflow-файлы парсятся чисто.
4. Запустите `npm test` и `node --test tests/unit/*.test.js` — все тесты должны пройти.
5. Обновите `CHANGELOG.md` (и `CHANGELOG.ru.md`) под секцией `[Unreleased]` или следующей запланированной версии.
6. Откройте PR в `main`.

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

Это добавит строку `Signed-off-by:`. DCO — это лёгкое подтверждение, что вы автор изменения и имеете право лицензировать его на условиях проекта; отдельный CLA не требуется.

## Стиль кода

- Frontend — единый IIFE-бандл (`widgets/main/main.js`). Когда исходники доступны локально, новые флоу идут в `legacy-monolith.js` или в соседний модуль, импортируемый из `index.js`; когда доступен только бандл — правки делаются прямо в собранном файле.
- Multi-language UI: любая новая user-facing строка ОБЯЗАНА быть добавлена во все 15 JSON-файлов под `widgets/main/i18n/` и использоваться через `T('key')` или атрибут `data-i18n`. English — source of truth и runtime fallback.
- Bump версии затрагивает ЧЕТЫРЕ точки одним коммитом: `manifest.json:version`, `package.json:version`, константа `APP_VERSION` в frontend-бандле, литерал `'app-version'` в `backend-project.js`.
- Комментарии — только для не-очевидного **WHY**: скрытых ограничений, тонких инвариантов, workaround'ов со ссылкой. Не описывайте **WHAT**.

## Quality gates (перед merge)

- `npm run build:check` — `node --check` проходит для бандла и workflow-файлов.
- `npm test` — все Playwright-spec'и проходят.
- `node --test tests/unit/*.test.js` — все unit-spec'и проходят.
- `manifest.json` валиден через `JSON.parse`.
- Версия поднята синхронно в четырёх точках выше (если применимо).
- `CHANGELOG.md` и `CHANGELOG.ru.md` обновлены.

## Багрепорты и фичи

Используйте [GitHub Issues](https://github.com/Letsrollamigo/smart-sprint-planner/issues). Шаблоны для багрепортов и feature-request'ов уже подготовлены.

Для security-issues следуйте процессу в [SECURITY.ru.md](SECURITY.ru.md).
