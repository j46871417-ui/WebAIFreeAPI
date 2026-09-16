import fs from "node:fs";
import { CLAUDE_AUTH_FILE } from "./config.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";
import { DEFAULT_BROWSER_PROFILE } from "../../config.mjs";

export async function loginClaudeAndSave(timeoutMs = 5 * 60 * 1000) {
  const { getChatGPTChromium } = await import("../chatgpt/engine.mjs");
  const chromium = await getChatGPTChromium();

  const context = await launchPersistentDeepSeekContext(
    chromium,
    DEFAULT_BROWSER_PROFILE + "_claude",
    false
  );

  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://claude.ai/login", { waitUntil: "domcontentloaded" }).catch(() => {});

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
      let isChatClaude = false;
      try {
        const u = new URL(currentUrl);
        isChatClaude = u.hostname === "claude.ai" &&
          !u.pathname.startsWith("/login") &&
          !u.pathname.startsWith("/auth") &&
          !u.pathname.startsWith("/api/auth");
      } catch {}

      if (!isChatClaude) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const claudeCookies = lastCookies.filter((c) =>
        c.domain && /(^|\.)claude\.ai$/i.test(c.domain)
      );

      const hasSession = claudeCookies.some((c) =>
        c.name === "sessionKey" ||
        c.name.includes("session") ||
        c.name === "cf_clearance"
      );

      let hasSignInButton = true;
      let hasComposerOrNav = false;
      try {
        const domCheck = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button, a"));
          const signPatterns = ["sign in", "log in", "войти", "continue with", "sign up"];
          const signIn = buttons.some((b) => {
            const t = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase().trim();
            const h = (b.getAttribute("href") || "").toLowerCase();
            return signPatterns.some((p) => t === p || t.startsWith(p)) || h.includes("/login") || h.includes("/auth");
          });

          const activeSelectors = [
            'div[contenteditable="true"]',
            'textarea',
            'button[aria-label*="Account" i]',
            'button[aria-label*="User" i]',
            'button[aria-label*="Profile" i]',
            'a[href*="/settings"]',
            'a[href*="/chats"]'
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
        fs.writeFileSync(CLAUDE_AUTH_FILE, JSON.stringify(claudeCookies, null, 2));
        await page.waitForTimeout(1500).catch(() => {});
        await context.close().catch(() => {});
        return { ok: true };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error("[claude-login] Error during login session:", err);
  } finally {
    await context.close().catch(() => {});
  }

  const { hasAuth } = (await import("../registry.mjs")).PROVIDERS.claude;
  if (!hasAuth()) {
    throw new Error("Claude: авторизация не завершена. Окно браузера было закрыто до сохранения сессии или время ожидания истекло.");
  }

  return { ok: true };
}
