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

  async function ensurePageReady() {
    const currentUrl = page.url();
    if (!currentUrl.includes("grok.com")) {
      await page.goto(GROK_BASE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2000);
    }
  }

  async function findComposer() {
    const selectors = [
      'textarea',
      'div[contenteditable="true"]',
      '[role="textbox"]'
    ];
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.count().catch(() => 0)) {
        if (await loc.isVisible().catch(() => false)) {
          return loc;
        }
      }
    }
    return null;
  }

  async function sendChat({ prompt, model = null, onDelta = null, signal = null }) {
    if (idleTimer) clearTimeout(idleTimer);
    await ensurePageReady();

    const composer = await findComposer();
    if (!composer) {
      throw new Error("Grok: поле ввода сообщения не найдено на странице. Возможно, требуется авторизация через 'npm run login-grok'.");
    }

    await composer.click();
    await page.keyboard.insertText(prompt);
    await page.waitForTimeout(300);

    // Send via Enter or submit button
    const submitBtn = page.locator('button[type="submit"], button[aria-label="Send"], button:has(svg)').last();
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
      const currentText = await page.evaluate(() => {
        // Grok messages usually render in markdown/prose containers
        const messageContainers = document.querySelectorAll(
          '.prose, [data-message-author-role="assistant"], div[class*="message"], div[class*="response"]'
        );
        if (!messageContainers.length) {
          // Fallback: take all paragraphs or main text containers
          const allP = document.querySelectorAll('main p, [role="main"] p');
          if (allP.length) {
            return Array.from(allP).map(p => p.innerText).join("\n");
          }
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
          unchangedCount += 1;
        }
      }

      // Check if generation finished:
      // Stop button disappears, or unchanged for ~4 seconds after receiving text
      const isGenerating = await page.evaluate(() => {
        const stopBtn = document.querySelector('button[aria-label="Stop"], button:has(svg[class*="stop"])');
        return Boolean(stopBtn && stopBtn.getClientRects().length > 0);
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
