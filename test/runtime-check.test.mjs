import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getRuntimeStatus } from "../scripts/runtime-check.mjs";

function createRuntimeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-free-runtime-"));
  for (const relativePath of [
    "node/node.exe",
    "package.json",
    "bin/deepseek.mjs",
    "node_modules/patchright/package.json",
    "node_modules/playwright/package.json",
  ]) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, relativePath === "package.json" ? '{"version":"1.7.1"}' : "");
  }
  return root;
}

describe("offline runtime checker", () => {
  it("accepts a complete bundled runtime", () => {
    const root = createRuntimeRoot();
    const status = getRuntimeStatus(root);
    assert.equal(status.ok, true);
    assert.equal(status.version, "1.7.1");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports missing production runtime files", () => {
    const root = createRuntimeRoot();
    fs.rmSync(path.join(root, "node_modules", "playwright"), { recursive: true });
    const status = getRuntimeStatus(root);
    assert.equal(status.ok, false);
    assert.ok(status.missing.includes("node_modules/playwright/package.json"));
    fs.rmSync(root, { recursive: true, force: true });
  });
});
