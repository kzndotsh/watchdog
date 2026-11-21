import { db, organizationScopedDb } from "#db";
import { TEST_ORGANIZATION_ID } from "@watchdog/domain/schemas/testing";

/**
 * The shared test connection: tests import it from here so api and caps never depend on
 * `#db`. It is the application role in `TEST_ORGANIZATION_ID`'s row-level security scope
 * (#718), so a test reads and seeds its default organization's Cases and Claims directly; another
 * organization's rows need `withOrganizationScope`. Code under test never runs on it: core reads
 * the unscoped pool through `Db.layer` and scopes itself (`inOrganization`).
 */
export const testDb = organizationScopedDb(db, TEST_ORGANIZATION_ID);
