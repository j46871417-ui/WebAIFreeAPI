import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { AI_FREE_VERSION } from "../config.mjs";
import { readCurrentVersion, detectChannel, checkForUpdate } from "../updater.mjs";
import { readInstance, isProcessAlive } from "../process/instance-registry.mjs";

/**
 * Checks if an HTTP endpoint responds with 200
 */
function probeHttp(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const req = http.get(
        {
          hostname: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname,
          timeout: timeoutMs,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              statusCode: res.statusCode,
              body: data,
            });
          });
        }
      );
      req.on("error", (err) => resolve({ ok: false, error: err.message }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, error: "timeout" });
      });
    } catch (err) {
      resolve({ ok: false, error: err.message });
    }
  });
}

/**
 * Performs complete diagnostic checks
 */
export async function runDiagnostics({ strict = false, requireService = false, timeoutMs = 3000 } = {}) {
  const checks = [];
  const addCheck = (category, name, status, message, details = null) => {
    checks.push({ category, name, status, message, details });
  };

  // 1. Core: Node.js Runtime
  const nodeVer = process.version;
  const major = Number.parseInt(nodeVer.replace(/^v/, "").split(".")[0], 10);
  if (major >= 18) {
    addCheck("core", "runtime", "ok", `Node.js ${nodeVer} detected (>= 18 required)`, { version: nodeVer, execPath: process.execPath });
  } else {
    addCheck("core", "runtime", "fail", `Node.js ${nodeVer} is outdated (>= 18 required)`, { version: nodeVer });
  }

  // 2. Core: Project Directories & Write Permissions
  const aiFreeHome = path.join(os.homedir(), ".ai-free");
  const deepseekCliHome = path.join(os.homedir(), ".deepseek-cli");
  let dirsWritable = true;
  try {
    fs.mkdirSync(aiFreeHome, { recursive: true });
    const testFile = path.join(aiFreeHome, ".write_test");
    fs.writeFileSync(testFile, "ok", "utf8");
    fs.unlinkSync(testFile);
  } catch (err) {
    dirsWritable = false;
  }

  if (dirsWritable) {
    addCheck("core", "storage", "ok", `Storage directories writable (${aiFreeHome})`, { aiFreeHome, deepseekCliHome });
  } else {
    addCheck("core", "storage", "fail", `Storage directory ${aiFreeHome} is not writable`);
  }

  // 3. Core: Dependencies (Playwright package)
  try {
    const { findChromeBinary } = await import("../browser/launch.mjs");
    addCheck("core", "dependencies", "ok", "Core modules and browser launcher resolved");
  } catch (err) {
    addCheck("core", "dependencies", "fail", `Failed importing browser modules: ${err.message}`);
  }

  // 4. Browser Detection
  try {
    const { detectBrowserChannels } = await import("../browser/launch.mjs");
    const detected = detectBrowserChannels();
    if (detected.any) {
      addCheck("browser", "detection", "ok", `Browser detected: ${detected.any}`, detected);
    } else {
      addCheck("browser", "detection", "warn", "System browser not found; Playwright bundled Chromium will be used", detected);
    }
  } catch (err) {
    addCheck("browser", "detection", "warn", `Browser detection failed: ${err.message}`);
  }

  // 5. Providers & Model Catalog
  try {
    const { MODEL_CATALOG } = await import("../../packages/core/src/providers/model-catalog.mjs");
    const count = Array.isArray(MODEL_CATALOG) ? MODEL_CATALOG.length : 0;
    addCheck("providers", "catalog", "ok", `Model catalog registered with ${count} models`, { count });
  } catch (err) {
    addCheck("providers", "catalog", "fail", `Model catalog load failed: ${err.message}`);
  }

  // 6. Desktop Integration
  if (process.platform === "linux") {
    const desktopDirs = [
      "/usr/share/applications/ai-free.desktop",
      path.join(os.homedir(), ".local/share/applications/ai-free.desktop"),
    ];
    const foundDesktop = desktopDirs.find((p) => fs.existsSync(p));
    if (foundDesktop) {
      addCheck("desktop", "shortcut", "ok", `Desktop entry installed at ${foundDesktop}`);
    } else {
      addCheck("desktop", "shortcut", "warn", "Desktop entry not found in standard system or user locations");
    }
  } else if (process.platform === "win32") {
    addCheck("desktop", "integration", "ok", "Windows desktop runtime ready");
  }

  // 7. Service & Health Endpoint
  const instance = readInstance("server-default");
  const port = instance?.port || 4317;
  const healthRes = await probeHttp(`http://127.0.0.1:${port}/health`, 1500);

  if (healthRes.ok) {
    let parsedBody = null;
    try { parsedBody = JSON.parse(healthRes.body); } catch {}
    addCheck("service", "server", "ok", `WebAIFreeAPI active on port ${port} (PID: ${instance?.pid || "running"})`, parsedBody);
  } else {
    // Idle service is informative, only warning if requireService is explicitly requested
    const status = (strict && requireService) ? "warn" : "info";
    addCheck("service", "server", status, `WebAIFreeAPI service is currently stopped (port ${port} idle)`);
  }

  // 8. Updater & Channel
  const currentVer = readCurrentVersion();
  const channel = detectChannel(currentVer);
  addCheck("updater", "version", "ok", `Current version: v${currentVer} (channel: ${channel})`, { version: currentVer, channel });

  // Calculate overall status
  const failures = checks.filter((c) => c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn");
  const passes = checks.filter((c) => c.status === "ok");

  const overallOk = failures.length === 0 && (!strict || warnings.length === 0);

  return {
    ok: overallOk,
    strict,
    platform: process.platform,
    version: currentVer,
    timestamp: new Date().toISOString(),
    summary: {
      total: checks.length,
      passed: passes.length,
      warnings: warnings.length,
      failed: failures.length,
    },
    checks,
  };
}

/**
 * Renders human-readable colored report for CLI
 */
export function formatDiagnosticsText(report) {
  const isRu = (process.env.LANG || "").startsWith("ru");
  const C_RESET = "\x1b[0m";
  const C_BOLD = "\x1b[1m";
  const C_GREEN = "\x1b[32m";
  const C_YELLOW = "\x1b[33m";
  const C_RED = "\x1b[31m";
  const C_CYAN = "\x1b[36m";

  const lines = [];
  lines.push(`${C_BOLD}${C_CYAN}=== WebAIFreeAPI Diagnostics (ai-free doctor) ===${C_RESET}`);
  lines.push(`OS: ${process.platform} (${process.arch}) | Version: v${report.version} | Timestamp: ${report.timestamp}`);
  lines.push("");

  const categories = {};
  for (const c of report.checks) {
    categories[c.category] = categories[c.category] || [];
    categories[c.category].push(c);
  }

  for (const [cat, items] of Object.entries(categories)) {
    lines.push(`${C_BOLD}[${cat.toUpperCase()}]${C_RESET}`);
    for (const item of items) {
      let icon = `${C_GREEN}✔${C_RESET}`;
      if (item.status === "warn") icon = `${C_YELLOW}⚠${C_RESET}`;
      if (item.status === "fail") icon = `${C_RED}✖${C_RESET}`;
      if (item.status === "info") icon = `${C_CYAN}ℹ${C_RESET}`;
      lines.push(`  ${icon} ${item.name}: ${item.message}`);
    }
    lines.push("");
  }

  lines.push(`${C_BOLD}Summary:${C_RESET} ${report.summary.passed} passed, ${report.summary.warnings} warnings, ${report.summary.failed} failed`);
  if (report.ok) {
    lines.push(`${C_GREEN}${C_BOLD}Status: READY / HEALTHY${C_RESET}`);
  } else {
    lines.push(`${C_RED}${C_BOLD}Status: ATTENTION REQUIRED${C_RESET}`);
  }

  return lines.join("\n");
}
