// Модуль ограничения частоты запросов (Rate Limiting) и защиты от HTTP 429 для DeepSeek.
// chat.deepseek.com имеет Cloudflare WAF и бэкенд-лимиты:
// - Рекомендуемый интервал: >= 2500-3000 мс между сетевыми запросами к API.
// - Микропауза между PoW-челленджем и completion: >= 300-400 мс.
// - Concurrency = 1 (сериализация запросов).
// - При 429 или "server is busy" — автоматический Exponential Backoff.

import { createFileLogger } from "../../logging/logger.mjs";

const logger = createFileLogger({ component: "provider.deepseek.limiter" });

export const DEFAULT_DEEPSEEK_INTERVAL_MS = 3000;
export const DEFAULT_DEEPSEEK_POW_SETTLE_MS = 400;
export const DEFAULT_DEEPSEEK_MAX_RETRY_ATTEMPTS = 4;
export const DEFAULT_DEEPSEEK_BASE_RETRY_DELAY_MS = 4000;

export function getDeepSeekIntervalMs() {
  const envVal = Number(process.env.DEEPSEEK_REQUEST_INTERVAL_MS);
  return Number.isFinite(envVal) && envVal >= 0 ? envVal : DEFAULT_DEEPSEEK_INTERVAL_MS;
}

export function getDeepSeekPowSettleMs() {
  const envVal = Number(process.env.DEEPSEEK_POW_SETTLE_MS);
  return Number.isFinite(envVal) && envVal >= 0 ? envVal : DEFAULT_DEEPSEEK_POW_SETTLE_MS;
}

export function sleep(ms, signal = null) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error("Operation aborted"));
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    function onAbort() {
      cleanup();
      reject(new Error("Operation aborted"));
    }
    function cleanup() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export function isDeepSeekRateLimitError(error, status = null) {
  if (status === 429) return true;
  const msg = String(error?.message || error || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("rate limit") ||
    msg.includes("server is busy") ||
    msg.includes("please try again later")
  );
}

export class DeepSeekRateLimiter {
  constructor({
    intervalMs = getDeepSeekIntervalMs(),
    maxRetries = DEFAULT_DEEPSEEK_MAX_RETRY_ATTEMPTS,
    baseRetryDelayMs = DEFAULT_DEEPSEEK_BASE_RETRY_DELAY_MS,
  } = {}) {
    this.intervalMs = intervalMs;
    this.maxRetries = maxRetries;
    this.baseRetryDelayMs = baseRetryDelayMs;
    this._lastRequestTime = 0;
    this._queueTail = Promise.resolve();
  }

  setIntervalMs(ms) {
    this.intervalMs = Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_DEEPSEEK_INTERVAL_MS;
  }

  async schedule(fn, { signal = null } = {}) {
    const runInQueue = async () => {
      const now = Date.now();
      const elapsed = now - this._lastRequestTime;
      const waitMs = Math.max(0, this.intervalMs - elapsed);
      if (waitMs > 0) {
        logger.debug("provider.deepseek.limiter.throttle", { waitMs });
        await sleep(waitMs, signal);
      }
      try {
        const result = await fn();
        return result;
      } finally {
        this._lastRequestTime = Date.now();
      }
    };

    const task = this._queueTail.then(runInQueue, runInQueue);
    this._queueTail = task.then(() => {}, () => {});
    return task;
  }

  async executeWithRetry(fn, { signal = null, retryAttempts = this.maxRetries } = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= retryAttempts + 1; attempt++) {
      try {
        return await this.schedule(fn, { signal });
      } catch (error) {
        lastError = error;
        if (signal?.aborted || !isDeepSeekRateLimitError(error) || attempt > retryAttempts) {
          throw error;
        }

        const delay = this.baseRetryDelayMs * Math.pow(2, attempt - 1);
        logger.warn("provider.deepseek.limiter.retry", {
          attempt,
          maxRetries: retryAttempts,
          delayMs: delay,
          error: error.message,
        });

        await sleep(delay, signal);
      }
    }
    throw lastError;
  }
}

export const sharedDeepSeekRateLimiter = new DeepSeekRateLimiter();
