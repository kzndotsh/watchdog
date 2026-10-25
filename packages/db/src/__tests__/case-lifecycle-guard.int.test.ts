import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  CASE_LIFECYCLE_SQLSTATE,
  type CaseDeletionEvent,
} from "@watchdog/schemas/shared";
import {
  expectPostgresRefusal,
  resetTestDb,
  seedCase,
} from "@watchdog/test-db";

import { APP_ROLE } from "../app-role.ts";
import { db } from "../client.ts";
import type { DbExec } from "../exec.ts";
import { setGraphHistoryContext } from "../history-context.ts";
import { caseDeletionRecordsRepo } from "../repos/case-deletion-records.repo.ts";
import { casesRepo } from "../repos/cases.repo.ts";
import type { CaseRow } from "../repos/cases.repo.ts";
import { cases } from "../schema/cases.ts";

/**
 * Issue #304: the application role may change a Case's lifecycle columns, or delete a Case, only
 * with a matching `case_deletion_records` row written in the same transaction, enforced by the
 * BEFORE trigger `cases_lifecycle_guard_trg` (`0001_database_logic`, SQLSTATE WD002).
 * `db` is the application role (`DATABASE_URL`); `ownerDb` is the table owner
 * (`DATABASE_URL_MIGRATE`), the documented maintenance path, which the trigger never refuses.
 */
const ownerClient = postgres(process.env.DATABASE_URL_MIGRATE ?? "", {
  max: 2,
  idle_timeout: 5,
  onnotice: () => {},
});
const ownerDb = drizzle(ownerClient);

afterAll(async () => {
  await ownerClient.end({ timeout: 5 });
});

const refused = { code: CASE_LIFECYCLE_SQLSTATE };

type Subject = Pick<CaseRow, "id" | "organizationId" | "name" | "slug">;

async function subject(exec: DbExec): Promise<Subject> {
  const row = await seedCase(exec);
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    slug: row.slug,
  };
}

async function record(
  exec: DbExec,
  who: Subject,
  event: CaseDeletionEvent
): Promise<void> {
  await caseDeletionRecordsRepo.append(exec, {
    caseId: who.id,
    organizationId: who.organizationId,
    caseName: who.name,
    caseSlug: who.slug,
    event,
    actorId: null,
    actorLabel: null,
  });
}

function tombstone(exec: DbExec, who: Subject) {
  const now = new Date();
  return casesRepo.tombstone(exec, who.id, who.organizationId, {
    deletedAt: now,
    deletedBy: null,
    purgeAfter: new Date(now.getTime() + 86_400_000),
  });
}

/** A Case already deleted, its `deleted` record committed in an earlier transaction. */
async function deletedCase(): Promise<Subject> {
  const who = await subject(db);
  await db.transaction(async (tx) => {
    await record(tx, who, "deleted");
    await tombstone(tx, who);
  });
  return who;
}

async function lifecycleOf(id: CaseRow["id"]) {
  const [row] = await db
    .select({
      deletedAt: cases.deletedAt,
      purgeStartedAt: cases.purgeStartedAt,
      purgeError: cases.purgeError,
    })
    .from(cases)
    .where(eq(cases.id, id));
  return row;
}

describe("cases_lifecycle_guard (#304)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("is a no-op for the current application role name (APP_ROLE) and pins its search_path", async () => {
    expect(APP_ROLE).toBe("watchdog_app");
    const [row] = await ownerDb.execute<{ config: string[] | null }>(
      sql`select proconfig as config from pg_proc where proname = 'cases_lifecycle_guard'`
    );
    expect(row?.config).toEqual(["search_path=pg_catalog, pg_temp"]);
  });

  describe("delete", () => {
    it("refuses to delete a live Case, even with a purged record", async () => {
      const who = await subject(db);
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await record(tx, who, "purged");
          await tx.delete(cases).where(eq(cases.id, who.id));
        }),
        refused
      );
      expect(await lifecycleOf(who.id)).toBeDefined();
    });

    it("refuses to delete a tombstone with no purged record in the transaction", async () => {
      const who = await deletedCase();
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await tx.delete(cases).where(eq(cases.id, who.id));
        }),
        refused
      );
      expect(await lifecycleOf(who.id)).toBeDefined();
    });

    it("does not count a purged record from an earlier transaction", async () => {
      const who = await deletedCase();
      await db.transaction(async (tx) => {
        await record(tx, who, "purged");
      });
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await tx.delete(cases).where(eq(cases.id, who.id));
        }),
        refused
      );
      expect(await lifecycleOf(who.id)).toBeDefined();
    });

    it("does not count another Case's purged record", async () => {
      const who = await deletedCase();
      const other = await subject(db);
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await record(tx, other, "purged");
          await tx.delete(cases).where(eq(cases.id, who.id));
        }),
        refused
      );
    });

    it("deletes a tombstone with its purged record written first in the same transaction", async () => {
      const who = await deletedCase();
      await db.transaction(async (tx) => {
        await setGraphHistoryContext(tx, { channel: "system" });
        await record(tx, who, "purged");
        await casesRepo.purgeDeleted(tx, who.id);
      });
      expect(await lifecycleOf(who.id)).toBeUndefined();
    });
  });

  describe("update", () => {
    it("refuses a tombstone with no record, and one whose record is from an earlier transaction", async () => {
      const who = await subject(db);
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await tombstone(tx, who);
        }),
        refused
      );
      await db.transaction(async (tx) => {
        await record(tx, who, "deleted");
      });
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await tombstone(tx, who);
        }),
        refused
      );
      expect((await lifecycleOf(who.id))?.deletedAt).toBeNull();
    });

    it("refuses a tombstone backed only by a record of another event", async () => {
      const who = await subject(db);
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await record(tx, who, "restored");
          await tombstone(tx, who);
        }),
        refused
      );
    });

    it("tombstones with the deleted record first in the same transaction", async () => {
      const who = await subject(db);
      await db.transaction(async (tx) => {
        await record(tx, who, "deleted");
        await tombstone(tx, who);
      });
      expect((await lifecycleOf(who.id))?.deletedAt).toBeInstanceOf(Date);
    });

    it("refuses a restore with no restored record, and allows it with one", async () => {
      const who = await deletedCase();
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await casesRepo.restoreDeleted(tx, who.id, who.organizationId);
        }),
        refused
      );
      expect((await lifecycleOf(who.id))?.deletedAt).toBeInstanceOf(Date);
      await db.transaction(async (tx) => {
        await record(tx, who, "restored");
        await casesRepo.restoreDeleted(tx, who.id, who.organizationId);
      });
      expect((await lifecycleOf(who.id))?.deletedAt).toBeNull();
    });

    it("refuses to clear deleted_at once the purge has begun, record or not", async () => {
      const who = await deletedCase();
      await db.transaction(async (tx) => {
        await record(tx, who, "purge_started");
        await casesRepo.markDeletedPurgeStarted(tx, who.id, new Date());
      });
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await record(tx, who, "restored");
          // The repo's own predicate skips a begun purge; a raw statement shows the database does.
          await tx
            .update(cases)
            .set({ deletedAt: null, deletedBy: null })
            .where(eq(cases.id, who.id));
        }),
        refused
      );
      expect((await lifecycleOf(who.id))?.deletedAt).toBeInstanceOf(Date);
    });

    it("refuses to mark a purge started or store a purge error with no record", async () => {
      const who = await deletedCase();
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await casesRepo.markDeletedPurgeStarted(tx, who.id, new Date());
        }),
        refused
      );
      await expectPostgresRefusal(
        db.transaction(async (tx) => {
          await casesRepo.recordDeletedPurgeError(tx, who.id, "boom");
        }),
        refused
      );
      const row = await lifecycleOf(who.id);
      expect(row?.purgeStartedAt).toBeNull();
      expect(row?.purgeError).toBeNull();
    });

    it("allows the purge steps with their records", async () => {
      const who = await deletedCase();
      await db.transaction(async (tx) => {
        await record(tx, who, "purge_started");
        await casesRepo.markDeletedPurgeStarted(tx, who.id, new Date());
      });
      await db.transaction(async (tx) => {
        await record(tx, who, "purge_failed");
        await casesRepo.recordDeletedPurgeError(tx, who.id, "boom");
      });
      const row = await lifecycleOf(who.id);
      expect(row?.purgeStartedAt).toBeInstanceOf(Date);
      expect(row?.purgeError).toBe("boom");
    });

    it("leaves ordinary edits alone", async () => {
      const who = await subject(db);
      await db
        .update(cases)
        .set({ name: "Renamed" })
        .where(eq(cases.id, who.id));
      const [row] = await db
        .select({ name: cases.name })
        .from(cases)
        .where(eq(cases.id, who.id));
      expect(row?.name).toBe("Renamed");
    });
  });

  describe("owner maintenance", () => {
    it("lets the owner delete a live Case and edit lifecycle columns with no record", async () => {
      const gone = await subject(db);
      const edited = await subject(db);
      await ownerDb.delete(cases).where(eq(cases.id, gone.id));
      await ownerDb
        .update(cases)
        .set({ deletedAt: new Date(), purgeAfter: new Date() })
        .where(eq(cases.id, edited.id));
      expect(await lifecycleOf(gone.id)).toBeUndefined();
      expect((await lifecycleOf(edited.id))?.deletedAt).toBeInstanceOf(Date);
    });
  });
});
