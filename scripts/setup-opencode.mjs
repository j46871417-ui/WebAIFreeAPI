import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const homedir = os.homedir();
const appData = process.env.APPDATA || path.join(homedir, "AppData", "Roaming");

const settingsDir = path.join(homedir, ".deepseek-cli");
fs.mkdirSync(settingsDir, { recursive: true });
const settingsFile = path.join(settingsDir, "settings.json");

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
} catch {}

if (!settings.apiKeys) {
  settings.apiKeys = {
    deepseek: "sk-GhC8UKDvowNsCwI6llvSJE7a1jOiQg2KF8CRhTIh6iU",
    qwen: "sk-Vy-Uq7kO1EUCCQN3z7_cY66SABw3NMiA3mCWg71mp-s",
    chatgpt: "sk-DAj-3YAb8OVwaiAE1sBbqbiz-NR-tw-I8aXgq6zZPrE",
  };
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), "utf8");
}

const opencodeConfig = {
  $schema: "https://opencode.ai/config.json",
  model: "ai-free-deepseek/deepseek-v4-flash",
  small_model: "ai-free-deepseek/deepseek-v4-flash",
  provider: {
    "ai-free-deepseek": {
      npm: "@ai-sdk/openai-compatible",
      name: "WebAIFreeAPI (DeepSeek)",
      options: {
        baseURL: "http://127.0.0.1:4317/v1",
        apiKey: settings.apiKeys.deepseek,
      },
      models: {
        "deepseek-v4-flash": {
          name: "DeepSeek v4 Flash",
          limit: { context: 128000, output: 8192 },
        },
        "deepseek-v4-pro": {
          name: "DeepSeek v4 Pro",
          reasoning: true,
          limit: { context: 128000, output: 8192 },
        },
        "deepseek-v4-vision": {
          name: "DeepSeek v4 Vision",
          limit: { context: 128000, output: 8192 },
        },
        "deepseek-chat": {
          name: "DeepSeek Chat",
          limit: { context: 128000, output: 8192 },
        },
        "deepseek-reasoner": {
          name: "DeepSeek Reasoner",
          reasoning: true,
          limit: { context: 128000, output: 8192 },
        },
      },
    },
    "ai-free-qwen": {
      npm: "@ai-sdk/openai-compatible",
      name: "WebAIFreeAPI (Qwen)",
      options: {
        baseURL: "http://127.0.0.1:4317/v1",
        apiKey: settings.apiKeys.qwen,
      },
      models: {
        "qwen3.8-max": {
          name: "Qwen3.8 Max",
          reasoning: true,
          limit: { context: 128000, output: 8192 },
        },
        "qwen3.7-plus": {
          name: "Qwen3.7 Plus",
          limit: { context: 128000, output: 8192 },
        },
        "qwen3.7-max": {
          name: "Qwen3.7 Max",
          reasoning: true,
          limit: { context: 128000, output: 8192 },
        },
        "qwen3-coder-plus": {
          name: "Qwen3 Coder Plus",
          limit: { context: 128000, output: 8192 },
        },
        "qwen3.6-plus": {
          name: "Qwen3.6 Plus",
          limit: { context: 128000, output: 8192 },
        },
      },
    },
    "ai-free-chatgpt": {
      npm: "@ai-sdk/openai-compatible",
      name: "WebAIFreeAPI (ChatGPT)",
      options: {
        baseURL: "http://127.0.0.1:4317/v1",
        apiKey: settings.apiKeys.chatgpt,
      },
      models: {
        "gpt-5.5-instant": {
          name: "GPT-5.5 Instant",
          limit: { context: 128000, output: 8192 },
        },
        "gpt-5.6-sol-medium": {
          name: "GPT-5.6 Sol Medium",
          reasoning: true,
          limit: { context: 128000, output: 8192 },
        },
        "gpt-5.6-sol-high": {
          name: "GPT-5.6 Sol High",
          reasoning: true,
          limit: { context: 128000, output: 8192 },
        },
        "gpt-4o": {
          name: "GPT-4o",
          limit: { context: 128000, output: 4096 },
        },
        "gpt-4o-mini": {
          name: "GPT-4o mini",
          limit: { context: 128000, output: 4096 },
        },
        "o3-mini": {
          name: "o3 mini",
          reasoning: true,
          limit: { context: 128000, output: 8192 },
        },
      },
    },
  },
};

const targetFiles = [
  path.join(homedir, ".config", "opencode", "opencode.json"),
  path.join(homedir, ".opencode", "opencode.json"),
  path.join(appData, "opencode", "opencode.json"),
];

for (const targetFile of targetFiles) {
  try {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, JSON.stringify(opencodeConfig, null, 2), "utf8");
    console.log(`Configured OpenCode config: ${targetFile}`);
  } catch (e) {
    console.error(`Failed writing OpenCode config ${targetFile}: ${e.message}`);
  }
}
