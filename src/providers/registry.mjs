// Единый реестр AI-провайдеров.
// Каждый провайдер — { id, name, description, hasAuth(), login(args) }.
// hasAuth — синхронная проверка наличия auth-файла.
// login — запускает provider-специфичный логин (Playwright + sаве).
//
// DeepSeek и Qwen ленивые импорты — не грузим их код, пока не нужно.

import path from "node:path";
import fs from "node:fs";
import { DEFAULT_AUTH_FILE, AUTH_DIR } from "../config.mjs";
import { QWEN_AUTH_FILE } from "./qwen/config.mjs";
import { CHATGPT_AUTH_FILE } from "./chatgpt/config.mjs";
import { isChatGPTAuthUsable, readChatGPTAuth } from "./chatgpt/auth-files.mjs";

export const GROK_AUTH_FILE = path.join(AUTH_DIR, "grok-state.json");
export const MISTRAL_AUTH_FILE = path.join(AUTH_DIR, "mistral-state.json");

export const PROVIDERS = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    description: "chat.deepseek.com — основная модель + Code Agent + поиск",
    authFile: DEFAULT_AUTH_FILE,
    hasAuth: () => fs.existsSync(DEFAULT_AUTH_FILE),
    async login(args = {}) {
      const { loginAndSaveAuth } = await import("../browser/login.mjs");
      await loginAndSaveAuth(args.authFile || DEFAULT_AUTH_FILE);
    },
  },
  qwen: {
    id: "qwen",
    name: "Qwen",
    description: "chat.qwen.ai — альтернатива от Alibaba (free, mongo щедрые лимиты)",
    authFile: QWEN_AUTH_FILE,
    hasAuth: () => fs.existsSync(QWEN_AUTH_FILE),
    async login() {
      const { loginQwenAndSave } = await import("./qwen/browser-login.mjs");
      await loginQwenAndSave();
    },
  },
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    description: "chatgpt.com — бесплатный веб-интерфейс OpenAI",
    authFile: CHATGPT_AUTH_FILE,
    hasAuth: () => isChatGPTAuthUsable(readChatGPTAuth(CHATGPT_AUTH_FILE)),
    async login(options = {}) {
      const { loginChatGPTAndSave } = await import("./chatgpt/browser-login.mjs");
      await loginChatGPTAndSave(CHATGPT_AUTH_FILE, options);
    },
  },
  grok: {
    id: "grok",
    name: "Grok",
    description: "grok.com — модель Grok от xAI (требуется аккаунт Twitter/X)",
    authFile: GROK_AUTH_FILE,
    hasAuth: () => fs.existsSync(GROK_AUTH_FILE),
    async login() {
      const { loginGrokAndSave } = await import("./grok/browser-login.mjs");
      await loginGrokAndSave();
    },
  },
  mistral: {
    id: "mistral",
    name: "Mistral",
    description: "chat.mistral.ai — модели Mistral (Le Chat)",
    authFile: MISTRAL_AUTH_FILE,
    hasAuth: () => fs.existsSync(MISTRAL_AUTH_FILE),
    async login() {
      const { loginMistralAndSave } = await import("./mistral/browser-login.mjs");
      await loginMistralAndSave();
    },
  },
};

export function listProviders() {
  return Object.values(PROVIDERS);
}

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

// Сколько провайдеров уже залогинены.
export function configuredCount() {
  return Object.values(PROVIDERS).filter((p) => p.hasAuth()).length;
}

export function configuredProviders() {
  return Object.values(PROVIDERS).filter((p) => p.hasAuth());
}
