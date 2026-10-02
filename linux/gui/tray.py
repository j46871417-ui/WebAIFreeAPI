#!/usr/bin/env python3
"""WebAIFreeAPI (ai-free) System Tray Icon for Linux (ROSA Linux 13, KDE/GNOME/XFCE).

Optional dependencies:
    pystray >= 0.19.0
    Pillow >= 9.0.0
"""

import os
import sys
import subprocess
import webbrowser
from pathlib import Path

def print_help():
    print("WebAIFreeAPI Linux System Tray")
    print("Убедитесь, что установлены python3-pystray и python3-pillow:")
    print("  ROSA Linux (dnf):   sudo dnf install -y python3-pystray python3-pillow")
    print("  ROSA Linux (urpmi): sudo urpmi python3-pystray python3-pillow")
    print("  pip:                pip install -r linux/gui/requirements.txt")

try:
    import pystray
    from PIL import Image, ImageDraw
except ImportError as err:
    print(f"❌ Ошибка импорта: {err}")
    print_help()
    sys.exit(1)

APP_DIR = Path(__file__).resolve().parent.parent.parent
PORT = os.environ.get("PORT", "4317")
WEB_URL = f"http://127.0.0.1:{PORT}"

def run_ai_free_cmd(*args):
    """Run ai-free CLI command in detached background process."""
    launcher = APP_DIR / "linux" / "bin" / "ai-free"
    cmd = [str(launcher)] if launcher.exists() else ["ai-free"]
    cmd.extend(args)
    subprocess.Popen(cmd, cwd=str(APP_DIR), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def open_web_ui(icon, item):
    webbrowser.open(WEB_URL)

def open_window(icon, item):
    run_ai_free_cmd("--window")

def login_deepseek(icon, item):
    run_ai_free_cmd("--login")

def login_qwen(icon, item):
    run_ai_free_cmd("--login-qwen")

def login_chatgpt(icon, item):
    run_ai_free_cmd("--login-chatgpt")

def check_status(icon, item):
    run_ai_free_cmd("--check")

def quit_app(icon, item):
    icon.stop()

def create_tray_icon_image():
    """Create a crisp 64x64 tray icon."""
    size = (64, 64)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Dark rounded background
    draw.rounded_rectangle([2, 2, 62, 62], radius=14, fill=(24, 28, 38, 255), outline=(43, 50, 68, 255), width=2)

    # Stylized letter A with cyan-blue gradient fill
    # Points roughly representing the glyph
    points = [
        (14, 46),
        (28, 12),
        (37, 12),
        (51, 46),
        (40, 46),
        (38, 40),
        (26, 40),
        (24, 46)
    ]
    draw.polygon(points, fill=(89, 215, 255, 255))
    # Inner hole
    inner = [(32.5, 22), (28.5, 34), (36.5, 34)]
    draw.polygon(inner, fill=(24, 28, 38, 255))

    # Star accent in purple
    star = [(47, 12), (48, 15), (51, 16), (48, 17), (47, 20), (46, 17), (43, 16), (46, 15)]
    draw.polygon(star, fill=(214, 143, 255, 255))

    return image

def main():
    image = create_tray_icon_image()
    menu = pystray.Menu(
        pystray.MenuItem("Открыть Web-интерфейс", open_web_ui, default=True),
        pystray.MenuItem("Открыть окно приложения", open_window),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Вход: DeepSeek", login_deepseek),
        pystray.MenuItem("Вход: Qwen", login_qwen),
        pystray.MenuItem("Вход: ChatGPT", login_chatgpt),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Проверить статус", check_status),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Выход", quit_app)
    )

    icon = pystray.Icon("WebAIFreeAPI", image, "WebAIFreeAPI (ai-free)", menu)
    icon.run()

if __name__ == "__main__":
    main()
