import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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

describe("spawnSyncSafe cancellation", () => {
  it("terminates long-running process when AbortSignal triggers", async () => {
    const { spawnSyncSafe } = await import("../src/code-agent/executor.mjs");
    const controller = new AbortController();

    const cmd = process.platform === "win32" ? "ping" : "sleep";
    const args = process.platform === "win32" ? ["127.0.0.1", "-n", "10"] : ["10"];

    // Cancel after 200ms
    setTimeout(() => controller.abort(), 200);

    const started = Date.now();
    const result = await spawnSyncSafe(cmd, args, {
      cwd: process.cwd(),
      timeoutMs: 15_000,
      signal: controller.signal,
    });

    const elapsed = Date.now() - started;
    assert.ok(elapsed < 4000, `Execution should be cancelled quickly, took ${elapsed}ms`);
    assert.ok(result.aborted === true || result.signal === "SIGTERM" || result.timedOut === false);
  });
});

describe("instance-registry ownership and lifecycle", () => {
  it("registers, reads, checks alive/ownership, and unregisters instance cleanly", async () => {
    const {
      registerInstance,
      readInstance,
      isProcessAlive,
      isProcessOwnedByInstance,
      unregisterInstance,
    } = await import("../src/process/instance-registry.mjs");

    const testId = "test-instance-" + Date.now();
    const registered = registerInstance({
      instanceId: testId,
      port: 54321,
      pid: process.pid,
      cwd: process.cwd(),
    });

    assert.equal(registered.instanceId, testId);
    assert.equal(registered.pid, process.pid);

    const readBack = readInstance(testId);
    assert.ok(readBack);
    assert.equal(readBack.port, 54321);
    assert.equal(readBack.pid, process.pid);

    // Current process should be alive and owned
    assert.equal(isProcessAlive(process.pid), true);
    assert.equal(isProcessOwnedByInstance(process.pid, readBack), true);

    // Fake dead pid should not be alive
    assert.equal(isProcessAlive(9999999), false);
    assert.equal(isProcessOwnedByInstance(9999999, readBack), false);

    unregisterInstance(testId);
    assert.equal(readInstance(testId), null);
  });

  it("cleans up browser profile lock files safely", async () => {
    const { killBrowserProfileProcesses } = await import("../src/process/instance-registry.mjs");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "browser-lock-test-"));
    try {
      const lock1 = path.join(tmpDir, "SingletonLock");
      const lock2 = path.join(tmpDir, "lockfile");
      fs.writeFileSync(lock1, "fake-lock", "utf8");
      fs.writeFileSync(lock2, "fake-lock", "utf8");
      assert.ok(fs.existsSync(lock1));
      assert.ok(fs.existsSync(lock2));

      killBrowserProfileProcesses(tmpDir);

      assert.equal(fs.existsSync(lock1), false, "SingletonLock should be unlinked");
      assert.equal(fs.existsSync(lock2), false, "lockfile should be unlinked");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
