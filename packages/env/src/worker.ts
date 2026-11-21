import { loadRepoEnv } from "./load";

/**
 * Point `DATABASE_URL` at the worker role's URL (`DATABASE_URL_WORKER`, #720) when it is set, so
 * every connection the worker opens (the pool, pg-boss, the activity LISTEN) logs in as
 * `watchdog_worker`, which may write no Graph table. Unset, `DATABASE_URL` stays as it is.
 */
export function applyWorkerDatabaseUrl(source: NodeJS.ProcessEnv): void {
  const url = source.DATABASE_URL_WORKER?.trim();
  if (url !== undefined && url !== "") source.DATABASE_URL = url;
}

// The worker entry imports this module first, before anything imports `@watchdog/env/server`
// (which parses the environment once, at its first import).
loadRepoEnv();
applyWorkerDatabaseUrl(process.env);
