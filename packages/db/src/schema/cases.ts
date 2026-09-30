import { boolean, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_helpers";

/** Case — work scope. Each Entity belongs to exactly one Case. */
export const cases = pgTable(
  "cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    /**
     * Better Auth organization id (soft text ref, same pattern as
     * `credentials.user_id`). No cross-schema FK.
     */
    organizationId: text("organization_id").notNull(),
    /**
     * When false (default), Caps with `egress: "third_party"` refuse to run.
     * Enable to allow AI/paid API Caps to send Case data off-box.
     */
    allowThirdPartyEgress: boolean("allow_third_party_egress")
      .notNull()
      .default(false),
    ...timestamps,
  },
  // Slugs are unique per organization (two organizations may both have "acme").
  (t) => [
    uniqueIndex("cases_organization_id_slug_uidx").on(t.organizationId, t.slug),
  ]
);
