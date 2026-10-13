/**
 * Checks that the perf seed's Proposal patches parse with the live patch schema.
 * Run by scripts/perf-seed.sh after the load: `DATABASE_URL_MIGRATE` is the scratch database.
 * About one Proposal in twenty is checked (all of them when the seed is small).
 */
import postgres from "postgres";

import { patchSchema } from "@watchdog/schemas/graph";

const url = process.env.DATABASE_URL_MIGRATE;
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL_MIGRATE is required");
}

const sql = postgres(url, { max: 1 });
try {
  const rows = await sql<{ id: string; patch: unknown }[]>`
    SELECT id, patch FROM proposals
    WHERE abs(hashtext(id::text)) % 20 = 0 OR (SELECT count(*) FROM proposals) <= 1000
  `;
  let ops = 0;
  for (const row of rows) {
    const parsed = patchSchema.safeParse(row.patch);
    if (!parsed.success) {
      throw new Error(
        `seeded Proposal ${row.id} has an invalid patch: ${JSON.stringify(parsed.error.issues[0])}`
      );
    }
    ops += parsed.data.length;
  }
  if (rows.length === 0) throw new Error("no Proposals to check");
  console.log(
    `perf-seed: ${rows.length} sampled Proposal patches (${ops} ops) parse with patchSchema`
  );
} finally {
  await sql.end();
}
