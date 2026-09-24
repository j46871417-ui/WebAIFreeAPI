import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { runWithEmptyStreamRetry } from "../api/stream-retry.mjs";

describe("empty provider stream retry", () => {
  it("retries one empty upstream stream before any client delta", async () => {
    let attempts = 0;
    let refreshed = 0;
    const deltas = [];
    const result = await runWithEmptyStreamRetry({
      operation: async ({ onDelta }) => {
        attempts += 1;
        if (attempts === 1) throw emptyStreamError();
        onDelta("ok");
        return { text: "ok" };
      },
      onDelta: (delta) => deltas.push(delta),
      beforeRetry: async () => { refreshed += 1; },
    });

    assert.equal(attempts, 2);
    assert.equal(refreshed, 1);
    assert.deepEqual(deltas, ["ok"]);
    assert.equal(result.text, "ok");
  });

  it("does not retry after a partial delta was sent", async () => {
    let attempts = 0;
    await assert.rejects(() => runWithEmptyStreamRetry({
      operation: async ({ onDelta }) => {
        attempts += 1;
        onDelta("partial");
        throw emptyStreamError();
      },
      onDelta: () => {},
    }), /without response/);
    assert.equal(attempts, 1);
  });

  it("does not retry after a thinking delta was sent", async () => {
    let attempts = 0;
    const thinkingDeltas = [];
    await assert.rejects(() => runWithEmptyStreamRetry({
      operation: async ({ onThinking }) => {
        attempts += 1;
        onThinking("partial thought");
        throw emptyStreamError();
      },
      onDelta: () => {},
      onThinking: (delta) => thinkingDeltas.push(delta),
    }), /without response/);
    assert.equal(attempts, 1);
    assert.deepEqual(thinkingDeltas, ["partial thought"]);
  });

  it("succeeds when stream emits thinking before text", async () => {
    let attempts = 0;
    const deltas = [];
    const thinkingDeltas = [];
    const result = await runWithEmptyStreamRetry({
      requireDelta: true,
      operation: async ({ onDelta, onThinking }) => {
        attempts += 1;
        onThinking("reasoning plan");
        onDelta("final answer");
        return { text: "final answer", thinkingText: "reasoning plan" };
      },
      onDelta: (delta) => deltas.push(delta),
      onThinking: (delta) => thinkingDeltas.push(delta),
    });
    assert.equal(attempts, 1);
    assert.deepEqual(thinkingDeltas, ["reasoning plan"]);
    assert.deepEqual(deltas, ["final answer"]);
    assert.equal(result.text, "final answer");
  });

  it("succeeds when only thinking was emitted with requireDelta=true", async () => {
    const thinkingDeltas = [];
    const result = await runWithEmptyStreamRetry({
      requireDelta: true,
      operation: async ({ onThinking }) => {
        onThinking("just thinking");
        return { text: "", thinkingText: "just thinking" };
      },
      onDelta: () => {},
      onThinking: (delta) => thinkingDeltas.push(delta),
    });
    assert.deepEqual(thinkingDeltas, ["just thinking"]);
    assert.equal(result.thinkingText, "just thinking");
  });
});

function emptyStreamError() {
  const error = new Error("ended without response content");
  error.code = "EMPTY_UPSTREAM_STREAM";
  return error;
}
