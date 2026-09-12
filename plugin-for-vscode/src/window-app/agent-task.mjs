// Хелперы для запуска code-agent из window-app server.

import { resolveAgentTaskInput } from "../code-agent/task-input.mjs";

export const AGENT_TASK_EMPTY_HELP =
  "Команды агента для работы с кодом, файлами и терминалом:\n" +
  "• /file <путь> [вопрос] — прочитать и разобрать конкретный файл проекта\n" +
  "• /folder <путь> [вопрос] — изучить структуру директории и файлов\n" +
  "• /terminal <команда> (или /cmd, /term) — выполнить команду терминала\n" +
  "• /powershell <команда> (или /ps, /pwsh) — выполнить команду или скрипт в Windows PowerShell\n" +
  "• /code <задача> — комплексная автономная задача по кодовой базе\n" +
  "• /skill <id> <задача> — запустить задачу со специализированным навыком";

const PERSISTENT_CODE_CONTEXT_PROVIDERS = new Set(["chatgpt", "qwen", "deepseek"]);

export function resolveConversationAgentTask(prompt, conversation, {
  autoCodeMode = false,
  autoBrowserMode = false,
} = {}) {
  return resolveAgentTaskInput(prompt, {
    skillId: conversation.skillId || null,
    coderMode: conversation.coderMode === true,
    hardwareMode: conversation.hardwareMode === true,
    autoCodeMode,
    autoBrowserMode,
  });
}

export function buildAgentTaskOptions(conversation, body, { hardwareMode, systemPrompt, agentInput }) {
  const skillId = agentInput?.skillId || conversation.skillId || body.skillId || null;
  return {
    systemPrompt,
    skillId,
    browserOnly: agentInput?.browserOnly === true,
    memoryEnabled: conversation.memoryEnabled !== false && body.memoryEnabled !== false,
    autoSkill: !skillId && conversation.autoSkill !== false && body.autoSkill !== false,
    compactInitialPrompt: PERSISTENT_CODE_CONTEXT_PROVIDERS.has(conversation.provider)
      && Boolean(conversation.codeParentMessageId),
  };
}

export function formatAgentMetaFooter(meta = {}) {
  if (!meta || (meta.memoryUsed === 0 && !meta.memorySaved && !meta.memoryPending && !meta.skillId && !meta.graphUsed)) {
    return "";
  }
  const parts = [];
  if (meta.memoryUsed > 0) parts.push(`memory used: ${meta.memoryUsed}`);
  if (meta.graphUsed > 0) parts.push(`graph: ${meta.graphUsed}`);
  if (meta.memoryPending) parts.push("memory saving…");
  else if (meta.memorySaved > 0) parts.push(`saved: ${meta.memorySaved}`);
  if (meta.skillId) parts.push(`skill: ${meta.skillId}`);
  if (!parts.length) return "";
  return `\n\n---\n🧠 ${parts.join(" · ")}`;
}

export function finalizeCodeTaskMessage(codeResult) {
  const agentMeta = codeResult?.agentMeta || null;
  const footer = formatAgentMetaFooter(agentMeta);
  return {
    agentMeta,
    content: `${String(codeResult?.message || "").trimEnd()}${footer}`.trimEnd(),
  };
}
