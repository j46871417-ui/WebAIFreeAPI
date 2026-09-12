import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAgentTaskPrompt, resolveAgentTaskInput } from "../src/code-agent/task-input.mjs";
import { shouldAutoRunCodeTask } from "../src/window-app/server.mjs";

describe("agent task commands (/file, /folder, /terminal, /code, /skill)", () => {
  it("parses empty commands correctly with empty=true", () => {
    assert.deepEqual(parseAgentTaskPrompt("/code"), {
      mode: "code",
      command: "code",
      skillId: null,
      task: "",
      empty: true,
    });

    assert.deepEqual(parseAgentTaskPrompt("/file"), {
      mode: "code",
      command: "file",
      skillId: null,
      task: "",
      empty: true,
    });

    assert.deepEqual(parseAgentTaskPrompt("/folder"), {
      mode: "code",
      command: "folder",
      skillId: null,
      task: "",
      empty: true,
    });

    assert.deepEqual(parseAgentTaskPrompt("/terminal"), {
      mode: "code",
      command: "terminal",
      skillId: null,
      task: "",
      empty: true,
    });

    assert.deepEqual(parseAgentTaskPrompt("/cmd"), {
      mode: "code",
      command: "terminal",
      skillId: null,
      task: "",
      empty: true,
    });
  });

  it("parses /file and /read with file path and optional instructions", () => {
    const res1 = parseAgentTaskPrompt("/file src/server.mjs");
    assert.equal(res1.empty, false);
    assert.equal(res1.command, "file");
    assert.match(res1.task, /src\/server\.mjs/);

    const res2 = parseAgentTaskPrompt('/read "package.json" проверь зависимости');
    assert.equal(res2.empty, false);
    assert.equal(res2.command, "file");
    assert.match(res2.task, /package\.json/);
    assert.match(res2.task, /проверь зависимости/);
  });

  it("parses /folder and /dir with directory path and optional instructions", () => {
    const res1 = parseAgentTaskPrompt("/folder src/code-agent");
    assert.equal(res1.empty, false);
    assert.equal(res1.command, "folder");
    assert.match(res1.task, /src\/code-agent/);

    const res2 = parseAgentTaskPrompt("/dir test найди тесты агента");
    assert.equal(res2.empty, false);
    assert.equal(res2.command, "folder");
    assert.match(res2.task, /test/);
    assert.match(res2.task, /найди тесты агента/);
  });

  it("parses /terminal, /term, /cmd, /sh, /run with command string", () => {
    for (const prefix of ["/terminal", "/term", "/cmd", "/sh", "/run"]) {
      const res = parseAgentTaskPrompt(`${prefix} npm test`);
      assert.equal(res.empty, false, prefix);
      assert.equal(res.command, "terminal", prefix);
      assert.match(res.task, /npm test/, prefix);
    }
  });

  it("parses /powershell, /pwsh, /ps with command string", () => {
    for (const prefix of ["/powershell", "/pwsh", "/ps"]) {
      const emptyRes = parseAgentTaskPrompt(prefix);
      assert.equal(emptyRes.empty, true, prefix);
      assert.equal(emptyRes.command, "powershell", prefix);

      const res = parseAgentTaskPrompt(`${prefix} Get-Process | Select-Object -First 5`);
      assert.equal(res.empty, false, prefix);
      assert.equal(res.command, "powershell", prefix);
      assert.match(res.task, /Get-Process/, prefix);
    }
  });

  it("resolves input for agent execution", () => {
    const input = resolveAgentTaskInput("/terminal git status");
    assert.equal(input.run, true);
    assert.equal(input.slash, true);
    assert.equal(input.browserOnly, false);
    assert.match(input.task, /git status/);

    const psInput = resolveAgentTaskInput("/powershell dir");
    assert.equal(psInput.run, true);
    assert.equal(psInput.slash, true);
    assert.match(psInput.task, /Windows PowerShell/);
  });

  it("excludes slash commands from shouldAutoRunCodeTask", () => {
    assert.equal(shouldAutoRunCodeTask("/file src/test.js"), false);
    assert.equal(shouldAutoRunCodeTask("/folder src/"), false);
    assert.equal(shouldAutoRunCodeTask("/term npm test"), false);
    assert.equal(shouldAutoRunCodeTask("/powershell Get-Process"), false);
    assert.equal(shouldAutoRunCodeTask("/ps dir"), false);
    assert.equal(shouldAutoRunCodeTask("/code напиши тест"), false);
  });
});
