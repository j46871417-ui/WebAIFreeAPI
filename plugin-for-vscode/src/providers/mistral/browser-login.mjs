import fs from "node:fs";
import { MISTRAL_AUTH_FILE } from "../registry.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";
import { DEFAULT_BROWSER_PROFILE } from "../../config.mjs";
import {
  isMistralCookieDomain,
  isMistralAuthUsable,
  isMistralAuthRoute,
  evaluateMistralPageState,
} from "./auth-utils.mjs";

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
      if (isMistralAuthRoute(currentUrl)) {
        // Пользователь находится на внешнем OAuth провайдере (Google, Microsoft, auth.mistral.ai)
        // или в процессе редиректа. Окно закрывать НЕЛЬЗЯ.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Фильтруем куки строго для домена mistral.ai
      const mistralCookies = lastCookies.filter((c) => isMistralCookieDomain(c?.domain));
      const hasUsableCookies = isMistralAuthUsable(mistralCookies);

      // Проверяем интерфейс страницы: наличие поля ввода и отсутствие видимых кнопок входа
      let domCheck = { hasComposer: false, visibleSignInButtons: [], hasProfile: false };
      try {
        domCheck = await page.evaluate(() => {
          const isVisible = (el) => Boolean(el && el.offsetParent !== null && !el.hasAttribute("hidden"));
          const composer = document.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
          const hasComposer = isVisible(composer);

          const buttons = Array.from(document.querySelectorAll("button, a"));
          const signPatterns = ["sign in", "log in", "войти", "se connecter", "sign up", "s'inscrire", "регистрация"];
          const visibleSignInButtons = buttons
            .filter(isVisible)
            .map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().toLowerCase())
            .filter((t) => signPatterns.some((p) => t === p || t.startsWith(p)));

          const profileSelectors = [
            '[data-testid="user-menu"]',
            '[data-testid="user-profile"]',
            'button[aria-label*="account" i]',
            'button[aria-label*="profile" i]',
            'button[aria-label*="user" i]',
            'a[href*="/account"]',
            'a[href*="/settings"]',
          ];
          const hasProfile = profileSelectors.some((sel) => isVisible(document.querySelector(sel)));

          return { hasComposer, visibleSignInButtons, hasProfile };
        });
      } catch {}

      const pageEvaluation = evaluateMistralPageState({
        url: currentUrl,
        hasComposer: domCheck.hasComposer || domCheck.hasProfile,
        visibleSignInButtons: domCheck.visibleSignInButtons,
      });

      if (pageEvaluation.isLoggedIn && hasUsableCookies) {
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
    try {
      if (lastCookies.length > 0) {
        const mistralCookies = lastCookies.filter((c) => isMistralCookieDomain(c?.domain));
        if (isMistralAuthUsable(mistralCookies) && !fs.existsSync(MISTRAL_AUTH_FILE)) {
          fs.writeFileSync(MISTRAL_AUTH_FILE, JSON.stringify(mistralCookies, null, 2));
        }
      }
    } catch {}
    await context.close().catch(() => {});
  }

  const { hasAuth } = (await import("../registry.mjs")).PROVIDERS.mistral;
  if (!hasAuth()) {
    throw new Error("Mistral: авторизация не завершена. Окно браузера было закрыто до сохранения сессии или время ожидания истекло.");
  }

  return { ok: true };
}
