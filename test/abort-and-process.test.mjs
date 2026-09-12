import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { streamSse } from "../src/providers/deepseek/sse.mjs";
import { killChildProcessTree } from "../src/code-agent/executor.mjs";

describe("streamSse cancellation", () => {
  it("immediately aborts reader when signal is already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();

    let readerCancelled = false;
    const mockRes = {
      body: {
        getReader: () => ({
          read: async () => ({ done: false, value: new Uint8Array([1, 2, 3]) }),
          cancel: () => { readerCancelled = true; },
        }),
      },
    };

    await assert.rejects(
      () => streamSse(mockRes, false, null, abortController.signal),
      (err) => {
        assert.equal(err.name, "AbortError");
        return true;
      },
    );
    assert.equal(readerCancelled, true);
  });

  it("cancels reader when signal triggers during stream reading", async () => {
    const abortController = new AbortController();

    let readerCancelled = false;
    let readCount = 0;
    const encoder = new TextEncoder();

    const mockRes = {
      body: {
        getReader: () => ({
          read: async () => {
            readCount++;
            if (readCount === 1) {
              const chunk = encoder.encode('data: {"v":"hello"}\n\n');
              return { done: false, value: chunk };
            }
            abortController.abort();
            return new Promise((resolve) => setTimeout(() => resolve({ done: true }), 20));
          },
          cancel: () => { readerCancelled = true; },
        }),
      },
    };

    const deltas = [];
    await assert.rejects(
      () => streamSse(mockRes, false, (text) => deltas.push(text), abortController.signal),
      (err) => {
        assert.equal(err.name, "AbortError");
        return true;
      },
    );
    assert.equal(readerCancelled, true);
    assert.ok(deltas.length >= 1);
  });
});

describe("killChildProcessTree", () => {
  it("safely handles null or missing child pid without error", () => {
    assert.doesNotThrow(() => killChildProcessTree(null));
    assert.doesNotThrow(() => killChildProcessTree({}));
    assert.doesNotThrow(() => killChildProcessTree({ pid: null }));
  });

  it("calls child.kill or taskkill gracefully without throwing unhandled exceptions", () => {
    const mockChild = {
      pid: 99999999,
      kill: () => {},
    };
    assert.doesNotThrow(() => killChildProcessTree(mockChild));
  });
});
