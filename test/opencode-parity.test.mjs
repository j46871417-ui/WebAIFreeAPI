import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  buildOpenCodeConfig,
  detectOpenCodeConfigs,
  stripJsonCommentsAndTrailingCommas,
  parseOpenCodeJson,
  readOpenCodeConfig,
  validateOpenCodeConfig,
  backupOpenCodeConfig,
  rollbackOpenCodeConfig,
  mergeOpenCodeConfig,
  applyOpenCodeConfig,
} from "../src/integrations/opencode.mjs";

describe("OpenCode Integration Parity", () => {
  it("detects configuration paths according to operating system standards", () => {
    const fakeHome = path.join(os.tmpdir(), "opencode-home-test");

    // Linux / POSIX detection
    const linuxDetection = detectOpenCodeConfigs({
      homedir: fakeHome,
      env: { XDG_CONFIG_HOME: path.join(fakeHome, "custom-config") },
      platform: "linux",
    });
    assert.ok(
      linuxDetection.allCandidates.some((p) => p.includes("custom-config")),
      "Linux should detect XDG_CONFIG_HOME"
    );
    assert.ok(
      linuxDetection.allCandidates.some((p) => p.includes(".opencode")),
      "Linux should detect ~/.opencode"
    );

    // Windows detection
    const winDetection = detectOpenCodeConfigs({
      homedir: fakeHome,
      env: { APPDATA: path.join(fakeHome, "AppData", "Roaming") },
      platform: "win32",
    });
    assert.ok(
      winDetection.allCandidates.some((p) => p.includes("AppData")),
      "Windows should detect %APPDATA%"
    );
    assert.ok(
      winDetection.allCandidates.some((p) => p.includes(".opencode")),
      "Windows should detect ~/.opencode"
    );
  });

  it("safely strips comments and trailing commas from user JSONC", () => {
    const jsonc = `
    {
      // OpenCode schema link
      "$schema": "https://opencode.ai/config.json",
      /* Custom user comment block
         with multiple lines */
      "model": "my-custom-provider/my-model",
      "provider": {
        "my-custom-provider": {
          "npm": "@ai-sdk/openai-compatible",
          "name": "Custom Ollama",
        },
      },
    }
    `;

    const parsed = parseOpenCodeJson(jsonc);
    assert.equal(parsed.$schema, "https://opencode.ai/config.json");
    assert.equal(parsed.model, "my-custom-provider/my-model");
    assert.ok(parsed.provider["my-custom-provider"]);
    assert.equal(parsed.provider["my-custom-provider"].name, "Custom Ollama");
  });

  it("merges generated config into existing config without clobbering user settings", () => {
    const existing = {
      $schema: "https://opencode.ai/config.json",
      model: "anthropic/claude-3-7-sonnet",
      small_model: "custom/fast",
      theme: "dark",
      provider: {
        anthropic: {
          npm: "@ai-sdk/anthropic",
          name: "Anthropic Direct",
          options: { apiKey: "sk-ant-123" },
        },
        "ai-free-qwen": {
          npm: "@ai-sdk/openai-compatible",
          name: "Old Qwen",
          options: { baseURL: "http://127.0.0.1:9999/v1", apiKey: "old-key" },
          models: {
            "my-custom-fine-tuned-model": { name: "Custom Fine-tuned" },
          },
        },
      },
    };

    const generated = buildOpenCodeConfig({
      port: 4317,
      keys: { qwen: "new-qwen-key", deepseek: "new-deepseek-key" },
    });

    const merged = mergeOpenCodeConfig(existing, generated);

    // User's custom selected models and themes are preserved
    assert.equal(merged.model, "anthropic/claude-3-7-sonnet");
    assert.equal(merged.small_model, "custom/fast");
    assert.equal(merged.theme, "dark");

    // Third-party provider is preserved untouched
    assert.ok(merged.provider.anthropic);
    assert.equal(merged.provider.anthropic.name, "Anthropic Direct");

    // WebAIFreeAPI provider is updated with new baseURL and apiKey
    assert.equal(merged.provider["ai-free-qwen"].options.baseURL, "http://127.0.0.1:4317/v1");
    assert.equal(merged.provider["ai-free-qwen"].options.apiKey, "new-qwen-key");

    // User's custom model under ai-free-qwen is NOT deleted
    assert.ok(merged.provider["ai-free-qwen"].models["my-custom-fine-tuned-model"]);

    // Standard WebAIFreeAPI models are populated
    assert.ok(merged.provider["ai-free-qwen"].models["qwen3.7-max"]);
    assert.ok(merged.provider["ai-free-deepseek"].models["deepseek-chat"]);
  });

  it("performs backup and rollback reliably", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-backup-test-"));
    const targetFile = path.join(tmpDir, "opencode.json");

    try {
      const initialContent = JSON.stringify({ model: "original-model" });
      fs.writeFileSync(targetFile, initialContent, "utf8");

      // Test backup
      const backupPath = backupOpenCodeConfig(targetFile);
      assert.ok(backupPath && fs.existsSync(backupPath), "Backup file should be created");
      assert.equal(fs.readFileSync(backupPath, "utf8"), initialContent);

      // Mutate file
      fs.writeFileSync(targetFile, "corrupted content", "utf8");

      // Test rollback
      const rolledBack = rollbackOpenCodeConfig(targetFile, backupPath);
      assert.ok(rolledBack, "Rollback should return true");
      assert.equal(fs.readFileSync(targetFile, "utf8"), initialContent);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("applies config atomically to specified target files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-apply-test-"));
    const targetFile = path.join(tmpDir, "nested", "opencode.json");

    try {
      const res = applyOpenCodeConfig({
        targetFiles: [targetFile],
        port: 4317,
        keys: { deepseek: "sk-ds-key" },
      });

      assert.ok(res.ok);
      assert.equal(res.paths.length, 1);
      assert.ok(fs.existsSync(targetFile));

      const parsed = readOpenCodeConfig(targetFile);
      assert.equal(parsed.provider["ai-free-deepseek"].options.apiKey, "sk-ds-key");
      assert.equal(parsed.provider["ai-free-deepseek"].options.baseURL, "http://127.0.0.1:4317/v1");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
