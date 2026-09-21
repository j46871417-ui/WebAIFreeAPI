import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { isMistralAuthUsable, evaluateMistralPageState } from "../src/providers/mistral/auth-utils.mjs";

describe("Mistral auth verification", () => {
  it("recognizes valid Mistral session even when anonymousUser cookie is present", () => {
    const cookies = [
      { name: "anonymousUser", value: "anon-uuid-123", domain: ".mistral.ai", path: "/" },
      { name: "cf_clearance", value: "cf-token-abc", domain: ".mistral.ai", path: "/" },
      { name: "csrftoken", value: "csrf-xyz", domain: "chat.mistral.ai", path: "/" },
    ];

    assert.equal(isMistralAuthUsable(cookies), true);
  });

  it("rejects cookies from unrelated domains", () => {
    const cookies = [
      { name: "session", value: "some-session", domain: ".google.com", path: "/" },
    ];

    assert.equal(isMistralAuthUsable(cookies), false);
  });

  it("rejects empty or invalid cookie arrays", () => {
    assert.equal(isMistralAuthUsable([]), false);
    assert.equal(isMistralAuthUsable(null), false);
    assert.equal(isMistralAuthUsable(undefined), false);
  });

  it("evaluates logged in state when composer is present and no visible sign-in buttons exist", () => {
    const state = evaluateMistralPageState({
      url: "https://chat.mistral.ai/chat",
      hasComposer: true,
      visibleSignInButtons: [],
    });

    assert.equal(state.isLoggedIn, true);
    assert.equal(state.isAuthRoute, false);
  });

  it("rejects logged in state when visible sign in button exists", () => {
    const state = evaluateMistralPageState({
      url: "https://chat.mistral.ai/chat",
      hasComposer: true,
      visibleSignInButtons: ["sign in"],
    });

    assert.equal(state.isLoggedIn, false);
  });

  it("identifies auth/login redirect routes as in-progress", () => {
    const state = evaluateMistralPageState({
      url: "https://auth.mistral.ai/u/login",
      hasComposer: false,
      visibleSignInButtons: [],
    });

    assert.equal(state.isLoggedIn, false);
    assert.equal(state.isAuthRoute, true);
  });
});
