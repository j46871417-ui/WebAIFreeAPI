import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const binDir = path.join(rootDir, "bin");
const srcNativeDir = path.join(rootDir, "src-native");
const distDir = path.join(rootDir, "dist");
function findCsc() {
  const candidates = [
    "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
    "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const fromPath = execSync("where csc", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim().split(/\r?\n/)[0];
    if (fromPath && fs.existsSync(fromPath)) return fromPath;
  } catch {}
  return null;
}

const cscExe = findCsc();
const iconFile = path.join(rootDir, "ai-free.ico");
const manifestFile = path.join(srcNativeDir, "app.manifest");
const outputExe = path.join(binDir, "WebAIFreeAPI.exe");

if (!cscExe) {
  console.error("csc.exe not found in Microsoft.NET Framework or PATH. .NET Framework v4.0 is required to build native GUI.");
  process.exit(1);
}

const netFrameworkDir = path.dirname(cscExe);
const wpfDir = path.join(netFrameworkDir, "WPF");

fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });

const csFiles = [
  path.join(srcNativeDir, "ApiClient.cs"),
  path.join(srcNativeDir, "SettingsWindow.cs"),
  path.join(srcNativeDir, "NativeTray.cs"),
  path.join(srcNativeDir, "MainWindow.cs"),
  path.join(srcNativeDir, "App.cs"),
];

for (const f of csFiles) {
  if (!fs.existsSync(f)) {
    console.error(`Missing source file: ${f}`);
    process.exit(1);
  }
}

const wpfRefs = [
  path.join(wpfDir, "PresentationFramework.dll"),
  path.join(wpfDir, "PresentationCore.dll"),
  path.join(wpfDir, "WindowsBase.dll"),
  path.join(netFrameworkDir, "System.Xaml.dll"),
  path.join(netFrameworkDir, "System.Web.Extensions.dll"),
  "System.dll",
  "System.Drawing.dll",
  "System.Windows.Forms.dll",
  path.join(rootDir, "webview2-sdk", "lib", "net45", "Microsoft.Web.WebView2.Core.dll"),
  path.join(rootDir, "webview2-sdk", "lib", "net45", "Microsoft.Web.WebView2.Wpf.dll"),
  path.join(rootDir, "webview2-sdk", "lib", "net45", "Microsoft.Web.WebView2.WinForms.dll")
];

console.log("Compiling native WPF desktop application (WebAIFreeAPI.exe)...");

const cmdParts = [
  `"${cscExe}"`,
  "/nologo",
  "/target:winexe",
  `/out:"${outputExe}"`,
  fs.existsSync(manifestFile) ? `/win32manifest:"${manifestFile}"` : "",
  fs.existsSync(iconFile) ? `/win32icon:"${iconFile}"` : "",
  ...wpfRefs.map((r) => `/r:"${r}"`),
  ...csFiles.map((f) => `"${f}"`),
].filter(Boolean);

const cmd = cmdParts.join(" ");

try {
  execSync(cmd, { cwd: rootDir, stdio: "inherit" });
  const stat = fs.statSync(outputExe);
  console.log(`\nCompilation successful! Binary: ${outputExe} (${(stat.size / 1024).toFixed(1)} KB)`);

  // Copy WebView2 DLLs
  fs.copyFileSync(path.join(rootDir, "webview2-sdk", "runtimes", "win-x64", "native", "WebView2Loader.dll"), path.join(binDir, "WebView2Loader.dll"));
  fs.copyFileSync(path.join(rootDir, "webview2-sdk", "lib", "net45", "Microsoft.Web.WebView2.Core.dll"), path.join(binDir, "Microsoft.Web.WebView2.Core.dll"));
  fs.copyFileSync(path.join(rootDir, "webview2-sdk", "lib", "net45", "Microsoft.Web.WebView2.WinForms.dll"), path.join(binDir, "Microsoft.Web.WebView2.WinForms.dll"));
  
  // Copy to dist
  const distExe = path.join(distDir, "WebAIFreeAPI.exe");
  fs.copyFileSync(outputExe, distExe);
  fs.copyFileSync(path.join(binDir, "WebView2Loader.dll"), path.join(distDir, "WebView2Loader.dll"));
  fs.copyFileSync(path.join(binDir, "Microsoft.Web.WebView2.Core.dll"), path.join(distDir, "Microsoft.Web.WebView2.Core.dll"));
  fs.copyFileSync(path.join(binDir, "Microsoft.Web.WebView2.WinForms.dll"), path.join(distDir, "Microsoft.Web.WebView2.WinForms.dll"));

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const version = pkg.version || "1.5.0";
  const versionedExe = path.join(distDir, `WebAIFreeAPI_v${version}.exe`);
  fs.copyFileSync(outputExe, versionedExe);
  console.log(`Copied to: ${distExe} and ${versionedExe}`);
} catch (err) {
  console.error("Compilation failed:", err.message);
  process.exit(1);
}

