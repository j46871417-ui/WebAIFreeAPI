import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const rootDir = "C:\\ai-free";
const distDir = path.join(rootDir, "dist");
const sevenZipExe = "C:\\Program Files\\7-Zip\\7z.exe";
const cscExe = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
const iconFile = path.join(rootDir, "ai-free.ico");
const csFile = path.join(rootDir, "scripts", "Installer.cs");

if (!fs.existsSync(sevenZipExe)) {
  console.error("7-Zip not found in C:\\Program Files\\7-Zip");
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });

const archiveZip = path.join(distDir, "ai-free.zip");
const outputExe = path.join(distDir, "WebAIFreeAPI-Setup.exe");

if (fs.existsSync(archiveZip)) fs.unlinkSync(archiveZip);
if (fs.existsSync(outputExe)) fs.unlinkSync(outputExe);

console.log("1. Creating ai-free.zip archive using 7-Zip...");
const itemsToInclude = [
  "api",
  "bin",
  "node",
  "node_modules",
  "packages",
  "plugin-for-vscode",
  "scripts",
  "src",
  "package.json",
  "run.bat",
  "run-silent.vbs",
  "launcher.bat",
  "setup.bat",
  "ai-free.ico",
  ".gitignore",
];

const excludes = [
  "-xr!.git",
  "-xr!.deepseek-cli",
  "-xr!.qwen-cli",
  "-xr!.chatgpt-cli",
  "-xr!.ai-free",
  "-xr!dist",
  "-xr!*.log",
  "-xr!*.tmp",
  "-xr!*.db",
];

const cmdZip = `"${sevenZipExe}" a -tzip -mx=5 "${archiveZip}" ${itemsToInclude.map(i => `"${path.join(rootDir, i)}"`).join(" ")} ${excludes.join(" ")}`;
execSync(cmdZip, { cwd: rootDir, stdio: "inherit" });

const manifestFile = path.join(rootDir, "scripts", "app.manifest");
console.log("2. Compiling native Windows GUI installer with csc.exe (with UAC manifest)...");
const cmdCsc = `"${cscExe}" /target:winexe /win32manifest:"${manifestFile}" /out:"${outputExe}" /win32icon:"${iconFile}" /resource:"${archiveZip}",ai-free.zip /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "${csFile}"`;
execSync(cmdCsc, { cwd: rootDir, stdio: "inherit" });

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = pkg.version || "1.5.0";
const versionedExe = path.join(distDir, `WebAIFreeAPI_v${version}.exe`);
fs.copyFileSync(outputExe, versionedExe);

console.log(`\nNative GUI Installer created: ${outputExe} (${(fs.statSync(outputExe).size / (1024 * 1024)).toFixed(1)} MB)`);
console.log(`Versioned installer created: ${versionedExe}`);

const desktops = [
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "OneDrive", "Desktop"),
].filter((d) => fs.existsSync(d));

for (const d of desktops) {
  const destSetup = path.join(d, "WebAIFreeAPI-Setup.exe");
  const destVersioned = path.join(d, `WebAIFreeAPI_v${version}.exe`);
  fs.copyFileSync(outputExe, destSetup);
  fs.copyFileSync(versionedExe, destVersioned);
  console.log(`Copied installer to: ${destSetup} and ${destVersioned}`);
}

