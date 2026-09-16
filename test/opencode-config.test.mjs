import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildOpenCodeConfig } from "../src/window-app/server.mjs";

describe("OpenCode configuration generator", () => {
  it("generates valid OpenCode config with all 5 providers and custom port/keys", () => {
    const keys = {
      qwen: "sk-qwen-test",
      deepseek: "sk-deepseek-test",
      chatgpt: "sk-chatgpt-test",
      grok: "sk-grok-test",
      mistral: "sk-mistral-test",
    };
    const config = buildOpenCodeConfig({ port: 4317, keys });

    assert.equal(config.$schema, "https://opencode.ai/config.json");
    assert.equal(typeof config.model, "string");
    assert.equal(typeof config.small_model, "string");

    const providers = config.provider;
    assert.ok(providers, "provider object should exist");

    const expectedProviders = [
      "ai-free-qwen",
      "ai-free-deepseek",
      "ai-free-chatgpt",
      "ai-free-grok",
      "ai-free-mistral",
      "ai-free-claude",
      "ai-free-gemini",
    ];

    for (const p of expectedProviders) {
      assert.ok(providers[p], `Provider ${p} should be present in OpenCode config`);
      assert.equal(providers[p].npm, "@ai-sdk/openai-compatible");
      assert.equal(providers[p].options.baseURL, "http://127.0.0.1:4317/v1");
      assert.ok(Object.keys(providers[p].models).length > 0, `${p} should have configured models`);
    }

    assert.ok(providers["ai-free-claude"].models["claude-3-7-sonnet"]);
    assert.ok(providers["ai-free-gemini"].models["gemini-3.1-pro"]);

    assert.equal(providers["ai-free-qwen"].options.apiKey, "sk-qwen-test");
    assert.equal(providers["ai-free-deepseek"].options.apiKey, "sk-deepseek-test");
    assert.equal(providers["ai-free-chatgpt"].options.apiKey, "sk-chatgpt-test");
    assert.equal(providers["ai-free-grok"].options.apiKey, "sk-grok-test");
    assert.equal(providers["ai-free-mistral"].options.apiKey, "sk-mistral-test");

    // Specific model checks
    assert.ok(providers["ai-free-grok"].models["grok-3"]);
    assert.ok(providers["ai-free-mistral"].models["mistral-large"]);
    assert.ok(providers["ai-free-chatgpt"].models["gpt-5.5-instant"]);
    assert.ok(providers["ai-free-deepseek"].models["deepseek-chat"]);
    assert.ok(providers["ai-free-qwen"].models["qwen3.7-max"]);
  });

  it("handles default options when port and keys are omitted", () => {
    const config = buildOpenCodeConfig();
    assert.equal(config.provider["ai-free-deepseek"].options.baseURL, "http://127.0.0.1:4317/v1");
    assert.equal(config.provider["ai-free-deepseek"].options.apiKey, undefined);
  });
});
