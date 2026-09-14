import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { AI_FREE_VERSION, SETTINGS_FILE } from "../config.mjs";
import { loadSettings } from "../state/settings.mjs";
import { getStateFile } from "../state/window-state.mjs";
import { listProviders } from "../providers/registry.mjs";
import { probeRuntimeCommand } from "../updater.mjs";
import { resolveLogDirectory } from "../logging/logger.mjs";

const execFileAsync = promisify(execFile);
export const DIAGNOSTIC_COMMANDS = ["node", "npm", "git", "python3", "python", "dotnet", "pio", "arduino-cli", "esptool.py"];

export async function collectDiagnostics({ workspaceRoot, state, runningTaskIds = [] } = {}) {
  const settings = loadSettings();
  const [commands, git] = await Promise.all([
    Promise.all(DIAGNOSTIC_COMMANDS.map(checkCommand)),
    collectGitInfo(workspaceRoot),
  ]);
  const providers = listProviders().map((provider) => {
    const authPath = provider.authFile || "";
    const hasAuth = Boolean(provider.hasAuth?.());
    return {
      id: provider.id,
      name: provider.name,
      status: hasAuth ? "ready" : "needs_login",
      hasAuth,
      authFile: authPath,
      authFileExists: authPath ? fs.existsSync(authPath) : false,
      authFileLabel: authPath ? redactHome(authPath) : "",
      description: provider.description || "",
    };
  });
  const conversations = Array.isArray(state?.conversations) ? state.conversations : [];
  const logFile = path.join(resolveLogDirectory(), "ai-free.log");
  const activeConversation = conversations.find((item) => item.id === state?.activeConversationId) || null;

  let browsers = {
    edge: { available: false, path: null },
    chrome: { available: false, path: null },
    brave: { available: false, path: null },
    chromium: { available: false, path: null },
    any: false,
  };
  try {
    const { detectBrowserChannels } = await import("../browser/launch.mjs");
    const ch = detectBrowserChannels();
    browsers = {
      edge: { available: Boolean(ch.msedge), path: ch.msedge ? redactHome(ch.msedge) : null },
      chrome: { available: Boolean(ch.chrome), path: ch.chrome ? redactHome(ch.chrome) : null },
      brave: { available: Boolean(ch.brave), path: ch.brave ? redactHome(ch.brave) : null },
      chromium: { available: Boolean(ch.chromium), path: ch.chromium ? redactHome(ch.chromium) : null },
      any: Boolean(ch.any),
    };
  } catch {}

  const recentLogs = collectRecentLogs(logFile, 40);

  const summary = {
    generatedAt: new Date().toISOString(),
    app: {
      name: "AI Free",
      version: AI_FREE_VERSION,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      release: os.release(),
    },
    workspace: {
      root: workspaceRoot ? path.resolve(workspaceRoot) : "",
      exists: workspaceRoot ? fs.existsSync(path.resolve(workspaceRoot)) : false,
    },
    state: {
      stateFile: getStateFile(),
      stateFileExists: fs.existsSync(getStateFile()),
      settingsFile: SETTINGS_FILE,
      settingsFileExists: fs.existsSync(SETTINGS_FILE),
      conversations: conversations.length,
      activeConversationId: state?.activeConversationId || "",
      activeProvider: activeConversation?.provider || "",
      activeModel: activeConversation?.model || "",
      runningTaskIds,
    },
    logging: {
      file: logFile,
      exists: fs.existsSync(logFile),
    },
    browsers,
    recentLogs,
    providers,
    commands,
    git,
    telegram: {
      enabled: settings.telegram?.enabled === true,
      hasBotToken: Boolean(settings.telegram?.botToken),
      hasChatId: Boolean(settings.telegram?.chatId),
    },
  };
  return {
    ...summary,
    report: formatDiagnosticReport(summary),
  };
}

export function formatDiagnosticReport(data) {
  const lines = [];
  lines.push("AI Free diagnostic report");
  lines.push(`Generated: ${data.generatedAt}`);
  lines.push("");
  lines.push("App");
  lines.push(`- Version: ${data.app.version}`);
  lines.push(`- Node: ${data.app.node}`);
  lines.push(`- Platform: ${data.app.platform}`);
  lines.push(`- OS release: ${data.app.release}`);
  lines.push("");
  lines.push("Workspace");
  lines.push(`- Root: ${redactHome(data.workspace.root)}`);
  lines.push(`- Exists: ${yesNo(data.workspace.exists)}`);
  lines.push("");
  lines.push("State");
  lines.push(`- State file: ${redactHome(data.state.stateFile)} (${existsLabel(data.state.stateFileExists)})`);
  lines.push(`- Settings file: ${redactHome(data.state.settingsFile)} (${existsLabel(data.state.settingsFileExists)})`);
  lines.push(`- Conversations: ${data.state.conversations}`);
  lines.push(`- Active provider/model: ${data.state.activeProvider || "-"} / ${data.state.activeModel || "-"}`);
  lines.push(`- Running tasks: ${data.state.runningTaskIds.length ? data.state.runningTaskIds.join(", ") : "-"}`);
  lines.push("");
  lines.push("Logging");
  lines.push(`- Log file: ${redactHome(data.logging.file)} (${existsLabel(data.logging.exists)})`);
  lines.push("");
  lines.push("Providers");
  for (const provider of data.providers) {
    lines.push(`- ${provider.name}: ${provider.status}${provider.authFileLabel ? ` (${provider.authFileLabel})` : ""}`);
  }
  lines.push("");
  lines.push("Commands");
  for (const command of data.commands) {
    lines.push(`- ${command.command}: ${command.ok ? command.version || "ok" : command.error}`);
  }
  lines.push("");
  lines.push("Git");
  lines.push(`- Available: ${yesNo(data.git.available)}`);
  lines.push(`- Branch: ${data.git.branch || "-"}`);
  lines.push(`- Commit: ${data.git.commit || "-"}`);
  lines.push(`- Dirty: ${yesNo(data.git.dirty)}`);
  lines.push("");
  lines.push("Telegram");
  lines.push(`- Enabled: ${yesNo(data.telegram.enabled)}`);
  lines.push(`- Bot token configured: ${yesNo(data.telegram.hasBotToken)}`);
  lines.push(`- Chat ID configured: ${yesNo(data.telegram.hasChatId)}`);

  if (data.browsers) {
    lines.push("");
    lines.push("Browsers");
    lines.push(`- Microsoft Edge: ${data.browsers.edge?.available ? (data.browsers.edge.path || "ok") : "missing"}`);
    lines.push(`- Google Chrome: ${data.browsers.chrome?.available ? (data.browsers.chrome.path || "ok") : "missing"}`);
    if (data.browsers.brave?.available) {
      lines.push(`- Brave Browser: ${data.browsers.brave.path || "ok"}`);
    }
    if (data.browsers.chromium?.available) {
      lines.push(`- Chromium: ${data.browsers.chromium.path || "ok"}`);
    }
    lines.push(`- Any browser available: ${yesNo(data.browsers.any)}`);
  }

  if (Array.isArray(data.recentLogs) && data.recentLogs.length) {
    lines.push("");
    lines.push("Recent Logs & Errors");
    for (const entry of data.recentLogs.slice(-25)) {
      const ts = entry.timestamp ? `[${entry.timestamp}] ` : "";
      const lvl = entry.level ? `[${entry.level.toUpperCase()}] ` : "";
      const comp = entry.component ? `(${entry.component}) ` : "";
      const ev = entry.event ? `${entry.event}: ` : "";
      lines.push(`- ${ts}${lvl}${comp}${ev}${redactHome(entry.message || "")}`);
    }
  }

  return lines.join("\n");
}

function collectRecentLogs(logFile, maxLines = 40) {
  const result = [];
  try {
    if (fs.existsSync(logFile)) {
      const raw = fs.readFileSync(logFile, "utf8");
      const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
      const tail = lines.slice(-maxLines);
      for (const line of tail) {
        try {
          const parsed = JSON.parse(line);
          result.push({
            timestamp: parsed.timestamp,
            level: parsed.level,
            component: parsed.component,
            event: parsed.event,
            message: parsed.error?.message || (typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data)),
          });
        } catch {
          result.push({ message: redactHome(line) });
        }
      }
    }
  } catch {}

  // Также проверяем backend.log от C# трея / встроенного процесса
  try {
    const backendLog = path.resolve(process.cwd(), "backend.log");
    if (fs.existsSync(backendLog)) {
      const raw = fs.readFileSync(backendLog, "utf8");
      const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
      const tail = lines.slice(-20);
      for (const line of tail) {
        result.push({ component: "backend-native", event: "stdout", message: redactHome(line) });
      }
    }
  } catch {}

  return result;
}

async function checkCommand(command) {
  return probeRuntimeCommand(command);
}

async function collectGitInfo(workspaceRoot) {
  const cwd = path.resolve(workspaceRoot || process.cwd());
  try {
    const [branch, commit, status] = await Promise.all([
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd).catch(() => ""),
      runGit(["rev-parse", "--short", "HEAD"], cwd).catch(() => ""),
      runGit(["status", "--porcelain"], cwd).catch(() => ""),
    ]);
    return {
      available: true,
      branch,
      commit,
      dirty: Boolean(status),
    };
  } catch (error) {
    return {
      available: false,
      branch: "",
      commit: "",
      dirty: false,
      error: error.message,
    };
  }
}

async function runGit(args, cwd) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: 8000,
    maxBuffer: 300_000,
  });
  return String(stdout || "").trim();
}

function redactHome(value) {
  const text = String(value || "");
  const home = os.homedir();
  return home && text.startsWith(home) ? `~${text.slice(home.length)}` : text;
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function existsLabel(value) {
  return value ? "exists" : "missing";
}
