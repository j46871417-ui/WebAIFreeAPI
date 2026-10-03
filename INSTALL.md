# Установка

Краткая инструкция. Полная документация — в [README.md](README.md).

## Требования

- **Node.js ≥ 18** — [скачать с nodejs.org](https://nodejs.org). Проверить: `node -v`.
- **Google Chrome** (опционально). Если не установлен — программа использует Playwright Chromium, который скачается автоматически.

## Установка (одна команда после клонирования)

```bash
git clone https://github.com/Staks-sor/free-deepseek-cli.git
cd free-deepseek-cli
npm install
```

`npm install` сам:
- скачает Node-зависимости (~20 МБ),
- через `postinstall`-хук подтянет Chromium для Playwright (~150 МБ).

## Установка на Linux (ROSA Linux 13, Fedora, РЕД ОС, Ubuntu/Debian)

### Вариант 1: Готовый RPM-пакет (ROSA 13 / Fedora / РЕД ОС)
Скачай `.rpm` из раздела [Releases](https://github.com/j46871417-ui/WebAIFreeAPI/releases):
```bash
# Для РОСА Линукс 13, Fedora, РЕД ОС:
sudo dnf install ./ai-free-*.noarch.rpm

# Для дистрибутивов с urpmi (ROSA Fresh / Mandriva):
sudo urpmi ./ai-free-*.noarch.rpm
```
Ярлык появится в меню приложений. Команда запуска из терминала: `ai-free`.

### Вариант 2: Универсальный скрипт `install.sh` (любой Linux)
Скачай релизный архив `ai-free-*-linux.tar.gz` из [Releases](https://github.com/j46871417-ui/WebAIFreeAPI/releases):
```bash
tar -xzf ai-free-*-linux.tar.gz
cd ai-free-*

# Установка без прав root (в ~/.local, только для текущего пользователя):
./linux/install.sh --user

# Или системная установка (в /opt/ai-free, требует sudo):
sudo ./linux/install.sh --system
```

### Вариант 3: Из исходного кода (Git)
```bash
git clone https://github.com/j46871417-ui/WebAIFreeAPI.git
cd WebAIFreeAPI
npm install
```

### Системные библиотеки браузера (Linux):
Если на вашей системе не установлен Chromium / Google Chrome, Playwright может запросить библиотеки:
```bash
sudo npx playwright install-deps chromium
# Либо просто установите системный Chromium:
# sudo dnf install -y chromium   (для ROSA/Fedora)
# sudo apt install -y chromium   (для Ubuntu/Debian)
```

### Управление и автозапуск сервиса (systemd):
```bash
# Запуск через системный трей (легковесный Python-трей):
ai-free --tray

# Управление пользовательским фоновым сервисом systemd:
systemctl --user enable --now ai-free    # включить и запустить
systemctl --user status ai-free          # проверить статус
systemctl --user stop ai-free            # остановить
```

## Первый запуск

```bash
npm start
```

Что произойдёт:

1. Откроется окно `chat.deepseek.com` с формой логина.
2. Залогинься любым способом — Google OAuth, email/пароль, captcha.
3. CLI автоматически поймает момент входа (по сетевому сигналу) и закроет окно логина.
4. Cookies и токен сохранятся в `~/.deepseek-cli/auth.json`.
5. Откроется рабочее окно с чатами на `http://127.0.0.1:4317`.

Дальше — пользуйся. Сессия живёт неделями, повторный логин не потребуется.

## Если что-то пошло не так

Полный сброс — одна команда:

**macOS / Linux:**
```bash
rm -rf ~/.deepseek-cli
```

**Windows (PowerShell):**
```powershell
Remove-Item -Recurse -Force $env:USERPROFILE\.deepseek-cli
```

Потом снова `npm start`. Это лечит 90% проблем.

## Что дальше

См. [README.md](README.md) для:
- описания всех команд (`/code`, `/ls`, и т.д.),
- настройки whitelist разрешённых команд,
- привязки чатов к разным папкам проектов,
- платформенных нюансов.
