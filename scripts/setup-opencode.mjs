import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { applyOpenCodeConfig } from "../src/integrations/opencode.mjs";

const homedir = os.homedir();
const settingsDir = path.join(homedir, ".deepseek-cli");
fs.mkdirSync(settingsDir, { recursive: true });
const settingsFile = path.join(settingsDir, "settings.json");

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
} catch {}

if (!settings.openAICompat || typeof settings.openAICompat !== "object") {
  settings.openAICompat = {};
}
if (!settings.openAICompat.apiKeys || typeof settings.openAICompat.apiKeys !== "object") {
  settings.openAICompat.apiKeys = {};
}
if (!settings.apiKeys || typeof settings.apiKeys !== "object") {
  settings.apiKeys = {};
}
for (const p of ["deepseek", "qwen", "chatgpt", "grok", "mistral", "claude", "gemini", "all"]) {
  const existing = settings.openAICompat.apiKeys[p] || settings.apiKeys[p];
  if (!existing || existing.includes("GhC8UKD")) {
    const key = `sk-${crypto.randomBytes(32).toString("base64url")}`;
    settings.openAICompat.apiKeys[p] = key;
    settings.apiKeys[p] = key;
  } else {
    settings.openAICompat.apiKeys[p] = existing;
    settings.apiKeys[p] = existing;
  }
}
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), "utf8");

try {
  const result = applyOpenCodeConfig({
    port: 4317,
    keys: settings.apiKeys,
  });
  for (const cfgPath of result.paths) {
    console.log(`Configured OpenCode config: ${cfgPath}`);
  }
} catch (e) {
  console.error(`Failed configuring OpenCode: ${e.message}`);
}
