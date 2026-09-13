import fs from "node:fs";
import path from "node:path";
import { GROK_AUTH_FILE, GROK_BASE_URL, GROK_BROWSER_PROFILE } from "./config.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";

let sharedProxyPromise = null;
let idleTimer = null;

export async function getGrokBrowserProxy({ debug = false } = {}) {
  if (sharedProxyPromise) return sharedProxyPromise;
  sharedProxyPromise = createGrokBrowserProxy({ debug }).catch((err) => {
    sharedProxyPromise = null;
    throw err;
  });
  return sharedProxyPromise;
}

export function resetGrokBrowserProxy() {
  if (sharedProxyPromise) {
    sharedProxyPromise.then((p) => p.close().catch(() => {})).catch(() => {});
    sharedProxyPromise = null;
  }
}

export function scheduleGrokBrowserIdleClose(timeoutMs = 120_000) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    resetGrokBrowserProxy();
  }, timeoutMs);
  if (typeof idleTimer.unref === "function") idleTimer.unref();
}

async function createGrokBrowserProxy({ debug = false } = {}) {
  const { getChatGPTChromium } = await import("../chatgpt/engine.mjs");
  const chromium = await getChatGPTChromium();

  const headless = process.env.GROK_HEADLESS !== "0";
  const context = await launchPersistentDeepSeekContext(
    chromium,
    GROK_BROWSER_PROFILE,
    headless
  );

  // Restore saved cookies if present
  if (fs.existsSync(GROK_AUTH_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(GROK_AUTH_FILE, "utf-8"));
      if (Array.isArray(cookies) && cookies.length) {
        await context.addCookies(cookies);
      }
    } catch (e) {
      if (debug) console.log("[grok-proxy] could not restore cookies:", e.message);
    }
  }

  const page = (await context.pages())[0] || await context.newPage();

  async function dismissModals() {
    await page.evaluate(() => {
      const dismissPatterns = [
        "понятно", "accept", "agree", "understand", "согласиться", "одобрить все",
        "нет, спасибо", "не сейчас", "not now", "no thanks", "close", "закрыть"
      ];
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const b of buttons) {
        const t = (b.innerText || b.getAttribute("aria-label") || "").trim().toLowerCase();
        if (dismissPatterns.some(p => t.includes(p))) {
          try { b.click(); } catch {}
        }
      }
    }).catch(() => {});
  }

  async function ensurePageReady() {
    const currentUrl = page.url();
    if (!currentUrl.includes("grok.com")) {
      await page.goto(GROK_BASE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2000);
    }
    if (page.url().includes("tos-gate")) {
      await dismissModals();
      await page.waitForTimeout(1500);
      if (page.url().includes("tos-gate")) {
        await page.goto(GROK_BASE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
      }
    }
    await dismissModals();
  }

  async function findComposer() {
    const selectors = [
      'div[role="textbox"][contenteditable="true"]',
      'div.tiptap[contenteditable="true"]',
      'div[contenteditable="true"]',
      'textarea',
      '[role="textbox"]'
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
      throw new Error("Grok: поле ввода сообщения не найдено на странице. Возможно, требуется авторизация через кнопку «Авторизоваться» в карточке модели.");
    }

    await composer.click();
    await page.keyboard.insertText(prompt);
    await page.waitForTimeout(300);

    // Send via Enter or submit button
    const submitBtn = page.locator('button[type="submit"], button[aria-label="Send"], button[aria-label*="отправить" i], button:has(svg rect)').last();
    if (await submitBtn.count().catch(() => 0) && await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click().catch(async () => {
        await page.keyboard.press("Enter");
      });
    } else {
      await page.keyboard.press("Enter");
    }

    // Monitor for response
    let lastText = "";
    let unchangedCount = 0;
    const startTime = Date.now();
    const timeoutMs = 120_000;

    // Wait a brief moment for generation to start
    await page.waitForTimeout(1000);

    while (Date.now() - startTime < timeoutMs) {
      if (signal?.aborted) {
        throw new Error("Request aborted by client");
      }

      // Extract last response text from DOM
      const currentText = await page.evaluate((userPrompt) => {
        const proseList = Array.from(document.querySelectorAll('.prose, [data-message-author-role="assistant"], .response-content'));
        const assistantBlocks = proseList.filter(el => {
          if (el.closest('.query-bar-editor') || el.classList.contains('query-bar-editor') || el.getAttribute('contenteditable') === 'true') return false;
          if (el.innerText.trim() === userPrompt.trim()) return false;
          return true;
        });
        if (assistantBlocks.length) {
          const last = assistantBlocks[assistantBlocks.length - 1];
          return (last?.innerText || '').trim();
        }
        // Fallback: search main paragraphs
        const allP = Array.from(document.querySelectorAll('main p.break-words, [role="main"] p.break-words, main p, [role="main"] p'));
        const filtered = allP.filter(p => !p.innerText.includes(userPrompt) && !p.closest('.query-bar-editor'));
        if (filtered.length) {
          return filtered.map(p => p.innerText.trim()).filter(Boolean).join("\n\n");
        }
        return "";
      }, prompt);

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
          unchangedCount += 1;
        }
      }

      // Check if generation finished:
      // Stop button disappears, or unchanged for ~4 seconds after receiving text
      const isGenerating = await page.evaluate(() => {
        const stopBtn = document.querySelector('button[aria-label*="остановить" i], button[aria-label*="stop" i]');
        return Boolean(stopBtn && stopBtn.offsetParent !== null);
      });

      if (!isGenerating && lastText.length > 0 && unchangedCount >= 4) {
        break;
      }

      await page.waitForTimeout(500);
    }

    // Save session cookies after successful chat
    try {
      const cookies = await context.cookies();
      fs.writeFileSync(GROK_AUTH_FILE, JSON.stringify(cookies, null, 2));
    } catch {}

    return { text: lastText };
  }

  async function close() {
    await context.close().catch(() => {});
  }

  return {
    sendChat,
    close,
  };
}
