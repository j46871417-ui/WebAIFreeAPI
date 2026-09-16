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
    sharedProxyPromise.then((p) => p.close().catch(() => {})).catch(() => {});
    sharedProxyPromise = null;
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

  const isHeadedDebug = process.env.GEMINI_HEADLESS === "0";
  const offscreen = !isHeadedDebug;
  const windowArgs = offscreen
    ? [
        "--window-position=-24000,-24000",
        "--window-size=1280,900",
        "--start-minimized",
      ]
    : [];

  const context = await launchPersistentDeepSeekContext(
    chromium,
    GEMINI_BROWSER_PROFILE,
    false,
    {
      args: windowArgs,
      ignoreDefaultArgs: ["--enable-automation"],
      userAgent: DEFAULT_UA,
      locale: "ru-RU",
      viewport: { width: 1280, height: 900 },
    }
  );

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  if (fs.existsSync(GEMINI_AUTH_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(GEMINI_AUTH_FILE, "utf-8"));
      if (Array.isArray(cookies) && cookies.length) {
        await context.addCookies(cookies);
      }
    } catch (e) {
      if (debug) console.log("[gemini-proxy] could not restore cookies:", e.message);
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
      let targetPattern = "";
      if (modelId.includes("flash-lite") || modelId.includes("lite")) {
        targetPattern = "flash-lite";
      } else if (modelId.includes("flash")) {
        targetPattern = "3.8 flash";
      } else if (modelId.includes("pro")) {
        targetPattern = "3.1 pro";
      }

      if (targetPattern && current.includes(targetPattern)) {
        return;
      }

      await picker.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);

      const menuItems = page.locator('gem-menu-item, [data-test-id^="bard-mode-option"]');
      const count = await menuItems.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const item = menuItems.nth(i);
        const text = String(await item.innerText().catch(() => "")).toLowerCase();
        if (targetPattern && text.includes(targetPattern)) {
          await item.click({ timeout: 5000 });
          await page.waitForTimeout(500);
          return;
        }
      }
      await page.keyboard.press("Escape").catch(() => {});
    } catch {}
  }

  async function findComposer() {
    const selectors = [
      'div.ql-editor',
      'rich-textarea [contenteditable="true"]',
      'rich-textarea div[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
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
    await selectGeminiModel(model);

    const composer = await findComposer();
    if (!composer) {
      throw new Error("Gemini: поле ввода сообщения не найдено на странице. Проверьте авторизацию.");
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

    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");

    if (prompt.length > 200) {
      await page.evaluate((text) => {
        const el = document.querySelector('div.ql-editor, rich-textarea [contenteditable="true"]');
        if (!el) return;
        el.focus();
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
      }, prompt);
      const hasContent = await page.evaluate(() => {
        const el = document.querySelector('div.ql-editor, rich-textarea [contenteditable="true"]');
        return Boolean(el && el.innerText.trim());
      });
      if (!hasContent) {
        await page.keyboard.type(prompt, { delay: 1 });
      }
    } else {
      await page.keyboard.type(prompt, { delay: 1 });
    }
    await page.waitForTimeout(400);

    let submitBtn = null;
    for (let i = 0; i < 15; i++) {
      const btn = page.locator('button[aria-label*="Отправить" i], button[aria-label*="Send" i], .send-button button, gem-icon-button.send-button').first();
      if (await btn.count().catch(() => 0) && await btn.isVisible().catch(() => false)) {
        submitBtn = btn;
        break;
      }
      await page.waitForTimeout(200);
    }

    if (submitBtn) {
      await submitBtn.click({ timeout: 5000 }).catch(async () => {
        await page.keyboard.press("Enter");
      });
    } else {
      await page.keyboard.press("Enter");
    }

    let lastText = "";
    let unchangedCount = 0;
    const startTime = Date.now();
    const timeoutMs = 150_000;

    await page.waitForTimeout(800);

    while (Date.now() - startTime < timeoutMs) {
      if (signal?.aborted) {
        throw new Error("Request aborted by client");
      }

      const currentText = await page.evaluate(() => {
        const messageContainers = document.querySelectorAll(
          'message-content, .markdown-main-panel, .model-response-text, [class*="response-content"]'
        );
        if (!messageContainers.length) {
          return "";
        }
        const last = messageContainers[messageContainers.length - 1];
        if (!last) return "";
        let text = (last.innerText || "").trim();
        if (text.startsWith("Ответ Gemini")) {
          text = text.replace(/^Ответ Gemini\s*/, "").trim();
        }
        return text;
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
        const stopBtn = document.querySelector('button[aria-label*="Остановить" i], button[aria-label*="Stop" i], button.stop-button, [data-test-id*="stop"]');
        return Boolean(stopBtn);
      }).catch(() => false);

      if (!isGenerating && lastText && unchangedCount >= 3) {
        break;
      }

      if (!isGenerating && !lastText && (Date.now() - startTime > 20_000)) {
        const errorAlert = await page.evaluate(() => {
          const alert = document.querySelector('[role="alert"], .error-message');
          return alert ? (alert.innerText || "").trim() : null;
        }).catch(() => null);
        if (errorAlert) {
          throw new Error("Gemini: " + errorAlert);
        }
      }

      await page.waitForTimeout(500);
    }

    if (!lastText) {
      throw new Error("Gemini: не получен ответ от модели. Проверьте окно браузера или лимиты сообщений.");
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
