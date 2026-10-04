import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

export function getInstanceDir() {
  const dir = path.join(os.homedir(), ".ai-free", "instances");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getInstanceFilePath(instanceId = "server-default") {
  const safeId = String(instanceId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getInstanceDir(), `${safeId}.json`);
}

export function getLegacyPidFilePath() {
  const dir = path.join(os.homedir(), ".ai-free");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "ai-free.pid");
}

/**
 * Atomically writes instance descriptor to disk
 */
export function registerInstance(details = {}) {
  const instanceId = details.instanceId || "server-default";
  const pid = details.pid || process.pid;
  const filePath = getInstanceFilePath(instanceId);
  const tempPath = `${filePath}.${Date.now()}.tmp`;

  const payload = {
    instanceId,
    pid,
    port: details.port || 4317,
    startedAt: details.startedAt || new Date().toISOString(),
    cwd: details.cwd || process.cwd(),
    execPath: details.execPath || process.execPath,
    argv: details.argv || process.argv,
    version: details.version || "1.10.0-alpha.1",
  };

  try {
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);

    // Sync legacy PID file
    try {
      fs.writeFileSync(getLegacyPidFilePath(), String(pid), "utf8");
    } catch {}

    return payload;
  } catch (error) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
}

/**
 * Reads instance descriptor
 */
export function readInstance(instanceId = "server-default") {
  const filePath = getInstanceFilePath(instanceId);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Removes instance descriptor
 */
export function unregisterInstance(instanceId = "server-default") {
  const filePath = getInstanceFilePath(instanceId);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
  try {
    const legacy = getLegacyPidFilePath();
    if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
  } catch {}
}

/**
 * Check if a PID is alive
 */
export function isProcessAlive(pid) {
  if (!pid || typeof pid !== "number" || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies that the running process with PID actually belongs to this instance
 */
export function isProcessOwnedByInstance(pid, instanceInfo) {
  if (!isProcessAlive(pid) || !instanceInfo) return false;

  // On Linux/POSIX systems check /proc filesystem
  if (process.platform === "linux") {
    try {
      const cmdlinePath = `/proc/${pid}/cmdline`;
      if (fs.existsSync(cmdlinePath)) {
        const cmdline = fs.readFileSync(cmdlinePath, "utf8").replace(/\0/g, " ");
        const matchesEntry = cmdline.includes("deepseek.mjs") || cmdline.includes("ai-free");
        const matchesNode = cmdline.includes("node");
        if (matchesEntry || matchesNode) {
          return true;
        }
      }
    } catch {}

    try {
      const cwdLink = `/proc/${pid}/cwd`;
      if (fs.existsSync(cwdLink)) {
        const realCwd = fs.readlinkSync(cwdLink);
        if (realCwd === instanceInfo.cwd) {
          return true;
        }
      }
    } catch {}

    return false;
  }

  // On Windows
  if (process.platform === "win32") {
    try {
      const output = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      if (output.toLowerCase().includes("node.exe") || output.toLowerCase().includes("webai")) {
        return true;
      }
    } catch {
      return true; // Fallback to alive check
    }
  }

  return true;
}

/**
 * Stops an instance safely with verification, graceful shutdown, and process group termination
 */
export async function stopManagedInstance(instanceId = "server-default", { timeoutMs = 4000, port = 4317 } = {}) {
  const instance = readInstance(instanceId);
  let stopped = false;
  let method = "none";

  // 1. Try graceful HTTP shutdown
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      method = "http";
      stopped = true;
    }
  } catch {}

  // 2. Verified process termination
  if (instance && instance.pid) {
    const pid = instance.pid;
    if (isProcessAlive(pid)) {
      const isOwned = isProcessOwnedByInstance(pid, instance);
      if (isOwned) {
        if (process.platform === "win32") {
          try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
            method = "taskkill";
            stopped = true;
          } catch {
            try { process.kill(pid, "SIGTERM"); stopped = true; method = "sigterm"; } catch {}
          }
        } else {
          // Linux: Send SIGTERM to process group
          try {
            process.kill(-pid, "SIGTERM");
            method = "sigterm_group";
          } catch {
            try { process.kill(pid, "SIGTERM"); method = "sigterm"; } catch {}
          }

          // Wait up to timeoutMs for termination
          const start = Date.now();
          while (isProcessAlive(pid) && (Date.now() - start < timeoutMs)) {
            await new Promise((r) => setTimeout(r, 200));
          }

          // If still alive, SIGKILL
          if (isProcessAlive(pid)) {
            try {
              process.kill(-pid, "SIGKILL");
              method = "sigkill_group";
            } catch {
              try { process.kill(pid, "SIGKILL"); method = "sigkill"; } catch {}
            }
          }
          stopped = true;
        }
      } else {
        // PID exists but belongs to an unrelated process (PID reuse)
        console.warn(`[InstanceRegistry] Stale PID ${pid} does not belong to WebAIFreeAPI instance. Not terminating.`);
      }
    }
  }

  unregisterInstance(instanceId);
  return { stopped, method, instanceId, pid: instance?.pid || null };
}

/**
 * Safely terminates browser processes bound to a specific profileDir,
 * inspecting SingletonLock and process command lines instead of broad pkill.
 */
export function killBrowserProfileProcesses(profileDir) {
  if (!profileDir) return false;
  const absProfileDir = path.resolve(profileDir);
  let killed = false;

  if (process.platform === "win32") {
    try {
      const escaped = String(absProfileDir).replace(/'/g, "''");
      execSync(
        `powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${escaped}*' }; if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; exit 0 } else { exit 1 }"`,
        { stdio: "ignore", timeout: 10_000 }
      );
      killed = true;
    } catch {}
  } else {
    // Linux / POSIX
    const candidatePids = new Set();

    // 1. Check SingletonLock symlink (Chromium standard on Linux)
    const singletonLockPath = path.join(absProfileDir, "SingletonLock");
    try {
      if (fs.existsSync(singletonLockPath)) {
        const lockTarget = fs.readlinkSync(singletonLockPath);
        const match = lockTarget.match(/(?:^|-)(\d+)$/);
        if (match) {
          const pid = parseInt(match[1], 10);
          if (pid > 0) candidatePids.add(pid);
        }
      }
    } catch {}

    // 2. Query pgrep specifically for --user-data-dir
    try {
      const pgrepOut = execSync(`pgrep -f "--user-data-dir=${absProfileDir}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5_000,
      });
      for (const line of pgrepOut.split("\n")) {
        const pid = parseInt(line.trim(), 10);
        if (pid > 0) candidatePids.add(pid);
      }
    } catch {}

    // 3. For each candidate PID, verify ownership via cmdline before killing
    for (const pid of candidatePids) {
      if (!isProcessAlive(pid)) continue;
      let isVerifiedBrowser = false;
      try {
        const cmdlinePath = `/proc/${pid}/cmdline`;
        if (fs.existsSync(cmdlinePath)) {
          const cmdline = fs.readFileSync(cmdlinePath, "utf8");
          if (cmdline.includes(absProfileDir) && (
            cmdline.includes("chrome") ||
            cmdline.includes("chromium") ||
            cmdline.includes("brave") ||
            cmdline.includes("edge")
          )) {
            isVerifiedBrowser = true;
          }
        }
      } catch {}

      if (isVerifiedBrowser) {
        try {
          process.kill(pid, "SIGTERM");
          killed = true;
        } catch {}
      }
    }

    // Brief grace period for SIGTERM
    if (candidatePids.size > 0) {
      const deadline = Date.now() + 500;
      while (Date.now() < deadline) {
        let anyAlive = false;
        for (const pid of candidatePids) {
          if (isProcessAlive(pid)) { anyAlive = true; break; }
        }
        if (!anyAlive) break;
        try { execSync("sleep 0.05", { stdio: "ignore" }); } catch {}
      }

      // SIGKILL if still alive
      for (const pid of candidatePids) {
        if (isProcessAlive(pid)) {
          try {
            process.kill(pid, "SIGKILL");
            killed = true;
          } catch {}
        }
      }
    }
  }

  // Clean up lock files
  for (const f of ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"]) {
    try { fs.unlinkSync(path.join(absProfileDir, f)); } catch {}
  }

  return killed;
}

