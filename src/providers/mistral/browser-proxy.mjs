import fs from "node:fs";
import path from "node:path";
import { MISTRAL_AUTH_FILE, MISTRAL_BASE_URL, MISTRAL_BROWSER_PROFILE } from "./config.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";
import {
  detectCloudflareChallenge,
  waitForCloudflareClearance,
  trySolveTurnstileCheckbox,
} from "../chatgpt/cloudflare-challenge.mjs";

let sharedProxyPromise = null;
let idleTimer = null;

export const DEFAULT_UA = process.platform === "win32"
  ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
  : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export function getMistralBrowserLaunchOptions(env = process.env) {
  const isHeadless = env.MISTRAL_HEADLESS !== "0";
  return {
    headless: isHeadless,
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent: DEFAULT_UA,
    locale: "ru-RU",
    viewport: { width: 1280, height: 900 },
  };
}

export function isMistralThinkingStatus(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text.trim().toLowerCase();
  return (
    /^(vibing|thinking|thought|reasoning|searching|searching\s+the\s+web|browsing|думаю|размышляю|поиск|поиск\s+в\s+интернете|подождите|генерирую)[.…]*$/i.test(clean) ||
    /^(vibing|thinking|думаю|reasoning)\s*\d*[:.]?$/i.test(clean)
  );
}

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

  const launchOptions = getMistralBrowserLaunchOptions();
  const context = await launchPersistentDeepSeekContext(
    chromium,
    MISTRAL_BROWSER_PROFILE,
    launchOptions.headless,
    {
      args: launchOptions.args,
      ignoreDefaultArgs: launchOptions.ignoreDefaultArgs,
      userAgent: launchOptions.userAgent,
      locale: launchOptions.locale,
      viewport: launchOptions.viewport,
    }
  );

  context.on("close", () => {
    sharedProxyPromise = null;
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

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
      // 1. Remove/dismiss cookie banners explicitly
      const banners = document.querySelectorAll(
        '[data-cookie-banner="true"], [role="dialog"][aria-label*="cookie" i], [aria-label*="Cookie" i], [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i]'
      );
      for (const banner of banners) {
        const btn = Array.from(banner.querySelectorAll("button")).find((b) => {
          const t = (b.innerText || b.getAttribute("aria-label") || "").trim().toLowerCase();
          return t.includes("accept") || t.includes("agree") || t.includes("allow") || t.includes("close") || t.includes("принять") || t.includes("понятно");
        }) || banner.querySelector("button");
        if (btn) {
          try { btn.click(); } catch {}
        }
        try { banner.remove(); } catch {}
      }

      // 2. Generic modal dismiss
      const dismissPatterns = [
        "accept", "agree", "understand", "согласиться", "одобрить", "allow", "allow all", "accept all",
        "not now", "no thanks", "close", "закрыть", "понятно", "ок", "ok"
      ];
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const b of buttons) {
        const t = (b.innerText || b.getAttribute("aria-label") || "").trim().toLowerCase();
        if (dismissPatterns.some((p) => t.includes(p))) {
          try { b.click(); } catch {}
        }
      }
    }).catch(() => {});
  }

  async function ensurePageReady() {
    const currentUrl = page.url();
    if (!currentUrl.includes("chat.mistral.ai")) {
      await page.goto(MISTRAL_BASE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await waitForCloudflareClearance(page, { maxMs: 15_000, debug });
    } else {
      const state = await detectCloudflareChallenge(page);
      if (state.challenge) {
        await waitForCloudflareClearance(page, { maxMs: 15_000, debug });
      }
    }
    await dismissModals();

    const cfState = await detectCloudflareChallenge(page);
    const hasCfElement = await page.evaluate(() => {
      const title = document.title || "";
      return Boolean(
        title.includes("Один момент") ||
        title.includes("Just a moment") ||
        document.querySelector("#challenge-running, #challenge-stage")
      );
    }).catch(() => false);

    if (cfState.challenge || hasCfElement) {
      throw new Error("Mistral: Сайт chat.mistral.ai заблокирован проверкой Cloudflare. Требуется повторный вход через кнопку «Авторизоваться».");
    }

    const pageState = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, a"));
      const isVisible = (el) => Boolean(el && el.offsetParent !== null && !el.hasAttribute("hidden"));
      const hasSignIn = buttons.filter(isVisible).some((b) => {
        const t = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase().trim();
        return t === "sign in" || t === "log in" || t === "войти";
      });
      if (hasSignIn) {
        return "Сессия Mistral не авторизована (отображается кнопка входа). Нажмите «Авторизоваться» на карточке модели.";
      }
      return null;
    }).catch(() => null);
    if (pageState) {
      throw new Error(`Mistral: ${pageState}`);
    }
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

    try {
      await composer.click({ timeout: 2000 });
    } catch {
      await dismissModals();
      await composer.click({ force: true, timeout: 2000 }).catch(() => {});
    }
    if (typeof composer?.focus === "function") {
      await composer.focus().catch(() => {});
    }

    const initialAssistantCount = await page.evaluate(() => {
      const msgs = document.querySelectorAll('.prose, [data-message-author-role="assistant"], div[class*="prose"]');
      return msgs.length;
    }).catch(() => 0);

    await page.keyboard.insertText(prompt);
    await page.waitForTimeout(300);

    // Send via Enter or submit button
    const submitBtn = page.locator('button[type="submit"], button[aria-label="Send"], button:has(svg)').last();
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
    const timeoutMs = 120_000;

    await page.waitForTimeout(1000);

    while (Date.now() - startTime < timeoutMs) {
      if (signal?.aborted) {
        throw new Error("Request aborted by client");
      }

      const currentText = await page.evaluate((initCount) => {
        const messageContainers = Array.from(document.querySelectorAll(
          '.prose, [data-message-author-role="assistant"], div[class*="prose"], div[class*="markdown"], [data-testid*="message"]'
        )).filter((el) => {
          if (el.getAttribute("contenteditable") === "true" || el.closest('[contenteditable="true"]')) return false;
          return true;
        });

        if (messageContainers.length <= initCount) {
          return "";
        }
        const last = messageContainers[messageContainers.length - 1];
        if (!last) return "";

        const clone = last.cloneNode(true);
        const statusSelectors = [
          "details",
          "summary",
          '[class*="thinking"]',
          '[class*="reasoning"]',
          '[class*="status"]',
          '[class*="badge"]',
          '[class*="loader"]',
          '[data-testid*="thinking"]',
          '[data-testid*="reasoning"]',
        ];
        for (const s of statusSelectors) {
          clone.querySelectorAll(s).forEach((el) => el.remove());
        }

        const raw = (clone.innerText || "").trim();
        const clean = raw.toLowerCase();
        if (/^(vibing|thinking|thought|reasoning|searching|searching\s+the\s+web|browsing|думаю|размышляю|поиск|поиск\s+в\s+интернете|подождите|генерирую)[.…]*$/i.test(clean)) {
          return "";
        }
        return raw;
      }, initialAssistantCount);

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
        const stopBtn = document.querySelector('button[aria-label*="stop" i], button[aria-label*="остановить" i], button:has(svg[class*="stop"]), button[data-testid*="stop"]');
        if (stopBtn && stopBtn.getClientRects().length > 0) return true;

        const spinners = document.querySelectorAll(
          '[class*="animate-spin"], [class*="animate-pulse"], [data-is-streaming="true"], [class*="thinking"], [class*="reasoning"]'
        );
        if (spinners.length > 0) return true;

        const textElements = document.querySelectorAll("button, span, div");
        for (const el of textElements) {
          const t = (el.innerText || "").trim().toLowerCase();
          if (t === "vibing" || t === "думаю" || t === "thinking" || t === "searching the web" || t === "поиск в интернете") {
            if (el.getClientRects().length > 0) return true;
          }
        }
        return false;
      });

      // Ранняя проверка на ошибки или требование авторизации вместо бесконечного ожидания
      if (!lastText && Date.now() - startTime > 12_000) {
        await trySolveTurnstileCheckbox(page, { debug }).catch(() => {});
        const cfState = await detectCloudflareChallenge(page);
        if (cfState.challenge) {
          await waitForCloudflareClearance(page, { maxMs: 5_000, debug });
        }
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
