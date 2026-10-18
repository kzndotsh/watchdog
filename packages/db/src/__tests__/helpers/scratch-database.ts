import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const DRIZZLE_DIR = path.resolve(import.meta.dirname, "../../../drizzle");

type Journal = { entries: { idx: number; tag: string }[] };

/** The integration server's superuser URL, pointed at another database. */
function serverUrl(database: string): string {
  const migrateUrl = process.env.DATABASE_URL_MIGRATE;
  if (migrateUrl === undefined || migrateUrl === "") {
    throw new Error("DATABASE_URL_MIGRATE is required for migration tests");
  }
  const url = new URL(migrateUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function withClient<T>(
  url: string,
  run: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    return await run(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export type ScratchDatabase = {
  readonly name: string;
  readonly url: string;
  /** Apply every migration up to and including journal index `lastIndex` that is still pending. */
  migrateThrough: (lastIndex: number) => Promise<void>;
  /** Run a SQL file with psql (the perf seed uses psql meta-commands). */
  runSqlFile: (file: string, variables?: Record<string, string>) => void;
  drop: () => Promise<void>;
};

/**
 * A PRIVATE throwaway database on the integration server, made from the superuser URL and
 * dropped by `drop()`: a random `wd_scratch_*` name, never one of the shared databases.
 * Migrations come from a trimmed copy of `drizzle/`, so a test can stop after any of them.
 */
export async function createScratchDatabase(): Promise<ScratchDatabase> {
  const name = `wd_scratch_${process.pid}_${Math.random().toString(16).slice(2, 10)}`;
  await withClient(serverUrl("postgres"), (sql) =>
    sql.unsafe(`CREATE DATABASE "${name}"`)
  );
  const url = serverUrl(name);
  // What docker/postgres/init.sql and scripts/perf-seed.sh create before migrating.
  await withClient(url, async (sql) => {
    await sql.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await sql.unsafe("CREATE SCHEMA IF NOT EXISTS auth");
  });

  const journalText = readFileSync(
    path.join(DRIZZLE_DIR, "meta/_journal.json"),
    "utf-8"
  );
  const journal: Journal & Record<string, unknown> = JSON.parse(journalText);
  const workDir = mkdtempSync(path.join(tmpdir(), "wd-scratch-migrations-"));

  return {
    name,
    url,
    async migrateThrough(lastIndex) {
      const folder = path.join(workDir, `through-${lastIndex}`);
      rmSync(folder, { recursive: true, force: true });
      mkdirSync(path.join(folder, "meta"), { recursive: true });
      const entries = journal.entries.filter((entry) => entry.idx <= lastIndex);
      writeFileSync(
        path.join(folder, "meta/_journal.json"),
        JSON.stringify({ ...journal, entries })
      );
      for (const entry of entries) {
        cpSync(
          path.join(DRIZZLE_DIR, `${entry.tag}.sql`),
          path.join(folder, `${entry.tag}.sql`)
        );
      }
      await withClient(url, (sql) =>
        migrate(drizzle(sql), { migrationsFolder: folder })
      );
    },
    runSqlFile(file, variables = {}) {
      const args = [url, "-v", "ON_ERROR_STOP=1", "-q", "-f", file];
      for (const [key, value] of Object.entries(variables)) {
        args.push("-v", `${key}=${value}`);
      }
      const result = spawnSync("psql", args, { encoding: "utf-8" });
      if (result.status !== 0) {
        throw new Error(`psql failed: ${result.stderr}${result.stdout}`);
      }
    },
    async drop() {
      rmSync(workDir, { recursive: true, force: true });
      await withClient(serverUrl("postgres"), (sql) =>
        sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
      );
    },
  };
}

/** One query on a scratch database. */
export function queryScratch<T extends object>(
  database: ScratchDatabase,
  statement: string
): Promise<T[]> {
  return withClient(database.url, async (sql) => {
    const rows = await sql.unsafe<T[]>(statement);
    return [...rows];
  });
}

/** Run one statement on a scratch database and return the error it raised, if any. */
export function tryScratch(
  database: ScratchDatabase,
  statement: string
): Promise<Error | undefined> {
  return withClient(database.url, async (sql) => {
    try {
      await sql.unsafe(statement);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  });
}
