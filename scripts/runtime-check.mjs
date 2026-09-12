import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REQUIRED_FILES = [
  "node/node.exe",
  "package.json",
  "bin/deepseek.mjs",
  "node_modules/patchright/package.json",
  "node_modules/playwright/package.json",
];

function toPlatformPath(relativePath) {
  return relativePath.split("/").join(path.sep);
}

export function getRuntimeStatus(rootDir) {
  const root = path.resolve(rootDir);
  const missing = REQUIRED_FILES.filter((relativePath) => !fs.existsSync(
    path.join(root, toPlatformPath(relativePath)),
  ));

  let packageJson = null;
  const packagePath = path.join(root, "package.json");
  if (fs.existsSync(packagePath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    } catch {
      missing.push("package.json (valid JSON)");
    }
  }

  return {
    ok: missing.length === 0,
    root,
    missing,
    version: packageJson?.version || null,
    nodePath: path.join(root, toPlatformPath("node/node.exe")),
  };
}

export function assertRuntimeReady(rootDir) {
  const status = getRuntimeStatus(rootDir);
  if (!status.ok) {
    throw new Error(`Offline runtime is incomplete. Missing: ${status.missing.join(", ")}`);
  }
  return status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const status = assertRuntimeReady(process.argv[2] || process.cwd());
    console.log(`Runtime check passed: WebAIFreeAPI v${status.version || "unknown"}`);
  } catch (error) {
    console.error(`Runtime check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
