// Прототип OpenAI-совместимого /v1/chat/completions.
//
// Поддерживает:
//   - POST /v1/chat/completions с body { model, messages, stream:false }
//   - GET  /v1/models
//
// НЕ поддерживает (пока):
//   - stream: true (TODO: SSE)
//   - tools / function calling (TODO)
//   - logprobs, n>1, seed, и прочие OpenAI-параметры
//   - API-ключи (TODO: добавить после прототипа)
//
// Маршрутизация: model имя → провайдер (см. models.mjs).
//   - Qwen: создаём чат по запросу (sessionId не персистится между вызовами API!),
//           отправляем последнее user-сообщение, ждём полный ответ.
//   - DeepSeek: аналогично — каждый запрос = свежий чат.
//
// Это значит: внешний клиент должен слать ВСЮ историю в body.messages, чтобы
// модель имела контекст. Сервер не помнит ничего между запросами (stateless).
// Это OpenAI-совместимое поведение — у них тоже stateless.

import { findModel, modelsList } from "./models.mjs";
import { readQwenAuth } from "../src/providers/qwen/auth-files.mjs";
import { QWEN_AUTH_FILE } from "../src/providers/qwen/config.mjs";
import { QwenChatClient } from "../src/providers/qwen/client.mjs";

// Ленивый singleton Qwen-клиента — переиспользуем через все вызовы API.
let qwenClient = null;
async function getQwenClient() {
  if (qwenClient) return qwenClient;
  const auth = readQwenAuth(QWEN_AUTH_FILE);
  if (!auth?.token) {
    throw new Error("Qwen не подключён. Запусти: npm run login-qwen");
  }
  qwenClient = new QwenChatClient({
    token: auth.token,
    cookieHeader: auth.cookieHeader,
    debug: Boolean(process.env.API_DEBUG),
  });
  return qwenClient;
}

export async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/v1/models") {
    return sendJson(res, modelsList());
  }

  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    return handleChatCompletions(req, res);
  }

  if (req.method === "GET" && url.pathname === "/") {
    return sendJson(res, {
      name: "deepseek-cli openai-compat",
      version: "0.1.0-prototype",
      endpoints: ["GET /v1/models", "POST /v1/chat/completions"],
      docs: "see README.md in api/",
    });
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: { message: "Not found", type: "not_found_error" } }));
}

async function handleChatCompletions(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return sendError(res, 400, `Invalid JSON: ${e.message}`);
  }

  const modelName = body?.model;
  if (!modelName) return sendError(res, 400, "Missing 'model' field");

  const mapping = findModel(modelName);
  if (!mapping) return sendError(res, 404, `Unknown model: ${modelName}`);

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return sendError(res, 400, "Missing 'messages' array");

  // Стрим пока не поддерживаем — возвращаем 501, чтобы клиент явно знал.
  if (body.stream === true) {
    return sendError(res, 501, "Streaming не реализован в прототипе. Пришли stream:false.");
  }

  // OpenAI присылает ВСЮ историю каждый раз. Мы её сжимаем в один prompt —
  // конкатенируем с лейблами ролей. Это упрощение прототипа; для качества контекста
  // потом сделаем proper multi-turn через persistent sessionId + parent_id chain.
  const prompt = messages
    .map((m) => `${(m.role || "user").toUpperCase()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n\n");

  try {
    if (mapping.provider === "qwen") {
      const client = await getQwenClient();
      // Свежий чат на каждый запрос — простейший stateless flow.
      const chatId = await client.createChat({ model: mapping.model, title: "API request" });
      const result = await client.complete({
        chatId,
        prompt,
        thinking: false,
        search: false,
        model: mapping.model,
      });
      return sendJson(res, toOpenAIResponse(modelName, result.text));
    }
    if (mapping.provider === "deepseek") {
      return sendError(res, 501, "DeepSeek в прототипе не подключён. Сначала Qwen.");
    }
    return sendError(res, 500, `Unknown provider: ${mapping.provider}`);
  } catch (e) {
    return sendError(res, 500, `Upstream error: ${e.message}`);
  }
}

// Формат OpenAI chat completion response.
function toOpenAIResponse(model, text) {
  const ts = Math.floor(Date.now() / 1000);
  return {
    id: `chatcmpl-${ts}${Math.random().toString(36).slice(2, 10)}`,
    object: "chat.completion",
    created: ts,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    // Реальные usage-метрики у нас не доступны, ставим заглушку.
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function sendJson(res, payload, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, { error: { message, type: "invalid_request_error" } }, status);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}
