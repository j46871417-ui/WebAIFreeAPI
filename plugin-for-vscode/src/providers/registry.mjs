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
import { isJwtActive } from "./qwen/auth-files.mjs";
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
    hasAuth: () => {
      try {
        if (!fs.existsSync(DEFAULT_AUTH_FILE) || fs.statSync(DEFAULT_AUTH_FILE).size <= 5) return false;
        const raw = JSON.parse(fs.readFileSync(DEFAULT_AUTH_FILE, "utf-8"));
        return Boolean(raw && (raw.userToken || raw.token) && Array.isArray(raw.cookies) && raw.cookies.some((c) => c.name === "ds_session_id"));
      } catch {
        return false;
      }
    },
    async login(args = {}) {
      const { loginAndSaveAuth } = await import("../browser/login.mjs");
      await loginAndSaveAuth(args.authFile || DEFAULT_AUTH_FILE);
    },
  },
  qwen: {
    id: "qwen",
    name: "Qwen",
    description: "chat.qwen.ai — альтернатива от Alibaba (free, много щедрые лимиты)",
    authFile: QWEN_AUTH_FILE,
    hasAuth: () => {
      try {
        if (!fs.existsSync(QWEN_AUTH_FILE) || fs.statSync(QWEN_AUTH_FILE).size <= 5) return false;
        const raw = JSON.parse(fs.readFileSync(QWEN_AUTH_FILE, "utf-8"));
        return Boolean(raw?.token && isJwtActive(raw.token));
      } catch {
        return false;
      }
    },
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
    hasAuth: () => {
      try {
        if (!fs.existsSync(GROK_AUTH_FILE) || fs.statSync(GROK_AUTH_FILE).size <= 5) return false;
        const cookies = JSON.parse(fs.readFileSync(GROK_AUTH_FILE, "utf-8"));
        if (!Array.isArray(cookies) || cookies.length === 0) return false;
        return cookies.some((c) =>
          c.domain && (/(^|\.)grok\.com$/i.test(c.domain) || /(^|\.)x\.com$/i.test(c.domain)) &&
          (c.name.includes("sso") || c.name === "auth_token" || c.name === "twid" || c.name === "xai_session" || (c.name.includes("session") && !c.name.includes("intercom")))
        );
      } catch {
        return false;
      }
    },
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
    hasAuth: () => {
      try {
        if (!fs.existsSync(MISTRAL_AUTH_FILE) || fs.statSync(MISTRAL_AUTH_FILE).size <= 5) return false;
        const cookies = JSON.parse(fs.readFileSync(MISTRAL_AUTH_FILE, "utf-8"));
        if (!Array.isArray(cookies) || cookies.length === 0) return false;
        const mistralCookies = cookies.filter((c) => c.domain && /(^|\.)mistral\.ai$/i.test(c.domain));
        const hasAnon = mistralCookies.some((c) => c.name === "anonymousUser");
        if (hasAnon) return false;
        const hasAuthToken = mistralCookies.some((c) =>
          c.name === "mistral_session" ||
          c.name.includes("session-token") ||
          c.name === "app_session" ||
          c.name === "__Secure-next-auth.session-token" ||
          c.name === "authjs.session-token" ||
          (c.name.includes("session") && !c.name.includes("intercom") && !c.name.includes("anonymous"))
        );
        return hasAuthToken;
      } catch {
        return false;
      }
    },
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
