#!/usr/bin/env bash
# ==============================================================================
# WebAIFreeAPI (ai-free) - Standalone Linux Installer
# Optimized for ROSA Linux Fresh 13 (dnf / urpmi) & compatible Linux distributions
# ==============================================================================
set -e

# ANSI Colors
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_GREEN="\033[32m"
C_CYAN="\033[36m"
C_YELLOW="\033[33m"
C_RED="\033[31m"
C_MAGENTA="\033[35m"

print_banner() {
  echo -e "${C_CYAN}${C_BOLD}"
  echo "============================================================"
  echo "          WebAIFreeAPI (ai-free) - Linux Installer          "
  echo "          Оптимизировано для ROSA Linux Fresh 13            "
  echo "============================================================"
  echo -e "${C_RESET}"
}

print_banner

# Locate script source and project files
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
INSTALLER_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
SOURCE_DIR="$(cd -P "$INSTALLER_DIR/.." >/dev/null 2>&1 && pwd)"

# Parse command line flags
INSTALL_MODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --system)
      INSTALL_MODE="system"
      shift
      ;;
    --user)
      INSTALL_MODE="user"
      shift
      ;;
    -h|--help)
      echo "Использование: $0 [ПАРАМЕТРЫ]"
      echo ""
      echo "Параметры:"
      echo "  --system     Установить общесистемно в /opt/ai-free (требует root или sudo)"
      echo "  --user       Установить только для текущего пользователя в ~/.local"
      echo "  -h, --help   Показать эту справку"
      exit 0
      ;;
    *)
      echo "Неизвестный параметр: $1"
      exit 1
      ;;
  esac
done

# Detect OS
OS_NAME="Linux"
if [ -f /etc/os-release ]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  OS_NAME="${PRETTY_NAME:-$NAME}"
fi
echo -e "${C_CYAN}[*] Операционная система:${C_RESET} ${C_BOLD}${OS_NAME}${C_RESET}"

# Detect Package Manager (ROSA Linux Fresh 13 uses dnf or urpmi)
PKG_MGR=""
if command -v dnf >/dev/null 2>&1; then
  PKG_MGR="dnf"
elif command -v urpmi >/dev/null 2>&1; then
  PKG_MGR="urpmi"
elif command -v apt-get >/dev/null 2>&1; then
  PKG_MGR="apt"
elif command -v zypper >/dev/null 2>&1; then
  PKG_MGR="zypper"
elif command -v pacman >/dev/null 2>&1; then
  PKG_MGR="pacman"
fi

if [ -n "$PKG_MGR" ]; then
  echo -e "${C_CYAN}[*] Пакетный менеджер:${C_RESET} ${C_BOLD}${PKG_MGR}${C_RESET}"
else
  echo -e "${C_YELLOW}[!] Пакетный менеджер не определен.${C_RESET}"
fi

# Determine Installation Mode (system vs user)
if [ -z "$INSTALL_MODE" ]; then
  if [ "$(id -u)" -eq 0 ]; then
    INSTALL_MODE="system"
  else
    if command -v sudo >/dev/null 2>&1 && [ -t 0 ]; then
      echo ""
      echo -e "${C_BOLD}Выберите тип установки:${C_RESET}"
      echo -e "  ${C_GREEN}1)${C_RESET} Системная (/opt/ai-free, доступно всем пользователям, через sudo)"
      echo -e "  ${C_GREEN}2)${C_RESET} Пользовательская (~/.local, без root-прав)"
      read -r -p "Ваш выбор [1/2] (по умолчанию: 1): " CHOICE
      if [[ "$CHOICE" == "2" ]]; then
        INSTALL_MODE="user"
      else
        INSTALL_MODE="system"
      fi
    elif [ "$(id -u)" -ne 0 ]; then
      INSTALL_MODE="user"
    else
      INSTALL_MODE="system"
    fi
  fi
fi

echo -e "${C_CYAN}[*] Режим установки:${C_RESET} ${C_BOLD}${INSTALL_MODE}${C_RESET}"

# Check Node.js
check_nodejs() {
  echo -e "\n${C_CYAN}[*] Проверка Node.js...${C_RESET}"
  local node_ok=false

  if command -v node >/dev/null 2>&1; then
    local node_ver
    node_ver=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
    if [ -n "$node_ver" ] && [ "$node_ver" -ge 18 ]; then
      node_ok=true
      echo -e "    ${C_GREEN}✓ Node.js $(node -v) обнаружен${C_RESET}"
    else
      echo -e "    ${C_YELLOW}! Обнаружен устаревший Node.js $(node -v). Требуется версия >= 18.0.0.${C_RESET}"
    fi
  else
    echo -e "    ${C_RED}✗ Node.js не найден в системе.${C_RESET}"
  fi

  if [ "$node_ok" = false ]; then
    echo ""
    echo -e "${C_YELLOW}[!] Для работы WebAIFreeAPI требуется Node.js >= 18.${C_RESET}"
    echo "    Установите его командой:"
    if [ "$PKG_MGR" = "dnf" ]; then
      echo -e "    ${C_BOLD}sudo dnf install -y nodejs${C_RESET}"
    elif [ "$PKG_MGR" = "urpmi" ]; then
      echo -e "    ${C_BOLD}sudo urpmi nodejs${C_RESET}"
    elif [ "$PKG_MGR" = "apt" ]; then
      echo -e "    ${C_BOLD}sudo apt update && sudo apt install -y nodejs npm${C_RESET}"
    else
      echo -e "    Используйте официальный дистрибутив Node.js: https://nodejs.org/"
    fi

    if [ -t 0 ] && [ "$INSTALL_MODE" = "system" ] && [ -n "$PKG_MGR" ]; then
      read -r -p "Желаете установить Node.js прямо сейчас? [Y/n]: " INSTALL_NODE
      if [[ "$INSTALL_NODE" =~ ^[YyДд]?$ ]] || [ -z "$INSTALL_NODE" ]; then
        if [ "$PKG_MGR" = "dnf" ]; then
          sudo dnf install -y nodejs
        elif [ "$PKG_MGR" = "urpmi" ]; then
          sudo urpmi nodejs
        elif [ "$PKG_MGR" = "apt" ]; then
          sudo apt update && sudo apt install -y nodejs npm
        fi
      else
        echo -e "${C_RED}Установка прервана. Установите Node.js и повторите запуск.${C_RESET}"
        exit 1
      fi
    else
      echo -e "${C_RED}Пожалуйста, установите Node.js и перезапустите скрипт.${C_RESET}"
      exit 1
    fi
  fi
}

check_nodejs

# Check Optional Browsers
echo -e "\n${C_CYAN}[*] Проверка веб-браузеров...${C_RESET}"
BROWSER_FOUND=false
for b in chromium google-chrome-stable firefox yandex-browser; do
  if command -v "$b" >/dev/null 2>&1; then
    echo -e "    ${C_GREEN}✓ Браузер найден: $b${C_RESET}"
    BROWSER_FOUND=true
    break
  fi
done

if [ "$BROWSER_FOUND" = false ]; then
  echo -e "    ${C_YELLOW}Внимание: Системный браузер не обнаружен. При первом запуске Playwright автоматически скачает Chromium.${C_RESET}"
fi

# Target Directories Setup
if [ "$INSTALL_MODE" = "system" ]; then
  TARGET_DIR="/opt/ai-free"
  BIN_DIR="/usr/local/bin"
  DESKTOP_DIR="/usr/share/applications"
  ICON_DIR="/usr/share/icons/hicolor/scalable/apps"
  SYSTEMD_DIR="/usr/lib/systemd/user"
  SUDO_PREFIX=""
  if [ "$(id -u)" -ne 0 ]; then
    SUDO_PREFIX="sudo"
  fi
else
  TARGET_DIR="$HOME/.local/share/ai-free"
  BIN_DIR="$HOME/.local/bin"
  DESKTOP_DIR="$HOME/.local/share/applications"
  ICON_DIR="$HOME/.local/share/icons/hicolor/scalable/apps"
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  SUDO_PREFIX=""
fi

echo -e "\n${C_CYAN}[*] Создание целевых каталогов...${C_RESET}"
$SUDO_PREFIX mkdir -p "$TARGET_DIR" "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR" "$SYSTEMD_DIR"

echo -e "${C_CYAN}[*] Копирование файлов приложения в $TARGET_DIR...${C_RESET}"

# Temporary file list for clean copy
EXCLUDE_ARGS=(
  --exclude=".git"
  --exclude=".github"
  --exclude="test"
  --exclude="tests"
  --exclude="src-native"
  --exclude="dist"
  --exclude="node"
  --exclude="webview2-sdk"
  --exclude="*.bat"
  --exclude="*.vbs"
  --exclude="*.exe"
  --exclude="*.dll"
  --exclude="*.log"
  --exclude="*.tmp"
  --exclude="*.db"
)

if command -v rsync >/dev/null 2>&1; then
  $SUDO_PREFIX rsync -a --delete "${EXCLUDE_ARGS[@]}" "$SOURCE_DIR/" "$TARGET_DIR/"
else
  # Fallback to cp + cleanup
  $SUDO_PREFIX cp -a "$SOURCE_DIR/." "$TARGET_DIR/"
  $SUDO_PREFIX rm -rf "$TARGET_DIR/.git" "$TARGET_DIR/.github" "$TARGET_DIR/test" "$TARGET_DIR/tests" \
                      "$TARGET_DIR/src-native" "$TARGET_DIR/dist" "$TARGET_DIR/node" "$TARGET_DIR/webview2-sdk"
  $SUDO_PREFIX rm -f "$TARGET_DIR/bin/"*.exe "$TARGET_DIR/bin/"*.dll "$TARGET_DIR/"*.bat "$TARGET_DIR/"*.vbs
fi

# Set executable permissions
$SUDO_PREFIX chmod +x "$TARGET_DIR/linux/bin/ai-free" \
                      "$TARGET_DIR/bin/deepseek.mjs" \
                      "$TARGET_DIR/bin/launcher.mjs" \
                      "$TARGET_DIR/bin/ai-free-browser-mcp.mjs" 2>/dev/null || true

# Symlink to PATH
echo -e "${C_CYAN}[*] Создание ссылки в $BIN_DIR/ai-free...${C_RESET}"
$SUDO_PREFIX ln -sf "$TARGET_DIR/linux/bin/ai-free" "$BIN_DIR/ai-free"

# Install Desktop Entry
echo -e "${C_CYAN}[*] Установка ярлыка в $DESKTOP_DIR/ai-free.desktop...${C_RESET}"
if [ "$INSTALL_MODE" = "user" ]; then
  # Adjust Exec for user path if bin directory might not be in default session PATH
  sed -e "s|^Exec=ai-free|Exec=$BIN_DIR/ai-free|" "$TARGET_DIR/linux/ai-free.desktop" > /tmp/ai-free.desktop
  cp /tmp/ai-free.desktop "$DESKTOP_DIR/ai-free.desktop"
  rm -f /tmp/ai-free.desktop
else
  $SUDO_PREFIX cp "$TARGET_DIR/linux/ai-free.desktop" "$DESKTOP_DIR/ai-free.desktop"
fi
$SUDO_PREFIX chmod 644 "$DESKTOP_DIR/ai-free.desktop" 2>/dev/null || chmod 644 "$DESKTOP_DIR/ai-free.desktop"

# Install Icon
echo -e "${C_CYAN}[*] Установка иконки в $ICON_DIR/ai-free.svg...${C_RESET}"
$SUDO_PREFIX cp "$TARGET_DIR/linux/ai-free.svg" "$ICON_DIR/ai-free.svg"
$SUDO_PREFIX chmod 644 "$ICON_DIR/ai-free.svg" 2>/dev/null || chmod 644 "$ICON_DIR/ai-free.svg"

# Install Systemd Service
echo -e "${C_CYAN}[*] Установка systemd службы в $SYSTEMD_DIR/ai-free.service...${C_RESET}"
if [ "$INSTALL_MODE" = "user" ]; then
  sed -e "s|/usr/bin/ai-free|$BIN_DIR/ai-free|g" "$TARGET_DIR/linux/ai-free.service" > "$SYSTEMD_DIR/ai-free.service"
else
  $SUDO_PREFIX cp "$TARGET_DIR/linux/ai-free.service" "$SYSTEMD_DIR/ai-free.service"
fi
$SUDO_PREFIX chmod 644 "$SYSTEMD_DIR/ai-free.service" 2>/dev/null || chmod 644 "$SYSTEMD_DIR/ai-free.service"

# Install npm dependencies if node_modules is missing
if [ ! -d "$TARGET_DIR/node_modules/playwright" ]; then
  echo -e "\n${C_CYAN}[*] Установка npm зависимостей в $TARGET_DIR...${C_RESET}"
  (cd "$TARGET_DIR" && $SUDO_PREFIX npm install --omit=dev) || {
    echo -e "${C_YELLOW}[!] npm install завершился с предупреждением. Зависимости будут проверены при первом запуске.${C_RESET}"
  }
fi

# Update desktop and icon databases
echo -e "\n${C_CYAN}[*] Обновление кэша рабочего стола и иконок...${C_RESET}"
if command -v update-desktop-database >/dev/null 2>&1; then
  $SUDO_PREFIX update-desktop-database "$DESKTOP_DIR" 2>/dev/null || update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  $SUDO_PREFIX gtk-update-icon-cache -f -t "$ICON_DIR/../../../" 2>/dev/null || true
fi

# Add user bin path reminder
if [ "$INSTALL_MODE" = "user" ]; then
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      echo -e "\n${C_YELLOW}[!] Внимание: Каталог $BIN_DIR не найден в переменной PATH.${C_RESET}"
      echo -e "    Добавьте его в ~/.bashrc или ~/.zshrc:"
      echo -e "    ${C_BOLD}export PATH=\"\$HOME/.local/bin:\$PATH\"${C_RESET}"
      ;;
  esac
fi

# Print Success Summary
echo -e "\n${C_GREEN}${C_BOLD}============================================================${C_RESET}"
echo -e "${C_GREEN}${C_BOLD}      WebAIFreeAPI успешно установлен и готов к работе!     ${C_RESET}"
echo -e "${C_GREEN}${C_BOLD}============================================================${C_RESET}"
echo -e "  Каталог программы  : ${C_BOLD}$TARGET_DIR${C_RESET}"
echo -e "  Исполняемый файл   : ${C_BOLD}$BIN_DIR/ai-free${C_RESET}"
echo -e "  Ярлык приложения   : ${C_BOLD}$DESKTOP_DIR/ai-free.desktop${C_RESET}"
echo -e "  Иконка             : ${C_BOLD}$ICON_DIR/ai-free.svg${C_RESET}"
echo -e "  Systemd сервис     : ${C_BOLD}$SYSTEMD_DIR/ai-free.service${C_RESET}"
echo -e "  Веб-интерфейс      : ${C_CYAN}http://127.0.0.1:4317${C_RESET}"
echo ""
echo -e "${C_BOLD}Команды запуска:${C_RESET}"
echo -e "  • Графическое окно : ${C_GREEN}ai-free${C_RESET} (или ai-free --window)"
echo -e "  • Сервер API       : ${C_GREEN}ai-free --no-window${C_RESET}"
echo -e "  • Авторизация      : ${C_GREEN}ai-free --login${C_RESET} (DeepSeek), ${C_GREEN}ai-free --login-qwen${C_RESET}, ${C_GREEN}ai-free --login-chatgpt${C_RESET}"
echo -e "  • Служба в фоне    : ${C_GREEN}systemctl --user start ai-free.service${C_RESET}"
echo -e "  • Автозапуск службы: ${C_GREEN}systemctl --user enable ai-free.service${C_RESET}"
echo ""
