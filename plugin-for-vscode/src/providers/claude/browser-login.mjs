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

      const claudeCookies = lastCookies.filter((c) =>
        c.domain && /(^|\.)claude\.ai$/i.test(c.domain)
      );

      const hasSession = claudeCookies.some((c) =>
        c.name === "sessionKey" ||
        (c.name.includes("session") && !c.name.includes("intercom"))
      );

      let hasComposer = false;
      try {
        hasComposer = await page.evaluate(() => {
          const composer = document.querySelector('fieldset div[contenteditable="true"], div.ProseMirror, div[contenteditable="true"], textarea');
          return Boolean(composer && composer.getClientRects().length > 0);
        });
      } catch {}

      if (hasSession && (hasComposer || isChatClaude)) {
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
    if (!fs.existsSync(CLAUDE_AUTH_FILE) || fs.statSync(CLAUDE_AUTH_FILE).size <= 5) {
      const claudeCookies = lastCookies.filter((c) =>
        c.domain && /(^|\.)claude\.ai$/i.test(c.domain)
      );
      const hasSession = claudeCookies.some((c) =>
        c.name === "sessionKey" ||
        (c.name.includes("session") && !c.name.includes("intercom"))
      );
      if (hasSession) {
        fs.writeFileSync(CLAUDE_AUTH_FILE, JSON.stringify(claudeCookies, null, 2));
      }
    }
    await context.close().catch(() => {});
  }

  const { hasAuth } = (await import("../registry.mjs")).PROVIDERS.claude;
  if (!hasAuth()) {
    throw new Error("Claude: авторизация не завершена. Окно браузера было закрыто до сохранения сессии или время ожидания истекло.");
  }

  return { ok: true };
}
