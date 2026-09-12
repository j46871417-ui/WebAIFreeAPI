import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { fetchWithTlsFallback } from "../src/providers/deepseek/fetch-safe.mjs";

describe("fetchWithTlsFallback", () => {
  it("exports fetchWithTlsFallback function", () => {
    assert.equal(typeof fetchWithTlsFallback, "function");
  });

  it("handles TLS certificate chain errors by falling back to NODE_TLS_REJECT_UNAUTHORIZED=0", async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    let attempts = 0;

    try {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

      globalThis.fetch = async (url, opts) => {
        attempts++;
        if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
          const err = new TypeError("fetch failed");
          err.cause = new Error("self-signed certificate in certificate chain");
          err.cause.code = "SELF_SIGNED_CERT_IN_CHAIN";
          throw err;
        }
        return { status: 200, ok: true };
      };

      const res = await fetchWithTlsFallback("https://example.test");
      assert.equal(res.status, 200);
      assert.equal(attempts, 2);
      assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalEnv;
      } else {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      }
    }
  });

  it("re-throws non-TLS errors without setting NODE_TLS_REJECT_UNAUTHORIZED", async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

    try {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

      globalThis.fetch = async () => {
        throw new Error("Generic network failure");
      };

      await assert.rejects(
        () => fetchWithTlsFallback("https://example.test"),
        /Generic network failure/,
      );
      assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalEnv;
      } else {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      }
    }
  });
});
