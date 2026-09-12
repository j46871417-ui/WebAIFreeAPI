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

const nativeExe = path.join(targetDir, "bin", "WebAIFreeAPI.exe");
const hasNativeExe = fs.existsSync(nativeExe);

const shortcuts = [
  {
    name: "WebAIFreeAPI.lnk",
    target: hasNativeExe ? nativeExe : "wscript.exe",
    args: hasNativeExe ? "" : `"${path.join(targetDir, "run-silent.vbs")}"`,
    workingDir: targetDir,
    icon: fs.existsSync(iconFile) ? iconFile : (hasNativeExe ? nativeExe : ""),
    description: "WebAIFreeAPI — Нативный AI десктоп-клиент (DeepSeek, Qwen, ChatGPT)",
  },
  {
    name: "WebAIFreeAPI Launcher.lnk",
    target: path.join(targetDir, "launcher.bat"),
    args: "",
    workingDir: targetDir,
    icon: fs.existsSync(iconFile) ? iconFile : "",
    description: "WebAIFreeAPI - Меню настроек и авторизации",
  },
];

for (const desktop of desktopDirs) {
  for (const s of shortcuts) {
    const lnkPath = path.join(desktop, s.name);
    const vbsFile = path.join(os.tmpdir(), `create-lnk-${Date.now()}-${Math.random().toString(36).slice(2)}.vbs`);
    const vbsContent = [
      'Set oWS = WScript.CreateObject("WScript.Shell")',
      `sLinkFile = "${lnkPath.replace(/"/g, '""')}"`,
      'Set oLink = oWS.CreateShortcut(sLinkFile)',
      `oLink.TargetPath = "${s.target.replace(/"/g, '""')}"`,
      `oLink.Arguments = "${s.args.replace(/"/g, '""')}"`,
      `oLink.WorkingDirectory = "${s.workingDir.replace(/"/g, '""')}"`,
      `oLink.Description = "${s.description.replace(/"/g, '""')}"`,
      s.icon ? `oLink.IconLocation = "${s.icon.replace(/"/g, '""')}"` : "",
      "oLink.Save",
    ].filter(Boolean).join("\r\n");

    try {
      fs.writeFileSync(vbsFile, vbsContent, "utf8");
      execSync(`cscript //nologo "${vbsFile}"`, { stdio: "ignore" });
      console.log(`Created shortcut: ${lnkPath}`);
    } catch (e) {
      console.error(`Failed to create shortcut ${lnkPath}: ${e.message}`);
    } finally {
      try { fs.unlinkSync(vbsFile); } catch {}
    }
  }
}
