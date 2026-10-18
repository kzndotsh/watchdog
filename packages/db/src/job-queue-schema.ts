import { PgBoss } from "pg-boss";

/**
 * Install or upgrade pg-boss's own schema (`pgboss`) as the connecting role, which then owns it.
 * pg-boss would create it on start otherwise, and that would make the application role the
 * owner of the tables the job queue lives in. The web app and worker start pg-boss with
 * `migrate: false` (a missing or outdated schema is a startup error that says so) and, with the
 * data privileges `applyAppRoleGrants` gives them, only read and write job rows.
 *
 * Queues use the shared job table, so creating or updating one is row work for the application
 * role; nothing at runtime creates a table.
 */
export async function installJobQueueSchema(url: string): Promise<void> {
  const boss = new PgBoss({
    connectionString: url,
    application_name: "watchdog-migrate",
    supervise: false,
    schedule: false,
    migrate: true,
  });
  boss.on("error", () => {});
  try {
    await boss.start();
  } finally {
    await boss.stop({ graceful: false, close: true });
  }
}
