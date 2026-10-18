/**
 * Lists every stored row that breaks a database invariant of #302 (a value outside its
 * vocabulary, a link across Cases, an Evidence id that names nothing in the Case). Read only.
 * Run it when migration `0025_report_invariant_violations` refuses to continue, against the
 * database that failed to migrate (its rules read the pre-migration schema):
 *
 *   DATABASE_URL_MIGRATE=postgresql://... pnpm --filter @watchdog/db exec tsx scripts/invariant-violations.ts
 *
 * Exits 1 when it finds rows (so a script can gate on it), 0 when the database is clean.
 */
import postgres from "postgres";

import { invariantRules } from "../src/invariants";

const url = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL_MIGRATE or DATABASE_URL is required");
}

const sql = postgres(url, { max: 1 });
let found = 0;
try {
  const [legacy] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'evidence_ids'`;
  if (legacy?.n === "0") {
    console.log(
      "This database is already past migration 0027: Postgres enforces every rule, nothing to list."
    );
    process.exit(0);
  }
  for (const rule of invariantRules()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one rule at a time keeps the output ordered
    const rows = await sql.unsafe<{ k: string }[]>(
      `SELECT k FROM (${rule.query}) AS q(k) ORDER BY k`
    );
    if (rows.length === 0) continue;
    found += rows.length;
    console.log(`${rule.name}: ${rows.length} row(s). To fix: ${rule.hint}.`);
    for (const row of rows) console.log(`  ${row.k}`);
  }
} finally {
  await sql.end();
}
if (found === 0) {
  console.log("No stored row breaks an invariant.");
} else {
  process.exitCode = 1;
}
