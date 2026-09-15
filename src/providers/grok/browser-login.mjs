import fs from "node:fs";
import { GROK_AUTH_FILE } from "../registry.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";
import { DEFAULT_BROWSER_PROFILE } from "../../config.mjs";

export async function loginGrokAndSave(timeoutMs = 5 * 60 * 1000) {
  const { getChatGPTChromium } = await import("../chatgpt/engine.mjs");
  const chromium = await getChatGPTChromium();

  const context = await launchPersistentDeepSeekContext(
    chromium,
    DEFAULT_BROWSER_PROFILE + "_grok",
    false
  );

  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://grok.com/", { waitUntil: "domcontentloaded" }).catch(() => {});

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
      let isGrok = false;
      try {
        const u = new URL(currentUrl);
        isGrok = (u.hostname === "grok.com" || u.hostname.endsWith(".grok.com")) &&
          !u.pathname.startsWith("/sign-in") &&
          !u.pathname.startsWith("/sign-up") &&
          !u.pathname.startsWith("/login") &&
          !u.pathname.startsWith("/auth");
      } catch {}

      if (!isGrok) {
        // Пользователь находится на внешнем OAuth (Twitter/X, Google) или редиректе
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const grokCookies = lastCookies.filter((c) =>
        c.domain && (/(^|\.)grok\.com$/i.test(c.domain) || /(^|\.)x\.com$/i.test(c.domain))
      );

      let hasChatInterface = false;
      let hasSignInButton = true;
      let hasSsoCookie = false;
      try {
        hasChatInterface = await page.evaluate(() => {
          const composer = document.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
          return Boolean(composer && composer.getClientRects().length > 0);
        });
        hasSignInButton = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button, a"));
          const signPatterns = ["sign in", "log in", "sign up", "войти", "se connecter"];
          return buttons.some((b) => {
            const t = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase().trim();
            const h = (b.getAttribute("href") || "").toLowerCase();
            return signPatterns.some((p) => t === p || t.startsWith(p)) || h.includes("/login") || h.includes("/sign-in");
          });
        });
        hasSsoCookie = grokCookies.some((c) =>
          c.name.includes("sso") ||
          c.name === "auth_token" ||
          c.name === "twid" ||
          c.name === "xai_session" ||
          (c.name.includes("session") && !c.name.includes("intercom"))
        );
      } catch {}

      if (hasChatInterface && !hasSignInButton && hasSsoCookie) {
        fs.writeFileSync(GROK_AUTH_FILE, JSON.stringify(grokCookies, null, 2));
        await page.waitForTimeout(1500).catch(() => {});
        await context.close().catch(() => {});
        return { ok: true };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error("[grok-login] Error during login session:", err);
  } finally {
    await context.close().catch(() => {});
  }

  const success = fs.existsSync(GROK_AUTH_FILE) && fs.statSync(GROK_AUTH_FILE).size > 5;
  if (!success) {
    throw new Error("Grok: авторизация не завершена. Окно браузера было закрыто до сохранения сессии или время ожидания истекло.");
  }

  return { ok: true };
}
