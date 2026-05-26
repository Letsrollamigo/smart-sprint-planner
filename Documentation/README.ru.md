# Smart Sprint Planner

> 🇬🇧 [Read in English](../README.md) · 🇷🇺 По-русски

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![GitHub Release](https://img.shields.io/badge/GitHub-v2.1.8-brightgreen.svg)](https://github.com/Letsrollamigo/smart-sprint-planner/releases/latest)
[![JetBrains Marketplace](https://img.shields.io/badge/Marketplace-v1.9.3-orange.svg)](https://plugins.jetbrains.com/search?search=smart%20sprint%20planner)
[![YouTrack](https://img.shields.io/badge/YouTrack-2024.3+-purple.svg)](https://www.jetbrains.com/youtrack/)
[![Tests](https://img.shields.io/badge/Playwright-passing-success.svg)](../tests/)
[![Поддержать на TON](https://img.shields.io/badge/Поддержать-TON-0088CC?logo=ton)](ton://transfer/UQAeXVOoOQXx0BR9iFOtS0aCux5hLhfZ664e3FNjW3vgJtij)

> 🎉 **Smart Sprint Planner теперь в [JetBrains Marketplace](https://plugins.jetbrains.com/search?search=smart%20sprint%20planner).** Версия **1.9.3** — последний одобренный релиз. С этого момента marketplace-листинг — канонический способ установки для команд, которым нужны проверенные стабильные релизы.

> 💎 **Поддержать проект?** Если плагин был полезен команде и вы хотите
> поддержать его развитие, любая сумма приветствуется на TON-кошелёк:
> `UQAeXVOoOQXx0BR9iFOtS0aCux5hLhfZ664e3FNjW3vgJtij`

Плагин ролевого планирования спринтов для **YouTrack 2024.3+**. Планируйте состав спринта по ролям анализа, тестирования и семи инженерных направлений в одном виджете — с трекингом загрузки, рабочими черновиками, снимками подтверждённой истории, Gantt-таймлайном по каждой роли, дифференцированным учётом трудозатрат, каскадной агрегацией parent ← child и каскадом состояний parent.State ← min(children).

## Каналы релизов

Плагин выходит по двум параллельным каналам — выбирайте тот, который соответствует уровню риска вашей команды:

| Канал | Текущая версия | Каденс | Кому подходит |
|---|---|---|---|
| **[JetBrains Marketplace](https://plugins.jetbrains.com/search?search=smart%20sprint%20planner)** | **v1.9.3** | Стабильные релизы, проверены JB-ревью | Командам, которым нужны проверенные релизы и встроенный auto-update YouTrack. Каждая новая выгрузка проходит модерацию JetBrains marketplace (1–3 рабочих дня) перед публикацией. |
| **[GitHub Releases](https://github.com/Letsrollamigo/smart-sprint-planner/releases)** | **v2.1.8** | Bleeding-edge | Командам, которым нужны последние возможности сразу и нет проблем с ручной установкой `.zip`. Каждый релиз здесь полностью протестирован (415 unit-тестов + Playwright), но выходит раньше прохождения marketplace-модерации. |

GitHub Releases — авторитетный источник: каждая marketplace-выгрузка собирается из тегированного GitHub-релиза. Если вы видите фичу в этом README, которой ещё нет в marketplace-версии — значит, очередной цикл модерации ещё не завершён.

## Возможности

- **9 функциональных ролей** — анализ, тестирование, платформенная разработка, backend, frontend, iOS, Android, fullstack, базы данных. Роли включаются опционально в каждом проекте; универсальная роль `devPlatform` позволяет командам мапить любой стек (1C, SAP, Salesforce, low-code и т.д.) на собственное custom-поле.
- **Таблицы состава по каждой роли** — назначения с учётом capacity vs. load, overlimit-защита, прямое редактирование полей YouTrack из таблицы спринта.
- **Распределение задач по исполнителям** с колонкой «Система» (read-only, сортируемая) и опциональной колонкой «Аллокации по проектам» — per-system breakdown часов и процентов от capacity исполнителя.
- **Ручной ввод ресурса по исполнителям** — режим `manualPersonalResource` для команд, где team-lead задаёт capacity «сверху вниз» (фиксированные часы в неделю), а не через KPE-коэффициенты.
- **История спринтов** — подтверждённые снимки, общий рабочий черновик, персональные черновики у каждого пользователя, восстановление в один клик.
- **Gantt-таймлайн по ролям** с фильтрацией по спринтам.
- **Excel-экспорт** для вкладок планирования и истории.
- **15 языков UI** — чешский, немецкий, английский, испанский, французский, венгерский, итальянский, японский, корейский, нидерландский, польский, португальский, русский, турецкий, китайский (упрощённый). Авто-детект по браузеру, ручное переключение, fallback на английский.
- **Дифференцированный учёт трудозатрат (DTA)** — маппинг типа work-item → роль, агрегация факта по ролям обратно в custom-поля задачи, обязательная валидация типа работы, опциональные уведомления о соотношении план/факт.
- **Каскадная агрегация parent ← child** — поля плана и факта в контейнерной задаче считаются как сумма прямых детей, оценки и факт сворачиваются автоматически. Контейнерные задачи можно блокировать от прямых списаний work-item.
- **Каскад состояний parent ← min(children)** — State контейнерной задачи автоматически следует за наименее продвинутым state'ом дочерних (стратегия min). Настраиваемый порядок состояний, guard от реоткрытия резолвнутых контейнеров, опциональное минимальное состояние (floor). По умолчанию выключено; переиспользует cascade-иерархию.
- **Цели спринта** — структурированные цели к каждому спринту: название, описание, метрика успеха, ответственный. Отображаются на оверлее стендапа, чтобы цели оставались на виду во время ежедневного митинга.
- **Ассистент стендапа** — полноэкранный оверлей ежедневного стендапа с per-роль списками задач (Сделано вчера / Делаю сегодня / Заблокировано), таймером и режимом подсветки блокеров. Работает напрямую на данных текущего спринта.
- **Server-side авторизация** на каждом мутирующем эндпоинте через проектные настройки `ssp_settings`. Deny-by-default до настройки `settingsManagerGroup`.

## Установка

Выберите один из двух каналов (см. **Каналы релизов** выше):

### Вариант A — JetBrains Marketplace (рекомендуемый, стабильный)

1. В YouTrack: **Администрирование → Приложения → Marketplace** → поиск **«Smart Sprint Planner»** → **Установить**.
2. Откройте любой проект и добавьте виджет **Smart Sprint Planner** на страницу настроек.
3. Нажмите **⚙ Plugin settings** в шапке виджета. Первое сохранение требует пользователя из `settingsManagerGroup` — пока группа не настроена, все мутации запрещены.

YouTrack автоматически обновляет плагин по мере публикации новых marketplace-версий.

### Вариант Б — GitHub Release (bleeding-edge)

1. Скачайте свежий `Smart-Sprint-Planner-vX.Y.Z.zip` со страницы [Releases](https://github.com/Letsrollamigo/smart-sprint-planner/releases).
2. В YouTrack: **Настройки проекта → Приложения → Установить из файла** → загрузите zip.
3. Те же шаги по виджету и настройкам, что выше.

Подробная конфигурация — в [USER-GUIDE.ru.md](USER-GUIDE.ru.md). Взгляд team-lead'а / Scrum master'а / PM'а на то, как плагин ложится на Scrum-церемонии и capacity planning, — в [METHODOLOGY-GUIDE.ru.md](METHODOLOGY-GUIDE.ru.md).

## Сборка из исходников

```bash
git clone https://github.com/Letsrollamigo/smart-sprint-planner.git
cd smart-sprint-planner
npm install
npm run build:check    # syntax-проверка bundle и workflow-файлов
npm test               # Playwright-набор (36 spec)
node --test tests/unit/*.test.js   # unit-набор (415 spec)
```

Требования: Node.js 18+. Для end-to-end ручной проверки нужен инстанс YouTrack 2024.3+; Playwright-тесты используют mock-бэкенд.

## Документация

- [USER-GUIDE.ru.md](USER-GUIDE.ru.md) — полное руководство пользователя со скриншотами и примерами конфигурации.
- [METHODOLOGY-GUIDE.ru.md](METHODOLOGY-GUIDE.ru.md) — взгляд team-lead'а / Scrum master'а / PM'а: карта церемоний, capacity planning, дисциплина учёта времени, антипаттерны.
- [SECURITY.ru.md](SECURITY.ru.md) — модель безопасности, поверхность угроз, процесс ответственного раскрытия.
- [CHANGELOG.ru.md](CHANGELOG.ru.md) — история релизов.
- [CONTRIBUTING.ru.md](CONTRIBUTING.ru.md) — как контрибьютить (требуется DCO sign-off).
- [CODE_OF_CONDUCT.ru.md](CODE_OF_CONDUCT.ru.md) — правила сообщества.

## Совместимость

- **YouTrack**: 2024.3 и новее (используется современный app-widget API и `extensionPoint: PROJECT_SETTINGS`).
- **Браузеры**: любой evergreen-браузер, поддерживаемый самим YouTrack.
- **Хранилище**: extension properties под namespace'ом `ssp_*`; cross-tab синхронизация через `localStorage`-сигнал `ssp:wc-touched:*`.

## Лицензия

[MIT License](../LICENSE) — Copyright © 2026 Letsrollamigo.

Контрибуции приветствуются под той же лицензией. Отправляя код, вы соглашаетесь с [Developer Certificate of Origin](https://developercertificate.org/) — подробности в [CONTRIBUTING.ru.md](CONTRIBUTING.ru.md).
