#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version || "1.9.9";
const pkgName = "ai-free";
const isRpmMode = process.argv.includes("--rpm");

console.log(`\n============================================================`);
console.log(`  WebAIFreeAPI - Linux Packaging Tool (ROSA Linux 13 RPM)`);
console.log(`  Version: ${version}`);
console.log(`============================================================\n`);

fs.mkdirSync(distDir, { recursive: true });

const archiveBaseName = `${pkgName}-${version}`;
const archiveName = `${archiveBaseName}-linux.tar.gz`;
const archivePath = path.join(distDir, archiveName);
const stagingRoot = path.join(distDir, "staging");
const stagingAppDir = path.join(stagingRoot, archiveBaseName);

// 1. Clean previous staging directory and archive
console.log(`[1/4] Preparing clean staging directory...`);
if (fs.existsSync(stagingRoot)) {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}
if (fs.existsSync(archivePath)) {
  fs.unlinkSync(archivePath);
}
fs.mkdirSync(stagingAppDir, { recursive: true });

// 2. Copy application files to staging directory
console.log(`[2/4] Copying Linux release files...`);

const itemsToCopy = [
  "api",
  "bin",
  "docs",
  "linux",
  "packages",
  "plugin-for-vscode",
  "scripts",
  "src",
  "package.json",
  "package-lock.json",
  "LICENSE",
  "README.md",
  "INSTALL.md",
  ".env.example",
  "llms.txt",
  "AGENTS.md",
];

for (const item of itemsToCopy) {
  const src = path.join(rootDir, item);
  const dst = path.join(stagingAppDir, item);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dst, { recursive: true, preserveTimestamps: true });
  }
}

// Clean development and Windows-specific files from staging
function cleanDirectory(baseDir) {
  const toRemove = [
    path.join(baseDir, ".git"),
    path.join(baseDir, ".github"),
    path.join(baseDir, "test"),
    path.join(baseDir, "tests"),
    path.join(baseDir, "src-native"),
    path.join(baseDir, "dist"),
    path.join(baseDir, "node"),
    path.join(baseDir, "webview2-sdk"),
  ];

  for (const item of toRemove) {
    if (fs.existsSync(item)) {
      fs.rmSync(item, { recursive: true, force: true });
    }
  }

  // Remove pycache and bytecode recursively
  function removeBytecode(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__pycache__") {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          removeBytecode(fullPath);
        }
      } else if (entry.name.endsWith(".pyc") || entry.name.endsWith(".pyo")) {
        fs.unlinkSync(fullPath);
      }
    }
  }
  removeBytecode(baseDir);

  // Remove Windows binaries and batch scripts
  const binDir = path.join(baseDir, "bin");
  if (fs.existsSync(binDir)) {
    for (const file of fs.readdirSync(binDir)) {
      if (file.endsWith(".exe") || file.endsWith(".dll")) {
        fs.unlinkSync(path.join(binDir, file));
      }
    }
  }

  for (const file of fs.readdirSync(baseDir)) {
    if (file.endsWith(".bat") || file.endsWith(".vbs") || file.endsWith(".exe")) {
      fs.unlinkSync(path.join(baseDir, file));
    }
  }

  // Set Linux executable permissions on key scripts
  try {
    const chmodList = [
      path.join(baseDir, "linux", "bin", "ai-free"),
      path.join(baseDir, "linux", "install.sh"),
      path.join(baseDir, "bin", "deepseek.mjs"),
      path.join(baseDir, "bin", "launcher.mjs"),
      path.join(baseDir, "bin", "ai-free-browser-mcp.mjs"),
    ];
    for (const f of chmodList) {
      if (fs.existsSync(f)) {
        fs.chmodSync(f, 0o755);
      }
    }
  } catch {}
}

cleanDirectory(stagingAppDir);

// 3. Create tar.gz archive
console.log(`[3/4] Creating ${archiveName} archive...`);

function createTarGz() {
  const relativeArchive = path.relative(rootDir, archivePath).replace(/\\/g, "/");
  const relativeStaging = path.relative(rootDir, stagingRoot).replace(/\\/g, "/");

  // bsdtar / gnu tar support -C for directory
  const cmd = `tar -czf "${archivePath}" -C "${stagingRoot}" "${archiveBaseName}"`;
  try {
    execSync(cmd, { cwd: rootDir, stdio: "inherit" });
    return true;
  } catch (err) {
    console.error(`Tar execution failed: ${err.message}`);
    return false;
  }
}

const tarSuccess = createTarGz();
if (!tarSuccess) {
  console.error("❌ Не удалось создать tar.gz архив.");
  process.exit(1);
}

// Clean up staging directory after successful archive
if (fs.existsSync(stagingRoot)) {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}

const stats = fs.statSync(archivePath);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`\n✓ Архив успешно создан: ${archivePath} (${sizeMB} МБ)`);

// 4. Handle RPM packaging or output RPM guidance
console.log(`\n[4/4] Verifying RPM packaging configuration...`);
const specPath = path.join(rootDir, "linux", "packaging", "rosa13", "ai-free.spec");
if (!fs.existsSync(specPath)) {
  console.error(`❌ Spec file not found: ${specPath}`);
  process.exit(1);
}
console.log(`✓ ROSA Linux 13 spec-файл найден: ${specPath}`);

function isCommandAvailable(command) {
  try {
    const res = spawnSync(command, ["--version"], { stdio: "ignore" });
    return res.status === 0;
  } catch {
    return false;
  }
}

if (isRpmMode) {
  console.log(`\n[*] RPM Build mode requested (--rpm)...`);
  if (isCommandAvailable("rpmbuild")) {
    console.log(`[*] rpmbuild обнаружен. Начинаю сборку RPM пакета...`);
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    const rpmTopDir = path.join(homeDir, "rpmbuild");
    fs.mkdirSync(path.join(rpmTopDir, "SOURCES"), { recursive: true });
    fs.mkdirSync(path.join(rpmTopDir, "SPECS"), { recursive: true });
    fs.mkdirSync(path.join(rpmTopDir, "RPMS"), { recursive: true });
    fs.mkdirSync(path.join(rpmTopDir, "SRPMS"), { recursive: true });
    fs.mkdirSync(path.join(rpmTopDir, "BUILD"), { recursive: true });
    fs.mkdirSync(path.join(rpmTopDir, "BUILDROOT"), { recursive: true });

    // Copy source archive to SOURCES
    fs.copyFileSync(archivePath, path.join(rpmTopDir, "SOURCES", archiveName));

    // Run rpmbuild
    const rpmCmd = `rpmbuild -ba "${specPath}"`;
    console.log(`Выполняю: ${rpmCmd}`);
    execSync(rpmCmd, { stdio: "inherit" });
    console.log(`\n✓ Сборка RPM успешно завершена!`);
  } else {
    console.log(`\nℹ Утилита 'rpmbuild' недоступна в текущей среде (${process.platform}).`);
    console.log(`  Сформированный tar.gz архив готов для сборки RPM на целевой системе ROSA Linux 13.`);
    console.log(`\nИнструкция по сборке пакета на ROSA Linux Fresh 13:`);
    console.log(`  1. Установите инструменты сборки:`);
    console.log(`     sudo dnf install -y rpm-build rpmdevtools`);
    console.log(`  2. Создайте структуру каталогов:`);
    console.log(`     rpmdev-setuptree`);
    console.log(`  3. Скопируйте архив в SOURCES:`);
    console.log(`     cp "${archivePath}" ~/rpmbuild/SOURCES/`);
    console.log(`  4. Запустите сборку:`);
    console.log(`     rpmbuild -ba "${specPath}"`);
    console.log(`  5. Установите полученный RPM:`);
    console.log(`     sudo dnf install ~/rpmbuild/RPMS/noarch/ai-free-${version}-1.*.noarch.rpm`);
  }
}

console.log(`\n============================================================`);
console.log(`  Сборка для Linux успешно завершена!`);
console.log(`  Архив: dist/${archiveName}`);
console.log(`============================================================\n`);
