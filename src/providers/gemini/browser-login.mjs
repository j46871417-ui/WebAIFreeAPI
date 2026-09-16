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
        isChatGemini = u.hostname === "gemini.google.com" &&
          !u.pathname.startsWith("/auth") &&
          !u.pathname.startsWith("/login");
      } catch {}

      if (!isChatGemini) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const googleCookies = lastCookies.filter((c) =>
        c.domain && /(^|\.)google\.com$/i.test(c.domain)
      );

      const hasSession = googleCookies.some((c) =>
        c.name === "__Secure-1PSID" ||
        c.name === "SAPISID" ||
        c.name === "SSID" ||
        c.name === "SID"
      );

      let hasSignInButton = true;
      let hasComposerOrNav = false;
      try {
        const domCheck = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button, a"));
          const signPatterns = ["войти", "sign in", "log in", "вход"];
          const signIn = buttons.some((b) => {
            const t = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase().trim();
            const h = (b.getAttribute("href") || "").toLowerCase();
            return signPatterns.some((p) => t === p || t.startsWith(p)) || h.includes("accounts.google.com");
          });

          const activeSelectors = [
            'rich-textarea div[contenteditable="true"]',
            'div[contenteditable="true"][role="textbox"]',
            'a[aria-label*="Google Account" i]',
            'a[aria-label*="Аккаунт Google" i]',
            'button[aria-label*="Новый чат" i]',
            'button[aria-label*="New chat" i]'
          ];
          const hasApp = activeSelectors.some((sel) => {
            const el = document.querySelector(sel);
            return Boolean(el && el.offsetParent !== null);
          });

          return { signIn, hasApp };
        });
        hasSignInButton = domCheck.signIn;
        hasComposerOrNav = domCheck.hasApp;
      } catch {}

      const isActuallyLoggedIn = !hasSignInButton && (hasComposerOrNav || hasSession);

      if (isActuallyLoggedIn) {
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
    await context.close().catch(() => {});
  }

  const { hasAuth } = (await import("../registry.mjs")).PROVIDERS.gemini;
  if (!hasAuth()) {
    throw new Error("Gemini: авторизация не завершена. Окно браузера было закрыто до сохранения сессии или время ожидания истекло.");
  }

  return { ok: true };
}
