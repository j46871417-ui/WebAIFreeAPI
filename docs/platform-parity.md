# Архитектурная модель и паритет платформ (Windows & Linux)

Документ описывает единую архитектуру и функциональный контракт **WebAIFreeAPI** для операционных систем Windows и Linux (включая дистрибутивы РОСА 13 Fresh, ALT Linux, Red Hat / Fedora, Debian / Ubuntu).

---

## 1. Архитектурная модель: Common Core + Thin Platform Adapters

WebAIFreeAPI построен по принципу **единого источника истины** (Single Source of Truth) для всей бизнес-логики и тонких платформенных адаптеров:

```text
                           common/core (Node.js)
                                     |
               +---------------------+---------------------+
               |                                           |
        platform/windows                            platform/linux
               |                                           |
   +-----------+-----------+                   +-----------+-----------+
   | Installer (InnoSetup) |                   | Installer (install.sh)|
   | Native Tray (WPF/C#)  |                   | Python Tray (pystray) |
   | Updater (Setup.exe)   |                   | Updater (tar.gz/rpm)  |
   | Process (CIM/taskkill)|                   | Process (/proc, killpg|
   | Registry/AppData cfg  |                   | systemd user service  |
   | Desktop Shortcut      |                   | Freedesktop .desktop  |
   +-----------------------+                   +-----------------------+
```

### Единая кодовая база (Common Core):
- **API & Routing:** OpenAI-совместимый эндпоинт `/v1/chat/completions`, стриминг SSE, валидация ключей, обработка заголовков CORS.
- **Provider Core:** Транспорты DeepSeek, Qwen, ChatGPT, Grok, Mistral, Claude, Gemini; поддержка reasoning/thinking стриминга, tool calling и умного поиска.
- **Session Management:** Браузерные профили, сохранение куки и токенов авторизации в `~/.deepseek-cli/`.
- **OpenCode Integration (`src/integrations/opencode.mjs`):** Безопасный мерж каталога моделей и провайдеров в `opencode.json` без затирания пользовательских настроек, резервное копирование и автоматический откат.
- **Diagnostics (`src/diagnostics/doctor.mjs`):** Единый диагностический движок (`ai-free doctor`), проверяющий 8 категорий окружения.
- **Process Registry (`src/process/instance-registry.mjs`):** Атомарный реестр запущенных экземпляров, верификация владения PID через `/proc` / CIM, завершение групп процессов без неизбирательного `pkill`.
- **Updater Engine (`src/updater.mjs`):** Строгий SemVer 2.0.0, каналы обновлений (`stable`, `beta`, `alpha`), проверка контрольных сумм SHA-256, staged extraction, атомарная активация и откат.

---

## 2. Матрица функционального паритета (Feature Parity Matrix)

| Возможность / Компонент | Windows | Linux | Статус паритета |
| :--- | :--- | :--- | :--- |
| **OpenAI-compatible API** | Порт 4317 / 4318, SSE стриминг | Порт 4317 / 4318, SSE стриминг | 100% идентично |
| **Web UI (Window Mode)** | Chrome/Edge app mode (`--app=http://...`) | Chromium/Chrome/Brave app mode (`--app=http://...`) | 100% идентично |
| **System Tray** | WPF/C# Tray (`WebAIFreeAPI.exe`) | Python 3 + pystray/PIL (`ai_free_tray.py`) | Полный паритет меню и действий |
| **Background Service** | Windows Service / автозапуск в реестре | Systemd user service (`ai-free.service`) | Идентичный жизненный цикл |
| **CLI управление** | `ai-free`, `--status`, `--stop` | `ai-free start/stop/restart/status/logs/doctor` | Полный паритет |
| **Диагностика (`doctor`)** | `ai-free doctor` (`--json`, `--strict`) | `ai-free doctor` (`--json`, `--strict`) | Единый модуль `src/diagnostics` |
| **Интеграция OpenCode** | `%APPDATA%\opencode\opencode.json` | `~/.config/opencode/opencode.json`, `~/.opencode/` | Единый безопасный мерж и бэкап |
| **Процессы и блокировки** | CIM Process, SingletonLock, PID check | `/proc/<pid>/cmdline`, process groups, PID check | Безопасная очистка без `pkill` |
| **Автообновление** | Скачивание и запуск `WebAIFreeAPI-Setup.exe` | Скачивание `.tar.gz` или `.rpm`, staged замена | SemVer 2.0.0, SHA-256, Rollback |
| **Code Agent Shell** | PowerShell / CMD / Git Bash | Bash / Sh / PowerShell Core (`pwsh`) | Контракт изоляции и отмены (Abort) |

---

## 3. Процесс установки и интеграция с ОС

### Windows
1. **Инсталлятор:** `WebAIFreeAPI-Setup.exe` (создаёт ярлык на рабочем столе, автозапуск, трей).
2. **Портативный запуск:** Запуск `WebAIFreeAPI.exe` из любой папки.

### Linux
1. **Автономный установщик:**
   ```bash
   # Пользовательская установка в ~/.local (без root):
   ./linux/install.sh

   # Системная установка в /opt/ai-free:
   sudo ./linux/install.sh --system

   # Удаление:
   ./linux/install.sh --uninstall
   ```
2. **RPM пакет (РОСА 13, ALT Linux, Fedora):**
   ```bash
   sudo dnf install ./ai-free-1.10.0-alpha.1.noarch.rpm
   # или для РОСА / urpmi:
   sudo urpmi ./ai-free-1.10.0-alpha.1.noarch.rpm
   ```
3. **Управление фоновой службой:**
   ```bash
   systemctl --user start ai-free
   systemctl --user status ai-free
   systemctl --user restart ai-free
   systemctl --user stop ai-free
   ```
4. **Запуск через CLI:**
   ```bash
   ai-free doctor     # Проверка готовности окружения и браузеров
   ai-free start      # Запуск службы в фоне
   ai-free status     # Проверка статуса сервиса
   ai-free stop       # Безопасная остановка
   ai-free logs       # Просмотр логов
   ai-free --window   # Открытие Web UI
   ai-free --tray     # Запуск системного трея
   ```

---

## 4. Гарантии безопасности и изоляции процессов

1. **Никакого неизбирательного `pkill -f`:**
   Ранее использовавшиеся вызовы `pkill -9 -f` полностью исключены. Завершение процессов опирается на:
   - Проверку PID через файл экземпляра `~/.ai-free/instances/server.json`;
   - Проверку командной строки процесса (`/proc/<pid>/cmdline` на Linux, Win32_Process CIM на Windows);
   - Отправку сигналов в группу процессов (`kill -TERM -- -$PID`);
   - Очистку браузерных локов через чтение целевого PID из symlink `SingletonLock`.

2. **Защита конфигураций OpenCode:**
   - Перед любым изменением создаётся датированный бэкап `opencode.json.bak.<timestamp>`.
   - В случае сбоя сериализации или валидации выполняется автоматический откат `rollbackOpenCodeConfig`.
   - Пользовательские модели, кастомные провайдеры и комментарии в JSONC сохраняются.
