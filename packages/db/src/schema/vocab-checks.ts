import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import { VOCAB_CHECKS, type VocabCheck } from "./_vocab";
import * as schema from "./index";

/**
 * Every vocabulary CHECK the schema declares. drizzle evaluates a table's constraints callback
 * lazily (when its config is read), which is when `vocabCheck` registers; reading each table's
 * config here makes the list complete no matter who asks first.
 */
export function vocabChecks(): readonly VocabCheck[] {
  for (const exported of Object.values(schema)) {
    if (is(exported, PgTable)) getTableConfig(exported);
  }
  return VOCAB_CHECKS;
}
