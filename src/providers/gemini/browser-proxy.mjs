import fs from "node:fs";
import path from "node:path";
import { GEMINI_AUTH_FILE, GEMINI_BASE_URL, GEMINI_BROWSER_PROFILE, GEMINI_DEFAULT_MODEL } from "./config.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";

let sharedProxyPromise = null;
let idleTimer = null;

export async function getGeminiBrowserProxy({ debug = false } = {}) {
  if (sharedProxyPromise) return sharedProxyPromise;
  sharedProxyPromise = createGeminiBrowserProxy({ debug }).catch((err) => {
    sharedProxyPromise = null;
    throw err;
  });
  return sharedProxyPromise;
}

export function resetGeminiBrowserProxy() {
  if (sharedProxyPromise) {
    const p = sharedProxyPromise;
    sharedProxyPromise = null;
    p.then((proxy) => proxy.close().catch(() => {})).catch(() => {});
  }
}

export function scheduleGeminiBrowserIdleClose(timeoutMs = 120_000) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    resetGeminiBrowserProxy();
  }, timeoutMs);
  if (typeof idleTimer.unref === "function") idleTimer.unref();
}

const DEFAULT_UA = process.platform === "win32"
  ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
  : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

async function createGeminiBrowserProxy({ debug = false } = {}) {
  const { getChatGPTChromium } = await import("../chatgpt/engine.mjs");
  const chromium = await getChatGPTChromium();

  const isHeaded = process.env.GEMINI_HEADLESS === "0";
  const headless = !isHeaded;

  const context = await launchPersistentDeepSeekContext(
    chromium,
    GEMINI_BROWSER_PROFILE,
    headless,
    {
      args: [],
      ignoreDefaultArgs: ["--enable-automation"],
      userAgent: DEFAULT_UA,
      locale: "ru-RU",
      viewport: { width: 1280, height: 900 },
    }
  );

  context.on("close", () => {
    sharedProxyPromise = null;
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = (await context.pages())[0] || await context.newPage();
  try {
    await page.goto(GEMINI_BASE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2000);
  } catch {}

  async function dismissModals() {
    // Do not click arbitrary buttons matching 'ok' or 'close' on Gemini
  }

  async function ensurePageReady() {
    const currentUrl = page.url();
    if (!currentUrl.includes("gemini.google.com")) {
      try {
        await page.goto(GEMINI_BASE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
      } catch (err) {
        await page.waitForTimeout(1500);
        await page.goto(GEMINI_BASE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => {});
      }
      await page.waitForTimeout(2000);
    }
    await dismissModals();

    const pageState = await page.evaluate(() => {
      const hasComposer = Boolean(document.querySelector('rich-textarea, div[contenteditable="true"], [role="textbox"], textarea'));
      if (hasComposer) {
        return null;
      }
      const buttons = Array.from(document.querySelectorAll("button, a"));
      const hasSignIn = buttons.some((b) => {
        const t = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase().trim();
        const h = (b.getAttribute("href") || "").toLowerCase();
        return (t === "войти" || t === "sign in" || t === "log in") && (h.includes("servicelogin") || h.includes("interactivelogin") || !h);
      });
      if (hasSignIn) {
        return "Сессия Gemini не авторизована (отображается кнопка входа). Нажмите «Авторизоваться» на карточке модели.";
      }
      return null;
    }).catch(() => null);
    if (pageState) {
      throw new Error("Gemini: " + pageState);
    }
  }

  async function selectGeminiModel(modelId) {
    if (!modelId) return;
    try {
      const picker = page.locator('button[data-test-id="bard-mode-menu-button"]').first();
      if (!(await picker.count().catch(() => 0))) return;

      const current = String(await picker.innerText().catch(() => "")).trim().toLowerCase();
      const isLite = modelId.includes("flash-lite") || modelId.includes("lite");
      const isPro = modelId.includes("pro");
      const isFlash = !isLite && !isPro && modelId.includes("flash");

      if (isLite && (current.includes("lite") || current.includes("flash-lite"))) return;
      if (isFlash && current.includes("flash") && !current.includes("lite")) return;
      if (isPro && current.includes("pro")) return;

      await picker.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);

      const menuItems = page.locator('gem-menu-item, [data-test-id^="bard-mode-option"]');
      const count = await menuItems.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const item = menuItems.nth(i);
        const text = String(await item.innerText().catch(() => "")).toLowerCase();
        let match = false;
        if (isLite && text.includes("flash-lite")) match = true;
        else if (isFlash && (text.includes("3.8 flash") || (text.includes("flash") && !text.includes("lite")))) match = true;
        else if (isPro && text.includes("pro")) match = true;

        if (match) {
          await item.click({ timeout: 5000 });
          await page.waitForTimeout(500);
          return;
        }
      }
      await page.keyboard.press("Escape").catch(() => {});
    } catch {}
  }

  async function sendChat({ prompt, model = null, onDelta = null, signal = null }) {
    if (idleTimer) clearTimeout(idleTimer);
    if (debug) console.log("[gemini] ensurePageReady");
    await ensurePageReady();
    if (debug) console.log("[gemini] selectGeminiModel:", model);
    await selectGeminiModel(model);

    const initialCount = await page.evaluate(() => {
      return document.querySelectorAll('message-content, .markdown-main-panel, .model-response-text, [class*="response-content"]').length;
    }).catch(() => 0);

    const editor = page.locator('div.ql-editor, rich-textarea [contenteditable="true"]').first();
    await editor.click({ timeout: 5000 }).catch(async () => {
      await dismissModals();
      await editor.click({ force: true, timeout: 5000 }).catch(() => {});
    });
    await page.waitForTimeout(200);

    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(100);

    await page.keyboard.type(prompt, { delay: prompt.length > 500 ? 1 : 5 });
    await page.waitForTimeout(300);

    const submitBtn = page.locator('button[aria-label*="Отправить" i], button[aria-label*="Send" i], .send-button button').first();
    const btnCount = await submitBtn.count().catch(() => 0);
    if (btnCount) {
      await submitBtn.click();
    } else {
      await page.keyboard.press("Enter");
    }

    let lastText = "";
    let unchangedCount = 0;
    const startTime = Date.now();
    const timeoutMs = 120_000;

    while (Date.now() - startTime < timeoutMs) {
      if (signal?.aborted) {
        throw new Error("Request aborted by client");
      }

      await page.waitForTimeout(500);

      const state = await page.evaluate((initCount) => {
        const messageContainers = document.querySelectorAll(
          'message-content, .markdown-main-panel, .model-response-text, [class*="response-content"]'
        );
        if (messageContainers.length <= initCount) {
          const body = document.body ? document.body.innerText : "";
          const isBlocked = body.includes("не поддерживается в вашей стране") || body.includes("isn't supported in your country");
          const isRussianIp = body.includes("Россия") || body.includes("Russia");
          return { ready: false, text: "", isGenerating: false, isBlocked, isRussianIp };
        }
        const last = messageContainers[messageContainers.length - 1];
        let t = (last?.innerText || "").trim();
        if (t.startsWith("Ответ Gemini")) {
          t = t.replace(/^Ответ Gemini\s*/, "").trim();
        }
        const stopBtn = document.querySelector('button[aria-label*="Остановить" i], button[aria-label*="Stop" i], button.stop-button, [data-test-id*="stop"]');
        const sendBtn = document.querySelector('button[aria-label*="Отправить" i], button[aria-label*="Send" i], .send-button button');
        const hasSendBtn = Boolean(sendBtn && sendBtn.getClientRects().length > 0);
        return { ready: true, text: t, isGenerating: Boolean(stopBtn), hasSendBtn };
      }, initialCount);

      if (!state.ready && !lastText && Date.now() - startTime > 15_000) {
        if (state.isBlocked || state.isRussianIp) {
          throw new Error("Gemini не отвечает: обнаружен IP РФ (Google блокирует Gemini в России). Включите VPN/прокси для работы с Gemini.");
        }
      }

      if (state.ready && state.text) {
        if (state.text !== lastText) {
          unchangedCount = 0;
          if (onDelta) {
            const delta = state.text.startsWith(lastText)
              ? state.text.slice(lastText.length)
              : state.text;
            onDelta(delta, state.text);
          }
          lastText = state.text;
        } else {
          unchangedCount++;
        }
      }

      const isDone = lastText && (
        state.hasSendBtn ||
        (!state.isGenerating && unchangedCount >= 2) ||
        (unchangedCount >= 6)
      );

      if (state.ready && isDone) {
        break;
      }
    }

    if (!lastText) {
      throw new Error("Gemini: не получен ответ от модели. Проверьте VPN/прокси или сессию аккаунта.");
    }

    return {
      text: lastText,
      model: model || GEMINI_DEFAULT_MODEL,
    };
  }

  return {
    sendChat,
    close: async () => {
      await context.close().catch(() => {});
    },
  };
}
