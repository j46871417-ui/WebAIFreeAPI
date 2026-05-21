// In-memory очередь долгих задач (например, /code-агент 10-60 сек).
//
// Зачем: чтобы UI не блокировался, пока выполняется задача в одном чате.
// Юзер может переключиться в другой чат и запустить там вторую задачу.
//
// Жизненный цикл:
//   1. POST /messages со /code → server.startTask(conversationId, "code", taskFn)
//   2. taskFn запускается в фоне (fire-and-forget Promise)
//   3. UI делает polling GET /api/state каждую секунду, видит running: true
//   4. Когда taskFn завершается — running удаляется из Map, UI видит готовое сообщение
//
// Состояние НЕ персистится — при рестарте сервера задачи теряются (это OK для MVP).

const runningTasks = new Map(); // conversationId → { startedAt, kind, label }

// Запускает задачу в фоне. Если задача для этого conversationId уже идёт — бросает.
export function startTask(conversationId, kind, taskFn, label = "") {
  if (runningTasks.has(conversationId)) {
    throw new Error(`Task ${runningTasks.get(conversationId).kind} already running for ${conversationId}`);
  }
  runningTasks.set(conversationId, {
    startedAt: Date.now(),
    kind,
    label,
  });

  // Fire-and-forget. .finally() гарантирует очистку даже при throw.
  Promise.resolve()
    .then(() => taskFn())
    .catch((err) => {
      console.error(`[task-runner] task ${kind} for ${conversationId} crashed:`, err);
    })
    .finally(() => {
      runningTasks.delete(conversationId);
    });
}

// true если для conversationId есть задача в работе.
export function isRunning(conversationId) {
  return runningTasks.has(conversationId);
}

// Возвращает мета-инфо о задаче (или null).
export function getTaskInfo(conversationId) {
  return runningTasks.get(conversationId) || null;
}

// Список ID всех активных задач — для UI чтобы показать индикаторы.
export function getRunningIds() {
  return [...runningTasks.keys()];
}
