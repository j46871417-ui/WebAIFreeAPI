// Парсер JSON-tool-call'а из ответа LLM.
// Устойчив к markdown-блокам, тексту до/после JSON, нескольким JSON-объектам.
//
// 3 стратегии последовательно:
//   1. Пройтись по всем fenced-блокам ```...``` (любой язык: json, python, tool_calls),
//      искать tool в содержимом каждого.
//   2. Вырезать ВСЕ fenced-блоки (они часто содержат пояснения на python и т.п.)
//      и искать tool в остатке. Спасает Qwen-кейс: ```python ...``` + текст +
//      {"tool":"write_file",...} снаружи блока.
//   3. Fallback — искать в исходном тексте целиком.

export function parseToolCall(text) {
  const trimmed = String(text || "").trim();

  const fencedBlocks = [
    ...trimmed.matchAll(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/gi),
  ];
  for (const match of fencedBlocks) {
    const result = findToolCallInText(match[1].trim());
    if (result) return result;
  }

  const stripped = trimmed.replace(/```[a-zA-Z0-9]*\n?[\s\S]*?```/gi, " ");
  const result2 = findToolCallInText(stripped);
  if (result2) return result2;

  return findToolCallInText(trimmed);
}

// Ищет первый JSON-объект с полем "tool" (string) в тексте.
// Если первый {...} не tool-call — пропускает и берёт следующий.
function findToolCallInText(text) {
  let offset = 0;

  while (offset < text.length) {
    const start = text.indexOf("{", offset);
    if (start < 0) return null;

    const candidate = extractFirstJsonObject(text.slice(start));
    if (!candidate) {
      return null;
    }

    try {
      const parsed = JSON.parse(candidate);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.tool === "string"
      ) {
        return parsed;
      }
    } catch {
      // Невалидный JSON — пробуем следующий объект.
    }

    offset = start + Math.max(candidate.length, 1);
  }

  return null;
}

// Безопасный экстрактор первого валидного JSON-объекта из текста.
// Уважает строки и эскейпы, не путается на скобках внутри значений.
export function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}
