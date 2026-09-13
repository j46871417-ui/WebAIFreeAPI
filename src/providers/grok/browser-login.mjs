import fs from "node:fs";
import { GROK_AUTH_FILE } from "../registry.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";
import { DEFAULT_BROWSER_PROFILE } from "../../config.mjs";

export async function loginGrokAndSave() {
  console.log("Открываем окно для входа в Grok (X.com)...");
  console.log("Пожалуйста, войди в свой аккаунт X (Twitter).");
  console.log("Как только авторизуешься и увидишь интерфейс чата, закрой окно.");

  const { getChatGPTChromium } = await import("../chatgpt/engine.mjs");
  const chromium = await getChatGPTChromium();

  const context = await launchPersistentDeepSeekContext(
    chromium,
    DEFAULT_BROWSER_PROFILE + "_grok",
    false
  );

  const page = context.pages()[0] || await context.newPage();
  await page.goto("https://grok.com/", { waitUntil: "domcontentloaded" });

  return new Promise((resolve) => {
    context.on("close", async () => {
      console.log("Браузер закрыт. Сохраняем сессию Grok...");
      const cookies = await context.cookies();
      fs.writeFileSync(GROK_AUTH_FILE, JSON.stringify(cookies, null, 2));
      console.log(`Сессия Grok сохранена в ${GROK_AUTH_FILE}`);
      resolve();
    });
  });
}
