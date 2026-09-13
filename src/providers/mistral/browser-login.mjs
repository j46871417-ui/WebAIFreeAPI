import fs from "node:fs";
import { MISTRAL_AUTH_FILE } from "../registry.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";
import { DEFAULT_BROWSER_PROFILE } from "../../config.mjs";

export async function loginMistralAndSave(timeoutMs = 5 * 60 * 1000) {
  const { getChatGPTChromium } = await import("../chatgpt/engine.mjs");
  const chromium = await getChatGPTChromium();

  const context = await launchPersistentDeepSeekContext(
    chromium,
    DEFAULT_BROWSER_PROFILE + "_mistral",
    false
  );

  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://chat.mistral.ai/", { waitUntil: "domcontentloaded" }).catch(() => {});

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
      const notAuthPage = !currentUrl.includes("/login") && !currentUrl.includes("/auth");

      // Проверяем куки на наличие реального токена/сессии (а не гостевого anonymousUser)
      const hasAnon = lastCookies.some((c) => c.name === "anonymousUser");
      const hasAuthToken = lastCookies.some((c) =>
        c.name.includes("session") ||
        c.name.includes("auth") ||
        c.name.includes("token") ||
        c.name.includes("jwt") ||
        c.name.includes("user_id") ||
        c.name.includes("account")
      );

      // Проверяем интерфейс страницы: пропала ли кнопка входа и появился ли профиль
      let hasSignInButton = true;
      let hasUserProfile = false;
      try {
        const domCheck = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button, a"));
          const signPatterns = ["sign in", "log in", "sign up", "se connecter", "s'inscrire", "войти", "регистрация"];
          const signIn = buttons.some((b) => {
            const t = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase().trim();
            const h = (b.getAttribute("href") || "").toLowerCase();
            return signPatterns.some((p) => t === p || t.startsWith(p)) || h.includes("/login") || h.includes("/auth") || h.includes("/signin");
          });

          const profileSelectors = [
            '[data-testid="user-menu"]',
            '[data-testid="user-profile"]',
            'button[aria-label*="account" i]',
            'button[aria-label*="profile" i]',
            'button[aria-label*="user" i]',
            'a[href*="/account"]',
            'a[href*="/settings"]'
          ];
          const profile = profileSelectors.some((sel) => {
            const el = document.querySelector(sel);
            return Boolean(el && el.offsetParent !== null);
          });

          return { signIn, profile };
        });
        hasSignInButton = domCheck.signIn;
        hasUserProfile = domCheck.profile;
      } catch {}

      const isActuallyLoggedIn = (!hasSignInButton && (hasUserProfile || hasAuthToken)) || (hasAuthToken && !hasAnon);

      if (isActuallyLoggedIn && notAuthPage) {
        fs.writeFileSync(MISTRAL_AUTH_FILE, JSON.stringify(lastCookies, null, 2));
        await page.waitForTimeout(1500).catch(() => {});
        await context.close().catch(() => {});
        return { ok: true };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
  } finally {
    if (lastCookies.length) {
      const hasAnon = lastCookies.some((c) => c.name === "anonymousUser");
      const hasAuthToken = lastCookies.some((c) =>
        c.name.includes("session") ||
        c.name.includes("auth") ||
        c.name.includes("token") ||
        c.name.includes("jwt") ||
        c.name.includes("user_id") ||
        c.name.includes("account")
      );
      if (hasAuthToken && !hasAnon) {
        try {
          fs.writeFileSync(MISTRAL_AUTH_FILE, JSON.stringify(lastCookies, null, 2));
        } catch {}
      }
    }
    await context.close().catch(() => {});
  }

  const { hasAuth } = (await import("../registry.mjs")).PROVIDERS.mistral;
  return { ok: hasAuth() };
}
