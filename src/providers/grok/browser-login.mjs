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
      const notSignIn = !currentUrl.includes("/sign-in") && !currentUrl.includes("/sign-up");

      let hasChatInterface = false;
      try {
        hasChatInterface = await page.evaluate(() => {
          const composer = document.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
          return Boolean(composer && composer.getClientRects().length > 0);
        });
      } catch {}

      if (notSignIn && hasChatInterface) {
        fs.writeFileSync(GROK_AUTH_FILE, JSON.stringify(lastCookies, null, 2));
        await page.waitForTimeout(1500).catch(() => {});
        await context.close().catch(() => {});
        return { ok: true };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
  } finally {
    if (lastCookies.length) {
      try {
        fs.writeFileSync(GROK_AUTH_FILE, JSON.stringify(lastCookies, null, 2));
      } catch {}
    }
    await context.close().catch(() => {});
  }

  return { ok: fs.existsSync(GROK_AUTH_FILE) };
}
