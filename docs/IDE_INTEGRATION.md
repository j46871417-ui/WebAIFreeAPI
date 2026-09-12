# Руководство по подключению WebAIFreeAPI к IDE и кодовым агентам

**WebAIFreeAPI** предоставляет полнофункциональный локальный OpenAI-совместимый (`/v1/chat/completions`) и Anthropic-совместимый (`/v1/messages`) API для моделей **Qwen**, **DeepSeek** и **ChatGPT**.

Все запросы обрабатываются локально без платных подписок и API-токенов облачных платформ.

---

## 🔑 Где взять API-ключ и базовый URL?

1. Запустите WebAIFreeAPI.
2. Откройте **Настройки (Settings)** -> вкладка **API / IDE**.
3. В верхней части окна вы увидите ваш **Базовый URL** (по умолчанию `http://127.0.0.1:4317/v1`) и персональные **API-ключи** (`sk-...`), сгенерированные автоматически для вашего компьютера.
4. Нажмите кнопку **📋 Скопировать** рядом с нужным ключом.
5. Выберите вашу IDE в интерактивном переключателе — интерфейс сгенерирует готовый конфиг с вашими ключами.

---

## 1. Cursor

Cursor — популярный AI-редактор с поддержкой Composer и фонового редактирования.

### Пошаговая настройка:
1. В правом верхнем углу окна Cursor нажмите иконку шестерёнки (**Cursor Settings**) или нажмите `Ctrl+Shift+J` (`Cmd+Shift+J` на macOS).
2. Перейдите во вкладку **Models**.
3. В поле **OpenAI API Key** вставьте ваш локальный ключ (например, `sk-...` от Qwen или DeepSeek).
4. Включите переключатель **Override OpenAI Base URL**.
5. В поле адреса укажите:
   ```text
   http://127.0.0.1:4317/v1
   ```
6. В блоке моделей добавьте нужные модели (выключив стандартные):
   - `qwen3.7-max` (рекомендуется для агента и сложных задач)
   - `deepseek-chat`
   - `deepseek-reasoner` (R1)

---

## 2. VS Code: Cline и Roo Code (Roo Cline)

Cline и Roo Code — автономные кодовые агенты в VS Code, поддерживающие чтение, создание файлов, запуск команд в терминале и пошаговый рефакторинг.

### Способ 1 — Через графический интерфейс расширения:
1. Откройте панель **Cline** или **Roo Code** в левой панели VS Code.
2. Нажмите на иконку настроек (шестерёнка ⚙️) в правом верхнем углу панели.
3. В поле **API Provider** выберите **OpenAI-Compatible** (или **Anthropic-Compatible**).
4. Укажите параметры:
   - **Base URL**: `http://127.0.0.1:4317/v1`
   - **API Key**: ваш сгенерированный ключ `sk-...`
   - **Model ID**: `qwen3.7-max` (или `deepseek-chat`)

### Способ 2 — Через `settings.json` VS Code:
Добавьте в ваш `settings.json` (в `%APPDATA%\Code\User\settings.json` или `~/.config/Code/User/settings.json`):
```json
{
  "cline.apiProvider": "openai-compatible",
  "cline.openAiBaseUrl": "http://127.0.0.1:4317/v1",
  "cline.openAiApiKey": "ВАШ_СГЕНЕРИРОВАННЫЙ_КЛЮЧ",
  "cline.openAiModelId": "qwen3.7-max",
  "cline.openAiCustomModelInfo": {
    "maxTokens": 8192,
    "contextWindow": 128000,
    "supportsImages": true,
    "supportsComputerUse": true
  }
}
```

---

## 3. VS Code & JetBrains: Continue (continue.dev)

Continue — ведущее open-source расширение для чата, инлайн-правок (`Ctrl+I`) и автодополнения кода.

### Настройка:
Откройте файл конфигурации `~/.continue/config.yaml` (или нажмите иконку Continue -> шестерёнка на панели):

```yaml
models:
  - name: "Qwen 3.7 Max (WebAIFreeAPI)"
    provider: "openai"
    model: "qwen3.7-max"
    apiBase: "http://127.0.0.1:4317/v1"
    apiKey: "ВАШ_КЛЮЧ_QWEN"
  - name: "DeepSeek Chat (WebAIFreeAPI)"
    provider: "openai"
    model: "deepseek-chat"
    apiBase: "http://127.0.0.1:4317/v1"
    apiKey: "ВАШ_КЛЮЧ_DEEPSEEK"
  - name: "DeepSeek Reasoner R1"
    provider: "openai"
    model: "deepseek-reasoner"
    apiBase: "http://127.0.0.1:4317/v1"
    apiKey: "ВАШ_КЛЮЧ_DEEPSEEK"

tabAutocompleteModel:
  title: "Qwen Code Autocomplete"
  provider: "openai"
  model: "qwen3-coder-plus"
  apiBase: "http://127.0.0.1:4317/v1"
  apiKey: "ВАШ_КЛЮЧ_QWEN"
```

---

## 4. Windsurf (Codeium Cascade)

AI-редактор нового поколения с агентом Cascade.

### Пошаговая настройка:
1. Откройте **Windsurf Settings** (`Ctrl+,`).
2. Найдите раздел **Model Provider Settings** -> **Custom OpenAI**.
3. Укажите:
   - **Endpoint**: `http://127.0.0.1:4317/v1`
   - **API Key**: ваш ключ `sk-...`
   - **Model Name**: `qwen3.7-max`

---

## 5. JetBrains IDE (IntelliJ IDEA, PyCharm, WebStorm, Rider, GoLand, CLion, PhpStorm)

### Подключение через плагин CodeGPT:
1. Установите плагин **CodeGPT** из Marketplace (`Settings` -> `Plugins`).
2. Перейдите в **Settings** -> **Tools** -> **CodeGPT** -> **Providers** -> выберите **Custom (OpenAI)**.
3. Введите настройки:
   - **URL**: `http://127.0.0.1:4317/v1`
   - **API Key**: ваш сгенерированный ключ
   - **Chat Model**: `qwen3.7-max`
   - **Code Model**: `deepseek-chat`
4. Нажмите **Apply** и начните работу в окне CodeGPT справа.

---

## 6. OpenCode Desktop

OpenCode Desktop — десктопный агент разработки.

### Автоматическая настройка в 1 клик:
В интерфейсе WebAIFreeAPI перейдите в **Настройки** -> выберите вкладку **OpenCode Desktop** и нажмите кнопку **⚡ Настроить OpenCode автоматически в 1 клик**.

### Ручная настройка:
Файл конфигурации расположен по пути:
- Windows: `%USERPROFILE%\.opencode\opencode.json`
- Linux/macOS: `~/.opencode/opencode.json`

Пример конфигурации:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "ai-free-qwen/qwen3.7-max",
  "small_model": "ai-free-deepseek/deepseek-chat",
  "provider": {
    "ai-free-qwen": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "WebAIFreeAPI (Qwen)",
      "options": {
        "baseURL": "http://127.0.0.1:4317/v1",
        "apiKey": "ВАШ_КЛЮЧ_QWEN"
      },
      "models": {
        "qwen3.7-max": { "name": "Qwen 3.7 Max", "tools": true },
        "qwen3.7-plus": { "name": "Qwen 3.7 Plus" },
        "qwen3-coder-plus": { "name": "Qwen 3 Coder Plus", "tools": true }
      }
    },
    "ai-free-deepseek": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "WebAIFreeAPI (DeepSeek)",
      "options": {
        "baseURL": "http://127.0.0.1:4317/v1",
        "apiKey": "ВАШ_КЛЮЧ_DEEPSEEK"
      },
      "models": {
        "deepseek-chat": { "name": "DeepSeek Chat", "tools": true },
        "deepseek-reasoner": { "name": "DeepSeek Reasoner (R1)", "tools": true }
      }
    }
  }
}
```

---

## 7. Aider (Терминальный парный агент)

Aider — консольный AI-ассистент, который вносит изменения прямо в локальные файлы проекта и автоматически коммитит их в Git.

### Запуск в Windows (CMD):
```cmd
set OPENAI_API_BASE=http://127.0.0.1:4317/v1
set OPENAI_API_KEY=ВАШ_КЛЮЧ_QWEN
aider --model openai/qwen3.7-max
```

### Запуск в PowerShell:
```powershell
$env:OPENAI_API_BASE="http://127.0.0.1:4317/v1"
$env:OPENAI_API_KEY="ВАШ_КЛЮЧ_QWEN"
aider --model openai/qwen3.7-max
```

### Запуск в Linux / macOS:
```bash
export OPENAI_API_BASE="http://127.0.0.1:4317/v1"
export OPENAI_API_KEY="ВАШ_КЛЮЧ_QWEN"
aider --model openai/qwen3.7-max
```

---

## 8. Zed Editor

Быстрый редактор нового поколения.

### Настройка:
Откройте `settings.json` редактора (`Ctrl+,` или через палитру команд `zed: open settings`):
```json
{
  "language_models": {
    "openai": {
      "version": "1",
      "api_url": "http://127.0.0.1:4317/v1",
      "available_models": [
        {
          "name": "qwen3.7-max",
          "display_name": "Qwen 3.7 Max",
          "max_tokens": 8192
        },
        {
          "name": "deepseek-chat",
          "display_name": "DeepSeek Chat",
          "max_tokens": 8192
        },
        {
          "name": "deepseek-reasoner",
          "display_name": "DeepSeek Reasoner",
          "max_tokens": 8192
        }
      ]
    }
  }
}
```

---

## 📋 Доступные модели

| Название модели | Провайдер | Назначение |
|---|---|---|
| `qwen3.7-max` | Qwen | Флагманская модель, лучший выбор для кода, агентов (tool calling) и сложных задач |
| `qwen3.7-plus` | Qwen | Быстрая сбалансированная модель |
| `qwen3-coder-plus` | Qwen | Специализированная модель для генерации кода и автокомплита |
| `deepseek-chat` | DeepSeek | Быстрый чат и решение повседневных задач |
| `deepseek-reasoner` | DeepSeek | Модель с глубокими цепочками рассуждений (Reasoning R1) |
| `gpt-4o` | ChatGPT | Модель ChatGPT для OpenAI-совместимых запросов |
