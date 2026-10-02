#!/usr/bin/env bash
# WebAIFreeAPI - Icon Installer for Linux (Freedesktop / ROSA 13)
set -e

DESTDIR="${DESTDIR:-}"
PREFIX="${PREFIX:-/usr}"

# Check if running as root or user mode
if [ -n "$DESTDIR" ] || [ "$(id -u)" -eq 0 ]; then
  ICONS_BASE="${DESTDIR}${PREFIX}/share/icons/hicolor"
  PIXMAPS_DIR="${DESTDIR}${PREFIX}/share/pixmaps"
else
  ICONS_BASE="${HOME}/.local/share/icons/hicolor"
  PIXMAPS_DIR="${HOME}/.local/share/pixmaps"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing icons to: ${ICONS_BASE}"

# Install scalable SVG
mkdir -p "${ICONS_BASE}/scalable/apps"
cp -f "${SCRIPT_DIR}/ai-free.svg" "${ICONS_BASE}/scalable/apps/ai-free.svg"

# Install PNG sizes
for size in 16x16 32x32 48x48 64x64 128x128 256x256; do
  if [ -f "${SCRIPT_DIR}/ai-free-${size}.png" ]; then
    mkdir -p "${ICONS_BASE}/${size}/apps"
    cp -f "${SCRIPT_DIR}/ai-free-${size}.png" "${ICONS_BASE}/${size}/apps/ai-free.png"
  fi
done

# Install pixmaps fallback
mkdir -p "${PIXMAPS_DIR}"
cp -f "${SCRIPT_DIR}/ai-free.svg" "${PIXMAPS_DIR}/ai-free.svg"
if [ -f "${SCRIPT_DIR}/ai-free.png" ]; then
  cp -f "${SCRIPT_DIR}/ai-free.png" "${PIXMAPS_DIR}/ai-free.png"
fi

# Update icon cache if tool is available
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "${ICONS_BASE}" 2>/dev/null || true
fi

echo "Icons installed successfully."
