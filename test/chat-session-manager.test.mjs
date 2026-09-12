import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ChatSessionManager, isPrefix } from "../api/chat-session-manager.mjs";

describe("ChatSessionManager", () => {
  let manager;

  beforeEach(() => {
    manager = new ChatSessionManager({ maxSessions: 3, ttlMs: 1000 });
  });

  it("identifies matching prefix correctly", () => {
    const existing = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ];
    const incoming = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "how are you?" },
    ];
    assert.equal(isPrefix(existing, incoming), true);

    const diverged = [
      { role: "system", content: "sys" },
      { role: "user", content: "different question" },
    ];
    assert.equal(isPrefix(existing, diverged), false);
  });

  it("detects continuation by prefix matching without explicit ID", () => {
    const msgsTurn1 = [
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
    ];

    manager.saveSession({
      sessionId: "s1",
      provider: "qwen",
      model: "qwen3.7-plus",
      serverChatId: "chat_123",
      lastParentId: "msg_1",
      messages: msgsTurn1,
    });

    const msgsTurn2 = [
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "Hi there!" },
      { role: "user", content: "Tell me a joke" },
    ];

    const resolution = manager.resolveSession({
      req: { headers: {} },
      body: { messages: msgsTurn2 },
      provider: "qwen",
      model: "qwen3.7-plus",
    });

    assert.equal(resolution.isContinuation, true);
    assert.equal(resolution.session.serverChatId, "chat_123");
    assert.equal(resolution.session.lastParentId, "msg_1");
    assert.equal(resolution.newMessages.length, 2);
    assert.equal(resolution.newMessages[0].role, "assistant");
    assert.equal(resolution.newMessages[1].content, "Tell me a joke");
  });

  it("supports explicit session id header", () => {
    const msgsTurn1 = [{ role: "user", content: "start" }];
    manager.saveSession({
      sessionId: "my-custom-id",
      provider: "qwen",
      model: "qwen3.7-plus",
      serverChatId: "chat_custom",
      lastParentId: "msg_init",
      messages: msgsTurn1,
    });

    const msgsTurn2 = [
      { role: "user", content: "start" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "next" },
    ];

    const resolution = manager.resolveSession({
      req: { headers: { "x-session-id": "my-custom-id" } },
      body: { messages: msgsTurn2 },
      provider: "qwen",
      model: "qwen3.7-plus",
    });

    assert.equal(resolution.isContinuation, true);
    assert.equal(resolution.session.serverChatId, "chat_custom");
    assert.equal(resolution.newMessages.length, 2);
  });

  it("resets session if conversation diverged (e.g. edit/retry)", () => {
    manager.saveSession({
      sessionId: "diverge-test",
      provider: "qwen",
      model: "qwen3.7-plus",
      serverChatId: "chat_old",
      lastParentId: "msg_old",
      messages: [{ role: "user", content: "first question" }],
    });

    const resolution = manager.resolveSession({
      req: { headers: { "x-session-id": "diverge-test" } },
      body: { messages: [{ role: "user", content: "edited question" }] },
      provider: "qwen",
      model: "qwen3.7-plus",
    });

    assert.equal(resolution.isContinuation, false);
    assert.equal(resolution.session, null);
  });
});
