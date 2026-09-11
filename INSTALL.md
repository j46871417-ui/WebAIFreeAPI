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

## Linux: дополнительные системные библиотеки

Только для Linux, один раз:

```bash
sudo npx playwright install-deps chromium
```

Это поставит `libnss3`, `libgbm`, `libasound2` и прочие зависимости Chromium.
На macOS и Windows этот шаг не нужен.

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
