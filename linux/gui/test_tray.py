#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unit tests for WebAIFreeAPI Linux Tray & GUI Launcher.
"""

import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add parent directory to path to import ai_free_tray
sys.path.insert(0, str(Path(__file__).resolve().parent))
import ai_free_tray


class MockServerHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "app": "WebAIFreeAPI", "uptime": 42}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/api/shutdown":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Silence HTTP server log spam
        pass


class TestAIFreeTray(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Start mock server on an ephemeral free port
        cls.server = socketserver.TCPServer(("127.0.0.1", 0), MockServerHandler)
        cls.port = cls.server.server_address[1]
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_cli_parser(self):
        parser = ai_free_tray.build_parser()
        args = parser.parse_args(["--app", "--no-tray", "--port", "5000"])
        self.assertTrue(args.app)
        self.assertTrue(args.no_tray)
        self.assertFalse(args.stop)
        self.assertFalse(args.status)
        self.assertEqual(args.port, 5000)

        args_stop = parser.parse_args(["--stop"])
        self.assertTrue(args_stop.stop)

        args_status = parser.parse_args(["--status"])
        self.assertTrue(args_status.status)

    def test_find_project_root(self):
        root = ai_free_tray.find_project_root()
        self.assertTrue((root / "bin" / "deepseek.mjs").is_file(), f"bin/deepseek.mjs not found in {root}")

    def test_find_node_binary(self):
        root = ai_free_tray.find_project_root()
        node = ai_free_tray.find_node_binary(root)
        self.assertTrue(bool(node))

    def test_server_health_check(self):
        running = ai_free_tray.is_server_running(port=self.port)
        self.assertTrue(running)

        ok, data = ai_free_tray.get_server_health(port=self.port)
        self.assertTrue(ok)
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("uptime"), 42)

        # Non-existent port
        offline = ai_free_tray.is_server_running(port=self.port + 1)
        self.assertFalse(offline)

    def test_send_shutdown_request(self):
        res = ai_free_tray.send_shutdown_request(port=self.port)
        self.assertTrue(res)

    def test_cmd_status(self):
        exit_code = ai_free_tray.cmd_status(port=self.port)
        self.assertEqual(exit_code, 0)

        exit_code_offline = ai_free_tray.cmd_status(port=self.port + 1)
        self.assertEqual(exit_code_offline, 1)

    @patch("shutil.which")
    @patch("subprocess.Popen")
    def test_open_app_window_chromium(self, mock_popen, mock_which):
        mock_which.side_effect = lambda cmd: "/usr/bin/chromium" if cmd == "chromium" else None
        root = ai_free_tray.find_project_root()
        res = ai_free_tray.open_app_window(root, port=self.port)
        self.assertTrue(res)
        self.assertTrue(mock_popen.called)
        called_cmd = mock_popen.call_args[0][0]
        self.assertIn("/usr/bin/chromium", called_cmd)
        self.assertTrue(any("--app=" in arg for arg in called_cmd))

    @patch("shutil.which")
    @patch("subprocess.Popen")
    def test_open_terminal(self, mock_popen, mock_which):
        mock_which.side_effect = lambda cmd: "/usr/bin/konsole" if cmd == "konsole" else None
        root = ai_free_tray.find_project_root()
        res = ai_free_tray.open_terminal(root)
        self.assertTrue(res)
        self.assertTrue(mock_popen.called)
        called_cmd = mock_popen.call_args[0][0]
        self.assertEqual(called_cmd[0], "konsole")
        self.assertEqual(called_cmd[1], "--workdir")

    @patch("shutil.which")
    @patch("subprocess.Popen")
    def test_open_logs_folder(self, mock_popen, mock_which):
        mock_which.side_effect = lambda cmd: "/usr/bin/xdg-open" if cmd == "xdg-open" else None
        res = ai_free_tray.open_logs_folder()
        self.assertTrue(res)
        self.assertTrue(mock_popen.called)


if __name__ == "__main__":
    unittest.main()
