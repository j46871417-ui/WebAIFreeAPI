import fs from "node:fs";
import path from "node:path";
import { MISTRAL_AUTH_FILE, MISTRAL_BASE_URL, MISTRAL_BROWSER_PROFILE } from "./config.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";

let sharedProxyPromise = null;
let idleTimer = null;

export async function getMistralBrowserProxy({ debug = false } = {}) {
  if (sharedProxyPromise) return sharedProxyPromise;
  sharedProxyPromise = createMistralBrowserProxy({ debug }).catch((err) => {
    sharedProxyPromise = null;
    throw err;
  });
  return sharedProxyPromise;
}

export function resetMistralBrowserProxy() {
  if (sharedProxyPromise) {
    sharedProxyPromise.then((p) => p.close().catch(() => {})).catch(() => {});
    sharedProxyPromise = null;
  }
}

export function scheduleMistralBrowserIdleClose(timeoutMs = 120_000) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    resetMistralBrowserProxy();
  }, timeoutMs);
  if (typeof idleTimer.unref === "function") idleTimer.unref();
}

async function createMistralBrowserProxy({ debug = false } = {}) {
  const { getChatGPTChromium } = await import("../chatgpt/engine.mjs");
  const chromium = await getChatGPTChromium();

  const headless = process.env.MISTRAL_HEADLESS !== "0";
  const context = await launchPersistentDeepSeekContext(
    chromium,
    MISTRAL_BROWSER_PROFILE,
    headless
  );

  // Restore saved cookies if present
  if (fs.existsSync(MISTRAL_AUTH_FILE)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(MISTRAL_AUTH_FILE, "utf-8"));
      if (Array.isArray(cookies) && cookies.length) {
        await context.addCookies(cookies);
      }
    } catch (e) {
      if (debug) console.log("[mistral-proxy] could not restore cookies:", e.message);
    }
  }

  const page = (await context.pages())[0] || await context.newPage();

  async function dismissModals() {
    await page.evaluate(() => {
      const dismissPatterns = [
        "accept", "agree", "understand", "согласиться", "одобрить", "not now", "no thanks", "close", "закрыть"
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
    if (!currentUrl.includes("chat.mistral.ai")) {
      await page.goto(MISTRAL_BASE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2000);
    }
    await dismissModals();
  }

  async function findComposer() {
    const selectors = [
      'textarea',
      'div[contenteditable="true"]',
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
      throw new Error("Mistral: поле ввода сообщения не найдено на странице. Возможно, требуется авторизация через кнопку «Авторизоваться» в карточке модели.");
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

    let lastText = "";
    let unchangedCount = 0;
    const startTime = Date.now();
    const timeoutMs = 120_000;

    await page.waitForTimeout(1000);

    while (Date.now() - startTime < timeoutMs) {
      if (signal?.aborted) {
        throw new Error("Request aborted by client");
      }

      const currentText = await page.evaluate(() => {
        const messageContainers = document.querySelectorAll(
          '.prose, [data-message-author-role="assistant"], div[class*="message"], div[class*="response"]'
        );
        if (!messageContainers.length) {
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

      const isGenerating = await page.evaluate(() => {
        const stopBtn = document.querySelector('button[aria-label*="stop" i], button[aria-label*="остановить" i], button:has(svg[class*="stop"])');
        return Boolean(stopBtn && stopBtn.getClientRects().length > 0);
      });

      // Ранняя проверка на ошибки или требование авторизации вместо бесконечного ожидания
      if (!lastText && Date.now() - startTime > 12_000) {
        const errorState = await page.evaluate(() => {
          if (document.title.includes("Один момент") || document.title.includes("Just a moment") || document.querySelector("#challenge-running")) {
            return "Сайт chat.mistral.ai заблокирован проверкой Cloudflare. Авторизуйтесь заново через кнопку «Авторизоваться».";
          }
          const allText = document.body.innerText.toLowerCase();
          if (allText.includes("sign in to continue") || allText.includes("войдите, чтобы продолжить") || allText.includes("log in to chat")) {
            return "Требуется авторизация в Mistral. Нажмите «Авторизоваться» на карточке модели.";
          }
          return null;
        });
        if (errorState) {
          throw new Error(`Mistral: ${errorState}`);
        }
        if (!isGenerating && Date.now() - startTime > 18_000) {
          throw new Error("Mistral не начал генерацию ответа. Возможно, сессия истекла. Нажмите «Авторизоваться» на карточке Mistral.");
        }
      }

      if (!isGenerating && lastText.length > 0 && unchangedCount >= 4) {
        break;
      }

      await page.waitForTimeout(500);
    }

    try {
      const cookies = await context.cookies();
      fs.writeFileSync(MISTRAL_AUTH_FILE, JSON.stringify(cookies, null, 2));
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
