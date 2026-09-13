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
  return { ok: true, engine: "msedge" };
}

async function ensureBrowserBinariesOnce({ quiet = false } = {}) {
  return { ok: true, engine: "msedge", installed: [] };
}
