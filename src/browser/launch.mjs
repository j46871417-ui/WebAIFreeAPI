// Запуск Chromium через Playwright + открытие окна чатов на хосте.
// Здесь нет логики авторизации — только «как поднять браузер» и «как открыть URL».

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { killBrowserProfileProcesses } from "../process/instance-registry.mjs";


// Поднять persistent Chromium-профиль для DeepSeek/Qwen/ChatGPT. headless=false —
// видимое окно, true — для тихого refresh из профиля. Чистит stale SingletonLock-файлы от падений.
// Поддерживает каскадный выбор браузера: Edge → Chrome → Brave → Chromium → bundled Playwright.
export async function launchPersistentDeepSeekContext(chromium, profileDir, headless, overrides = {}) {
  fs.mkdirSync(profileDir, { recursive: true });
  const linuxArgs = process.platform === "linux"
    ? ["--no-sandbox", "--disable-setuid-sandbox"]
    : [];
  const options = {
    headless,
    viewport: null,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      ...linuxArgs,
      ...(overrides.args || []),
    ],
    ...overrides,
  };

  const proxyServer = overrides.proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  if (proxyServer && !options.proxy) {
    options.proxy = typeof proxyServer === "string" ? { server: proxyServer } : proxyServer;
  }

  const detected = detectBrowserChannels();
  const candidateAttempts = [];

  if (overrides.channel) {
    candidateAttempts.push({ type: "channel", value: overrides.channel });
  } else {
    if (detected.chrome) candidateAttempts.push({ type: "channel", value: "chrome" });
    if (detected.msedge) candidateAttempts.push({ type: "channel", value: "msedge" });
    if (detected.chromium) {
      if (process.platform === "linux") {
        candidateAttempts.push({ type: "executablePath", value: detected.chromium });
      } else {
        candidateAttempts.push({ type: "channel", value: "chromium" });
      }
    }

    // Если точные пути не определились (например, в экзотических окружениях),
    // всё равно пробуем стандартные каналы по очереди
    if (!candidateAttempts.length) {
      candidateAttempts.push({ type: "channel", value: "chrome" });
      candidateAttempts.push({ type: "channel", value: "msedge" });
      if (process.platform !== "linux") {
        candidateAttempts.push({ type: "channel", value: "chromium" });
      }
    }
  }

  // Если найден системный браузер (Brave, Edge или Chrome по прямому пути)
  if (detected.any && !candidateAttempts.some((a) => a.type === "executablePath")) {
    candidateAttempts.push({ type: "executablePath", value: detected.any });
  }

  // Последняя попытка — встроенный Playwright/Patchright Chromium без channel
  candidateAttempts.push({ type: "bundled", value: null });

  // Убиваем зависшие процессы браузера, которые держат лок на этой папке профиля
  const clearLocks = () => {
    try {
      killBrowserProfileProcesses(profileDir);
    } catch {}
  };

  // Чистим локи и зависшие процессы перед первой попыткой
  clearLocks();

  const tryLaunchSingle = async (attempt) => {
    const launchOpts = { ...options };
    if (attempt.type === "channel") {
      launchOpts.channel = attempt.value;
      delete launchOpts.executablePath;
    } else if (attempt.type === "executablePath") {
      delete launchOpts.channel;
      launchOpts.executablePath = attempt.value;
    } else {
      delete launchOpts.channel;
      delete launchOpts.executablePath;
    }
    const ctx = await chromium.launchPersistentContext(profileDir, launchOpts);
    try {
      await ctx.addInitScript(() => {
        try {
          Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        } catch {}
      });
    } catch {}
    return ctx;
  };

  const errors = [];
  for (const attempt of candidateAttempts) {
    try {
      return await tryLaunchSingle(attempt);
    } catch (error) {
      errors.push(error);
      const message = String(error?.message || "");
      if (message.includes("ProcessSingleton") || message.includes("SingletonLock") || message.includes("Lock file")) {
        clearLocks();
        try {
          return await tryLaunchSingle(attempt);
        } catch (retryError) {
          errors.push(retryError);
        }
      }
    }
  }

  const cleanReasons = errors.map((e) => e?.message || String(e)).slice(-2).join(" | ");
  let errorMessage;
  if (detected.any) {
    errorMessage = `Не удалось запустить найденный браузер (${detected.msedge ? "Microsoft Edge" : "Google Chrome"}). Ошибка запуска: ${cleanReasons}`;
  } else {
    errorMessage = `В системе не найден поддерживаемый браузер (Chrome, Edge, Brave). Пожалуйста, установите обычный Google Chrome или Microsoft Edge.`;
  }
  const userFacingError = new Error(errorMessage);
  userFacingError.attempts = errors;
  throw userFacingError;
}

// Открыть URL в окне-приложении (--app): без вкладок и адресной строки.
export function openAppWindow(url) {
  const chromeBinary = findChromeBinary();
  if (chromeBinary) {
    try {
      const proc = spawn(chromeBinary, [`--app=${url}`, "--new-window", "--disable-blink-features=AutomationControlled"], {
        detached: true,
        stdio: "ignore",
      });
      proc.on("error", () => fallbackOpen(url));
      proc.unref();
      return;
    } catch {
      // fall through
    }
  }

  if (process.platform === "darwin") {
    const chrome = spawn("open", ["-na", "Google Chrome", "--args", `--app=${url}`], {
      detached: true,
      stdio: "ignore",
    });
    chrome.on("error", () => fallbackOpen(url));
    chrome.unref();
    return;
  }

  fallbackOpen(url);
}

// Определение наличия установленных Chromium-браузеров (Edge, Chrome, Brave, Chromium).
export function detectBrowserChannels() {
  const result = {
    msedge: null,
    chrome: null,
    brave: null,
    chromium: null,
    any: null,
  };

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

    const edgePaths = [
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      localAppData ? path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe") : null,
    ].filter(Boolean);
    for (const p of edgePaths) {
      try { if (fs.existsSync(p)) { result.msedge = p; break; } } catch {}
    }

    const chromePaths = [
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      localAppData ? path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe") : null,
    ].filter(Boolean);
    for (const p of chromePaths) {
      try { if (fs.existsSync(p)) { result.chrome = p; break; } } catch {}
    }

    const bravePaths = [
      path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      path.join(programFilesX86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      localAppData ? path.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe") : null,
    ].filter(Boolean);
    for (const p of bravePaths) {
      try { if (fs.existsSync(p)) { result.brave = p; break; } } catch {}
    }

    const chromiumPaths = [
      path.join(programFiles, "Chromium", "Application", "chrome.exe"),
      path.join(programFilesX86, "Chromium", "Application", "chrome.exe"),
      localAppData ? path.join(localAppData, "Chromium", "Application", "chrome.exe") : null,
    ].filter(Boolean);
    for (const p of chromiumPaths) {
      try { if (fs.existsSync(p)) { result.chromium = p; break; } } catch {}
    }
  } else if (process.platform === "darwin") {
    const check = (p) => { try { return fs.existsSync(p) ? p : null; } catch { return null; } };
    const home = osHomedirSafe();
    result.chrome = check("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ||
      check(path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
    result.msedge = check("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge") ||
      check(path.join(home, "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"));
    result.brave = check("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser") ||
      check(path.join(home, "Applications/Brave Browser.app/Contents/MacOS/Brave Browser"));
    result.chromium = check("/Applications/Chromium.app/Contents/MacOS/Chromium") ||
      check(path.join(home, "Applications/Chromium.app/Contents/MacOS/Chromium"));
  } else {
    const check = (p) => {
      try {
        return (p && fs.existsSync(p)) ? p : null;
      } catch {
        return null;
      }
    };
    const which = (name) => {
      try {
        const res = spawnSync("which", [name], { encoding: "utf8" });
        if (res.status === 0 && res.stdout) {
          const first = res.stdout.split("\n")[0].trim();
          if (first && check(first)) return first;
        }
      } catch {}
      return null;
    };
    const findBinary = (names, paths) => {
      for (const name of names) {
        const found = which(name);
        if (found) return found;
      }
      for (const p of paths) {
        const found = check(p);
        if (found) return found;
      }
      return null;
    };

    result.chrome = findBinary(
      ["google-chrome", "google-chrome-stable"],
      [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/local/bin/google-chrome",
        "/usr/local/bin/google-chrome-stable",
        "/opt/google/chrome/google-chrome",
        "/opt/google/chrome/chrome",
        "/snap/bin/google-chrome",
        "/var/lib/flatpak/exports/bin/com.google.Chrome",
      ],
    );
    result.msedge = findBinary(
      ["microsoft-edge", "microsoft-edge-stable", "msedge"],
      [
        "/usr/bin/microsoft-edge",
        "/usr/bin/microsoft-edge-stable",
        "/usr/bin/msedge",
        "/opt/microsoft/msedge/msedge",
        "/opt/microsoft/msedge/microsoft-edge",
        "/usr/local/bin/microsoft-edge",
      ],
    );
    result.brave = findBinary(
      ["brave-browser", "brave"],
      [
        "/usr/bin/brave-browser",
        "/usr/bin/brave",
        "/usr/local/bin/brave-browser",
        "/opt/brave.com/brave/brave-browser",
        "/snap/bin/brave",
        "/var/lib/flatpak/exports/bin/com.brave.Browser",
      ],
    );
    result.chromium = findBinary(
      ["chromium", "chromium-browser"],
      [
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/local/bin/chromium",
        "/usr/local/bin/chromium-browser",
        "/snap/bin/chromium",
        "/var/lib/flatpak/exports/bin/org.chromium.Chromium",
      ],
    );
  }

  // Порядок выбора основного бинарника: Chrome → Edge → Brave → Chromium
  result.any = result.chrome || result.msedge || result.brave || result.chromium;
  return result;
}

// Поиск Chrome/Chromium/Edge на Win/Linux/Mac. Возвращает абсолютный путь или null.
export function findChromeBinary() {
  return detectBrowserChannels().any;
}

function osHomedirSafe() {
  try {
    return process.env.HOME || "";
  } catch {
    return "";
  }
}

export function fallbackOpen(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}
