// Парсинг slash-команд /code и /skill для code-agent.

export function parseAgentTaskPrompt(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return null;

  const skillMatch = text.match(/^\/skill\s+([a-z0-9_-]+)(?:\s+(.*))?$/i);
  if (skillMatch) {
    const task = (skillMatch[2] || "").trim();
    return {
      mode: "code",
      skillId: skillMatch[1],
      task,
      empty: !task,
    };
  }

  if (text === "/code" || text.startsWith("/code ")) {
    const task = text.slice(5).trim();
    return {
      mode: "code",
      command: "code",
      skillId: null,
      task,
      empty: !task,
    };
  }

  const fileMatch = text.match(/^\/(?:file|read)(?:\s+([\s\S]*))?$/i);
  if (fileMatch) {
    const raw = (fileMatch[1] || "").trim();
    if (!raw) {
      return {
        mode: "code",
        command: "file",
        skillId: null,
        task: "",
        empty: true,
      };
    }
    let filePath = raw;
    let instruction = "";
    const quotedMatch = raw.match(/^("([^"]+)"|'([^']+)'|(\S+))(?:\s+([\s\S]*))?$/);
    if (quotedMatch) {
      filePath = quotedMatch[2] || quotedMatch[3] || quotedMatch[4];
      instruction = (quotedMatch[5] || "").trim();
    }
    const task = instruction
      ? `Прочитай файл "${filePath}" и выполни задачу: ${instruction}`
      : `Прочитай и проанализируй файл "${filePath}". Дай подробный обзор его структуры, назначения и ключевого содержимого.`;
    return {
      mode: "code",
      command: "file",
      skillId: null,
      task,
      empty: false,
    };
  }

  const folderMatch = text.match(/^\/(?:folder|dir)(?:\s+([\s\S]*))?$/i);
  if (folderMatch) {
    const raw = (folderMatch[1] || "").trim();
    if (!raw) {
      return {
        mode: "code",
        command: "folder",
        skillId: null,
        task: "",
        empty: true,
      };
    }
    let folderPath = raw;
    let instruction = "";
    const quotedMatch = raw.match(/^("([^"]+)"|'([^']+)'|(\S+))(?:\s+([\s\S]*))?$/);
    if (quotedMatch) {
      folderPath = quotedMatch[2] || quotedMatch[3] || quotedMatch[4];
      instruction = (quotedMatch[5] || "").trim();
    }
    const task = instruction
      ? `Изучи содержимое директории "${folderPath}" и выполни задачу: ${instruction}`
      : `Изучи структуру файлов и подпапок в директории "${folderPath}". Дай структурированный обзор файлов и их роли в проекте.`;
    return {
      mode: "code",
      command: "folder",
      skillId: null,
      task,
      empty: false,
    };
  }

  const termMatch = text.match(/^\/(?:terminal|term|cmd|sh|run)(?:\s+([\s\S]*))?$/i);
  if (termMatch) {
    const raw = (termMatch[1] || "").trim();
    if (!raw) {
      return {
        mode: "code",
        command: "terminal",
        skillId: null,
        task: "",
        empty: true,
      };
    }
    const task = `Выполни в терминале команду: ${raw}\nЗапусти соответствующий инструмент (run_command или run_shell), изучи вывод консоли (stdout/stderr) и подробно объясни результат пользователю.`;
    return {
      mode: "code",
      command: "terminal",
      skillId: null,
      task,
      empty: false,
    };
  }

  const psMatch = text.match(/^\/(?:powershell|pwsh|ps)(?:\s+([\s\S]*))?$/i);
  if (psMatch) {
    const raw = (psMatch[1] || "").trim();
    if (!raw) {
      return {
        mode: "code",
        command: "powershell",
        skillId: null,
        task: "",
        empty: true,
      };
    }
    const task = `Выполни в Windows PowerShell команду или скрипт:\n${raw}\nЗапусти соответствующий инструмент (run_command с cmd "powershell" или run_shell с shell "powershell"), изучи вывод консоли (stdout/stderr) и подробно объясни результат пользователю.`;
    return {
      mode: "code",
      command: "powershell",
      skillId: null,
      task,
      empty: false,
    };
  }

  return null;
}

export function resolveAgentTaskInput(prompt, {
  skillId = null,
  coderMode = false,
  hardwareMode = false,
  autoCodeMode = false,
  autoBrowserMode = false,
} = {}) {
  const parsed = parseAgentTaskPrompt(prompt);
  if (parsed) {
    return {
      run: true,
      task: parsed.task,
      skillId: parsed.skillId || skillId || null,
      empty: parsed.empty,
      slash: true,
      browserOnly: false,
    };
  }

  if (coderMode || hardwareMode || autoCodeMode || autoBrowserMode) {
    return {
      run: true,
      task: prompt,
      skillId: skillId || null,
      empty: !String(prompt || "").trim(),
      slash: false,
      browserOnly: autoBrowserMode && !coderMode && !hardwareMode,
    };
  }

  return { run: false, browserOnly: false };
}
