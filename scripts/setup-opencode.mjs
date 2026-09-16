import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const homedir = os.homedir();
const appData = process.env.APPDATA || path.join(homedir, "AppData", "Roaming");

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
    "ai-free-grok": {
      npm: "@ai-sdk/openai-compatible",
      name: "WebAIFreeAPI (Grok)",
      options: {
        baseURL: "http://127.0.0.1:4317/v1",
        apiKey: settings.apiKeys.grok,
      },
      models: {
        "grok-3": { name: "Grok 3", limit: { context: 128000, output: 8192 } },
        "grok-3-reasoner": { name: "Grok 3 (Thinking)", reasoning: true, limit: { context: 128000, output: 8192 } },
      },
    },
    "ai-free-mistral": {
      npm: "@ai-sdk/openai-compatible",
      name: "WebAIFreeAPI (Mistral)",
      options: {
        baseURL: "http://127.0.0.1:4317/v1",
        apiKey: settings.apiKeys.mistral,
      },
      models: {
        "mistral-large": { name: "Mistral Large", limit: { context: 128000, output: 8192 } },
        "pixtral-large": { name: "Pixtral Large", vision: true, limit: { context: 128000, output: 8192 } },
      },
    },
    "ai-free-claude": {
      npm: "@ai-sdk/openai-compatible",
      name: "WebAIFreeAPI (Claude)",
      options: {
        baseURL: "http://127.0.0.1:4317/v1",
        apiKey: settings.apiKeys.claude,
      },
      models: {
        "claude-3-7-sonnet": { name: "Claude 3.7 Sonnet", reasoning: true, limit: { context: 200000, output: 8192 } },
        "claude-3-5-sonnet": { name: "Claude 3.5 Sonnet", limit: { context: 200000, output: 8192 } },
        "claude-3-5-haiku": { name: "Claude 3.5 Haiku", limit: { context: 200000, output: 8192 } },
      },
    },
    "ai-free-gemini": {
      npm: "@ai-sdk/openai-compatible",
      name: "WebAIFreeAPI (Gemini)",
      options: {
        baseURL: "http://127.0.0.1:4317/v1",
        apiKey: settings.apiKeys.gemini,
      },
      models: {
        "gemini-2.5-pro": { name: "Gemini 2.5 Pro", reasoning: true, limit: { context: 1000000, output: 8192 } },
        "gemini-2.5-flash": { name: "Gemini 2.5 Flash", limit: { context: 1000000, output: 8192 } },
        "gemini-2.0-flash": { name: "Gemini 2.0 Flash", limit: { context: 1000000, output: 8192 } },
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
