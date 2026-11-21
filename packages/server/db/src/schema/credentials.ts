import {
  customType,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_helpers";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** Per-user Cap secrets (AES-GCM ciphertext). `name` is SCREAMING_SNAKE. */
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    label: text("label"),
    ciphertext: bytea("ciphertext").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("credentials_user_id_name_uidx").on(t.userId, t.name)]
);
