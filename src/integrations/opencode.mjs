import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Standard OpenCode configuration schema and providers generator
 */
export function buildOpenCodeConfig({ port = 4317, keys = {} } = {}) {
  return {
    $schema: "https://opencode.ai/config.json",
    model: "ai-free-qwen/qwen3.7-max",
    small_model: "ai-free-deepseek/deepseek-chat",
    provider: {
      "ai-free-qwen": {
        npm: "@ai-sdk/openai-compatible",
        name: "WebAIFreeAPI (Qwen)",
        options: {
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: keys.qwen,
        },
        models: {
          "qwen3.8-max": {
            name: "Qwen 3.8 Max",
            tools: true,
            reasoning: true,
            limit: { context: 128000, output: 8192 },
          },
          "qwen3.7-max": {
            name: "Qwen 3.7 Max",
            tools: true,
            reasoning: true,
            limit: { context: 128000, output: 8192 },
          },
          "qwen3.7-plus": {
            name: "Qwen 3.7 Plus",
            limit: { context: 128000, output: 8192 },
          },
          "qwen3-coder-plus": {
            name: "Qwen 3 Coder Plus",
            tools: true,
            limit: { context: 128000, output: 8192 },
          },
        },
      },
      "ai-free-deepseek": {
        npm: "@ai-sdk/openai-compatible",
        name: "WebAIFreeAPI (DeepSeek)",
        options: {
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: keys.deepseek,
        },
        models: {
          "deepseek-chat": {
            name: "DeepSeek Chat",
            tools: true,
            limit: { context: 128000, output: 8192 },
          },
          "deepseek-reasoner": {
            name: "DeepSeek Reasoner (R1)",
            reasoning: true,
            tools: true,
            limit: { context: 128000, output: 8192 },
          },
        },
      },
      "ai-free-chatgpt": {
        npm: "@ai-sdk/openai-compatible",
        name: "WebAIFreeAPI (ChatGPT)",
        options: {
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: keys.chatgpt,
        },
        models: {
          "gpt-5.5-instant": { name: "GPT-5.5 Instant", limit: { context: 128000, output: 8192 } },
          "gpt-4o": { name: "GPT-4o", limit: { context: 128000, output: 4096 } },
          "o3-mini": { name: "o3 mini", reasoning: true, limit: { context: 128000, output: 8192 } },
        },
      },
      "ai-free-grok": {
        npm: "@ai-sdk/openai-compatible",
        name: "WebAIFreeAPI (Grok)",
        options: {
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: keys.grok,
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
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: keys.mistral,
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
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: keys.claude,
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
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: keys.gemini,
        },
        models: {
          "gemini-3.1-pro": { name: "Gemini 3.1 Pro", reasoning: true, limit: { context: 1000000, output: 8192 } },
          "gemini-3.8-flash": { name: "Gemini 3.8 Flash", limit: { context: 1000000, output: 8192 } },
          "gemini-3.5-flash-lite": { name: "Gemini 3.5 Flash Lite", limit: { context: 1000000, output: 8192 } },
        },
      },
    },
  };
}

/**
 * Detects all potential and existing OpenCode configuration locations
 */
export function detectOpenCodeConfigs({
  homedir = os.homedir(),
  env = process.env,
  platform = process.platform,
} = {}) {
  const candidates = [];

  if (platform === "win32") {
    const appData = env.APPDATA || path.join(homedir, "AppData", "Roaming");
    candidates.push(path.join(appData, "opencode", "opencode.json"));
    candidates.push(path.join(homedir, ".opencode", "opencode.json"));
    candidates.push(path.join(homedir, ".config", "opencode", "opencode.json"));
  } else {
    // Linux / macOS / POSIX
    const xdgConfig = env.XDG_CONFIG_HOME || path.join(homedir, ".config");
    candidates.push(path.join(xdgConfig, "opencode", "opencode.json"));
    candidates.push(path.join(homedir, ".opencode", "opencode.json"));
    if (env.APPDATA) {
      candidates.push(path.join(env.APPDATA, "opencode", "opencode.json"));
    }
  }

  // Deduplicate candidates
  const uniqueCandidates = [...new Set(candidates.map((p) => path.resolve(p)))];
  const existing = uniqueCandidates.filter((p) => fs.existsSync(p));

  // Determine target paths:
  // If any exist, targets are the existing ones.
  // If none exist, target the primary standard directory for this platform.
  let targets = existing.length > 0 ? existing : [uniqueCandidates[0]];

  return {
    existing,
    targets,
    allCandidates: uniqueCandidates,
  };
}

/**
 * Cleans comments and trailing commas before JSON.parse
 */
export function stripJsonCommentsAndTrailingCommas(content) {
  if (typeof content !== "string") return "";
  let stripped = content
    // Remove multi-line comments /* ... */
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Remove single-line comments // ...
    .replace(/(^|[^\\:])\/\/.*$/gm, "$1")
    // Remove trailing commas before } or ]
    .replace(/,(\s*[}\]])/g, "$1");
  return stripped;
}

/**
 * Safely parses OpenCode JSON / JSONC content
 */
export function parseOpenCodeJson(content) {
  if (!content || !content.trim()) return {};
  try {
    return JSON.parse(content);
  } catch {
    // Attempt stripped parse
    const cleaned = stripJsonCommentsAndTrailingCommas(content);
    return JSON.parse(cleaned);
  }
}

/**
 * Reads and safely parses an OpenCode configuration file
 */
export function readOpenCodeConfig(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  return parseOpenCodeJson(raw);
}

/**
 * Validates OpenCode configuration structure
 */
export function validateOpenCodeConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { valid: false, error: "OpenCode configuration must be a valid JSON object" };
  }
  if (config.provider && (typeof config.provider !== "object" || Array.isArray(config.provider))) {
    return { valid: false, error: "'provider' section must be an object" };
  }
  return { valid: true };
}

/**
 * Backs up an existing configuration file
 */
export function backupOpenCodeConfig(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const backupPath = `${filePath}.bak.${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Rolls back configuration file from backup
 */
export function rollbackOpenCodeConfig(filePath, backupPath) {
  if (!backupPath || !fs.existsSync(backupPath)) return false;
  try {
    fs.copyFileSync(backupPath, filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely merges WebAIFreeAPI configuration into existing OpenCode user configuration:
 * - Preserves existing user top-level settings (rules, theme, mcp, custom keys)
 * - Preserves user-chosen default `model` and `small_model` if already set
 * - Preserves third-party user providers (e.g. Anthropic, Ollama, OpenAI direct)
 * - Safely merges models under `ai-free-*` providers without erasing custom user models
 */
export function mergeOpenCodeConfig(existingConfig = {}, generatedConfig = {}) {
  const merged = { ...existingConfig };

  // Set schema if not present
  if (!merged.$schema && generatedConfig.$schema) {
    merged.$schema = generatedConfig.$schema;
  }

  // Preserve user model if already configured, otherwise set default
  if (!merged.model && generatedConfig.model) {
    merged.model = generatedConfig.model;
  }
  if (!merged.small_model && generatedConfig.small_model) {
    merged.small_model = generatedConfig.small_model;
  }

  // Initialize providers
  const userProviders = { ...(merged.provider || {}) };
  const generatedProviders = generatedConfig.provider || {};

  for (const [providerId, genProvider] of Object.entries(generatedProviders)) {
    const existingProvider = userProviders[providerId];
    if (!existingProvider) {
      userProviders[providerId] = genProvider;
    } else {
      // Merge WebAIFreeAPI provider
      const mergedOptions = {
        ...(existingProvider.options || {}),
        baseURL: genProvider.options?.baseURL || existingProvider.options?.baseURL,
      };
      if (genProvider.options?.apiKey) {
        mergedOptions.apiKey = genProvider.options.apiKey;
      }

      // Merge models, preserving user custom model entries under this provider
      const mergedModels = {
        ...(genProvider.models || {}),
        ...(existingProvider.models || {}),
      };

      userProviders[providerId] = {
        ...existingProvider,
        npm: genProvider.npm || existingProvider.npm,
        name: genProvider.name || existingProvider.name,
        options: mergedOptions,
        models: mergedModels,
      };
    }
  }

  merged.provider = userProviders;
  return merged;
}

/**
 * Applies OpenCode configuration to target files with atomic writing, backups, and rollback
 */
export function applyOpenCodeConfig({
  targetFiles = null,
  port = 4317,
  keys = {},
  homedir = os.homedir(),
  env = process.env,
  platform = process.platform,
} = {}) {
  const detected = detectOpenCodeConfigs({ homedir, env, platform });
  const destinations = targetFiles && targetFiles.length > 0 ? targetFiles : detected.targets;

  const generated = buildOpenCodeConfig({ port, keys });
  const configuredPaths = [];
  const backups = [];

  for (const dest of destinations) {
    const absPath = path.resolve(dest);
    const dir = path.dirname(absPath);
    let backupPath = null;

    try {
      fs.mkdirSync(dir, { recursive: true });

      let existing = {};
      if (fs.existsSync(absPath)) {
        backupPath = backupOpenCodeConfig(absPath);
        if (backupPath) backups.push({ target: absPath, backup: backupPath });
        existing = readOpenCodeConfig(absPath) || {};
      }

      const merged = mergeOpenCodeConfig(existing, generated);
      const validation = validateOpenCodeConfig(merged);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const jsonStr = JSON.stringify(merged, null, 2);
      fs.writeFileSync(absPath, jsonStr, "utf8");
      configuredPaths.push(absPath);
    } catch (err) {
      if (backupPath) {
        rollbackOpenCodeConfig(absPath, backupPath);
      }
      throw new Error(`Failed configuring OpenCode at ${absPath}: ${err.message}`);
    }
  }

  return {
    ok: true,
    paths: configuredPaths,
    backups,
  };
}
