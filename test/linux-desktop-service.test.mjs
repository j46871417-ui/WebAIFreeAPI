import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const linuxDir = path.join(root, "linux");

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function parseIni(content) {
  const sections = {};
  let currentSection = "";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1);
      sections[currentSection] = sections[currentSection] || {};
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex !== -1 && currentSection) {
      const key = line.slice(0, eqIndex).trim();
      const val = line.slice(eqIndex + 1).trim();
      sections[currentSection][key] = val;
    }
  }

  return sections;
}

test("1. linux/assets contains valid SVG and multi-size PNG icons", () => {
  const svgPath = path.join(linuxDir, "assets", "ai-free.svg");
  const vscodeSvg = path.join(root, "plugin-for-vscode", "media", "icon.svg");

  assert.ok(fs.existsSync(svgPath), "linux/assets/ai-free.svg must exist");
  assert.equal(fs.readFileSync(svgPath, "utf8"), fs.readFileSync(vscodeSvg, "utf8"));

  const sizes = [16, 32, 48, 64, 128, 256];
  for (const s of sizes) {
    const pngPath = path.join(linuxDir, "assets", `ai-free-${s}x${s}.png`);
    assert.ok(fs.existsSync(pngPath), `ai-free-${s}x${s}.png must exist`);

    const buf = fs.readFileSync(pngPath);
    assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `Invalid PNG header for ${s}x${s}`);
    assert.equal(buf.readUInt32BE(16), s, `Width mismatch for ${s}x${s}`);
    assert.equal(buf.readUInt32BE(20), s, `Height mismatch for ${s}x${s}`);

    const hicolorPng = path.join(linuxDir, "assets", "icons", "hicolor", `${s}x${s}`, "apps", "ai-free.png");
    assert.ok(fs.existsSync(hicolorPng), `hicolor/${s}x${s}/apps/ai-free.png must exist`);
  }

  assert.ok(fs.existsSync(path.join(linuxDir, "assets", "ai-free.png")), "linux/assets/ai-free.png must exist");
  assert.ok(fs.existsSync(path.join(linuxDir, "assets", "install-icons.sh")), "install-icons.sh must exist");
});

test("2. linux/ai-free.desktop adheres to Desktop Entry Specification 1.5", () => {
  const desktopFile = path.join(linuxDir, "ai-free.desktop");
  assert.ok(fs.existsSync(desktopFile), "linux/ai-free.desktop must exist");

  const content = read("linux/ai-free.desktop");
  assert.ok(!content.includes("\r\n"), "Desktop entry must have Unix LF line endings");

  const ini = parseIni(content);
  const entry = ini["Desktop Entry"];
  assert.ok(entry, "Missing [Desktop Entry] section");

  assert.equal(entry["Version"], "1.5");
  assert.equal(entry["Type"], "Application");
  assert.equal(entry["Name"], "WebAIFreeAPI");
  assert.equal(entry["Name[ru]"], "WebAIFreeAPI (AI Клиент)");
  assert.equal(entry["Comment"], "Free local AI client for DeepSeek, Qwen and ChatGPT with OpenAI-compatible API");
  assert.equal(entry["Comment[ru]"], "Локальный клиент нейросетей DeepSeek, Qwen и ChatGPT с OpenAI API");
  assert.equal(entry["Exec"], "/usr/bin/ai-free %U");
  assert.equal(entry["Icon"], "ai-free");
  assert.equal(entry["Terminal"], "false");
  assert.equal(entry["Categories"], "Development;Utility;ArtificialIntelligence;Network;");
  assert.equal(entry["MimeType"], "x-scheme-handler/aifree;");
  assert.equal(entry["Actions"], "OpenBrowser;RunTerminal;OpenLogs;");

  // Check actions
  const actionBrowser = ini["Desktop Action OpenBrowser"];
  assert.ok(actionBrowser, "Missing [Desktop Action OpenBrowser]");
  assert.ok(actionBrowser["Name"], "Missing Name in OpenBrowser action");
  assert.ok(actionBrowser["Exec"].includes("--window"), "OpenBrowser must pass --window");

  const actionTerminal = ini["Desktop Action RunTerminal"];
  assert.ok(actionTerminal, "Missing [Desktop Action RunTerminal]");
  assert.equal(actionTerminal["Terminal"], "true");
  assert.equal(actionTerminal["Exec"], "/usr/bin/ai-free");

  const actionLogs = ini["Desktop Action OpenLogs"];
  assert.ok(actionLogs, "Missing [Desktop Action OpenLogs]");
  assert.ok(actionLogs["Exec"].includes("--status"), "OpenLogs must pass --status");
});

test("3. linux/ai-free.service adheres to systemd user service unit specifications", () => {
  const serviceFile = path.join(linuxDir, "ai-free.service");
  assert.ok(fs.existsSync(serviceFile), "linux/ai-free.service must exist");

  const content = read("linux/ai-free.service");
  assert.ok(!content.includes("\r\n"), "Service file must have Unix LF line endings");

  const ini = parseIni(content);
  const unit = ini["Unit"];
  const service = ini["Service"];
  const install = ini["Install"];

  assert.ok(unit, "Missing [Unit] section");
  assert.equal(unit["Description"], "WebAIFreeAPI Background Service");
  assert.equal(unit["After"], "network.target");

  assert.ok(service, "Missing [Service] section");
  assert.equal(service["ExecStart"], "/usr/bin/node /opt/ai-free/bin/deepseek.mjs --no-window");
  assert.equal(service["Restart"], "on-failure");
  assert.equal(service["RestartSec"], "3");
  assert.equal(service["Environment"], "NODE_ENV=production");

  assert.ok(install, "Missing [Install] section");
  assert.equal(install["WantedBy"], "default.target");
});

test("4. linux/bin/ai-free is a robust POSIX-compatible bash launcher", () => {
  const binFile = path.join(linuxDir, "bin", "ai-free");
  assert.ok(fs.existsSync(binFile), "linux/bin/ai-free must exist");

  const content = read("linux/bin/ai-free");

  // 1. Shebang
  assert.ok(content.startsWith("#!/usr/bin/env bash"), "Shebang must be #!/usr/bin/env bash");

  // 2. Line endings
  assert.ok(!content.includes("\r\n"), "Launcher script must use Unix LF newlines");

  // 3. Node version check >= 18
  assert.match(content, /NODE_MAJOR/, "Must extract Node major version");
  assert.match(content, /-lt 18/, "Must verify Node.js version >= 18");

  // 4. Base directory detection
  assert.match(content, /\/opt\/ai-free/, "Must check /opt/ai-free");
  assert.match(content, /deepseek\.mjs/, "Must check deepseek.mjs entrypoint");

  // 5. Argument handling
  const requiredArgs = ["--service", "--tray", "--no-window", "--window", "--api", "--status", "--stop"];
  for (const arg of requiredArgs) {
    assert.ok(content.includes(arg), `Launcher must support ${arg}`);
  }

  // 6. Bash syntax integrity checks
  const lines = content.split("\n");
  let ifCount = 0;
  let fiCount = 0;
  let caseCount = 0;
  let esacCount = 0;
  let forWhileCount = 0;
  let doneCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;

    // Word boundary checks
    if (/\bif\s+/.test(trimmed)) ifCount += 1;
    if (/\bfi\b/.test(trimmed)) fiCount += 1;
    if (/\bcase\s+/.test(trimmed)) caseCount += 1;
    if (/\besac\b/.test(trimmed)) esacCount += 1;
    if (/\b(for|while)\s+/.test(trimmed)) forWhileCount += 1;
    if (/\bdone\b/.test(trimmed)) doneCount += 1;
  }

  assert.equal(ifCount, fiCount, `Unbalanced if/fi blocks: ${ifCount} if vs ${fiCount} fi`);
  assert.equal(caseCount, esacCount, `Unbalanced case/esac blocks: ${caseCount} case vs ${esacCount} esac`);
  assert.equal(forWhileCount, doneCount, `Unbalanced loop blocks: ${forWhileCount} loop vs ${doneCount} done`);
});
