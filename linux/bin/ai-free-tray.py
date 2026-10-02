#!/usr/bin/env python3
"""
WebAIFreeAPI - System Tray Indicator for Linux (PyGObject / pystray / AppIndicator)
Optional tray component for Freedesktop / ROSA Linux 13.
"""

import os
import sys
import webbrowser
import subprocess
from pathlib import Path

WEB_URL = os.environ.get("DEEPSEEK_WINDOW_URL", "http://127.0.0.1:4317")
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ICON_SVG = BASE_DIR / "linux" / "assets" / "ai-free.svg"
ICON_PNG = BASE_DIR / "linux" / "assets" / "ai-free.png"


def open_web():
    webbrowser.open(WEB_URL)


def open_logs():
    log_file = Path.home() / ".ai-free" / "logs" / "ai-free.log"
    if log_file.exists():
        subprocess.Popen(["xdg-open", str(log_file)])
    else:
        open_web()


def stop_service():
    launcher = Path(__file__).resolve().parent / "ai-free"
    if launcher.exists():
        subprocess.run([str(launcher), "--stop"], check=False)
    sys.exit(0)


def try_appindicator():
    try:
        import gi
        gi.require_version('Gtk', '3.0')
        try:
            gi.require_version('AyatanaAppIndicator3', '0.1')
            from gi.repository import AyatanaAppIndicator3 as appindicator
        except (ValueError, ImportError):
            gi.require_version('AppIndicator3', '0.1')
            from gi.repository import AppIndicator3 as appindicator
        from gi.repository import Gtk, GLib

        indicator = appindicator.Indicator.new(
            "WebAIFreeAPI",
            str(ICON_PNG if ICON_PNG.exists() else "ai-free"),
            appindicator.IndicatorCategory.APPLICATION_STATUS
        )
        indicator.set_status(appindicator.IndicatorStatus.ACTIVE)

        menu = Gtk.Menu()

        item_open = Gtk.MenuItem(label="Открыть WebAIFreeAPI")
        item_open.connect("activate", lambda _: open_web())
        menu.append(item_open)

        item_logs = Gtk.MenuItem(label="Открыть журнал логов")
        item_logs.connect("activate", lambda _: open_logs())
        menu.append(item_logs)

        menu.append(Gtk.SeparatorMenuItem())

        item_stop = Gtk.MenuItem(label="Остановить и выйти")
        item_stop.connect("activate", lambda _: (stop_service(), Gtk.main_quit()))
        menu.append(item_stop)

        menu.show_all()
        indicator.set_menu(menu)
        Gtk.main()
        return True
    except Exception:
        return False


def try_pystray():
    try:
        from PIL import Image
        import pystray

        if not ICON_PNG.exists():
            return False

        image = Image.open(str(ICON_PNG))
        menu = pystray.Menu(
            pystray.MenuItem("Открыть WebAIFreeAPI", lambda: open_web()),
            pystray.MenuItem("Открыть логи", lambda: open_logs()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Выход", lambda icon, item: (stop_service(), icon.stop()))
        )
        icon = pystray.Icon("WebAIFreeAPI", image, "WebAIFreeAPI", menu)
        icon.run()
        return True
    except Exception:
        return False


def main():
    if not try_appindicator() and not try_pystray():
        # Neither GTK AppIndicator nor pystray available - exit cleanly
        sys.exit(0)


if __name__ == "__main__":
    main()
