// Тесты /code-агента: парсер tool-call'ов и валидаторы аргументов команд.

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { extractFirstJsonObject, parseToolCall } from "../src/code-agent/parser.mjs";
import {
  looksLikePath,
  resolveWorkspacePath,
  truncateOutput,
  validateCommandArgs,
} from "../src/code-agent/executor.mjs";
import { COMMAND_CATALOG } from "../src/state/settings.mjs";

describe("parseToolCall", () => {
  it("parses bare JSON object", () => {
    assert.deepEqual(parseToolCall('{"tool":"read_file","path":"a.txt"}'), {
      tool: "read_file",
      path: "a.txt",
    });
  });

  it("extracts JSON from markdown fence", () => {
    const text = '```json\n{"tool":"finish","message":"done"}\n```';
    assert.deepEqual(parseToolCall(text), { tool: "finish", message: "done" });
  });

  it("extracts first JSON object from surrounding prose", () => {
    const text = 'Here is my call: {"tool":"list_files","path":"."} ok?';
    assert.deepEqual(parseToolCall(text), { tool: "list_files", path: "." });
  });

  it("returns null when no JSON object at all", () => {
    assert.equal(parseToolCall("Just some text"), null);
    assert.equal(parseToolCall(""), null);
    assert.equal(parseToolCall(null), null);
  });

  it("returns null when JSON lacks tool field", () => {
    assert.equal(parseToolCall('{"path":"x.txt"}'), null);
  });

  it("returns null on malformed JSON", () => {
    assert.equal(parseToolCall("{tool:"), null);
  });
});

describe("extractFirstJsonObject", () => {
  it("returns null when no opening brace", () => {
    assert.equal(extractFirstJsonObject("no braces"), null);
  });

  it("handles nested objects", () => {
    const text = 'before {"a":{"b":"c"}} after';
    assert.equal(extractFirstJsonObject(text), '{"a":{"b":"c"}}');
  });

  it("respects strings (ignores braces inside)", () => {
    const text = '{"key":"value with } brace"}';
    assert.equal(extractFirstJsonObject(text), text);
  });

  it("respects escaped quotes", () => {
    const text = '{"key":"escaped \\" still string"}';
    assert.equal(extractFirstJsonObject(text), text);
  });
});

describe("validateCommandArgs", () => {
  it("blocks npm install/add/remove/publish", () => {
    assert.throws(() => validateCommandArgs("/tmp", "npm", ["install"]));
    assert.throws(() => validateCommandArgs("/tmp", "npm", ["add", "left-pad"]));
    assert.throws(() => validateCommandArgs("/tmp", "npm", ["publish"]));
  });

  it("blocks node -e / --eval / -p / --print", () => {
    assert.throws(() => validateCommandArgs("/tmp", "node", ["-e", "x"]));
    assert.throws(() => validateCommandArgs("/tmp", "node", ["--eval", "x"]));
    assert.throws(() => validateCommandArgs("/tmp", "node", ["-p", "x"]));
  });

  it("blocks python -c / -m", () => {
    assert.throws(() => validateCommandArgs("/tmp", "python", ["-c", "x"]));
    assert.throws(() => validateCommandArgs("/tmp", "python3", ["-m", "x"]));
  });

  it("blocks shell operators in args", () => {
    assert.throws(() => validateCommandArgs("/tmp", "ls", ["a;b"]));
    assert.throws(() => validateCommandArgs("/tmp", "ls", ["a&&b"]));
    assert.throws(() => validateCommandArgs("/tmp", "ls", ["a|b"]));
    assert.throws(() => validateCommandArgs("/tmp", "ls", ["`whoami`"]));
  });

  it("blocks network URLs in args", () => {
    assert.throws(() => validateCommandArgs("/tmp", "ls", ["http://x"]));
    assert.throws(() => validateCommandArgs("/tmp", "ls", ["https://x"]));
  });

  it("accepts normal node + relative path", () => {
    // Path inside workspace should not throw.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-"));
    try {
      assert.doesNotThrow(() => validateCommandArgs(dir, "node", ["script.js"]));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("COMMAND_CATALOG.rm validateArgs", () => {
  const v = COMMAND_CATALOG.rm.validateArgs;

  it("blocks --recursive", () => {
    assert.throws(() => v(["--recursive", "x"]));
  });

  it("blocks --no-preserve-root", () => {
    assert.throws(() => v(["--no-preserve-root"]));
  });

  it("blocks -r, -R, -rf, -Rf, -fR", () => {
    assert.throws(() => v(["-r"]));
    assert.throws(() => v(["-R"]));
    assert.throws(() => v(["-rf"]));
    assert.throws(() => v(["-Rf"]));
    assert.throws(() => v(["-fR"]));
    assert.throws(() => v(["-fr"]));
  });

  it("allows simple rm without recursive flag", () => {
    assert.doesNotThrow(() => v(["file.txt"]));
    assert.doesNotThrow(() => v(["-f", "file.txt"]));
  });
});

describe("COMMAND_CATALOG.git validateArgs", () => {
  const v = COMMAND_CATALOG.git.validateArgs;

  it("blocks clone, fetch, pull", () => {
    assert.throws(() => v(["clone", "https://x"]));
    assert.throws(() => v(["fetch"]));
    assert.throws(() => v(["pull"]));
  });

  it("blocks push --force / -f", () => {
    assert.throws(() => v(["push", "--force"]));
    assert.throws(() => v(["push", "-f"]));
    assert.throws(() => v(["push", "+"]));
  });

  it("blocks remote add", () => {
    assert.throws(() => v(["remote", "add", "origin", "x"]));
  });

  it("blocks submodule add", () => {
    assert.throws(() => v(["submodule", "add", "x"]));
  });

  it("allows normal git ops", () => {
    assert.doesNotThrow(() => v(["status"]));
    assert.doesNotThrow(() => v(["log"]));
    assert.doesNotThrow(() => v(["diff"]));
    assert.doesNotThrow(() => v(["add", "."]));
    assert.doesNotThrow(() => v(["commit", "-m", "msg"]));
    assert.doesNotThrow(() => v(["push"]));
    assert.doesNotThrow(() => v(["push", "origin", "main"]));
  });
});

describe("COMMAND_CATALOG.find validateArgs", () => {
  const v = COMMAND_CATALOG.find.validateArgs;

  it("blocks -exec, -execdir, -delete, -ok", () => {
    assert.throws(() => v([".", "-exec", "rm", "{}"]));
    assert.throws(() => v([".", "-execdir", "x"]));
    assert.throws(() => v([".", "-delete"]));
    assert.throws(() => v([".", "-ok", "x"]));
  });

  it("allows normal find queries", () => {
    assert.doesNotThrow(() => v([".", "-name", "*.js"]));
    assert.doesNotThrow(() => v([".", "-type", "f"]));
  });
});

describe("COMMAND_CATALOG.chmod validateArgs", () => {
  const v = COMMAND_CATALOG.chmod.validateArgs;

  it("blocks 777, a+rwx, ugo+rwx", () => {
    assert.throws(() => v(["777", "file"]));
    assert.throws(() => v(["a+rwx", "file"]));
    assert.throws(() => v(["ugo+rwx", "file"]));
  });

  it("allows normal chmod", () => {
    assert.doesNotThrow(() => v(["644", "file"]));
    assert.doesNotThrow(() => v(["+x", "file"]));
  });
});

describe("looksLikePath", () => {
  it("detects paths starting with . or /", () => {
    assert.equal(looksLikePath("./file"), true);
    assert.equal(looksLikePath("/abs"), true);
  });

  it("detects paths with slash", () => {
    assert.equal(looksLikePath("dir/file"), true);
  });

  it("detects common code file extensions", () => {
    assert.equal(looksLikePath("script.js"), true);
    assert.equal(looksLikePath("notes.md"), true);
    assert.equal(looksLikePath("README.txt"), true);
  });

  it("doesnt confuse non-path strings", () => {
    assert.equal(looksLikePath("hello"), false);
    assert.equal(looksLikePath("argument"), false);
  });
});

describe("resolveWorkspacePath", () => {
  let ws;

  it("setup", () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "rw-"));
  });

  it("resolves relative path inside workspace", () => {
    const result = resolveWorkspacePath(ws, "file.txt");
    assert.equal(result, path.join(ws, "file.txt"));
  });

  it("rejects path that escapes via ..", () => {
    assert.throws(() => resolveWorkspacePath(ws, "../outside"));
  });

  it("rejects absolute path pointing outside", () => {
    assert.throws(() => resolveWorkspacePath(ws, "/etc/passwd"));
  });

  it("rejects .git, node_modules, .env subdirs", () => {
    assert.throws(() => resolveWorkspacePath(ws, ".git/config"));
    assert.throws(() => resolveWorkspacePath(ws, "node_modules/foo"));
    assert.throws(() => resolveWorkspacePath(ws, ".env"));
  });

  it("rejects empty/null path", () => {
    assert.throws(() => resolveWorkspacePath(ws, ""));
    assert.throws(() => resolveWorkspacePath(ws, null));
  });

  it("cleanup", () => {
    fs.rmSync(ws, { recursive: true, force: true });
  });
});

describe("truncateOutput", () => {
  it("returns string unchanged when short", () => {
    assert.equal(truncateOutput("hello"), "hello");
  });

  it("truncates and adds marker when too long", () => {
    const long = "x".repeat(15000);
    const result = truncateOutput(long);
    assert.ok(result.length < long.length);
    assert.ok(result.endsWith("[truncated]"));
  });

  it("coerces non-strings", () => {
    assert.equal(truncateOutput(null), "");
    assert.equal(truncateOutput(undefined), "");
    assert.equal(truncateOutput(42), "42");
  });
});
