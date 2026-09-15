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
      let isChatMistral = false;
      try {
        const u = new URL(currentUrl);
        isChatMistral = u.hostname === "chat.mistral.ai" &&
          !u.pathname.startsWith("/auth") &&
          !u.pathname.startsWith("/login") &&
          !u.pathname.startsWith("/signin") &&
          !u.pathname.startsWith("/callback");
      } catch {}

      if (!isChatMistral) {
        // Пользователь находится на внешнем OAuth провайдере (Google, Microsoft, auth.mistral.ai)
        // или в процессе редиректа. Окно закрывать НЕЛЬЗЯ.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Фильтруем куки строго для домена mistral.ai
      const mistralCookies = lastCookies.filter((c) =>
        c.domain && /(^|\.)mistral\.ai$/i.test(c.domain)
      );

      // Проверяем куки на наличие реального токена/сессии (а не гостевого anonymousUser или intercom-session)
      const hasAnon = mistralCookies.some((c) => c.name === "anonymousUser");
      const hasAuthToken = mistralCookies.some((c) =>
        c.name === "mistral_session" ||
        c.name.includes("session-token") ||
        c.name === "app_session" ||
        c.name === "__Secure-next-auth.session-token" ||
        c.name === "authjs.session-token" ||
        (c.name.includes("session") && !c.name.includes("intercom") && !c.name.includes("anonymous"))
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

      const isActuallyLoggedIn = !hasAnon && !hasSignInButton && (hasUserProfile || hasAuthToken);

      if (isActuallyLoggedIn) {
        fs.writeFileSync(MISTRAL_AUTH_FILE, JSON.stringify(mistralCookies, null, 2));
        await page.waitForTimeout(1500).catch(() => {});
        await context.close().catch(() => {});
        return { ok: true };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error("[mistral-login] Error during login session:", err);
  } finally {
    await context.close().catch(() => {});
  }

  const { hasAuth } = (await import("../registry.mjs")).PROVIDERS.mistral;
  if (!hasAuth()) {
    throw new Error("Mistral: авторизация не завершена. Окно браузера было закрыто до сохранения сессии или время ожидания истекло.");
  }

  return { ok: true };
}
