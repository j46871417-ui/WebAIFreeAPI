#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WebAIFreeAPI - Linux Native GUI & System Tray Launcher
Target OS: ROSA Linux 13 / General Linux (X11 / Wayland)
Python 3.8+ compatible

Features:
- Background Node.js API server management (bin/deepseek.mjs --no-window)
- Standalone web app window mode via Chromium-based browsers or system default
- System tray icon with menu actions (pystray + Pillow with graceful fallback)
- Signal handling (SIGTERM, SIGINT, SIGHUP) for graceful shutdown
- Command-line interface: --app, --no-tray, --stop, --status
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Try importing optional tray dependencies
try:
    import pystray
    from PIL import Image, ImageDraw
    HAS_TRAY = True
except ImportError:
    pystray = None  # type: ignore
    Image = None    # type: ignore
    ImageDraw = None  # type: ignore
    HAS_TRAY = False

# Constants & Defaults
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = int(os.environ.get("AI_FREE_PORT", "4317"))
APP_NAME = "WebAIFreeAPI"

# Global state
_server_process: Optional[subprocess.Popen] = None
_tray_icon: Optional[Any] = None
_shutdown_event = threading.Event()

logger = logging.getLogger("ai_free_tray")


def setup_logging(debug: bool = False) -> None:
    """Configure logging to console and persistent log file."""
    log_dir = get_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "ai-free-tray.log"

    level = logging.DEBUG if debug else logging.INFO
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handlers: List[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    try:
        file_handler = logging.FileHandler(str(log_file), encoding="utf-8")
        file_handler.setFormatter(formatter)
        handlers.append(file_handler)
    except Exception as e:
        print(f"Warning: could not open log file {log_file}: {e}", file=sys.stderr)

    logging.basicConfig(level=level, handlers=handlers, format="%(asctime)s [%(levelname)s] %(message)s")


def get_log_dir() -> Path:
    """Return ~/.ai-free/logs path."""
    return Path.home() / ".ai-free" / "logs"


def get_pid_file() -> Path:
    """Return ~/.ai-free/server.pid path."""
    base = Path.home() / ".ai-free"
    base.mkdir(parents=True, exist_ok=True)
    return base / "server.pid"


def get_tray_pid_file() -> Path:
    """Return ~/.ai-free/tray.pid path."""
    base = Path.home() / ".ai-free"
    base.mkdir(parents=True, exist_ok=True)
    return base / "tray.pid"


def find_project_root() -> Path:
    """
    Locate the ai-free project root directory.
    Checks AI_FREE_DIR env var, parent traversal, CWD, and standard system paths.
    """
    env_dir = os.environ.get("AI_FREE_DIR")
    if env_dir:
        cand = Path(env_dir).resolve()
        if (cand / "bin" / "deepseek.mjs").is_file():
            return cand

    # Current script is located at <project_root>/linux/gui/ai_free_tray.py
    here = Path(__file__).resolve().parent
    cand = here.parent.parent
    if (cand / "bin" / "deepseek.mjs").is_file():
        return cand

    cwd = Path.cwd().resolve()
    if (cwd / "bin" / "deepseek.mjs").is_file():
        return cwd

    for system_path in [
        Path("/opt/ai-free"),
        Path.home() / ".local" / "share" / "ai-free",
    ]:
        if (system_path / "bin" / "deepseek.mjs").is_file():
            return system_path

    # Fallback to parent.parent
    return here.parent.parent


def find_node_binary(project_root: Path) -> str:
    """
    Find Node.js executable path.
    Prefers bundled node if present, otherwise searches system PATH.
    """
    bundled_paths = [
        project_root / "node" / "bin" / "node",
        project_root / "node" / "node",
        project_root / "node" / "node.exe",
    ]
    for p in bundled_paths:
        if p.is_file() and os.access(str(p), os.X_OK):
            return str(p)

    which_node = shutil.which("node") or shutil.which("nodejs")
    if which_node:
        return which_node

    return "node"


# ---------------------------------------------------------------------------
# Server Health & Control
# ---------------------------------------------------------------------------

def get_base_url(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> str:
    return f"http://{host}:{port}"


def is_server_running(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, timeout: float = 1.5) -> bool:
    """Check if the WebAIFreeAPI server responds with 200 on /health."""
    url = f"{get_base_url(host, port)}/health"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": f"{APP_NAME}-Tray/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def get_server_health(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, timeout: float = 1.5) -> Tuple[bool, Dict[str, Any]]:
    """Retrieve health payload from /health."""
    url = f"{get_base_url(host, port)}/health"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": f"{APP_NAME}-Tray/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                return True, data
    except Exception as e:
        return False, {"error": str(e)}
    return False, {"error": "Unexpected response"}


def send_shutdown_request(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, timeout: float = 2.5) -> bool:
    """Send graceful POST /api/shutdown to the server."""
    url = f"{get_base_url(host, port)}/api/shutdown"
    try:
        data = json.dumps({"source": "tray_exit"}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": f"{APP_NAME}-Tray/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def wait_for_server(
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    timeout_sec: float = 12.0,
    poll_interval: float = 0.3,
) -> bool:
    """Poll health endpoint until server is ready or timeout expires."""
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if is_server_running(host, port, timeout=poll_interval):
            return True
        time.sleep(poll_interval)
    return False


def start_server_process(
    project_root: Path,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
) -> bool:
    """
    Launch bin/deepseek.mjs in the background if not already running.
    """
    global _server_process

    if is_server_running(host, port):
        logger.info("Server is already running at %s", get_base_url(host, port))
        return True

    entry_script = project_root / "bin" / "deepseek.mjs"
    if not entry_script.is_file():
        logger.error("Entry script not found: %s", entry_script)
        return False

    node_bin = find_node_binary(project_root)
    log_dir = get_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    server_log_path = log_dir / "ai-free.log"

    logger.info("Starting server: %s %s --no-window (cwd: %s)", node_bin, entry_script, project_root)

    cmd = [node_bin, str(entry_script), "--no-window"]
    env = os.environ.copy()
    env["AI_FREE_PORT"] = str(port)

    try:
        log_file = open(server_log_path, "a", encoding="utf-8")
    except Exception as e:
        logger.warning("Could not open %s for writing: %e. Using DEVNULL.", server_log_path, e)
        log_file = subprocess.DEVNULL  # type: ignore

    kwargs: Dict[str, Any] = {
        "cwd": str(project_root),
        "env": env,
        "stdout": log_file,
        "stderr": subprocess.STDOUT,
    }

    if os.name == "posix":
        # Launch detached session so it survives tray restarts
        kwargs["start_new_session"] = True
    elif hasattr(subprocess, "CREATE_NO_WINDOW"):
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

    try:
        proc = subprocess.Popen(cmd, **kwargs)
        _server_process = proc

        # Save PID
        try:
            get_pid_file().write_text(str(proc.pid), encoding="utf-8")
        except Exception as e:
            logger.debug("Failed to write PID file: %s", e)

        logger.info("Server spawned with PID %d. Waiting for readiness...", proc.pid)
        ready = wait_for_server(host, port, timeout_sec=12.0)
        if ready:
            logger.info("Server is ready at %s", get_base_url(host, port))
            return True
        else:
            logger.warning("Server process started (PID %d) but health check timed out.", proc.pid)
            return False
    except Exception as e:
        logger.error("Failed to launch server process: %s", e)
        return False


def stop_server_process(
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    timeout_sec: float = 5.0,
) -> bool:
    """
    Stop the server gracefully via POST /api/shutdown, then force terminate if needed.
    """
    global _server_process

    logger.info("Stopping server at %s...", get_base_url(host, port))

    # 1. Send graceful shutdown request
    send_shutdown_request(host, port, timeout=2.0)

    # 2. Wait up to 3 seconds for server to exit
    deadline = time.time() + 3.0
    stopped = False
    while time.time() < deadline:
        if not is_server_running(host, port, timeout=0.5):
            stopped = True
            break
        time.sleep(0.3)

    # 3. Terminate tracked subprocess handle if still alive
    if _server_process is not None and _server_process.poll() is None:
        try:
            logger.info("Terminating tracked server process PID %d", _server_process.pid)
            _server_process.terminate()
            _server_process.wait(timeout=2.0)
        except Exception:
            try:
                _server_process.kill()
            except Exception:
                pass
        _server_process = None

    # 4. Check PID file for external or previous process
    pid_file = get_pid_file()
    if pid_file.is_file():
        try:
            pid = int(pid_file.read_text(encoding="utf-8").strip())
            if is_pid_alive(pid):
                logger.info("Killing PID %d from pidfile", pid)
                kill_pid(pid)
        except Exception as e:
            logger.debug("Error checking PID file: %s", e)
        finally:
            try:
                pid_file.unlink(missing_ok=True)
            except Exception:
                pass

    # 5. Check instance registry descriptors (~/.ai-free/instances/*.json)
    instances_dir = Path.home() / ".ai-free" / "instances"
    if instances_dir.is_dir():
        for inst_file in instances_dir.glob("*.json"):
            try:
                data = json.loads(inst_file.read_text(encoding="utf-8"))
                inst_pid = data.get("pid")
                if inst_pid and isinstance(inst_pid, int) and is_pid_alive(inst_pid):
                    logger.info("Killing verified PID %d from instance %s", inst_pid, inst_file.name)
                    kill_pid(inst_pid)
            except Exception as e:
                logger.debug("Error reading instance file %s: %s", inst_file, e)
            finally:
                try:
                    inst_file.unlink(missing_ok=True)
                except Exception:
                    pass

    stopped = not is_server_running(host, port, timeout=0.5)
    logger.info("Server stop completed (stopped=%s)", stopped)
    return stopped


def restart_server_process(
    project_root: Path,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
) -> bool:
    """Restart server: stop, wait, and start."""
    logger.info("Restarting server...")
    stop_server_process(host, port)
    time.sleep(0.5)
    return start_server_process(project_root, host, port)


def is_pid_alive(pid: int) -> bool:
    """Check if process with PID exists."""
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def kill_pid(pid: int, timeout: float = 2.0) -> None:
    """Send SIGTERM then SIGKILL to a PID and its process group on POSIX."""
    if not is_pid_alive(pid):
        return
    try:
        if hasattr(os, "killpg") and hasattr(os, "getpgid"):
            try:
                pgid = os.getpgid(pid)
                os.killpg(pgid, signal.SIGTERM)
            except Exception:
                os.kill(pid, signal.SIGTERM)
        else:
            os.kill(pid, signal.SIGTERM)
    except Exception:
        return

    deadline = time.time() + timeout
    while time.time() < deadline:
        if not is_pid_alive(pid):
            return
        time.sleep(0.1)

    try:
        if hasattr(os, "killpg") and hasattr(os, "getpgid"):
            try:
                pgid = os.getpgid(pid)
                os.killpg(pgid, signal.SIGKILL if hasattr(signal, "SIGKILL") else signal.SIGTERM)
            except Exception:
                os.kill(pid, signal.SIGKILL if hasattr(signal, "SIGKILL") else signal.SIGTERM)
        else:
            os.kill(pid, signal.SIGKILL if hasattr(signal, "SIGKILL") else signal.SIGTERM)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# UI & Desktop Integration
# ---------------------------------------------------------------------------

CHROMIUM_BROWSERS = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "brave",
    "brave-browser",
    "yandex-browser",
    "yandex-browser-stable",
    "microsoft-edge",
    "microsoft-edge-stable",
    "edge",
]

TERMINAL_EMULATORS = [
    ("konsole", lambda d: ["konsole", "--workdir", str(d)]),
    ("gnome-terminal", lambda d: ["gnome-terminal", f"--working-directory={d}"]),
    ("xfce4-terminal", lambda d: ["xfce4-terminal", f"--working-directory={d}"]),
    ("mate-terminal", lambda d: ["mate-terminal", f"--working-directory={d}"]),
    ("lxterminal", lambda d: ["lxterminal", f"--working-directory={d}"]),
    ("alacritty", lambda d: ["alacritty", "--working-directory", str(d)]),
    ("kitty", lambda d: ["kitty", "--directory", str(d)]),
    ("x-terminal-emulator", lambda d: ["x-terminal-emulator"]),
    ("xterm", lambda d: ["xterm"]),
]


def open_app_window(
    project_root: Path,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
) -> bool:
    """
    Open the WebAIFreeAPI frontend in a standalone web app browser window.
    Ensures server is running first.
    """
    url = get_base_url(host, port)

    if not is_server_running(host, port):
        logger.info("Server not running. Starting server before opening window...")
        start_server_process(project_root, host, port)
        wait_for_server(host, port, timeout_sec=10.0)

    # 1. Try Chromium-based browsers in app mode
    for browser in CHROMIUM_BROWSERS:
        browser_bin = shutil.which(browser)
        if browser_bin:
            cmd = [browser_bin, f"--app={url}", "--window-size=1320,860"]
            logger.info("Opening app window with %s: %s", browser, cmd)
            try:
                kwargs: Dict[str, Any] = {
                    "stdout": subprocess.DEVNULL,
                    "stderr": subprocess.DEVNULL,
                }
                if os.name == "posix":
                    kwargs["start_new_session"] = True
                subprocess.Popen(cmd, **kwargs)
                return True
            except Exception as e:
                logger.warning("Failed to launch %s: %s", browser, e)

    # 2. Try xdg-open on Linux
    if shutil.which("xdg-open"):
        logger.info("Opening URL via xdg-open: %s", url)
        try:
            kwargs = {
                "stdout": subprocess.DEVNULL,
                "stderr": subprocess.DEVNULL,
            }
            if os.name == "posix":
                kwargs["start_new_session"] = True
            subprocess.Popen(["xdg-open", url], **kwargs)
            return True
        except Exception as e:
            logger.warning("Failed to run xdg-open: %s", e)

    # 3. Fallback to standard Python webbrowser
    logger.info("Opening URL via python webbrowser: %s", url)
    return webbrowser.open(url)


def open_terminal(directory: Path) -> bool:
    """Launch system terminal emulator inside specified directory."""
    for term_name, cmd_builder in TERMINAL_EMULATORS:
        if shutil.which(term_name):
            cmd = cmd_builder(directory)
            logger.info("Launching terminal: %s", cmd)
            try:
                kwargs: Dict[str, Any] = {
                    "cwd": str(directory),
                    "stdout": subprocess.DEVNULL,
                    "stderr": subprocess.DEVNULL,
                }
                if os.name == "posix":
                    kwargs["start_new_session"] = True
                subprocess.Popen(cmd, **kwargs)
                return True
            except Exception as e:
                logger.warning("Failed to start %s: %s", term_name, e)

    if os.name == "nt":
        subprocess.Popen(["cmd.exe", "/c", "start", "cmd.exe"], cwd=str(directory))
        return True

    logger.error("No suitable terminal emulator found.")
    return False


def open_logs_folder() -> bool:
    """Open ~/.ai-free/logs in system file manager."""
    log_dir = get_log_dir()
    log_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Opening logs folder: %s", log_dir)

    if shutil.which("xdg-open"):
        try:
            kwargs: Dict[str, Any] = {
                "stdout": subprocess.DEVNULL,
                "stderr": subprocess.DEVNULL,
            }
            if os.name == "posix":
                kwargs["start_new_session"] = True
            subprocess.Popen(["xdg-open", str(log_dir)], **kwargs)
            return True
        except Exception as e:
            logger.warning("xdg-open failed: %s", e)

    for fm in ["dolphin", "nautilus", "thunar", "pcmanfm", "caja", "nemo"]:
        if shutil.which(fm):
            try:
                kwargs = {
                    "stdout": subprocess.DEVNULL,
                    "stderr": subprocess.DEVNULL,
                }
                if os.name == "posix":
                    kwargs["start_new_session"] = True
                subprocess.Popen([fm, str(log_dir)], **kwargs)
                return True
            except Exception as e:
                logger.debug("File manager %s failed: %s", fm, e)

    if os.name == "nt" and hasattr(os, "startfile"):
        os.startfile(str(log_dir))  # type: ignore
        return True

    webbrowser.open(log_dir.as_uri())
    return True


# ---------------------------------------------------------------------------
# Tray Icon Creation & Menu Handlers
# ---------------------------------------------------------------------------

def create_tray_image(project_root: Path) -> Any:
    """
    Load project icon (ai-free.png or ai-free.ico) or generate a clean PIL image.
    """
    if Image is None:
        return None

    # Try icon files
    for cand in [
        project_root / "ai-free.png",
        project_root / "ai-free.ico",
        project_root / "dist" / "icon.png",
    ]:
        if cand.is_file():
            try:
                img = Image.open(str(cand))
                # Ensure RGBA mode
                return img.convert("RGBA")
            except Exception as e:
                logger.debug("Could not load image %s: %s", cand, e)

    # Fallback generated icon: 64x64 blue badge with white ring
    size = (64, 64)
    img = Image.new("RGBA", size, color=(0, 0, 0, 0))
    if ImageDraw is not None:
        draw = ImageDraw.Draw(img)
        # Background circle
        draw.ellipse([4, 4, 60, 60], fill=(24, 144, 255, 255), outline=(255, 255, 255, 255), width=3)
        # Center core
        draw.ellipse([22, 22, 42, 42], fill=(255, 255, 255, 255))
    return img


def run_tray_app(
    project_root: Path,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
) -> None:
    """
    Run pystray system tray loop.
    """
    global _tray_icon

    if not HAS_TRAY or pystray is None:
        logger.warning("pystray or Pillow not available. Falling back to background process mode.")
        run_headless_loop(project_root, host, port)
        return

    icon_img = create_tray_image(project_root)

    def on_open_app(icon: Any, item: Any) -> None:
        open_app_window(project_root, host, port)

    def on_open_terminal(icon: Any, item: Any) -> None:
        open_terminal(project_root)

    def on_open_logs(icon: Any, item: Any) -> None:
        open_logs_folder()

    def on_restart_server(icon: Any, item: Any) -> None:
        def _bg_restart():
            restart_server_process(project_root, host, port)
            try:
                icon.notify("Сервер перезапущен (порт 4317)", APP_NAME)
            except Exception:
                pass
        threading.Thread(target=_bg_restart, daemon=True).start()

    def on_exit(icon: Any, item: Any) -> None:
        logger.info("Exit requested from tray menu.")
        _shutdown_event.set()
        try:
            icon.stop()
        except Exception as e:
            logger.debug("Error stopping icon: %s", e)
        stop_server_process(host, port)
        remove_tray_pid()
        sys.exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("Открыть WebAIFreeAPI", on_open_app, default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Открыть терминал", on_open_terminal),
        pystray.MenuItem("Папка с логами", on_open_logs),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Перезапустить сервер", on_restart_server),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Выход", on_exit),
    )

    title = f"{APP_NAME} ({host}:{port})"
    _tray_icon = pystray.Icon("ai_free_tray", icon_img, title, menu=menu)

    # Save tray PID
    save_tray_pid()

    # Initial notification
    try:
        _tray_icon.notify(f"Сервер работает на http://{host}:{port}", APP_NAME)
    except Exception:
        pass

    logger.info("System tray initialized. Entering event loop...")
    try:
        _tray_icon.run()
    except Exception as e:
        logger.warning("Tray icon runtime error (%s). Falling back to background process mode.", e)
        run_headless_loop(project_root, host, port)
    finally:
        remove_tray_pid()


def run_headless_loop(
    project_root: Path,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
) -> None:
    """
    Fallback background mode when GUI/tray is unavailable or disabled.
    Handles SIGTERM / SIGINT and keeps server alive.
    """
    save_tray_pid()
    logger.info("Running in headless background mode. Press Ctrl+C or send SIGTERM to exit.")

    def handle_signal(sig: int, frame: Any) -> None:
        logger.info("Received signal %d. Shutting down...", sig)
        _shutdown_event.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, handle_signal)

    try:
        while not _shutdown_event.is_set():
            _shutdown_event.wait(timeout=1.0)
    finally:
        logger.info("Cleaning up background service...")
        stop_server_process(host, port)
        remove_tray_pid()


def save_tray_pid() -> None:
    """Save current tray launcher PID to ~/.ai-free/tray.pid."""
    try:
        get_tray_pid_file().write_text(str(os.getpid()), encoding="utf-8")
    except Exception as e:
        logger.debug("Failed to write tray PID: %s", e)


def remove_tray_pid() -> None:
    """Remove ~/.ai-free/tray.pid file."""
    try:
        get_tray_pid_file().unlink(missing_ok=True)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# CLI Command Implementations
# ---------------------------------------------------------------------------

def cmd_status(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> int:
    """Print server status to stdout. Exit 0 if running, 1 if offline."""
    running, info = get_server_health(host, port)
    if running:
        uptime = info.get("uptime", "unknown")
        app = info.get("app", APP_NAME)
        print(f"Status: RUNNING")
        print(f"Application: {app}")
        print(f"Endpoint: {get_base_url(host, port)}")
        print(f"Uptime: {uptime}s")
        return 0
    else:
        print(f"Status: STOPPED")
        print(f"Endpoint: {get_base_url(host, port)}")
        if "error" in info:
            print(f"Details: {info['error']}")
        return 1


def cmd_stop(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> int:
    """Stop server and any running tray instance."""
    # Stop running tray process if exists
    tray_pid_file = get_tray_pid_file()
    if tray_pid_file.is_file():
        try:
            pid = int(tray_pid_file.read_text(encoding="utf-8").strip())
            if pid != os.getpid() and is_pid_alive(pid):
                logger.info("Stopping running tray launcher (PID %d)...", pid)
                kill_pid(pid)
        except Exception as e:
            logger.debug("Error killing tray PID: %s", e)
        finally:
            tray_pid_file.unlink(missing_ok=True)

    stopped = stop_server_process(host, port)
    if stopped:
        print(f"{APP_NAME} stopped successfully.")
        return 0
    else:
        print(f"Warning: {APP_NAME} may not have fully terminated.")
        return 1


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ai_free_tray.py",
        description=f"{APP_NAME} Linux Tray & GUI Launcher (ROSA Linux 13 / X11 / Wayland)",
    )
    parser.add_argument(
        "--app",
        action="store_true",
        help="Open WebAIFreeAPI window in standalone web app mode.",
    )
    parser.add_argument(
        "--no-tray",
        action="store_true",
        help="Run without system tray icon (headless service mode).",
    )
    parser.add_argument(
        "--stop",
        action="store_true",
        help="Stop running server and tray processes, then exit.",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Check if server is active and return exit code 0 (running) or 1 (stopped).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Server port (default: {DEFAULT_PORT}).",
    )
    parser.add_argument(
        "--host",
        type=str,
        default=DEFAULT_HOST,
        help=f"Server host (default: {DEFAULT_HOST}).",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable verbose debug logging.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    setup_logging(debug=args.debug)
    project_root = find_project_root()
    host = args.host
    port = args.port

    logger.debug("Project root resolved to: %s", project_root)

    # 1. Action: --status
    if args.status:
        sys.exit(cmd_status(host, port))

    # 2. Action: --stop
    if args.stop:
        sys.exit(cmd_stop(host, port))

    # 3. Start server in background if not already active
    server_ready = start_server_process(project_root, host, port)
    if not server_ready:
        logger.warning("Server was not confirmed ready. Proceeding anyway...")

    # 4. Action: --app (open browser window)
    if args.app:
        open_app_window(project_root, host, port)

    # 5. Tray vs Headless lifecycle
    if args.no_tray:
        # If launched with both --app and --no-tray from CLI, user just wanted to open the window
        # without keeping a tray daemon alive if server is already running.
        if args.app:
            logger.info("Window opened in --no-tray mode. Exiting.")
            sys.exit(0)
        run_headless_loop(project_root, host, port)
    else:
        run_tray_app(project_root, host, port)


if __name__ == "__main__":
    main()
