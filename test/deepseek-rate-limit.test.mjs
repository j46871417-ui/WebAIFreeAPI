import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  DeepSeekRateLimiter,
  isDeepSeekRateLimitError,
  sleep,
} from "../src/providers/deepseek/rate-limiter.mjs";

describe("DeepSeek rate limiter", () => {
  it("enforces minimum interval between consecutive requests", async () => {
    const intervalMs = 120;
    const limiter = new DeepSeekRateLimiter({ intervalMs, baseRetryDelayMs: 20 });

    const timestamps = [];
    const run = async (id) => {
      return limiter.schedule(async () => {
        timestamps.push(Date.now());
        return id;
      });
    };

    const results = await Promise.all([run(1), run(2), run(3)]);
    assert.deepEqual(results, [1, 2, 3]);
    assert.equal(timestamps.length, 3);

    const diff1 = timestamps[1] - timestamps[0];
    const diff2 = timestamps[2] - timestamps[1];

    // Допускаем небольшую погрешность таймера Node.js (-15ms)
    assert.ok(diff1 >= intervalMs - 15, `diff1 was ${diff1}ms, expected >= ${intervalMs - 15}ms`);
    assert.ok(diff2 >= intervalMs - 15, `diff2 was ${diff2}ms, expected >= ${intervalMs - 15}ms`);
  });

  it("identifies rate limit errors correctly", () => {
    assert.equal(isDeepSeekRateLimitError(new Error("HTTP 429 Too Many Requests")), true);
    assert.equal(isDeepSeekRateLimitError(new Error("Server is busy, please try again later")), true);
    assert.equal(isDeepSeekRateLimitError(new Error("Rate limit exceeded")), true);
    assert.equal(isDeepSeekRateLimitError(new Error("Auth required"), 429), true);
    assert.equal(isDeepSeekRateLimitError(new Error("Auth required at /api: HTTP 401")), false);
    assert.equal(isDeepSeekRateLimitError(new Error("Connection refused")), false);
  });

  it("retries on 429 and succeeds when upstream recovers", async () => {
    const limiter = new DeepSeekRateLimiter({
      intervalMs: 10,
      baseRetryDelayMs: 20,
      maxRetries: 3,
    });

    let attempts = 0;
    const result = await limiter.executeWithRetry(async () => {
      attempts++;
      if (attempts < 3) {
        const err = new Error("HTTP 429 Too Many Requests");
        err.status = 429;
        throw err;
      }
      return "success after retry";
    });

    assert.equal(result, "success after retry");
    assert.equal(attempts, 3);
  });

  it("does not retry on non-rate-limit errors", async () => {
    const limiter = new DeepSeekRateLimiter({
      intervalMs: 10,
      baseRetryDelayMs: 20,
      maxRetries: 3,
    });

    let attempts = 0;
    await assert.rejects(
      async () => {
        await limiter.executeWithRetry(async () => {
          attempts++;
          throw new Error("Invalid payload: code 40001");
        });
      },
      (err) => {
        assert.equal(err.message, "Invalid payload: code 40001");
        return true;
      }
    );

    assert.equal(attempts, 1);
  });
});
