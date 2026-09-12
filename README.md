<h1 align="center">WebAIFreeAPI</h1>

<p align="center">
  <strong>Бесплатный локальный AI-клиент и API для DeepSeek, Qwen и ChatGPT с поддержкой автономных кодовых агентов (OpenCode / CLI), памяти и веб-поиска</strong>
</p>

<p align="center">
  <a href="https://github.com/j46871417-ui/WebAIFreeAPI/releases/latest/download/WebAIFreeAPI-Setup.exe"><img src="https://img.shields.io/badge/Скачать_WebAIFreeAPI--Setup.exe-2ea44f?style=for-the-badge&logo=windows&logoColor=white" alt="Скачать WebAIFreeAPI-Setup.exe"></a>
  <a href="https://github.com/j46871417-ui/WebAIFreeAPI/releases"><img src="https://img.shields.io/github/v/release/j46871417-ui/WebAIFreeAPI?style=for-the-badge&label=Релиз" alt="Релизы"></a>
  <a href="https://t.me/+8qU7020rMF84OWNi"><img src="https://img.shields.io/badge/Telegram-Сообщество-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram Сообщество"></a>
</p>

WebAIFreeAPI превращает бесплатные веб-чаты AI в полноценный локальный инструмент разработчика.

Используй **DeepSeek**, **Qwen** и **ChatGPT** через единое графическое окно, фоновый сервис, OpenAI-совместимый API, расширение VS Code, а также в роли агента в **OpenCode Desktop** и других средах разработки.

---

## ✨ Основные возможности:

- 📦 **Готовый установщик в 1 клик (`WebAIFreeAPI-Setup.exe`)**: портативный пакет для Windows со встроенным Node.js, автоматической загрузкой Chromium и автонастройкой ярлыков.
- 🤖 **Полноценная работа Qwen и DeepSeek в OpenCode Desktop**: поддержка tool calling, bash, чтения и правки файлов без сбоев.
- 💬 **Умное переиспользование сессий**: внутри одной сессии чат продолжается последовательно без раздувания контекста каждым новым системным промтом.
- 🔄 **Автообновление прямо из интерфейса и трея**: проверка свежих версий с GitHub и установка обновления в один клик.
- 🔍 **Улучшенный Web Search**: встроенный веб-поиск и автоопределение намерений.
- ⚙️ **Автоматическая конфигурация OpenCode**: установщик сам прописывает профили WebAIFreeAPI в конфиг OpenCode Desktop.
- 🔌 **Интеграция с любой IDE**: встроенный генератор шаблонов и автогенерация API-ключей для Cursor, VS Code (Cline, Continue), Windsurf, JetBrains, OpenCode, Aider и Zed.

<p align="center">
  <img src="docs/assets/ai-free-agent-0.4.13.png" alt="WebAIFreeAPI Interface" width="800">
</p>

---

## 💻 Подключение к IDE и кодовым агентам (API)

WebAIFreeAPI работает как локальный OpenAI/Anthropic-совместимый сервер (`http://127.0.0.1:4317/v1`) с динамической генерацией уникальных локальных API-ключей.

В окне **Настройки -> API / IDE** доступен интерактивный конфигуратор под любую IDE с кнопками копирования и автонастройки:

| Среда разработки | Способ интеграции | Поддерживаемые функции |
|---|---|---|
| **Cursor** | Custom OpenAI Base URL (`http://127.0.0.1:4317/v1`) + ключ | Composer, чат, инлайн-правки |
| **VS Code (Cline / Roo Code)** | OpenAI-Compatible Provider в настройках | Автономный агент, терминал, чтение и правка файлов |
| **VS Code & JetBrains (Continue)** | `~/.continue/config.yaml` | Чат с контекстом, автокомплит кода, `Ctrl+I` |
| **Windsurf (Cascade)** | Model Provider Settings -> Custom OpenAI | Агент Cascade, генерация кода |
| **JetBrains (CodeGPT)** | Tools -> CodeGPT -> Custom (OpenAI) | Чат, рефакторинг в IDEA, PyCharm, WebStorm |
| **OpenCode Desktop** | Кнопка «⚡ Настроить автоматически» в 1 клик | Полный автономный агент со всеми инструментами |
| **Aider** | Консоль / переменные `OPENAI_API_BASE` и `OPENAI_API_KEY` | Парное программирование в терминале |
| **Zed** | `settings.json` -> `language_models.openai` | Встроенный ассистент Zed |

> 📖 **[Подробные пошаговые инструкции со всеми конфигурациями смотрите в docs/IDE_INTEGRATION.md](docs/IDE_INTEGRATION.md)**

---

## 🚀 Быстрый старт на Windows

### Способ 1 — Готовый установщик (WebAIFreeAPI-Setup.exe)
1. Скачай **[WebAIFreeAPI-Setup.exe](https://github.com/j46871417-ui/WebAIFreeAPI/releases/latest/download/WebAIFreeAPI-Setup.exe)** (или выбери версию в [Releases](https://github.com/j46871417-ui/WebAIFreeAPI/releases)).
2. Запусти установщик — он автоматически:
   - Установит приложение в `C:\Program Files\WebAIFreeAPI`;
   - Создаст ярлыки на рабочем столе (**WebAIFreeAPI** и **WebAIFreeAPI Launcher**);
   - Настроит конфиг OpenCode Desktop.
3. Запусти с ярлыка, пройди авторизацию в нужных провайдерах (DeepSeek / Qwen) один раз — и пользуйся!

### Способ 2 — Из исходного кода (Git)
```powershell
git clone https://github.com/j46871417-ui/WebAIFreeAPI.git WebAIFreeAPI
cd WebAIFreeAPI
npm install
npm start
```

В PowerShell или Windows Terminal — обе оболочки работают. CMD тоже, но Windows Terminal удобнее для интерактивного ввода (например, при `npm run save-creds`).

---

## 🎬 Первый запуск

```bash
npm start
```

Что произойдёт:

1. Если **ни один провайдер** ещё не подключён — консольный welcome-экран: выбери `1` (DeepSeek), `2` (Qwen) или `1,2` (оба).
2. Для каждого выбранного провайдера откроется окно логина в Chrome/Chromium — зайди **один раз** (Google OAuth, email/пароль, captcha).
3. **DeepSeek:** окно закроется само после первого успешного API-запроса; сессия → `~/.deepseek-cli/`.
4. **Qwen:** окно закроется, когда в cookies появится JWT (`token`); сессия → `~/.qwen-cli/`.
5. Откроется рабочее окно чатов (`localhost:4317`).

Повторный запуск — `npm start` без welcome, если auth уже есть. Qwen можно добавить позже: **«+ New chat»** → Qwen → **«нажми — подключить»**.

---

## 📁 Где что хранится

Служебные файлы — вне проекта, в домашней папке пользователя.

**DeepSeek** (`~/.deepseek-cli/` на Unix, `%USERPROFILE%\.deepseek-cli\` на Windows):

```
~/.deepseek-cli/
├── auth.json              # cookies + userToken (mode 0600 на Unix)
├── browser-profile/       # Chromium-профиль с сессией DeepSeek
├── state.json             # все чаты (глобально)
├── state.backup.json
├── settings.json          # allow-list команд для /code
└── credentials.json       # email + пароль (опционально, только DeepSeek)
```

**Qwen** (отдельно, не смешивается с DeepSeek):

```
~/.qwen-cli/
├── auth.json              # cookies + JWT token
└── browser-profile/       # Chromium-профиль для chat.qwen.ai и browser-proxy
```

**ChatGPT** (отдельно от DeepSeek и Qwen):

```
~/.chatgpt-cli/
├── auth.json              # cookies + session data
└── browser-profile/       # Chromium-профиль для chatgpt.com
```

**Memory + Skills** (общие для всех провайдеров):

```
~/.ai-free/
├── memory/
│   ├── memory.db          # SQLite FTS5 (+ graph tables)
│   ├── vault/             # Markdown-файлы заметок {id}.md
│   └── graph.json         # fallback графа (Node < 22)
└── skills/                # пользовательские skills (builtins в репо)
```

Чаты и настройки `/code` — в `~/.deepseek-cli/state.json` (общие для всех провайдеров).

---

## 🧹 Полное удаление

Есть два уровня удаления:

1. **Удалить только код приложения** — чаты, токены, browser-сессии, memory и skills останутся в домашней папке.
2. **Удалить полностью** — вместе с чатами, авторизацией, локальной памятью, skills, browser-профилями и плагином VS Code.

### 1. Удалить desktop/local версию без удаления данных

Если AI Free был установлен через `git clone`, закрой приложение и удали папку проекта:

```bash
# macOS / Linux
rm -rf ~/path/to/ai-free
```

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force "$env:USERPROFILE\path\to\ai-free"
```

Замени `~/path/to/ai-free` или `$env:USERPROFILE\path\to\ai-free` на реальный путь, куда был клонирован проект.

### 2. Полное удаление desktop/local версии вместе с данными

Это удалит:

- чаты и настройки: `~/.deepseek-cli/state.json`, `settings.json`;
- DeepSeek-сессию и browser-профиль: `~/.deepseek-cli/`;
- Qwen-сессию и browser-профиль: `~/.qwen-cli/`;
- ChatGPT-сессию и browser-профиль: `~/.chatgpt-cli/`;
- memory, skills и установленные плагины AI Free: `~/.ai-free/`.

```bash
# macOS / Linux
rm -rf ~/.deepseek-cli ~/.qwen-cli ~/.chatgpt-cli ~/.ai-free
```

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force `
  "$env:USERPROFILE\.deepseek-cli", `
  "$env:USERPROFILE\.qwen-cli", `
  "$env:USERPROFILE\.chatgpt-cli", `
  "$env:USERPROFILE\.ai-free"
```

После этого удали саму папку проекта, как в предыдущем пункте.

### 3. Удалить VS Code plugin

Через интерфейс VS Code:

1. Открой **Extensions**.
2. Найди **AI Free Chat & Agent**.
3. Нажми **Uninstall**.
4. Перезапусти VS Code.

Через терминал:

```bash
code --uninstall-extension developers-daily-life.ai-free-vscode
```

Если команда `code` недоступна, включи её в VS Code: **Command Palette** → `Shell Command: Install 'code' command in PATH`.

### 4. Удалить всё после VS Code plugin

Сам плагин использует те же локальные данные, что и desktop-версия. Если нужно удалить всё без следов, после удаления расширения выполни команды из раздела **Полное удаление desktop/local версии вместе с данными**.

### 5. Опционально: удалить браузеры Playwright/Patchright

AI Free скачивает Chromium через npm-зависимости. Обычно достаточно удалить папку проекта и `node_modules`, но если нужно освободить место полностью, можно также удалить кеш браузеров:

```bash
# macOS / Linux
rm -rf ~/Library/Caches/ms-playwright ~/.cache/ms-playwright ~/.cache/patchright
```

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force `
  "$env:LOCALAPPDATA\ms-playwright", `
  "$env:USERPROFILE\AppData\Local\ms-playwright", `
  "$env:USERPROFILE\AppData\Local\patchright"
```

Если в этих папках лежат браузеры от других проектов на Playwright, они тоже будут удалены и могут скачаться заново при следующем запуске тех проектов.

---

## ⌨️ Команды npm

| Команда | Что делает |
|---------|------------|
| `npm start` | Окно чатов (`localhost:4317`). Welcome + логин, если провайдер не подключён. |
| `npm run window` | Алиас `npm start`. |
| `npm run server` | Тот же сервер чатов и `/v1`, но без открытия окна; события идут в консоль. |
| `npm run cli` | Терминальный REPL (`/code`, `/ls`, `/new`, …). |
| `npm run api` | OpenAI-совместимый API на `127.0.0.1:4318`. |
| `npm run welcome` | Снова показать выбор провайдеров и подключить новые. |
| `npm run check` | Проверка auth DeepSeek (`OK: authenticated`). |
| `npm run login` | Re-login DeepSeek → `~/.deepseek-cli/auth.json`. |
| `npm run login-qwen` | Re-login Qwen → `~/.qwen-cli/auth.json`. |
| `npm run import-qwen` | Импорт cookies из JSON (Chrome / Cookie Editor), без Playwright. |
| `npm run save-creds` | Email + пароль для авто-заполнения формы DeepSeek. |
| `npm test` | Полный набор юнит- и интеграционных тестов. |

Запуск OpenAI-совместимого API (отдельный процесс):

```bash
npm run api
# → http://127.0.0.1:4318/v1
```

Если уже открыто окно чатов (`npm start`), тот же API доступен прямо на порту окна:
`http://127.0.0.1:4317/v1`. Base URL и ключи есть в Settings. Для DeepSeek и
Qwen создаются отдельные ключи формата `sk-...`; каждый ключ переиспользуется из
`~/.deepseek-cli/settings.json` и не дублируется.

Если окно не нужно, запусти:

```bash
npm run server
```

Это поднимает тот же сервер на `http://127.0.0.1:4317` и тот же API на
`http://127.0.0.1:4317/v1`, но Chromium-окно не открывается. Основные события
чатов, API-запросов и `/code`-задач печатаются в консоль.

---

## 🔌 Подключение Qwen

Qwen использует **отдельный** Chromium-профиль и API через встроенный browser-proxy (подпись `bx-ua` на стороне chat.qwen.ai). Без логина Qwen в чатах не появится.

### Способ 1 — из окна чатов (рекомендуется)

1. `npm start`
2. **«+ New chat»** → провайдер **Qwen**
3. Если подпись «нажми — подключить» — клик по карточке Qwen
4. Подтверди диалог → откроется `chat.qwen.ai` → залогинься → окно закроется само

### Способ 2 — из терминала

```bash
npm run login-qwen
```

### Способ 3 — импорт cookies (если Playwright блокирует антибот)

1. Залогинься в **обычном Chrome** на [chat.qwen.ai](https://chat.qwen.ai)
2. Экспортируй cookies расширением (Cookie Editor, EditThisCookie) в JSON
3. Импорт:

```bash
npm run import-qwen -- /path/to/cookies.json
```

Куки попадут и в `auth.json`, и в `browser-profile` — API и окно чатов увидят одну сессию.

### Авто-обновление сессии

Как у DeepSeek: при протухшей сессии программа сначала пробует **тихий refresh** из `~/.qwen-cli/browser-profile` (без окна). Если не вышло — открывает окно логина. В окне чатов и в API (`node api/server.mjs`) это встроено.

Перед Qwen-чатом нужен хотя бы один успешный `login-qwen` или импорт — иначе нечего обновлять.

---

## 🔐 Авто-логин email/пароль

Если у тебя обычный email-вход (не Google OAuth) и хочется полный автомат:

```bash
npm run save-creds
```

Спросит email и пароль (ввод пароля скрытый). Сохранит в `~/.deepseek-cli/credentials.json` plaintext с правами 0600 на Unix / ACL юзера на Windows.

В будущем, когда сессия истечёт и понадобится re-login, программа сама заполнит форму и кликнет Sign in. Тебе остаётся только пройти captcha, если попросят.

**Если входишь через Google OAuth** — эта команда не нужна. Google-форма не наша, autofill там не сработает, но Google-сессия и так сохранится в Chromium-профиле и при следующем re-login потребует от тебя только клик на «Sign in».

---

## 🛡️ Настройка разрешённых команд

В окне чата справа сверху — кнопка ⚙. Открывается панель с тремя группами команд по уровню риска:

- **🟢 Low:** `node`, `npm`, `python`, `ls`, `cat`, `mkdir`, `cp`, `grep`, и т.п. — безопасны.
- **🟡 Medium:** `git`, `mv`, `sed`, `chmod`, `make`, `find` — могут менять данные, но с защитами (например, `git clone` и `push --force` заблокированы).
- **🔴 High:** `rm` — со строгой блокировкой `-rf`.

Чекбокс = включено для `/code`. Сохраняется мгновенно. По умолчанию включены первые 7 команд (старый whitelist).

---

## 🗂️ Привязка чатов к папкам

В UI окна:

1. Кнопка **«+ New chat»** → модалка.
2. Поле «Папка проекта» — путь к workspace. Под полем: чипы недавних проектов.
3. Кнопка **`📁 Обзор`** — открывает файловый браузер. Можно ходить по дереву, создавать новые папки прямо там через **`➕ Новая папка`**.
4. Чекбокс «Создать папку, если её ещё нет» — если включён, программа создаст путь из инпута (только под `$HOME`).
5. **Создать чат** → чат привязан к этой папке. Любой `/code` в этом чате работает с файлами в его папке, не пересекаясь с другими.

В сайдбаре под именем чата видно `📁 имя-папки` — это его workspace.

---

## 🧠 Memory и Skills

### Topbar (в активном чате)

| Элемент | Назначение |
|---------|------------|
| **🛠 Coder** | Каждое сообщение → `/code`-агент (без префикса) |
| **🧠 Память** | Подтягивать прошлые ошибки/фиксы в prompt; сохранять опыт после задачи |
| **Skill auto** | Автовыбор skill по ключевым словам задачи |
| **Skill dropdown** | Ручной skill: `code-review`, `bug-fix`, `video-script` |

### CLI / чат

```
/code исправь баг в auth
/skill code-review проверь src/memory/
/skill video-script hook для YouTube Short про memory
```

После задачи внизу ответа — footer: `memory used · graph · saved · skill`.

### Settings → вкладка «Агент»

- Defaults для новых чатов (память, auto-skill)
- Список установленных skills
- Recent memory + удаление записей
- Badge backend: `sqlite · graph: sqlite`

Подробнее: [docs/AI_FREE_BRAINS_AND_SKILLS_PLAN.md](docs/AI_FREE_BRAINS_AND_SKILLS_PLAN.md). Сценарий для записи видео: [docs/VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md).

---

## 🛑 Закрытие

`Ctrl+C` в терминале → сервер останавливается → окно чатов через ~4–6 секунд само закрывается (heartbeat polling в фронте определяет, что сервер мёртв).

Закрытие терминала через ⌘W / правый-клик-Close — то же самое (терминал шлёт SIGHUP).

Если что-то зависло, можно убить процесс по PID. На Windows — Task Manager → Node.js.

---

## 🖥️ Платформенные нюансы

### macOS

- Открывает окно чатов в **`--app=` режиме Chrome** (без табов, без URL-бара, выглядит как desktop-приложение).
- При первом запуске Chrome macOS может спросить «Chrome wants to access Documents folder» — разреши.
- SIGINT/SIGHUP работают штатно. Окно закрывается само через ~5с после `Ctrl+C`.

### Linux

- Окно чатов открывается в **`--app=` режиме**: программа ищет `google-chrome`, `chromium`, `chromium-browser` или `microsoft-edge` в `PATH` и запускает с флагом `--app=URL`. Получаешь отдельное окно-приложение, как на macOS.
- Если ни один из этих браузеров не установлен — fallback на `xdg-open`: обычная вкладка в дефолтном браузере.
- Если у тебя Wayland (а не X11), Chromium из Playwright обычно работает, но если возникнут странности — попробуй `XDG_SESSION_TYPE=x11 npm start`.
- Системные зависимости для Playwright Chromium ставятся командой `sudo npx playwright install-deps chromium`.

### Windows

- Окно чатов открывается в **`--app=` режиме**: программа ищет `chrome.exe` в стандартных местах (`Program Files\Google\Chrome\Application\`, `%LOCALAPPDATA%\Google\Chrome\Application\`), также пробует `msedge.exe` от Edge.
- Если ничего не найдено — fallback на `cmd /c start` (открывает в дефолтном браузере как обычную вкладку).
- Маскированный ввод пароля (`npm run save-creds`) работает в Windows Terminal и PowerShell. В классическом CMD тоже работает, но без UTF-8 в кириллице могут быть кракозябры в выводе.
- Ctrl+C ловится штатно. SIGHUP на Windows не существует — но при закрытии окна терминала Node всё равно умирает, фронт это замечает по heartbeat и закрывается.
- `fs.chmodSync(0o600)` — no-op (Windows использует ACL). По умолчанию папка `%USERPROFILE%\.deepseek-cli\` доступна только владельцу.

---

## 🧰 Если что-то ломается

**Правило №1:** `rm -rf ~/.deepseek-cli && npm start` (или `Remove-Item -Recurse -Force $env:USERPROFILE\.deepseek-cli` на Windows). Это ядерный сброс — снесёт сессию, токены, профиль, настройки. После сброса заново заходишь, всё работает с нуля.

**`Error: Executable doesn't exist at ...chromium...`** → не запускал `npx playwright install chromium`. Запусти.

**`Failed to create a ProcessSingleton`** → остался stale lock от падающего Chromium. Запусти ещё раз — программа сама чистит эти файлы при следующем launch.

**Окно открылось, но `chat.deepseek.com` показывает ошибки** → попробуй обновить страницу. Если не помогло — ядерный сброс.

**Сессия истекла, окно re-login не открывается** → `npm run login` (DeepSeek) или `npm run login-qwen` (Qwen).

**Распознавание картинок (vision): `invalid ref file id` (biz_code 9)** → completion раньше, чем файл стал SUCCESS. В логах нужно `ready (status=SUCCESS)`, не `PARSING`.

**`CONTENT_EMPTY` после upload** → DeepSeek **не смог разобрать** картинку (не «долго грузится»). Сразу ошибка с подсказкой. Что попробовать: JPG/PNG (не SVG), до ~4 МБ, чёткий скриншот/фото с текстом. Большие PNG (~1.5 МБ) иногда дают CONTENT_EMPTY — сожми или пересохрани в JPEG.

### Qwen

| Симптом | Что делать |
|---------|------------|
| В «Новый чат» Qwen серый / «не подключён» | Клик по Qwen → «подключить», или `npm run login-qwen` |
| `Qwen не подключён` в чате | То же + проверь `~/.qwen-cli/auth.json` |
| Окно логина закрылось, JWT не появился | Антибот: `npm run import-qwen -- cookies.json` из Chrome |
| Ответы пустые / Bad_Request | Не ставь `QWEN_TRANSPORT=direct` в `.env` — нужен режим `browser` (по умолчанию) |
| После `import-qwen` всё равно не работает | Обнови репо (`git pull`), перезапусти `npm start` — куки синхронизируются в профиль |
| Сессия была, потом отвалилась | Обычно помогает тихий refresh; иначе `npm run login-qwen` |

Ядерный сброс только Qwen (DeepSeek не трогает):

```bash
rm -rf ~/.qwen-cli
npm run login-qwen
```

---

## 🔗 Интеграция с Kilo Code

Этот проект можно использовать как провайдер для Kilo Code или других IDE с поддержкой OpenAI-совместимых API.

### Запуск API сервера

```bash
npm run api
```

Сервер запустится на `http://127.0.0.1:4318`.

### Настройка в Kilo Code

1. Подключи провайдеров в CLI: `npm run login` и/или `npm run login-qwen`
2. Запусти API: `npm run api` или открой окно чатов и возьми Base URL из Settings
3. В Kilo Code — **OpenAI-совместимый провайдер**:
   - **Base URL:** `http://127.0.0.1:4318/v1`
   - **API Key:** DeepSeek или Qwen key из Settings
   - **Модели:** см. `GET http://127.0.0.1:4318/v1/models`

| Имя в Kilo Code | Провайдер |
|-----------------|-----------|
| `deepseek-v4-flash`, `deepseek-chat` | DeepSeek, обычный чат |
| `deepseek-v4-pro`, `deepseek-reasoner` | DeepSeek reasoning / Expert |
| `qwen3.7-max` (дефолт), `qwen3.6-plus`, `qwen3-max`, … | Qwen |

**Важно:** в настройках Kilo указывай именно эти id — не подставляй `deepseek-reasoner` вручную в другие поля. Сервер сам маппит `deepseek-reasoner` → `model_type: expert` у DeepSeek.

При ошибке `unknown variant 'deepseek-reasoner'` — обнови репозиторий (`git pull`) и перезапусти `node api/server.mjs` (нужна актуальная `api/models.mjs`).

---

## 🧩 Интеграция с PyCharm ACP

PyCharm AI Assistant запускает ACP-агента как subprocess из `~/.jetbrains/acp.json`.
Для этого в проекте есть режим:

```bash
node ./bin/deepseek.mjs --acp
```

ACP-агент ходит в наш OpenAI-compatible API (`http://127.0.0.1:4317/v1` или `4318/v1`).
Перед запуском в PyCharm должен быть поднят `npm start` или `npm run api`.

Пример `~/.jetbrains/acp.json`:

```json
{
  "default_mcp_settings": {
    "use_idea_mcp": true,
    "use_custom_mcp": true
  },
  "agent_servers": {
    "HR Recruiter (Qwen)": {
      "command": "/path/to/node",
      "args": ["/path/to/ai-free/bin/deepseek.mjs", "--acp"],
      "env": {
        "OPENAI_BASE_URL": "http://127.0.0.1:4317/v1",
        "OPENAI_API_KEY": "QWEN_KEY_FROM_SETTINGS",
        "OPENAI_MODEL": "qwen3.7-max",
        "DSCLI_ACP_ROLE": "recruiter"
      }
    }
  }
}
```

Доступные HR-роли: `recruiter`, `sourcer`, `interviewer`, `policy`.

---

## 🔒 Безопасность

- Токены и cookies — в `~/.deepseek-cli/` и `~/.qwen-cli/` (plaintext, `0o600` на Unix, ACL на Windows).
- `credentials.json` — только DeepSeek, опционально. **Не используй тот же пароль, что для банка/почты.**
- `/code` — команды без shell, в пределах workspace, whitelist. `curl`/`wget`/`bash` заблокированы по умолчанию.
- Серверы чатов и API слушают только `127.0.0.1` (`4317`, `4318`).
- Chromium-профили DeepSeek и Qwen **разделены** — сессии не смешиваются; открывает только Playwright по запросу программы.

## 🧾 Подробные логи

Desktop и VS Code записывают единый структурированный журнал JSONL:

- Windows: `%USERPROFILE%\.ai-free\logs\ai-free.log`
- macOS/Linux: `~/.ai-free/logs/ai-free.log`

Журнал содержит запуск и остановку процессов, HTTP-статусы, выбранные провайдеры и модели, длительность запросов, повторы, фоновые задачи, вызовы инструментов и полные stack trace ошибок. Текст запросов и ответов не сохраняется; API-ключи, cookies, токены и пароли маскируются. По умолчанию хранится не больше пяти файлов по 5 МиБ.

Настройка через переменные окружения: `AI_FREE_LOG_LEVEL`, `AI_FREE_LOG_DIR`, `AI_FREE_LOG_MAX_BYTES`, `AI_FREE_LOG_MAX_FILES`. Путь к текущему журналу также указан в **Настройки → Статус → Скопировать отчёт**.

---

## 💬 Сообщество и обратная связь

- 📢 **Telegram-сообщество**: присоединяйся к группе, посвященной моим программам и проектам сообщества — **[t.me/+8qU7020rMF84OWNi](https://t.me/+8qU7020rMF84OWNi)**
- 🐛 **Нашёл баг или есть идея?** Открой [Issue в репозитории](https://github.com/j46871417-ui/ai-free/issues).

## 📄 Лицензия

Personal-Use-Only — см. [LICENSE](LICENSE). Кратко: использовать в личных целях можно, распространять и модифицировать для распространения — только с разрешения автора. При любом одобренном использовании имя автора должно сохраняться.
