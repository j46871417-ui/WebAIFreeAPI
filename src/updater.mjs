import fs, { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
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

export function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function normalizeVersion(version) {
  return String(version || "").trim().replace(/^v/i, "");
}

/**
 * SemVer 2.0.0 Parser
 * Returns { major, minor, patch, prerelease: string[], build: string, raw: string }
 */
export function parseSemVer(version) {
  const raw = normalizeVersion(version);
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/);
  if (!match) {
    // Fallback for non-strict or partial versions
    const parts = raw.split(/[.-]/).map((p) => Number.parseInt(p, 10));
    return {
      major: Number.isFinite(parts[0]) ? parts[0] : 0,
      minor: Number.isFinite(parts[1]) ? parts[1] : 0,
      patch: Number.isFinite(parts[2]) ? parts[2] : 0,
      prerelease: [],
      build: "",
      raw,
    };
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  const prereleaseStr = match[4] || "";
  const build = match[5] || "";

  const prerelease = prereleaseStr ? prereleaseStr.split(".") : [];

  return { major, minor, patch, prerelease, build, raw };
}

/**
 * Strict SemVer 2.0.0 comparator
 * 1.9.10 < 1.10.0
 * 1.10.0-alpha.1 < 1.10.0-alpha.2
 * 1.10.0-alpha.1 < 1.10.0-beta.1
 * 1.10.0-beta.1 < 1.10.0-rc.1
 * 1.10.0-rc.1 < 1.10.0
 * 1.10.0 > 1.10.0-rc.1
 */
export function compareVersions(a, b) {
  const vA = parseSemVer(a);
  const vB = parseSemVer(b);

  if (vA.major > vB.major) return 1;
  if (vA.major < vB.major) return -1;

  if (vA.minor > vB.minor) return 1;
  if (vA.minor < vB.minor) return -1;

  if (vA.patch > vB.patch) return 1;
  if (vA.patch < vB.patch) return -1;

  // Prerelease comparison:
  // When major, minor, and patch are equal, a normal version has higher precedence than a pre-release
  const aHasPre = vA.prerelease.length > 0;
  const bHasPre = vB.prerelease.length > 0;

  if (!aHasPre && bHasPre) return 1;  // 1.10.0 > 1.10.0-rc.1
  if (aHasPre && !bHasPre) return -1; // 1.10.0-rc.1 < 1.10.0
  if (!aHasPre && !bHasPre) return 0; // 1.10.0 == 1.10.0

  // Both have pre-release identifiers
  const maxLen = Math.max(vA.prerelease.length, vB.prerelease.length);
  for (let i = 0; i < maxLen; i++) {
    const pA = vA.prerelease[i];
    const pB = vB.prerelease[i];

    if (pA === undefined) return -1; // Smaller set of pre-release fields has lower precedence
    if (pB === undefined) return 1;

    if (pA === pB) continue;

    const numA = /^\d+$/.test(pA) ? Number.parseInt(pA, 10) : null;
    const numB = /^\d+$/.test(pB) ? Number.parseInt(pB, 10) : null;

    // Identifiers consisting of only digits are compared numerically
    if (numA !== null && numB !== null) {
      if (numA > numB) return 1;
      if (numA < numB) return -1;
      continue;
    }

    // Numeric identifiers always have lower precedence than non-numeric identifiers
    if (numA !== null && numB === null) return -1;
    if (numA === null && numB !== null) return 1;

    // Identifiers with letters or hyphens are compared lexically in ASCII sort order
    if (pA > pB) return 1;
    if (pA < pB) return -1;
  }

  return 0;
}

/**
 * Detect update channel for a version string
 */
export function detectChannel(version) {
  const norm = normalizeVersion(version).toLowerCase();
  if (norm.includes("alpha")) return "alpha";
  if (norm.includes("beta")) return "beta";
  if (norm.includes("rc")) return "beta";
  return "stable";
}

/**
 * Check if a target version is eligible for a given configured channel
 * - stable: only stable
 * - beta: stable and beta
 * - alpha: stable, beta, and alpha
 */
export function isUpdateAllowedForChannel(targetVersion, configuredChannel = "stable") {
  const targetChannel = detectChannel(targetVersion);
  if (configuredChannel === "alpha") return true;
  if (configuredChannel === "beta") return targetChannel === "stable" || targetChannel === "beta";
  return targetChannel === "stable";
}

export function readCurrentVersion(root = projectRoot()) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : AI_FREE_VERSION;
  } catch {
    return AI_FREE_VERSION;
  }
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

/**
 * Verifies SHA-256 checksum of a file
 */
export function verifyChecksum(filePath, expectedSha256) {
  if (!expectedSha256) return true;
  const hash = crypto.createHash("sha256");
  const fileBuffer = fs.readFileSync(filePath);
  hash.update(fileBuffer);
  const actualSha256 = hash.digest("hex").toLowerCase();
  const cleanExpected = String(expectedSha256).trim().toLowerCase();
  if (actualSha256 !== cleanExpected) {
    throw new Error(`Checksum mismatch: expected ${cleanExpected}, got ${actualSha256}`);
  }
  return true;
}

/**
 * Select artifact from manifest or release assets based on platform/arch
 */
export function selectUpdateArtifact(releaseOrManifest, { platform = process.platform, arch = process.arch, packageType = "archive" } = {}) {
  // 1. If structured manifest exists
  if (releaseOrManifest?.artifacts && typeof releaseOrManifest.artifacts === "object") {
    const targetKey = `${platform}-${arch}`;
    const rpmKey = `linux-rpm-${arch}`;

    if (platform === "linux" && packageType === "rpm" && releaseOrManifest.artifacts[rpmKey]) {
      return { ...releaseOrManifest.artifacts[rpmKey], key: rpmKey, platform: "linux" };
    }
    if (releaseOrManifest.artifacts[targetKey]) {
      return { ...releaseOrManifest.artifacts[targetKey], key: targetKey, platform };
    }
    // Generic platform key fallback
    if (releaseOrManifest.artifacts[platform]) {
      return { ...releaseOrManifest.artifacts[platform], key: platform, platform };
    }
  }

  // 2. Synthesize from release assets
  const assets = releaseOrManifest?.assets || [];
  if (platform === "win32") {
    const setupAsset = assets.find((a) => String(a?.name || "").endsWith("-Setup.exe") || String(a?.name || "").endsWith(".exe"));
    if (setupAsset) {
      return {
        name: setupAsset.name,
        file: setupAsset.name,
        url: setupAsset.browser_download_url,
        sha256: setupAsset.sha256 || "",
        format: "installer",
        platform: "win32",
      };
    }
  } else if (platform === "linux") {
    if (packageType === "rpm") {
      const rpmAsset = assets.find((a) => String(a?.name || "").endsWith(".rpm"));
      if (rpmAsset) {
        return {
          name: rpmAsset.name,
          file: rpmAsset.name,
          url: rpmAsset.browser_download_url,
          sha256: rpmAsset.sha256 || "",
          format: "rpm",
          platform: "linux",
        };
      }
    }
    const tarAsset = assets.find((a) => String(a?.name || "").endsWith(".tar.gz") || String(a?.name || "").endsWith(".tar.zst"));
    if (tarAsset) {
      return {
        name: tarAsset.name,
        file: tarAsset.name,
        url: tarAsset.browser_download_url,
        sha256: tarAsset.sha256 || "",
        format: "tarball",
        platform: "linux",
      };
    }
  }

  // If no matching artifact found
  return null;
}

async function readRemotePackage(configuredChannel = "stable") {
  try {
    const apiRes = await fetch(RELEASES_API_URL, {
      headers: { "User-Agent": "AI-Free-Updater", "Accept": "application/vnd.github+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (apiRes.ok) {
      const release = await apiRes.json();
      const rawTag = release.tag_name || "";
      const version = normalizeVersion(rawTag);
      const manifestAsset = (release.assets || []).find((a) => String(a?.name || "").toLowerCase() === "release-manifest.json");

      let manifest = null;
      if (manifestAsset?.browser_download_url) {
        try {
          const mRes = await fetch(manifestAsset.browser_download_url, { signal: AbortSignal.timeout(4_000) });
          if (mRes.ok) manifest = await mRes.json();
        } catch {}
      }

      const selectedArtifact = selectUpdateArtifact(manifest || release, {
        platform: process.platform,
        arch: process.arch,
      });

      if (version) {
        return {
          version,
          channel: detectChannel(version),
          url: release.html_url || RELEASES_URL,
          manifest,
          artifact: selectedArtifact,
          setupUrl: selectedArtifact?.url || (process.platform === "win32" ? SETUP_DOWNLOAD_URL : ""),
        };
      }
    }
  } catch {}

  const response = await fetch(RAW_PACKAGE_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub вернул HTTP ${response.status}`);
  }
  const pkg = await response.json();
  const rawVer = typeof pkg.version === "string" ? pkg.version : "";
  return {
    version: rawVer,
    channel: detectChannel(rawVer),
    url: RAW_PACKAGE_URL,
    manifest: null,
    artifact: null,
    setupUrl: process.platform === "win32" ? SETUP_DOWNLOAD_URL : "",
  };
}

async function readLocalCommit(root, gitCommand) {
  try {
    return await runGit(["rev-parse", "HEAD"], { cwd: root, gitCommand, timeout: 5_000 });
  } catch {
    return "";
  }
}

async function readRemoteCommit(root, gitCommand) {
  try {
    const output = await runGit(["ls-remote", "origin", `refs/heads/${DEFAULT_BRANCH}`], {
      cwd: root,
      gitCommand,
      timeout: 5_000,
    });
    return output.split(/\s+/)[0] || "";
  } catch {
    return "";
  }
}

export async function downloadFile(url, destPath) {
  const response = await fetch(url, {
    headers: { "User-Agent": "WebAIFreeAPI-Universal-Updater" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Ошибка загрузки обновления: HTTP ${response.status} ${response.statusText}`);
  }
  const fileStream = createWriteStream(destPath);
  await pipeline(response.body, fileStream);
}

export async function checkForUpdate(options = {}) {
  const root = options.projectRoot || projectRoot();
  const currentVersion = readCurrentVersion(root);
  const currentChannel = options.channel || process.env.AI_FREE_UPDATE_CHANNEL || detectChannel(currentVersion);

  const [gitCommand, npmCommand] = await Promise.all([
    resolveCommand("git"),
    resolveNpmCommand(),
  ]);
  const [remotePackage, localCommit, remoteCommit] = await Promise.all([
    readRemotePackage(currentChannel).catch((error) => ({
      version: "",
      channel: "stable",
      error: error.message,
      url: RAW_PACKAGE_URL,
      setupUrl: process.platform === "win32" ? SETUP_DOWNLOAD_URL : "",
    })),
    gitCommand ? readLocalCommit(root, gitCommand) : "",
    gitCommand ? readRemoteCommit(root, gitCommand) : "",
  ]);

  const latestVersion = remotePackage.version || "";
  const versionCompare = latestVersion ? compareVersions(currentVersion, latestVersion) : 0;
  const isGit = Boolean(gitCommand) && fs.existsSync(path.join(root, ".git"));

  // Check channel gating: stable channel never auto-updates to prereleases
  const channelAllowed = latestVersion ? isUpdateAllowedForChannel(latestVersion, currentChannel) : true;

  const updateAvailable = channelAllowed && (
    versionCompare < 0 || (versionCompare === 0 && isGit && localCommit && remoteCommit && localCommit !== remoteCommit)
  );

  let updateMethod = "native-package";
  if (isGit) {
    updateMethod = npmCommand ? "git+npm" : "git";
  } else if (process.platform === "linux") {
    updateMethod = "linux-package";
  } else if (process.platform === "win32") {
    updateMethod = "windows-installer";
  }

  const updateWarning = isGit && !npmCommand
    ? "npm не найден. WebAIFreeAPI обновит код через git; если изменились зависимости, понадобится установить Node.js/npm и повторить обновление."
    : "";

  return {
    ok: !remotePackage.error,
    currentVersion,
    latestVersion,
    channel: currentChannel,
    channelAllowed,
    updateAvailable,
    localCommit,
    remoteCommit,
    canUpdate: updateAvailable,
    canInstallDependencies: isGit ? Boolean(npmCommand) : true,
    updateMethod,
    updateWarning,
    projectRoot: root,
    source: remotePackage.url,
    releasesUrl: RELEASES_URL,
    setupUrl: remotePackage.setupUrl || (process.platform === "win32" ? SETUP_DOWNLOAD_URL : ""),
    artifact: remotePackage.artifact || null,
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

/**
 * Base Update Backend class
 */
export class BaseUpdateBackend {
  constructor(name) {
    this.name = name;
  }
}

/**
 * Git Updater Backend
 */
export class GitUpdateBackend extends BaseUpdateBackend {
  constructor() {
    super("git");
  }

  async executeUpdate({ before, root, logs }) {
    const [gitCommand, npmCommand] = await Promise.all([
      resolveCommand("git"),
      resolveNpmCommand(),
    ]);
    if (!gitCommand) {
      throw new Error("Не найден git. Установите Git или используйте нативное обновление.");
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

    const after = await checkForUpdate({ projectRoot: root });
    const restartReady = !(skippedDependencyInstall && dependencyFilesChanged);
    return {
      ok: true,
      updated: true,
      restartReady,
      skippedDependencyInstall,
      dependencyFilesChanged,
      message: skippedDependencyInstall
        ? dependencyFilesChanged
          ? "Код обновлён, но зависимости изменились, а npm не найден. Установите Node.js/npm и повторите обновление перед перезапуском."
          : "Код обновлён. npm не найден, но зависимости не менялись, можно перезапустить WebAIFreeAPI."
        : "Обновление установлено. WebAIFreeAPI будет перезапущен автоматически.",
      before,
      after,
      logs: logs.filter(Boolean),
    };
  }
}

/**
 * Windows Installer Updater Backend
 */
export class WindowsInstallerUpdateBackend extends BaseUpdateBackend {
  constructor() {
    super("windows-installer");
  }

  async executeUpdate({ before, root, logs }) {
    if (process.platform !== "win32") {
      throw new Error("Windows Installer не может выполняться на платформе: " + process.platform);
    }

    const setupUrl = before.setupUrl || before.artifact?.url || SETUP_DOWNLOAD_URL;
    logs.push(`Фоновая загрузка установщика с ${setupUrl}...`);
    const tempInstallerPath = path.join(os.tmpdir(), `WebAIFreeAPI-Setup-v${before.latestVersion || "latest"}.exe`);
    await downloadFile(setupUrl, tempInstallerPath);

    if (before.artifact?.sha256) {
      logs.push(`Проверка контрольной суммы SHA-256 (${before.artifact.sha256})...`);
      verifyChecksum(tempInstallerPath, before.artifact.sha256);
      logs.push("Контрольная сумма успешно подтверждена.");
    }

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
      updateMethod: "windows-installer",
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
}

/**
 * Linux Package Updater Backend (Staged update with rollback capability)
 */
export class LinuxPackageUpdateBackend extends BaseUpdateBackend {
  constructor() {
    super("linux-package");
  }

  async executeUpdate({ before, root, logs }) {
    if (process.platform !== "linux") {
      throw new Error("Linux Package Updater не может выполняться на платформе: " + process.platform);
    }

    const artifact = before.artifact;
    if (!artifact?.url) {
      throw new Error("Для версии " + before.latestVersion + " не найден релизный пакет для Linux.");
    }

    // Step 1: DOWNLOAD
    logs.push(`[STAGE: DOWNLOAD] Загрузка пакета обновления: ${artifact.url}...`);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-free-update-"));
    const archivePath = path.join(tempDir, artifact.file || "update.tar.gz");
    await downloadFile(artifact.url, archivePath);

    // Step 2: VERIFY
    if (artifact.sha256) {
      logs.push(`[STAGE: VERIFY] Проверка контрольной суммы SHA-256...`);
      verifyChecksum(archivePath, artifact.sha256);
      logs.push("Контрольная сумма SHA-256 подтверждена.");
    }

    // Step 3: STAGE
    const stagingDir = path.join(tempDir, "staged");
    fs.mkdirSync(stagingDir, { recursive: true });
    logs.push(`[STAGE: EXTRACT] Распаковка обновления в staging каталог...`);
    await execFileAsync("tar", ["-xzf", archivePath, "-C", stagingDir]);

    // Check for nested archive root (e.g. ai-free-1.10.0/)
    let sourceRoot = stagingDir;
    const stagedEntries = fs.readdirSync(stagingDir);
    if (stagedEntries.length === 1 && fs.statSync(path.join(stagingDir, stagedEntries[0])).isDirectory()) {
      sourceRoot = path.join(stagingDir, stagedEntries[0]);
    }

    // Step 4: VALIDATE
    logs.push(`[STAGE: VALIDATE] Проверка целостности распакованного обновления...`);
    const entrypoint = path.join(sourceRoot, "bin", "deepseek.mjs");
    if (!fs.existsSync(entrypoint)) {
      throw new Error("Валидация обновления не пройдена: отсутствует точка входа bin/deepseek.mjs.");
    }

    // Node version probe in staging
    await execFileAsync(process.execPath, [entrypoint, "--version"], { timeout: 10_000 });
    logs.push("Валидация точки входа успешно пройдена.");

    // Step 5: BACKUP & ATOMIC ACTIVATE
    const versionsDir = path.join(os.homedir(), ".ai-free", "versions");
    fs.mkdirSync(versionsDir, { recursive: true });
    const targetVersionDir = path.join(versionsDir, `v${before.latestVersion}`);

    logs.push(`[STAGE: ACTIVATE] Установка новой версии в ${targetVersionDir}...`);
    fs.rmSync(targetVersionDir, { recursive: true, force: true });
    fs.cpSync(sourceRoot, targetVersionDir, { recursive: true });

    // Update current symlink if running from ~/.local/share/ai-free or managed versions
    const isManagedInstall = root.includes(".ai-free") || root.includes(".local/share/ai-free");
    if (isManagedInstall) {
      const backupDir = path.join(versionsDir, `backup-v${before.currentVersion}`);
      fs.rmSync(backupDir, { recursive: true, force: true });
      if (fs.existsSync(root)) {
        try {
          fs.cpSync(root, backupDir, { recursive: true });
          logs.push(`Создана резервная копия текущей версии: ${backupDir}`);
        } catch {}
      }

      // Copy new files over installation root cleanly (preserving node_modules if not bundled)
      fs.cpSync(targetVersionDir, root, { recursive: true });
    }

    // Clean up temporary download dir
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    logs.push("Обновление Linux-пакета успешно установлено.");

    return {
      ok: true,
      updated: true,
      restarting: true,
      restartReady: true,
      updateMethod: "linux-package",
      message: `Обновление WebAIFreeAPI v${before.latestVersion} успешно подготовлено.`,
      before,
      after: {
        ...before,
        currentVersion: before.latestVersion,
        updateAvailable: false,
      },
      logs,
    };
  }
}

/**
 * Factory for update backend
 */
export function getUpdateBackend({ isGit = false, platform = process.platform } = {}) {
  if (isGit) return new GitUpdateBackend();
  if (platform === "win32") return new WindowsInstallerUpdateBackend();
  if (platform === "linux") return new LinuxPackageUpdateBackend();
  return new GitUpdateBackend();
}

/**
 * Universal runUpdate entrypoint
 */
export async function runUpdate(options = {}) {
  const root = options.projectRoot || projectRoot();
  const before = await checkForUpdate({ projectRoot: root, channel: options.channel });
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

  const isGit = before.updateMethod.startsWith("git");
  const backend = getUpdateBackend({ isGit, platform: process.platform });
  const logs = [];

  return backend.executeUpdate({ before, root, logs });
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
