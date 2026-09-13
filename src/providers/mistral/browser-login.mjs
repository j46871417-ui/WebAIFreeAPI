import fs from "node:fs";
import { MISTRAL_AUTH_FILE } from "../registry.mjs";
import { launchPersistentDeepSeekContext } from "../../browser/launch.mjs";
import { DEFAULT_BROWSER_PROFILE } from "../../config.mjs";

export async function loginMistralAndSave() {
  console.log("Открываем окно для входа в Mistral Le Chat...");
  console.log("Пожалуйста, войди в свой аккаунт.");
  console.log("Как только авторизуешься и увидишь интерфейс чата, закрой окно.");

  const { getChatGPTChromium } = await import("../chatgpt/engine.mjs");
  const chromium = await getChatGPTChromium();

  const context = await launchPersistentDeepSeekContext(
    chromium,
    DEFAULT_BROWSER_PROFILE + "_mistral",
    false
  );

  const page = context.pages()[0] || await context.newPage();
  await page.goto("https://chat.mistral.ai/", { waitUntil: "domcontentloaded" });

  return new Promise((resolve) => {
    context.on("close", async () => {
      console.log("Браузер закрыт. Сохраняем сессию Mistral...");
      const cookies = await context.cookies();
      fs.writeFileSync(MISTRAL_AUTH_FILE, JSON.stringify(cookies, null, 2));
      console.log(`Сессия Mistral сохранена в ${MISTRAL_AUTH_FILE}`);
      resolve();
    });
  });
}
