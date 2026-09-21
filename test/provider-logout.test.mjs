import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  PROVIDERS,
  logoutProvider,
  GROK_AUTH_FILE,
  MISTRAL_AUTH_FILE,
  CLAUDE_AUTH_FILE,
} from "../src/providers/registry.mjs";
import { DEFAULT_AUTH_FILE } from "../src/config.mjs";
import { QWEN_AUTH_FILE } from "../src/providers/qwen/config.mjs";
import { CHATGPT_AUTH_FILE } from "../src/providers/chatgpt/config.mjs";

describe("Provider logout", () => {
  const allAuthFiles = [
    DEFAULT_AUTH_FILE,
    QWEN_AUTH_FILE,
    CHATGPT_AUTH_FILE,
    GROK_AUTH_FILE,
    MISTRAL_AUTH_FILE,
    CLAUDE_AUTH_FILE,
  ];

  const backups = new Map();
  for (const file of allAuthFiles) {
    backups.set(file, fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null);
  }

  afterEach(() => {
    for (const [file, content] of backups.entries()) {
      if (content !== null) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content, "utf-8");
      } else if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch {}
      }
    }
  });

  it("successfully logs out of Mistral by deleting auth file and resetting state", async () => {
    fs.mkdirSync(path.dirname(MISTRAL_AUTH_FILE), { recursive: true });
    const fakeCookies = [
      { name: "cf_clearance", value: "test", domain: ".mistral.ai", path: "/" },
      { name: "csrftoken", value: "test-csrf", domain: "chat.mistral.ai", path: "/" },
    ];
    fs.writeFileSync(MISTRAL_AUTH_FILE, JSON.stringify(fakeCookies), "utf-8");

    assert.equal(PROVIDERS.mistral.hasAuth(), true);

    const result = await logoutProvider("mistral");
    assert.equal(result.ok, true);
    assert.equal(result.hasAuth, false);
    assert.equal(fs.existsSync(MISTRAL_AUTH_FILE), false);
    assert.equal(PROVIDERS.mistral.hasAuth(), false);
  });

  it("successfully logs out of DeepSeek", async () => {
    fs.mkdirSync(path.dirname(DEFAULT_AUTH_FILE), { recursive: true });
    const fakeAuth = {
      token: "test-token",
      cookies: [{ name: "ds_session_id", value: "test", domain: ".deepseek.com", path: "/" }],
    };
    fs.writeFileSync(DEFAULT_AUTH_FILE, JSON.stringify(fakeAuth), "utf-8");

    assert.equal(PROVIDERS.deepseek.hasAuth(), true);

    const result = await logoutProvider("deepseek");
    assert.equal(result.ok, true);
    assert.equal(result.hasAuth, false);
    assert.equal(fs.existsSync(DEFAULT_AUTH_FILE), false);
    assert.equal(PROVIDERS.deepseek.hasAuth(), false);
  });

  it("successfully logs out of Qwen", async () => {
    fs.mkdirSync(path.dirname(QWEN_AUTH_FILE), { recursive: true });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
    const fakeJwt = `header.${payload}.sig`;
    fs.writeFileSync(QWEN_AUTH_FILE, JSON.stringify({ token: fakeJwt }), "utf-8");

    assert.equal(PROVIDERS.qwen.hasAuth(), true);

    const result = await logoutProvider("qwen");
    assert.equal(result.ok, true);
    assert.equal(result.hasAuth, false);
    assert.equal(fs.existsSync(QWEN_AUTH_FILE), false);
    assert.equal(PROVIDERS.qwen.hasAuth(), false);
  });

  it("successfully logs out of ChatGPT", async () => {
    fs.mkdirSync(path.dirname(CHATGPT_AUTH_FILE), { recursive: true });
    const fakeAuth = {
      sessionToken: "valid-session-token",
      cookies: [],
    };
    fs.writeFileSync(CHATGPT_AUTH_FILE, JSON.stringify(fakeAuth), "utf-8");

    assert.equal(PROVIDERS.chatgpt.hasAuth(), true);

    const result = await logoutProvider("chatgpt");
    assert.equal(result.ok, true);
    assert.equal(result.hasAuth, false);
    assert.equal(fs.existsSync(CHATGPT_AUTH_FILE), false);
    assert.equal(PROVIDERS.chatgpt.hasAuth(), false);
  });

  it("successfully logs out of Grok", async () => {
    fs.mkdirSync(path.dirname(GROK_AUTH_FILE), { recursive: true });
    const fakeCookies = [
      { name: "sso", value: "test", domain: ".grok.com", path: "/" },
    ];
    fs.writeFileSync(GROK_AUTH_FILE, JSON.stringify(fakeCookies), "utf-8");

    assert.equal(PROVIDERS.grok.hasAuth(), true);

    const result = await logoutProvider("grok");
    assert.equal(result.ok, true);
    assert.equal(result.hasAuth, false);
    assert.equal(fs.existsSync(GROK_AUTH_FILE), false);
    assert.equal(PROVIDERS.grok.hasAuth(), false);
  });

  it("successfully logs out of Claude", async () => {
    fs.mkdirSync(path.dirname(CLAUDE_AUTH_FILE), { recursive: true });
    const fakeCookies = [
      { name: "sessionKey", value: "test", domain: ".claude.ai", path: "/" },
    ];
    fs.writeFileSync(CLAUDE_AUTH_FILE, JSON.stringify(fakeCookies), "utf-8");

    assert.equal(PROVIDERS.claude.hasAuth(), true);

    const result = await logoutProvider("claude");
    assert.equal(result.ok, true);
    assert.equal(result.hasAuth, false);
    assert.equal(fs.existsSync(CLAUDE_AUTH_FILE), false);
    assert.equal(PROVIDERS.claude.hasAuth(), false);
  });

  it("throws on unknown provider", async () => {
    await assert.rejects(
      async () => logoutProvider("unknown-provider-id"),
      /Неизвестный провайдер: unknown-provider-id/,
    );
  });

  it("cleans up profile cookies if present", async () => {
    const { DEFAULT_BROWSER_PROFILE } = await import("../src/config.mjs");
    const profileCookies = path.join(DEFAULT_BROWSER_PROFILE, "Default", "Network", "Cookies");
    fs.mkdirSync(path.dirname(profileCookies), { recursive: true });
    fs.writeFileSync(profileCookies, "dummy-cookie-data");

    assert.equal(fs.existsSync(profileCookies), true);
    await logoutProvider("deepseek");
    assert.equal(fs.existsSync(profileCookies), false);
  });

  it("handles logout idempotently when auth file does not exist", async () => {
    if (fs.existsSync(MISTRAL_AUTH_FILE)) {
      fs.unlinkSync(MISTRAL_AUTH_FILE);
    }

    const result = await logoutProvider("mistral");
    assert.equal(result.ok, true);
    assert.equal(result.hasAuth, false);
  });
});
