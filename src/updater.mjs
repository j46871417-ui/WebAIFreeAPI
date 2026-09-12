import fs, { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";

import { AI_FREE_VERSION } from "./config.mjs";

const execFileAsync = promisify(execFile);

const REPO_OWNER = process.env.AI_FREE_REPO_OWNER || "j46871417-ui";
const REPO_NAME = process.env.AI_FREE_REPO_NAME || "WebAIFreeAPI";
const DEFAULT_BRANCH = process.env.AI_FREE_REPO_BRANCH || "main";
const RAW_PACKAGE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${DEFAULT_BRANCH}/package.json`;
const RELEASES_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const RELEASES_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const SETUP_DOWNLOAD_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/WebAIFreeAPI-Setup.exe`;

function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function normalizeVersion(version) {
  return String(version || "").trim().replace(/^v/i, "");
}

function readCurrentVersion(root = projectRoot()) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : AI_FREE_VERSION;
  } catch {
    return AI_FREE_VERSION;
  }
}

export function compareVersions(a, b) {
  const left = normalizeVersion(a).split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const right = normalizeVersion(b).split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const length = Math.max(left.length, right.length, 3);
  for (let index = 0; index < length; index += 1) {
    const l = Number.isFinite(left[index]) ? left[index] : 0;
    const r = Number.isFinite(right[index]) ? right[index] : 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function windowsNodeInstallRoots({ env = process.env, execPath = process.execPath } = {}) {
  return unique([
    execPath && path.dirname(execPath),
    env.npm_node_execpath && path.dirname(env.npm_node_execpath),
    env.NVM_SYMLINK,
    env.ProgramW6432 && path.join(env.ProgramW6432, "nodejs"),
    env.ProgramFiles && path.join(env.ProgramFiles, "nodejs"),
    env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "nodejs"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "nodejs"),
  ]);
}

export function windowsNpmCommandCandidates({ env = process.env, execPath = process.execPath } = {}) {
  const roots = windowsNodeInstallRoots({ env, execPath });
  return unique([
    env.npm_node_execpath && env.npm_execpath
      ? { command: env.npm_node_execpath, prefixArgs: [env.npm_execpath], shell: false }
      : null,
    "npm",
    "npm.cmd",
    env.APPDATA && path.join(env.APPDATA, "npm", "npm.cmd"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Volta", "bin", "npm.cmd"),
    env.USERPROFILE && path.join(env.USERPROFILE, ".volta", "bin", "npm.cmd"),
    env.USERPROFILE && path.join(env.USERPROFILE, "scoop", "apps", "nodejs", "current", "npm.cmd"),
    ...roots.map((root) => path.join(root, "npm.cmd")),
    ...roots.map((root) => ({
      command: path.join(root, "node.exe"),
      prefixArgs: [path.join(root, "node_modules", "npm", "bin", "npm-cli.js")],
      shell: false,
    })),
  ]);
}

function windowsCommandScript(command) {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(String(command || ""));
}

function commandCandidatePaths(command) {
  if (process.platform !== "win32") return [command];
  const env = process.env;
  if (command === "git") {
    return unique([
      "git",
      "git.exe",
      env.ProgramFiles && path.join(env.ProgramFiles, "Git", "cmd", "git.exe"),
      env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "Git", "cmd", "git.exe"),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "Git", "cmd", "git.exe"),
    ]);
  }
  if (command === "npm") {
    return windowsNpmCommandCandidates({ env, execPath: process.execPath });
  }
  if (command === "node") {
    return unique([
      "node",
      process.execPath,
      ...windowsNodeInstallRoots().map((root) => path.join(root, "node.exe")),
    ]);
  }
  return [command];
}

function normalizeExecutable(executable) {
  if (typeof executable === "string") {
    return {
      command: executable,
      prefixArgs: [],
      shell: windowsCommandScript(executable),
    };
  }
  return {
    command: executable.command,
    prefixArgs: executable.prefixArgs || [],
    shell: executable.shell === true || windowsCommandScript(executable.command),
  };
}

async function executableWorks(executable, args = ["--version"]) {
  const resolved = normalizeExecutable(executable);
  try {
    await execFileAsync(resolved.command, [...resolved.prefixArgs, ...args], {
      shell: resolved.shell,
      timeout: 10_000,
      maxBuffer: 100_000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function resolveCommand(command) {
  for (const candidate of commandCandidatePaths(command)) {
    if (await executableWorks(candidate)) return normalizeExecutable(candidate);
  }
  return null;
}

export async function resolveNpmCommand() {
  return resolveCommand("npm");
}

export async function probeRuntimeCommand(command) {
  const executable = command === "npm" ? await resolveNpmCommand() : await resolveCommand(command);
  if (!executable) return { command, ok: false, error: "not found", resolved: "" };
  const resolved = normalizeExecutable(executable);
  try {
    const { stdout, stderr } = await execFileAsync(
      resolved.command,
      [...resolved.prefixArgs, "--version"],
      { shell: resolved.shell, timeout: 10_000, maxBuffer: 100_000 },
    );
    return {
      command,
      ok: true,
      version: String(stdout || stderr || "").split(/\r?\n/)[0]?.trim() || "ok",
      resolved: executableDisplayName(resolved, command),
    };
  } catch (error) {
    return { command, ok: false, error: error.message || "failed", resolved: executableDisplayName(resolved, command) };
  }
}

function executableDisplayName(executable, fallback) {
  if (!executable) return fallback;
  const resolved = normalizeExecutable(executable);
  return [resolved.command, ...resolved.prefixArgs].filter(Boolean).join(" ");
}

async function runGit(args, options = {}) {
  const gitCommand = options.gitCommand || await resolveCommand("git");
  if (!gitCommand) throw new Error("Не найден git. Установи Git или открой страницу релиза для ручного обновления.");
  const result = await runCommand(gitCommand, args, {
    cwd: options.cwd || projectRoot(),
    timeout: options.timeout || 120_000,
    maxBuffer: options.maxBuffer || 2_000_000,
  });
  return String(result || "").trim();
}

async function readRemotePackage() {
  try {
    const apiRes = await fetch(RELEASES_API_URL, {
      headers: { "User-Agent": "AI-Free-Updater", "Accept": "application/vnd.github+json" },
      cache: "no-store",
    });
    if (apiRes.ok) {
      const release = await apiRes.json();
      const rawTag = release.tag_name || "";
      const version = normalizeVersion(rawTag);
      const exeAsset = (release.assets || []).find((a) => String(a?.name || "").endsWith(".exe"));
      if (version) {
        return {
          version,
          url: release.html_url || RELEASES_URL,
          setupUrl: exeAsset?.browser_download_url || SETUP_DOWNLOAD_URL,
        };
      }
    }
  } catch {}

  const response = await fetch(RAW_PACKAGE_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`GitHub вернул HTTP ${response.status}`);
  }
  const pkg = await response.json();
  return {
    version: typeof pkg.version === "string" ? pkg.version : "",
    url: RAW_PACKAGE_URL,
    setupUrl: SETUP_DOWNLOAD_URL,
  };
}

async function readLocalCommit(root, gitCommand) {
  try {
    return await runGit(["rev-parse", "HEAD"], { cwd: root, gitCommand });
  } catch {
    return "";
  }
}

async function readRemoteCommit(root, gitCommand) {
  try {
    const output = await runGit(["ls-remote", "origin", `refs/heads/${DEFAULT_BRANCH}`], {
      cwd: root,
      gitCommand,
      timeout: 120_000,
    });
    return output.split(/\s+/)[0] || "";
  } catch {
    return "";
  }
}

async function downloadFile(url, destPath) {
  const response = await fetch(url, {
    headers: { "User-Agent": "WebAIFreeAPI-Native-Updater" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Ошибка загрузки обновления: HTTP ${response.status} ${response.statusText}`);
  }
  const fileStream = createWriteStream(destPath);
  await pipeline(response.body, fileStream);
}

export async function checkForUpdate() {
  const root = projectRoot();
  const currentVersion = readCurrentVersion(root);
  const [gitCommand, npmCommand] = await Promise.all([
    resolveCommand("git"),
    resolveNpmCommand(),
  ]);
  const [remotePackage, localCommit, remoteCommit] = await Promise.all([
    readRemotePackage().catch((error) => ({ version: "", error: error.message, url: RAW_PACKAGE_URL, setupUrl: SETUP_DOWNLOAD_URL })),
    gitCommand ? readLocalCommit(root, gitCommand) : "",
    gitCommand ? readRemoteCommit(root, gitCommand) : "",
  ]);
  const latestVersion = remotePackage.version || "";
  const versionCompare = latestVersion ? compareVersions(currentVersion, latestVersion) : 0;
  const isGit = Boolean(gitCommand) && fs.existsSync(path.join(root, ".git"));
  const updateAvailable =
    versionCompare < 0 || (versionCompare === 0 && isGit && localCommit && remoteCommit && localCommit !== remoteCommit);

  const canUpdate = updateAvailable;
  const updateMethod = isGit ? (npmCommand ? "git+npm" : "git") : "native-package";
  const updateWarning = isGit && !npmCommand
    ? "npm не найден. WebAIFreeAPI обновит код через git; если изменились зависимости, понадобится установить Node.js/npm и повторить обновление."
    : "";

  return {
    ok: !remotePackage.error,
    currentVersion,
    latestVersion,
    updateAvailable,
    localCommit,
    remoteCommit,
    canUpdate,
    canInstallDependencies: isGit ? Boolean(npmCommand) : true,
    updateMethod,
    updateWarning,
    projectRoot: root,
    source: remotePackage.url,
    releasesUrl: RELEASES_URL,
    setupUrl: remotePackage.setupUrl || SETUP_DOWNLOAD_URL,
    gitCommand: executableDisplayName(gitCommand, "git"),
    npmCommand: npmCommand ? executableDisplayName(npmCommand, "npm") : "",
    error: remotePackage.error || "",
  };
}

async function runCommand(command, args, options = {}) {
  const executable = normalizeExecutable(command);
  const result = await execFileAsync(executable.command, [...executable.prefixArgs, ...args], {
    cwd: options.cwd || projectRoot(),
    shell: executable.shell,
    timeout: options.timeout || 600_000,
    maxBuffer: options.maxBuffer || 8_000_000,
  });
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

export async function runUpdate() {
  const root = projectRoot();
  const before = await checkForUpdate();
  if (!before.updateAvailable) {
    return {
      ok: true,
      updated: false,
      message: "Установлена актуальная версия.",
      before,
      after: before,
      logs: [],
    };
  }

  const logs = [];

  if (before.updateMethod.startsWith("git")) {
    const [gitCommand, npmCommand] = await Promise.all([
      resolveCommand("git"),
      resolveNpmCommand(),
    ]);
    if (!gitCommand) {
      throw new Error("Не найден git. Установи Git или используй нативное обновление.");
    }

    const beforeCommit = before.localCommit || await readLocalCommit(root, gitCommand);
    logs.push(await runCommand(gitCommand, ["fetch", "--prune", "origin"], { cwd: root, timeout: 180_000 }));
    logs.push(await runCommand(gitCommand, ["pull", "--ff-only", "origin", DEFAULT_BRANCH], { cwd: root, timeout: 180_000 }));

    const afterPullCommit = await readLocalCommit(root, gitCommand);
    let changedFiles = [];
    if (beforeCommit && afterPullCommit && beforeCommit !== afterPullCommit) {
      const changedOutput = await runCommand(gitCommand, ["diff", "--name-only", `${beforeCommit}..${afterPullCommit}`], {
        cwd: root,
        timeout: 60_000,
        maxBuffer: 1_000_000,
      }).catch(() => "");
      changedFiles = String(changedOutput || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }
    const dependencyFilesChanged = changedFiles.some((file) =>
      file === "package.json" || file === "package-lock.json" || file === "npm-shrinkwrap.json"
    );
    let skippedDependencyInstall = false;
    if (dependencyFilesChanged && npmCommand) {
      logs.push(await runCommand(npmCommand, ["install"], {
        cwd: root,
        timeout: 900_000,
        maxBuffer: 12_000_000,
      }));
    } else if (dependencyFilesChanged) {
      skippedDependencyInstall = true;
      logs.push("npm не найден: установка зависимостей пропущена.");
    } else {
      logs.push("Зависимости не менялись: npm install не требуется.");
    }

    const after = await checkForUpdate();
    const restartReady = !(skippedDependencyInstall && dependencyFilesChanged);
    return {
      ok: true,
      updated: true,
      restartReady,
      skippedDependencyInstall,
      dependencyFilesChanged,
      message: skippedDependencyInstall
        ? dependencyFilesChanged
          ? "Код обновлён, но зависимости изменились, а npm не найден. Установи Node.js/npm и повтори обновление перед перезапуском."
          : "Код обновлён. npm не найден, но зависимости не менялись, можно перезапустить WebAIFreeAPI."
        : "Обновление установлено. WebAIFreeAPI будет перезапущен автоматически.",
      before,
      after,
      logs: logs.filter(Boolean),
    };
  }

  // Нативное прямое обновление (Windows установщик в фоновом режиме)
  const setupUrl = before.setupUrl || SETUP_DOWNLOAD_URL;
  logs.push(`Фоновая загрузка установщика с ${setupUrl}...`);
  const tempInstallerPath = path.join(os.tmpdir(), `WebAIFreeAPI-Setup-v${before.latestVersion || "latest"}.exe`);
  await downloadFile(setupUrl, tempInstallerPath);
  logs.push(`Установщик обновления успешно загружен: ${tempInstallerPath}`);

  logs.push(`Запуск нативного фонового обновления в ${root}...`);
  const child = spawn(tempInstallerPath, [
    "/silent",
    "/update",
    `/dir=${root}`,
  ], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return {
    ok: true,
    updated: true,
    restarting: true,
    restartReady: true,
    updateMethod: "native-package",
    message: `Обновление WebAIFreeAPI v${before.latestVersion} загружено. Перезапускаю приложение...`,
    before,
    after: {
      ...before,
      currentVersion: before.latestVersion,
      updateAvailable: false,
    },
    logs,
  };
}

export function scheduleWindowRestart({ port = 4317, workspaceRoot = process.cwd(), delayMs = 1800 } = {}) {
  const root = projectRoot();
  const entry = path.join(root, "bin", "deepseek.mjs");
  const payload = Buffer.from(JSON.stringify({
    node: process.execPath,
    args: [
      entry,
      "--window",
      "--port",
      String(port),
      "--workspace",
      workspaceRoot,
    ],
    cwd: root,
    env: {
      ...process.env,
      AI_FREE_RESTARTED_AFTER_UPDATE: "1",
    },
    delayMs,
  }), "utf8").toString("base64");
  const code = [
    'const { spawn } = require("node:child_process");',
    'const payload = JSON.parse(Buffer.from(process.argv[1], "base64").toString("utf8"));',
    'setTimeout(() => {',
    '  const child = spawn(payload.node, payload.args, { cwd: payload.cwd, env: payload.env, detached: true, stdio: "ignore" });',
    '  child.unref();',
    '}, payload.delayMs);',
  ].join("\n");
  const launcher = spawn(process.execPath, ["-e", code, payload], {
    cwd: root,
    detached: true,
    stdio: "ignore",
  });
  launcher.unref();
}
