import fs from "node:fs";
import { GEMINI_AUTH_FILE } from "./config.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";
import { DEFAULT_BROWSER_PROFILE } from "../../config.mjs";

export async function loginGeminiAndSave(timeoutMs = 5 * 60 * 1000) {
  const { getChatGPTChromium } = await import("../chatgpt/engine.mjs");
  const chromium = await getChatGPTChromium();

  const context = await launchPersistentDeepSeekContext(
    chromium,
    DEFAULT_BROWSER_PROFILE + "_gemini",
    false
  );

  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://gemini.google.com/app", { waitUntil: "domcontentloaded" }).catch(() => {});

  const startedAt = Date.now();
  let lastCookies = [];

  try {
    while (Date.now() - startedAt < timeoutMs) {
      if (context.pages().length === 0) {
        break;
      }

      try {
        lastCookies = await context.cookies();
      } catch {
        break;
      }

      const currentUrl = page.url();
      let isChatGemini = false;
      try {
        const u = new URL(currentUrl);
        isChatGemini = (u.hostname === "gemini.google.com" || u.hostname.endsWith(".gemini.google.com")) &&
          !u.pathname.startsWith("/auth") &&
          !u.pathname.startsWith("/login");
      } catch {}

      const googleCookies = lastCookies.filter((c) =>
        c.domain && (/(^|\.)google\.com$/i.test(c.domain) || /(^|\.)gemini\.google\.com$/i.test(c.domain))
      );

      const hasSession = googleCookies.some((c) =>
        c.name === "__Secure-1PSID" ||
        c.name === "SAPISID" ||
        c.name === "SSID" ||
        c.name === "SID"
      );

      let hasComposer = false;
      try {
        hasComposer = await page.evaluate(() => {
          const composer = document.querySelector('rich-textarea, div[contenteditable="true"], [role="textbox"], textarea');
          return Boolean(composer && composer.getClientRects().length > 0);
        });
      } catch {}

      // Если пользователь вернулся на gemini.google.com и есть сессионные куки Google
      if (hasSession && (hasComposer || isChatGemini)) {
        fs.writeFileSync(GEMINI_AUTH_FILE, JSON.stringify(googleCookies, null, 2));
        await page.waitForTimeout(1500).catch(() => {});
        await context.close().catch(() => {});
        return { ok: true };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error("[gemini-login] Error during login session:", err);
  } finally {
    // Если окно закрылось пользователем, но в lastCookies уже есть сессия
    if (!fs.existsSync(GEMINI_AUTH_FILE) || fs.statSync(GEMINI_AUTH_FILE).size <= 5) {
      const googleCookies = lastCookies.filter((c) =>
        c.domain && (/(^|\.)google\.com$/i.test(c.domain) || /(^|\.)gemini\.google\.com$/i.test(c.domain))
      );
      const hasSession = googleCookies.some((c) =>
        c.name === "__Secure-1PSID" ||
        c.name === "SAPISID" ||
        c.name === "SSID" ||
        c.name === "SID"
      );
      if (hasSession) {
        fs.writeFileSync(GEMINI_AUTH_FILE, JSON.stringify(googleCookies, null, 2));
      }
    }
    await context.close().catch(() => {});
  }

  const { hasAuth } = (await import("../registry.mjs")).PROVIDERS.gemini;
  if (!hasAuth()) {
    throw new Error("Gemini: авторизация не завершена. Окно браузера было закрыто до сохранения сессии или время ожидания истекло.");
  }

  return { ok: true };
}
