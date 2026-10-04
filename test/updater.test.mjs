import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";

import {
  compareVersions,
  parseSemVer,
  detectChannel,
  isUpdateAllowedForChannel,
  selectUpdateArtifact,
  verifyChecksum,
  getUpdateBackend,
  windowsNodeInstallRoots,
  windowsNpmCommandCandidates,
} from "../src/updater.mjs";

describe("compareVersions (SemVer 2.0.0 compliance)", () => {
  it("orders semantic versions", () => {
    assert.equal(compareVersions("0.2.12", "0.2.13"), -1);
    assert.equal(compareVersions("0.3.0", "0.2.99"), 1);
    assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  });

  it("accepts v-prefixed versions", () => {
    assert.equal(compareVersions("v1.2.0", "1.2.1"), -1);
    assert.equal(compareVersions("v1.2.0", "1.2.0"), 0);
  });

  it("strictly implements SemVer prerelease precedence rules", () => {
    // 1.9.10 < 1.10.0
    assert.equal(compareVersions("1.9.10", "1.10.0"), -1);
    assert.equal(compareVersions("1.10.0", "1.9.10"), 1);

    // 1.10.0-alpha.1 < 1.10.0
    assert.equal(compareVersions("1.10.0-alpha.1", "1.10.0"), -1);
    assert.equal(compareVersions("1.10.0", "1.10.0-alpha.1"), 1);

    // 1.10.0-beta.1 < 1.10.0
    assert.equal(compareVersions("1.10.0-beta.1", "1.10.0"), -1);
    assert.equal(compareVersions("1.10.0", "1.10.0-beta.1"), 1);

    // 1.10.0 > 1.10.0-rc.1
    assert.equal(compareVersions("1.10.0", "1.10.0-rc.1"), 1);
    assert.equal(compareVersions("1.10.0-rc.1", "1.10.0"), -1);

    // Prerelease comparisons among each other
    assert.equal(compareVersions("1.10.0-alpha.1", "1.10.0-alpha.2"), -1);
    assert.equal(compareVersions("1.10.0-alpha.1", "1.10.0-beta.1"), -1);
    assert.equal(compareVersions("1.10.0-beta.1", "1.10.0-rc.1"), -1);
    assert.equal(compareVersions("1.10.0-rc.1", "1.10.0-rc.2"), -1);
  });
});

describe("channels and update eligibility", () => {
  it("detects channels accurately", () => {
    assert.equal(detectChannel("1.9.9"), "stable");
    assert.equal(detectChannel("1.10.0"), "stable");
    assert.equal(detectChannel("1.10.0-alpha.1"), "alpha");
    assert.equal(detectChannel("1.10.0-beta.2"), "beta");
    assert.equal(detectChannel("1.10.0-rc.1"), "beta");
  });

  it("enforces channel update gating policies", () => {
    // stable channel must NOT auto-update to alpha or beta
    assert.equal(isUpdateAllowedForChannel("1.10.0-alpha.1", "stable"), false);
    assert.equal(isUpdateAllowedForChannel("1.10.0-beta.1", "stable"), false);
    assert.equal(isUpdateAllowedForChannel("1.10.0", "stable"), true);

    // beta channel receives stable and beta, but not alpha
    assert.equal(isUpdateAllowedForChannel("1.10.0", "beta"), true);
    assert.equal(isUpdateAllowedForChannel("1.10.0-beta.1", "beta"), true);
    assert.equal(isUpdateAllowedForChannel("1.10.0-alpha.1", "beta"), false);

    // alpha channel can receive alpha, beta, and stable
    assert.equal(isUpdateAllowedForChannel("1.10.0", "alpha"), true);
    assert.equal(isUpdateAllowedForChannel("1.10.0-beta.1", "alpha"), true);
    assert.equal(isUpdateAllowedForChannel("1.10.0-alpha.1", "alpha"), true);
  });
});

describe("release manifest and platform artifact selection", () => {
  const sampleManifest = {
    version: "1.10.0",
    channel: "stable",
    artifacts: {
      "win32-x64": {
        file: "WebAIFreeAPI-Setup.exe",
        url: "https://example.com/download/WebAIFreeAPI-Setup.exe",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      "linux-x64": {
        file: "WebAIFreeAPI-linux-x64.tar.gz",
        url: "https://example.com/download/WebAIFreeAPI-linux-x64.tar.gz",
        sha256: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
      },
      "linux-rpm-x64": {
        file: "ai-free-1.10.0-1.noarch.rpm",
        url: "https://example.com/download/ai-free-1.10.0-1.noarch.rpm",
        sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      },
    },
  };

  it("selects correct artifact for Windows", () => {
    const art = selectUpdateArtifact(sampleManifest, { platform: "win32", arch: "x64" });
    assert.ok(art);
    assert.equal(art.file, "WebAIFreeAPI-Setup.exe");
    assert.ok(art.file.endsWith(".exe"));
  });

  it("selects correct artifact for Linux and NEVER selects .exe on Linux", () => {
    const art = selectUpdateArtifact(sampleManifest, { platform: "linux", arch: "x64" });
    assert.ok(art);
    assert.equal(art.file, "WebAIFreeAPI-linux-x64.tar.gz");
    assert.ok(!art.file.endsWith(".exe"), "Must never select an .exe file for Linux");
  });

  it("selects RPM artifact for Linux when packageType=rpm", () => {
    const art = selectUpdateArtifact(sampleManifest, { platform: "linux", arch: "x64", packageType: "rpm" });
    assert.ok(art);
    assert.equal(art.file, "ai-free-1.10.0-1.noarch.rpm");
  });

  it("synthesizes artifact selection from raw GitHub assets if manifest is omitted", () => {
    const release = {
      assets: [
        { name: "WebAIFreeAPI-Setup.exe", browser_download_url: "https://example.com/Setup.exe" },
        { name: "ai-free-1.10.0-linux.tar.gz", browser_download_url: "https://example.com/linux.tar.gz" },
      ],
    };

    const winArt = selectUpdateArtifact(release, { platform: "win32" });
    assert.ok(winArt);
    assert.equal(winArt.name, "WebAIFreeAPI-Setup.exe");

    const linuxArt = selectUpdateArtifact(release, { platform: "linux" });
    assert.ok(linuxArt);
    assert.equal(linuxArt.name, "ai-free-1.10.0-linux.tar.gz");
    assert.ok(!linuxArt.name.endsWith(".exe"));
  });
});

describe("checksum verification", () => {
  it("verifies matching SHA-256 and rejects mismatched checksums", () => {
    const tmpFile = path.join(os.tmpdir(), `ai-free-check-${Date.now()}.txt`);
    const content = "WebAIFreeAPI Universal Update Payload 2026";
    fs.writeFileSync(tmpFile, content, "utf8");

    const expectedSha256 = crypto.createHash("sha256").update(content).digest("hex");

    assert.equal(verifyChecksum(tmpFile, expectedSha256), true);

    // Mismatched checksum should throw
    assert.throws(
      () => verifyChecksum(tmpFile, "0000000000000000000000000000000000000000000000000000000000000000"),
      /Checksum mismatch/,
    );

    fs.rmSync(tmpFile, { force: true });
  });
});

describe("update backend factory", () => {
  it("returns appropriate backend by environment", () => {
    const gitBackend = getUpdateBackend({ isGit: true });
    assert.equal(gitBackend.name, "git");

    const winBackend = getUpdateBackend({ isGit: false, platform: "win32" });
    assert.equal(winBackend.name, "windows-installer");

    const linuxBackend = getUpdateBackend({ isGit: false, platform: "linux" });
    assert.equal(linuxBackend.name, "linux-package");
  });
});

describe("windows Node.js discovery", () => {
  it("includes the running node directory and standard MSI locations", () => {
    const roots = windowsNodeInstallRoots({
      execPath: path.join(path.sep, "Portable", "node.exe"),
      env: {
        ProgramW6432: "C:\\Program Files",
        ProgramFiles: "C:\\Program Files",
        "ProgramFiles(x86)": "C:\\Program Files (x86)",
        LOCALAPPDATA: "C:\\Users\\User\\AppData\\Local",
      },
    });
    assert.ok(roots.includes(path.join(path.sep, "Portable")));
    assert.ok(roots.includes(path.join("C:\\Program Files", "nodejs")));
  });

  it("finds npm from npm start, standard installs and common Windows version managers", () => {
    const env = {
      APPDATA: "C:\\Users\\User\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\User\\AppData\\Local",
      USERPROFILE: "C:\\Users\\User",
      ProgramFiles: "C:\\Program Files",
      NVM_SYMLINK: "C:\\Program Files\\nodejs",
      npm_node_execpath: "D:\\Node\\node.exe",
      npm_execpath: "D:\\Node\\node_modules\\npm\\bin\\npm-cli.js",
    };
    const candidates = windowsNpmCommandCandidates({ env, execPath: env.npm_node_execpath });
    const commands = candidates.map((candidate) => typeof candidate === "string" ? candidate : candidate.command);
    const direct = candidates.find((candidate) => typeof candidate === "object"
      && candidate.command === env.npm_node_execpath
      && candidate.prefixArgs?.[0] === env.npm_execpath);

    assert.ok(direct, "npm start should preserve a direct node + npm-cli fallback");
    assert.ok(commands.includes(path.join(env.ProgramFiles, "nodejs", "npm.cmd")));
    assert.ok(commands.includes(path.join(env.NVM_SYMLINK, "npm.cmd")));
    assert.ok(commands.includes(path.join(env.LOCALAPPDATA, "Volta", "bin", "npm.cmd")));
    assert.ok(commands.includes(path.join(env.USERPROFILE, "scoop", "apps", "nodejs", "current", "npm.cmd")));
  });
});
