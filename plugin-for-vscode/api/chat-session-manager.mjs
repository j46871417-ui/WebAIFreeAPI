import { randomUUID } from "node:crypto";
import { createFileLogger } from "../src/logging/logger.mjs";

const sessionLogger = createFileLogger({ component: "chat-session-manager" });

export class ChatSessionManager {
  constructor({ maxSessions = 100, ttlMs = 60 * 60 * 1000 } = {}) {
    this.maxSessions = maxSessions;
    this.ttlMs = ttlMs;
    this.sessions = new Map();
  }

  isSessionReuseEnabled(req) {
    if (process.env.API_SESSION_REUSE === "0") return false;
    const header = req?.headers?.["x-session-reuse"];
    if (header === "false" || header === "0") return false;
    return true;
  }

  resolveSession({ req, body, provider, model }) {
    if (!this.isSessionReuseEnabled(req)) {
      return { session: null, isContinuation: false, newMessages: body?.messages || [] };
    }

    this.pruneExpired();

    const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];
    if (!incomingMessages.length) {
      return { session: null, isContinuation: false, newMessages: [] };
    }

    const explicitId = req?.headers?.["x-session-id"]
      || req?.headers?.["x-conversation-id"]
      || body?.session_id
      || body?.conversation_id;

    if (explicitId) {
      const existing = this.sessions.get(String(explicitId));
      if (existing && existing.provider === provider) {
        if (isPrefix(existing.messages, incomingMessages)) {
          existing.updatedAt = Date.now();
          const newMessages = incomingMessages.slice(existing.messages.length);
          sessionLogger.info("session.continuation.explicit", {
            sessionId: explicitId,
            provider,
            model,
            existingTurns: existing.messages.length,
            newTurns: newMessages.length,
          });
          return { session: existing, isContinuation: true, newMessages };
        }
        // If history branched or diverged, invalidate this session so a new chat starts
        this.sessions.delete(String(explicitId));
      }
      return {
        session: null,
        isContinuation: false,
        newMessages: incomingMessages,
        desiredSessionId: String(explicitId),
      };
    }

    // Auto-match session by message history prefix
    let bestMatch = null;
    for (const session of this.sessions.values()) {
      if (session.provider !== provider) continue;
      if (session.messages.length && isPrefix(session.messages, incomingMessages)) {
        if (!bestMatch || session.updatedAt > bestMatch.updatedAt) {
          bestMatch = session;
        }
      }
    }

    if (bestMatch) {
      bestMatch.updatedAt = Date.now();
      const newMessages = incomingMessages.slice(bestMatch.messages.length);
      sessionLogger.info("session.continuation.prefix_match", {
        sessionId: bestMatch.id,
        provider,
        model,
        existingTurns: bestMatch.messages.length,
        newTurns: newMessages.length,
      });
      return { session: bestMatch, isContinuation: true, newMessages };
    }

    return { session: null, isContinuation: false, newMessages: incomingMessages };
  }

  saveSession({ sessionId, provider, model, serverChatId, lastParentId, messages }) {
    if (!serverChatId) return null;
    const id = sessionId || `session_${randomUUID()}`;
    const now = Date.now();

    const session = {
      id,
      provider,
      model,
      serverChatId,
      lastParentId: lastParentId || null,
      messages: cloneMessages(messages),
      createdAt: this.sessions.get(id)?.createdAt || now,
      updatedAt: now,
    };

    this.sessions.set(id, session);
    this.enforceLimit();
    sessionLogger.info("session.saved", {
      sessionId: id,
      provider,
      model,
      serverChatId,
      lastParentId,
      totalMessages: session.messages.length,
    });
    return session;
  }

  deleteSession(id) {
    if (!id) return;
    this.sessions.delete(String(id));
  }

  clear() {
    this.sessions.clear();
  }

  pruneExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.ttlMs) {
        this.sessions.delete(id);
      }
    }
  }

  enforceLimit() {
    if (this.sessions.size <= this.maxSessions) return;
    // Evict oldest updated session
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [id, session] of this.sessions.entries()) {
      if (session.updatedAt < oldestTime) {
        oldestTime = session.updatedAt;
        oldestId = id;
      }
    }
    if (oldestId) {
      this.sessions.delete(oldestId);
    }
  }
}

export function isPrefix(existing, incoming) {
  if (!Array.isArray(existing) || !Array.isArray(incoming)) return false;
  if (existing.length === 0 || incoming.length <= existing.length) return false;
  for (let i = 0; i < existing.length; i++) {
    const a = existing[i];
    const b = incoming[i];
    if (a?.role !== b?.role) return false;
    if (!areContentsEqual(a?.content, b?.content)) return false;
  }
  return true;
}

export function areContentsEqual(c1, c2) {
  if (c1 === c2) return true;
  if (typeof c1 === "string" && typeof c2 === "string") return c1.trim() === c2.trim();
  try {
    return JSON.stringify(c1) === JSON.stringify(c2);
  } catch {
    return false;
  }
}

export function cloneMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => ({
    role: m?.role,
    content: m?.content,
    ...(m?.name ? { name: m.name } : {}),
    ...(m?.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    ...(m?.tool_calls ? { tool_calls: m.tool_calls } : {}),
  }));
}

export const globalChatSessionManager = new ChatSessionManager();
