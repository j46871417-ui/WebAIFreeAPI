#!/usr/bin/env bash
# ==============================================================================
# WebAIFreeAPI (ai-free) - Standalone Linux Installer
# Optimized for ROSA Linux Fresh 13 (dnf / urpmi), Ubuntu/Debian, Fedora, Arch
# ==============================================================================
set -euo pipefail

# ANSI Colors
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_GREEN="\033[32m"
C_CYAN="\033[36m"
C_YELLOW="\033[33m"
C_RED="\033[31m"
C_MAGENTA="\033[35m"

# State Machine
STATE="PRECHECK"

set_state() {
  STATE="$1"
  echo -e "${C_CYAN}[STATE: ${STATE}]${C_RESET} $2"
}

on_error() {
  local exit_code="$1"
  local line_no="$2"
  STATE="FAILED"
  echo -e "\n${C_RED}${C_BOLD}============================================================${C_RESET}"
  echo -e "${C_RED}${C_BOLD}       УСТАНОВКА ПРЕРВАНА С ОШИБКОЙ (STATE: FAILED)         ${C_RESET}"
  echo -e "${C_RED}${C_BOLD}============================================================${C_RESET}"
  echo -e "  Код ошибки: ${C_BOLD}${exit_code}${C_RESET} (строка ${line_no})"
  echo -e "  Этап      : ${C_BOLD}${STATE}${C_RESET}"
  echo -e "  Справка   : Проверьте права доступа, наличие Node.js >= 18 и npm."
  echo ""
  exit "$exit_code"
}

trap 'on_error $? $LINENO' ERR

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
UNINSTALL_MODE=0
PURGE_DATA=0

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
    --uninstall)
      UNINSTALL_MODE=1
      shift
      ;;
    --purge)
      PURGE_DATA=1
      shift
      ;;
    -h|--help)
      echo "Использование: $0 [ПАРАМЕТРЫ]"
      echo ""
      echo "Параметры:"
      echo "  --system       Установить общесистемно в /opt/ai-free (требует root или sudo)"
      echo "  --user         Установить только для текущего пользователя в ~/.local"
      echo "  --uninstall    Удалить WebAIFreeAPI из системы (сохраняя пользовательские данные)"
      echo "  --purge        Использовать вместе с --uninstall для полного удаления данных (~/.ai-free)"
      echo "  -h, --help     Показать эту справку"
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

# Determine Target Directories based on Installation Mode (system vs user)
setup_paths() {
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
}

setup_paths

# Uninstall routine
if [ "$UNINSTALL_MODE" -eq 1 ]; then
  set_state "UNINSTALLING" "Удаление WebAIFreeAPI ($INSTALL_MODE)..."
  if [ "$INSTALL_MODE" = "system" ] && [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
    echo -e "${C_RED}Ошибка: Для удаления системной установки требуются права root или sudo.${C_RESET}"
    exit 1
  fi

  # Stop running service if present
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user stop ai-free.service 2>/dev/null || true
    systemctl --user disable ai-free.service 2>/dev/null || true
  fi

  $SUDO_PREFIX rm -f "$BIN_DIR/ai-free"
  $SUDO_PREFIX rm -f "$DESKTOP_DIR/ai-free.desktop"
  $SUDO_PREFIX rm -f "$ICON_DIR/ai-free.svg"
  $SUDO_PREFIX rm -f "$SYSTEMD_DIR/ai-free.service"
  $SUDO_PREFIX rm -rf "$TARGET_DIR"

  if [ "$PURGE_DATA" -eq 1 ]; then
    echo -e "${C_YELLOW}[!] Полная очистка пользовательских данных (~/.ai-free, ~/.deepseek-cli)...${C_RESET}"
    rm -rf "$HOME/.ai-free" "$HOME/.deepseek-cli"
  else
    echo -e "${C_CYAN}[i] Пользовательские данные сохранены в ~/.ai-free и ~/.deepseek-cli (используйте --purge для удаления).${C_RESET}"
  fi

  if command -v update-desktop-database >/dev/null 2>&1; then
    $SUDO_PREFIX update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  fi

  set_state "READY" "WebAIFreeAPI успешно удален."
  exit 0
fi

# Check Node.js
set_state "PRECHECK" "Проверка зависимостей среды..."

check_nodejs() {
  local node_ok=false

  if command -v node >/dev/null 2>&1; then
    local node_ver
    node_ver=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
    if [ -n "$node_ver" ] && [ "$node_ver" -ge 18 ]; then
      node_ok=true
      echo -e "    ${C_GREEN}✓ Node.js $(node -v) обнаружен (${C_BOLD}$(command -v node)${C_RESET})"
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

# Resolve absolute path to node binary
RESOLVED_NODE_BIN="$(command -v node)"
if [ -z "$RESOLVED_NODE_BIN" ] || [ ! -x "$RESOLVED_NODE_BIN" ]; then
  echo -e "${C_RED}Ошибка: Не удалось разрешить исполняемый путь Node.js.${C_RESET}"
  exit 1
fi

# Check Optional Browsers
echo -e "\n${C_CYAN}[*] Проверка веб-браузеров...${C_RESET}"
BROWSER_FOUND=false
for b in chromium google-chrome-stable google-chrome brave-browser firefox yandex-browser; do
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
set_state "INSTALLING" "Подготовка каталогов и копирование файлов..."
$SUDO_PREFIX mkdir -p "$TARGET_DIR" "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR" "$SYSTEMD_DIR"

# Clean copy
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

# Symlink executable to PATH
AI_FREE_BIN="$BIN_DIR/ai-free"
echo -e "${C_CYAN}[*] Создание исполняемой ссылки: ${AI_FREE_BIN}...${C_RESET}"
$SUDO_PREFIX ln -sf "$TARGET_DIR/linux/bin/ai-free" "$AI_FREE_BIN"

# Installing Dependencies
set_state "DEPENDENCIES" "Проверка и установка зависимостей npm..."
if [ ! -d "$TARGET_DIR/node_modules/playwright" ]; then
  echo -e "    Установка зависимостей через npm в $TARGET_DIR..."
  (cd "$TARGET_DIR" && $SUDO_PREFIX npm install --omit=dev) || {
    set_state "FAILED" "Ошибка при выполнении npm install в $TARGET_DIR."
    echo -e "${C_RED}Критическая ошибка: Зависимости npm не удалось установить.${C_RESET}"
    exit 1
  }
fi

# Configuring Desktop Entry & Systemd Service from templates
set_state "CONFIGURING" "Настройка системной интеграции..."

# 1. Desktop Entry template substitution
DESKTOP_TARGET="$DESKTOP_DIR/ai-free.desktop"
echo -e "    Генерация ярлыка: ${DESKTOP_TARGET} с Exec=${AI_FREE_BIN}..."
TMP_DESKTOP="$(mktemp)"
sed -e "s|@AI_FREE_BIN@|${AI_FREE_BIN}|g" "$TARGET_DIR/linux/ai-free.desktop" > "$TMP_DESKTOP"
$SUDO_PREFIX cp "$TMP_DESKTOP" "$DESKTOP_TARGET"
rm -f "$TMP_DESKTOP"
$SUDO_PREFIX chmod 644 "$DESKTOP_TARGET"

# 2. Icon installation
ICON_TARGET="$ICON_DIR/ai-free.svg"
echo -e "    Установка иконки: ${ICON_TARGET}..."
$SUDO_PREFIX cp "$TARGET_DIR/linux/assets/ai-free.svg" "$ICON_TARGET"
$SUDO_PREFIX chmod 644 "$ICON_TARGET"

# Multi-size PNG icons installation if directory exists
if [ -d "$TARGET_DIR/linux/assets/icons/hicolor" ]; then
  $SUDO_PREFIX cp -rn "$TARGET_DIR/linux/assets/icons/hicolor/." "$ICON_DIR/../../" 2>/dev/null || true
fi

# 3. Systemd Service template substitution
SERVICE_TARGET="$SYSTEMD_DIR/ai-free.service"
echo -e "    Генерация службы systemd: ${SERVICE_TARGET} (APP_DIR=${TARGET_DIR}, NODE_BIN=${RESOLVED_NODE_BIN})..."
TMP_SERVICE="$(mktemp)"
sed -e "s|@APP_DIR@|${TARGET_DIR}|g" \
    -e "s|@NODE_BIN@|${RESOLVED_NODE_BIN}|g" \
    "$TARGET_DIR/linux/ai-free.service" > "$TMP_SERVICE"
$SUDO_PREFIX cp "$TMP_SERVICE" "$SERVICE_TARGET"
rm -f "$TMP_SERVICE"
$SUDO_PREFIX chmod 644 "$SERVICE_TARGET"

# Reload systemd daemon if available
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload 2>/dev/null || true
fi

# Update desktop and icon databases
if command -v update-desktop-database >/dev/null 2>&1; then
  $SUDO_PREFIX update-desktop-database "$DESKTOP_DIR" 2>/dev/null || update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  $SUDO_PREFIX gtk-update-icon-cache -f -t "$ICON_DIR/../../../" 2>/dev/null || true
fi

# Validation phase
set_state "VALIDATING" "Проверка корректности установки (Smoke Validation)..."

# Check executable
if [ ! -x "$AI_FREE_BIN" ]; then
  set_state "FAILED" "Исполняемый файл $AI_FREE_BIN отсутствует или не имеет прав на запуск."
  exit 1
fi

# Check desktop file placeholders
if grep -q "@AI_FREE_BIN@" "$DESKTOP_TARGET"; then
  set_state "FAILED" "Ярлык $DESKTOP_TARGET содержит неразрешенный плейсхолдер @AI_FREE_BIN@."
  exit 1
fi

# Check service file placeholders
if grep -q "@APP_DIR@" "$SERVICE_TARGET" || grep -q "@NODE_BIN@" "$SERVICE_TARGET"; then
  set_state "FAILED" "Файл службы $SERVICE_TARGET содержит неразрешенные плейсхолдеры."
  exit 1
fi

# Check that entrypoint script exists in target
if [ ! -f "$TARGET_DIR/bin/deepseek.mjs" ]; then
  set_state "FAILED" "Основной файл приложения $TARGET_DIR/bin/deepseek.mjs не найден."
  exit 1
fi

# Run fast Node smoke check
"$RESOLVED_NODE_BIN" "$TARGET_DIR/bin/deepseek.mjs" --version >/dev/null 2>&1 || {
  set_state "FAILED" "Сбой при валидации запуска $TARGET_DIR/bin/deepseek.mjs через $RESOLVED_NODE_BIN."
  exit 1
}

echo -e "    ${C_GREEN}✓ Все проверки успешно пройдены.${C_RESET}"

# Check PATH warning for user mode
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

# Final State: READY
set_state "READY" "Установка завершена успешно!"

echo -e "\n${C_GREEN}${C_BOLD}============================================================${C_RESET}"
echo -e "${C_GREEN}${C_BOLD}      WebAIFreeAPI успешно установлен и готов к работе!     ${C_RESET}"
echo -e "${C_GREEN}${C_BOLD}============================================================${C_RESET}"
echo -e "  Каталог программы  : ${C_BOLD}$TARGET_DIR${C_RESET}"
echo -e "  Исполняемый файл   : ${C_BOLD}$AI_FREE_BIN${C_RESET}"
echo -e "  Node.js рантайм    : ${C_BOLD}$RESOLVED_NODE_BIN${C_RESET}"
echo -e "  Ярлык приложения   : ${C_BOLD}$DESKTOP_TARGET${C_RESET}"
echo -e "  Иконка             : ${C_BOLD}$ICON_TARGET${C_RESET}"
echo -e "  Systemd служба     : ${C_BOLD}$SERVICE_TARGET${C_RESET}"
echo -e "  Веб-интерфейс      : ${C_CYAN}http://127.0.0.1:4317${C_RESET}"
echo ""
echo -e "${C_BOLD}Команды управления:${C_RESET}"
echo -e "  • Запуск окна      : ${C_GREEN}ai-free${C_RESET} (или ai-free --window)"
echo -e "  • Запуск сервиса   : ${C_GREEN}ai-free --no-window${C_RESET}"
echo -e "  • Диагностика      : ${C_GREEN}ai-free doctor${C_RESET}"
echo -e "  • Фоновая служба   : ${C_GREEN}systemctl --user start ai-free.service${C_RESET}"
echo -e "  • Автозапуск службы: ${C_GREEN}systemctl --user enable ai-free.service${C_RESET}"
echo -e "  • Удаление         : ${C_GREEN}$0 --uninstall${C_RESET}"
echo ""
