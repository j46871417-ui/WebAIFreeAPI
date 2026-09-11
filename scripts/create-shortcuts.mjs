import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const homedir = os.homedir();
const desktopDirs = [
  path.join(homedir, "Desktop"),
  path.join(homedir, "OneDrive", "Desktop"),
].filter((dir) => fs.existsSync(dir));

const targetDir = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconFile = path.join(targetDir, "ai-free.ico");

const shortcuts = [
  {
    name: "AI Free.lnk",
    target: "wscript.exe",
    args: `"${path.join(targetDir, "run-silent.vbs")}"`,
    workingDir: targetDir,
    icon: fs.existsSync(iconFile) ? iconFile : "",
    description: "AI Free (Бесплатный DeepSeek, Qwen и ChatGPT)",
  },
  {
    name: "AI Free Launcher.lnk",
    target: path.join(targetDir, "launcher.bat"),
    args: "",
    workingDir: targetDir,
    icon: fs.existsSync(iconFile) ? iconFile : "",
    description: "AI Free - Меню настроек и авторизации",
  },
];

for (const desktop of desktopDirs) {
  for (const s of shortcuts) {
    const lnkPath = path.join(desktop, s.name);
    const psScript = `
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${lnkPath.replace(/\\/g, "\\\\")}")
$Shortcut.TargetPath = "${s.target.replace(/\\/g, "\\\\")}"
$Shortcut.Arguments = '${s.args}'
$Shortcut.WorkingDirectory = "${s.workingDir.replace(/\\/g, "\\\\")}"
$Shortcut.Description = "${s.description}"
if ("${s.icon}") { $Shortcut.IconLocation = "${s.icon.replace(/\\/g, "\\\\")}" }
$Shortcut.Save()
    `.trim();
    try {
      execSync(`powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, "; ")}"`, { stdio: "ignore" });
      console.log(`Created shortcut: ${lnkPath}`);
    } catch (e) {
      console.error(`Failed to create shortcut ${lnkPath}: ${e.message}`);
    }
  }
}
