import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_UA,
  getMistralBrowserLaunchOptions,
  getMistralBrowserProxy,
  resetMistralBrowserProxy,
  scheduleMistralBrowserIdleClose,
} from "../src/providers/mistral/browser-proxy.mjs";

describe("mistral browser proxy launch configuration", () => {
  it("exports lifecycle and helper functions", () => {
    assert.equal(typeof getMistralBrowserProxy, "function");
    assert.equal(typeof resetMistralBrowserProxy, "function");
    assert.equal(typeof scheduleMistralBrowserIdleClose, "function");
    assert.equal(typeof getMistralBrowserLaunchOptions, "function");
    assert.ok(DEFAULT_UA.includes("Chrome/133.0.0.0"));
  });

  it("defaults to headless mode without off-screen window positioning", () => {
    const options = getMistralBrowserLaunchOptions({});
    assert.equal(options.headless, true);
    assert.deepEqual(options.viewport, { width: 1280, height: 900 });
    assert.deepEqual(options.ignoreDefaultArgs, ["--enable-automation"]);
    assert.equal(options.userAgent, DEFAULT_UA);
    assert.equal(options.locale, "ru-RU");

    const args = options.args;
    assert.ok(!args.includes("--window-position=-24000,-24000"));
    assert.ok(!args.includes("--window-size=1280,900"));
    assert.ok(args.includes("--disable-blink-features=AutomationControlled"));
  });

  it("switches to headed mode when MISTRAL_HEADLESS=0 is explicitly set", () => {
    const options = getMistralBrowserLaunchOptions({ MISTRAL_HEADLESS: "0" });
    assert.equal(options.headless, false);
    assert.ok(!options.args.includes("--window-position=-24000,-24000"));
    assert.ok(options.args.includes("--disable-blink-features=AutomationControlled"));
  });

  it("remains headless when MISTRAL_HEADLESS=1 is explicitly set", () => {
    const options = getMistralBrowserLaunchOptions({ MISTRAL_HEADLESS: "1" });
    assert.equal(options.headless, true);
    assert.ok(!options.args.includes("--window-position=-24000,-24000"));
    assert.ok(options.args.includes("--disable-blink-features=AutomationControlled"));
  });

  it("accurately detects thinking/vibing status phrases", async () => {
    const { isMistralThinkingStatus } = await import("../src/providers/mistral/browser-proxy.mjs");
    assert.equal(isMistralThinkingStatus("Vibing"), true);
    assert.equal(isMistralThinkingStatus("vibing..."), true);
    assert.equal(isMistralThinkingStatus("Думаю"), true);
    assert.equal(isMistralThinkingStatus("думаю..."), true);
    assert.equal(isMistralThinkingStatus("Thinking"), true);
    assert.equal(isMistralThinkingStatus("Searching the web"), true);
    assert.equal(isMistralThinkingStatus("Поиск в интернете"), true);
    assert.equal(isMistralThinkingStatus("Привет! Чем я могу помочь?"), false);
    assert.equal(isMistralThinkingStatus(""), false);
  });
});
