import fs from "node:fs";
import path from "node:path";
import { CLAUDE_AUTH_FILE, CLAUDE_BASE_URL, CLAUDE_BROWSER_PROFILE } from "./config.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";

let sharedProxyPromise = null;
let idleTimer = null;

export async function getClaudeBrowserProxy({ debug = false } = {}) {
  if (sharedProxyPromise) return sharedProxyPromise;
  sharedProxyPromise = createClaudeBrowserProxy({ debug }).catch((err) => {
    sharedProxyPromise = null;
    throw err;
  });
  return sharedProxyPromise;
}

export function resetClaudeBrowserProxy() {
  if (sharedProxyPromise) {
    sharedProxyPromise.then((p) => p.close().catch(() => {})).catch(() => {});
    sharedProxyPromise = null;
  }
}

export function scheduleClaudeBrowserIdleClose(timeoutMs = 120_000) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    resetClaudeBrowserProxy();
  }, timeoutMs);
  if (typeof idleTimer.unref === "function") idleTimer.unref();
}

async function createClaudeBrowserProxy({ debug = false } = {}) {
  const { getChatGPTChromium } = await import("../chatgpt/engine.mjs");
  const chromium = await getChatGPTChromium();

  const headless = process.env.CLAUDE_HEADLESS !== "0";
  const context = await launchPersistentDeepSeekContext(
    chromium,
    CLAUDE_BROWSER_PROFILE,
    headless
  );

  if (fs.existsSync(CLAUDE_AUTH_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(CLAUDE_AUTH_FILE, "utf-8"));
      if (Array.isArray(cookies) && cookies.length) {
        await context.addCookies(cookies);
      }
    } catch (e) {
      if (debug) console.log("[claude-proxy] could not restore cookies:", e.message);
    }
  }

  const page = (await context.pages())[0] || await context.newPage();

  async function dismissModals() {
    await page.evaluate(() => {
      const dismissPatterns = [
        "accept", "agree", "understand", "согласиться", "одобрить", "allow", "allow all", "accept all",
        "not now", "no thanks", "close", "закрыть", "понятно", "ок", "ok", "got it"
      ];
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const b of buttons) {
        const t = (b.innerText || b.getAttribute("aria-label") || "").trim().toLowerCase();
        if (dismissPatterns.some((p) => t === p || t.startsWith(p))) {
          try { b.click(); } catch {}
        }
      }
    }).catch(() => {});
  }

  async function ensurePageReady() {
    const currentUrl = page.url();
    if (!currentUrl.includes("claude.ai")) {
      await page.goto(CLAUDE_BASE_URL + "/new", { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2000);
    }
    await dismissModals();

    const pageState = await page.evaluate(() => {
      const title = document.title || "";
      if (title.includes("Just a moment") || document.querySelector("#challenge-running")) {
        return "Сайт claude.ai заблокирован проверкой Cloudflare. Требуется повторный вход через кнопку «Авторизоваться».";
      }
      const hasComposer = Boolean(document.querySelector('fieldset div[contenteditable="true"], div.ProseMirror, div[contenteditable="true"], textarea'));
      if (hasComposer) {
        return null;
      }
      const buttons = Array.from(document.querySelectorAll("button, a"));
      const hasSignIn = buttons.some((b) => {
        const t = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase().trim();
        return t === "sign in" || t === "log in" || t === "войти";
      });
      if (hasSignIn) {
        return "Сессия Claude не авторизована (отображается кнопка входа). Нажмите «Авторизоваться» на карточке модели.";
      }
      return null;
    }).catch(() => null);
    if (pageState) {
      throw new Error("Claude: " + pageState);
    }
  }

  async function findComposer() {
    const selectors = [
      'fieldset div[contenteditable="true"]',
      'div[contenteditable="true"].ProseMirror',
      'div[contenteditable="true"]',
      'textarea[placeholder*="reply" i]',
      'textarea'
    ];
    for (let attempt = 0; attempt < 25; attempt++) {
      await dismissModals();
      for (const sel of selectors) {
        const loc = page.locator(sel).first();
        if (await loc.count().catch(() => 0)) {
          if (await loc.isVisible().catch(() => false)) {
            return loc;
          }
        }
      }
      await page.waitForTimeout(1000);
    }
    return null;
  }

  async function sendChat({ prompt, model = null, onDelta = null, signal = null }) {
    if (idleTimer) clearTimeout(idleTimer);
    await ensurePageReady();

    const composer = await findComposer();
    if (!composer) {
      throw new Error("Claude: поле ввода сообщения не найдено на странице. Возможно, требуется авторизация через кнопку «Авторизоваться» в карточке модели.");
    }

    try {
      await composer.click({ timeout: 2000 });
    } catch {
      await dismissModals();
      await composer.click({ force: true, timeout: 2000 }).catch(() => {});
    }
    if (typeof composer?.focus === "function") {
      await composer.focus().catch(() => {});
    }
    await page.keyboard.insertText(prompt);
    await page.waitForTimeout(300);

    const submitBtn = page.locator('button[aria-label*="Send" i], button:has(svg)').last();
    if (await submitBtn.count().catch(() => 0) && await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click({ force: true, timeout: 2000 }).catch(async () => {
        await page.keyboard.press("Enter");
      });
    } else {
      await page.keyboard.press("Enter");
    }

    let lastText = "";
    let unchangedCount = 0;
    const startTime = Date.now();
    const timeoutMs = 150_000;

    await page.waitForTimeout(1000);

    while (Date.now() - startTime < timeoutMs) {
      if (signal?.aborted) {
        throw new Error("Request aborted by client");
      }

      const currentText = await page.evaluate(() => {
        const messageContainers = document.querySelectorAll(
          '.font-claude-message, div.standard-markdown, [data-is-streaming="true"], div[class*="message"]'
        );
        if (!messageContainers.length) {
          return "";
        }
        const last = messageContainers[messageContainers.length - 1];
        return last ? (last.innerText || "").trim() : "";
      });

      if (currentText) {
        if (currentText !== lastText) {
          unchangedCount = 0;
          if (onDelta) {
            const delta = currentText.startsWith(lastText)
              ? currentText.slice(lastText.length)
              : currentText;
            onDelta(delta, currentText);
          }
          lastText = currentText;
        } else {
          unchangedCount++;
        }
      }

      const isGenerating = await page.evaluate(() => {
        const stopBtn = document.querySelector('button[aria-label*="Stop" i], button:has-text("Stop"), [data-is-streaming="true"]');
        return Boolean(stopBtn);
      }).catch(() => false);

      if (!isGenerating && lastText && unchangedCount >= 4) {
        break;
      }

      await page.waitForTimeout(500);
    }

    if (!lastText) {
      throw new Error("Claude: не получен ответ от модели. Проверьте окно браузера или лимиты сообщений.");
    }

    return {
      text: lastText,
      model: model || "claude-3-7-sonnet",
    };
  }

  return {
    sendChat,
    close: async () => {
      await context.close().catch(() => {});
    },
  };
}
