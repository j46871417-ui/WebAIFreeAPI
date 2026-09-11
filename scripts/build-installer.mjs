import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const rootDir = "C:\\ai-free";
const distDir = path.join(rootDir, "dist");
const sevenZipExe = "C:\\Program Files\\7-Zip\\7z.exe";
const sevenZipSfx = "C:\\Program Files\\7-Zip\\7z.sfx";

if (!fs.existsSync(sevenZipExe) || !fs.existsSync(sevenZipSfx)) {
  console.error("7-Zip or 7z.sfx not found in C:\\Program Files\\7-Zip");
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });

const archive7z = path.join(distDir, "ai-free.7z");
const sfxConfig = path.join(distDir, "sfx-config.txt");
const outputExe = path.join(distDir, "AI-Free-Setup.exe");

if (fs.existsSync(archive7z)) fs.unlinkSync(archive7z);
if (fs.existsSync(outputExe)) fs.unlinkSync(outputExe);

const configContent = `;!@Install@!UTF-8!
Title="Установка AI Free"
BeginPrompt="Распаковать и установить AI Free на ваш компьютер?"
Progress="yes"
ExecuteFile="setup.bat"
;!@InstallEnd@!
`;

fs.writeFileSync(sfxConfig, configContent, "utf8");

console.log("Creating 7z archive...");
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

const cmd7z = `"${sevenZipExe}" a -t7z -mx=5 "${archive7z}" ${itemsToInclude.map(i => `"${path.join(rootDir, i)}"`).join(" ")} ${excludes.join(" ")}`;
execSync(cmd7z, { cwd: rootDir, stdio: "inherit" });

console.log("Creating SFX EXE installer...");
const sfxBuffer = fs.readFileSync(sevenZipSfx);
const configBuffer = Buffer.from(configContent, "utf8");
const archiveBuffer = fs.readFileSync(archive7z);

const exeBuffer = Buffer.concat([sfxBuffer, configBuffer, archiveBuffer]);
fs.writeFileSync(outputExe, exeBuffer);

console.log(`SFX Installer created successfully: ${outputExe} (${(exeBuffer.length / (1024 * 1024)).toFixed(1)} MB)`);

const desktops = [
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "OneDrive", "Desktop"),
].filter((d) => fs.existsSync(d));

for (const d of desktops) {
  const dest = path.join(d, "AI-Free-Setup.exe");
  fs.copyFileSync(outputExe, dest);
  console.log(`Copied installer to: ${dest}`);
}
