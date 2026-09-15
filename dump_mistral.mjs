import { chromium } from "patchright";
import fs from "fs";

async function dumpGrokDom() {
  const context = await chromium.launchPersistentContext(
    "C:\\Users\\gabov\\.deepseek-cli\\browser-profile_mistral",
    { headless: true, channel: "msedge" }
  );
  
  const page = (await context.pages())[0] || await context.newPage();
  console.log("Navigating to https://chat.mistral.ai/...");
  await page.goto("https://chat.mistral.ai/", { waitUntil: "domcontentloaded", timeout: 30000 });
  
  console.log("Waiting 5s...");
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  fs.writeFileSync("mistral-dom-dump.html", html);
  console.log("DOM сохранен в mistral-dom-dump.html");
  
  await context.close();
}

dumpGrokDom().catch(console.error);
