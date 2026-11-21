import { sql, type SQL } from "drizzle-orm";

/**
 * The organization the current transaction acts for, for row-level security policies: the
 * `watchdog.org_id` setting (`ORGANIZATION_SETTING`) through `graph_history_setting`, which maps
 * the empty string a reused pooled connection holds to NULL, so an unset organization matches no
 * row. The scalar subquery makes Postgres evaluate it once per statement (an InitPlan), not per
 * row. The setting name is spelled here, not imported, because drizzle-kit reads the schema files
 * on their own.
 */
export const currentOrganization: SQL = sql.raw(
  "(select public.graph_history_setting('watchdog.org_id'))"
);
