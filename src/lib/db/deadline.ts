import { AsyncLocalStorage } from "node:async_hooks";

const databaseDeadline = new AsyncLocalStorage<number>();

/** Run work with an absolute wall-clock deadline inherited by its database queries. */
export function withDatabaseDeadline<T>(deadlineAt: Date | number, callback: () => T): T {
  const deadlineMs = deadlineAt instanceof Date ? deadlineAt.getTime() : deadlineAt;
  if (!Number.isFinite(deadlineMs)) throw new TypeError("Database deadline must be a valid timestamp");
  const inherited = databaseDeadline.getStore();
  return databaseDeadline.run(inherited === undefined ? deadlineMs : Math.min(inherited, deadlineMs), callback);
}

export function getDatabaseDeadline(): number | undefined {
  return databaseDeadline.getStore();
}
