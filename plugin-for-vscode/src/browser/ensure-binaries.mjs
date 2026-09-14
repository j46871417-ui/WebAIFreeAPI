// Patchright и Playwright используют разные бинарники Chromium — ставим оба при первом запуске.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..");
let ensurePromise = null;

function runInstall(label, args) {
  console.log(`📦 ${label}…`);
  const npmCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npmCmd, args, { cwd: projectRoot, stdio: "inherit" });
  return result.status === 0;
}

function chromiumLooksInstalled(chromium) {
  try {
    const p = chromium.executablePath();
    return Boolean(p && fs.existsSync(p));
  } catch {
    return false;
  }
}

export async function ensureBrowserBinaries({ quiet = false } = {}) {
  const { detectBrowserChannels } = await import("./launch.mjs");
  const detected = detectBrowserChannels();

  if (detected.any) {
    const installed = [];
    if (detected.msedge) installed.push("msedge");
    if (detected.chrome) installed.push("chrome");
    if (detected.brave) installed.push("brave");
    if (detected.chromium) installed.push("chromium");
    return {
      ok: true,
      engine: installed[0] || "msedge",
      installed,
      detectedPath: detected.any,
      channels: detected,
    };
  }

  // Проверяем встроенный Playwright/Patchright Chromium
  try {
    const { chromium } = await import("playwright");
    const exe = chromium?.executablePath?.();
    if (exe && fs.existsSync(exe)) {
      return {
        ok: true,
        engine: "playwright-bundled",
        installed: ["playwright-bundled"],
        detectedPath: exe,
        channels: { ...detected, playwrightBundled: exe },
      };
    }
  } catch {}

  return {
    ok: false,
    engine: null,
    installed: [],
    error: "Не найден поддерживаемый браузер (Microsoft Edge или Google Chrome). Пожалуйста, установите Google Chrome или Microsoft Edge, либо выполните команду 'npx playwright install chromium'.",
  };
}

async function ensureBrowserBinariesOnce(opts) {
  return ensureBrowserBinaries(opts);
}
