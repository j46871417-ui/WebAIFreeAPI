// Единый реестр AI-провайдеров.
// Каждый провайдер — { id, name, description, hasAuth(), login(args) }.
// hasAuth — синхронная проверка наличия auth-файла.
// login — запускает provider-специфичный логин (Playwright + sаве).
//
// DeepSeek и Qwen ленивые импорты — не грузим их код, пока не нужно.

import path from "node:path";
import fs from "node:fs";
import { DEFAULT_AUTH_FILE, AUTH_DIR, DEFAULT_BROWSER_PROFILE } from "../config.mjs";
import { QWEN_AUTH_FILE } from "./qwen/config.mjs";
import { isJwtActive } from "./qwen/auth-files.mjs";
import { CHATGPT_AUTH_FILE } from "./chatgpt/config.mjs";
import { isChatGPTAuthUsable, readChatGPTAuth } from "./chatgpt/auth-files.mjs";
import { isMistralAuthUsable } from "./mistral/auth-utils.mjs";

export const GROK_AUTH_FILE = path.join(AUTH_DIR, "grok-state.json");
export const MISTRAL_AUTH_FILE = path.join(AUTH_DIR, "mistral-state.json");
export const CLAUDE_AUTH_FILE = path.join(AUTH_DIR, "claude-state.json");
export const GEMINI_AUTH_FILE = path.join(AUTH_DIR, "gemini-state.json");

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
      await loginChatGPTAndSave(CHATGPT_AUTH_FILE, { forceExternal: true, closeAfterLogin: true, ...options });
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
        return isMistralAuthUsable(cookies);
      } catch {
        return false;
      }
    },
    async login() {
      const { loginMistralAndSave } = await import("./mistral/browser-login.mjs");
      await loginMistralAndSave();
    },
  },
  claude: {
    id: "claude",
    name: "Claude",
    description: "claude.ai — модели Claude 3.7 Sonnet и Haiku от Anthropic",
    authFile: CLAUDE_AUTH_FILE,
    hasAuth: () => {
      try {
        if (!fs.existsSync(CLAUDE_AUTH_FILE) || fs.statSync(CLAUDE_AUTH_FILE).size <= 5) return false;
        const cookies = JSON.parse(fs.readFileSync(CLAUDE_AUTH_FILE, "utf-8"));
        if (!Array.isArray(cookies) || cookies.length === 0) return false;
        return cookies.some((c) =>
          c.domain && /(^|\.)claude\.ai$/i.test(c.domain) &&
          (c.name === "sessionKey" || (c.name.includes("session") && !c.name.includes("intercom")))
        );
      } catch {
        return false;
      }
    },
    async login() {
      const { loginClaudeAndSave } = await import("./claude/browser-login.mjs");
      await loginClaudeAndSave();
    },
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    description: "gemini.google.com — в разработке",
    inDevelopment: true,
    authFile: GEMINI_AUTH_FILE,
    hasAuth: () => false,
    async login() {
      throw new Error("Провайдер Gemini находится в разработке и временно недоступен.");
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

export async function logoutProvider(id) {
  const provider = getProvider(id);
  if (!provider) {
    throw new Error(`Неизвестный провайдер: ${id}`);
  }

  // 1. Удаляем сохраненный auth-файл
  if (provider.authFile && fs.existsSync(provider.authFile)) {
    try {
      fs.unlinkSync(provider.authFile);
    } catch {}
  }

  // 2. Сбрасываем браузерные прокси и очищаем данные браузерных сессий
  if (id === "deepseek") {
    try {
      const { resetBrowserProxy } = await import("../browser/proxy.mjs").catch(() => ({}));
      if (typeof resetBrowserProxy === "function") resetBrowserProxy();
    } catch {}
    const profileCookies = path.join(DEFAULT_BROWSER_PROFILE, "Default", "Network", "Cookies");
    try { if (fs.existsSync(profileCookies)) fs.unlinkSync(profileCookies); } catch {}
  } else if (id === "qwen") {
    try {
      const { resetQwenBrowserProxy } = await import("./qwen/browser-proxy.mjs");
      await resetQwenBrowserProxy();
    } catch {}
    try {
      const { QWEN_BROWSER_PROFILE } = await import("./qwen/config.mjs");
      const profileCookies = path.join(QWEN_BROWSER_PROFILE, "Default", "Network", "Cookies");
      if (fs.existsSync(profileCookies)) fs.unlinkSync(profileCookies);
    } catch {}
  } else if (id === "chatgpt") {
    try {
      const { resetChatGPTBrowserProxy } = await import("./chatgpt/browser-proxy.mjs");
      await resetChatGPTBrowserProxy();
    } catch {}
    try {
      const { CHATGPT_BROWSER_PROFILE } = await import("./chatgpt/config.mjs");
      const profileCookies = path.join(CHATGPT_BROWSER_PROFILE, "Default", "Network", "Cookies");
      if (fs.existsSync(profileCookies)) fs.unlinkSync(profileCookies);
    } catch {}
  } else if (id === "grok") {
    try {
      const { resetGrokBrowserProxy } = await import("./grok/browser-proxy.mjs");
      resetGrokBrowserProxy();
    } catch {}
    try {
      const { GROK_BROWSER_PROFILE } = await import("./grok/config.mjs");
      const profileCookies = path.join(GROK_BROWSER_PROFILE, "Default", "Network", "Cookies");
      if (fs.existsSync(profileCookies)) fs.unlinkSync(profileCookies);
    } catch {}
  } else if (id === "mistral") {
    try {
      const { resetMistralBrowserProxy } = await import("./mistral/browser-proxy.mjs");
      resetMistralBrowserProxy();
    } catch {}
    try {
      const { MISTRAL_BROWSER_PROFILE } = await import("./mistral/config.mjs");
      if (fs.existsSync(MISTRAL_BROWSER_PROFILE)) {
        fs.rmSync(MISTRAL_BROWSER_PROFILE, { recursive: true, force: true });
      }
    } catch {}
    const defaultMistralProfile = DEFAULT_BROWSER_PROFILE + "_mistral";
    try {
      if (fs.existsSync(defaultMistralProfile)) {
        fs.rmSync(defaultMistralProfile, { recursive: true, force: true });
      }
    } catch {}
  } else if (id === "claude") {
    try {
      const { resetClaudeBrowserProxy } = await import("./claude/browser-proxy.mjs");
      resetClaudeBrowserProxy();
    } catch {}
    try {
      const { CLAUDE_BROWSER_PROFILE } = await import("./claude/config.mjs");
      const profileCookies = path.join(CLAUDE_BROWSER_PROFILE, "Default", "Network", "Cookies");
      if (fs.existsSync(profileCookies)) fs.unlinkSync(profileCookies);
    } catch {}
  } else if (id === "gemini") {
    try {
      const { resetGeminiBrowserProxy } = await import("./gemini/browser-proxy.mjs");
      resetGeminiBrowserProxy();
    } catch {}
  }

  return { ok: true, id, hasAuth: provider.hasAuth() };
}
