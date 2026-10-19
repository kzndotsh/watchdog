import { beforeEach, describe, expect, it } from "vitest";

import { createEntityEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { writeGraphFromAgentEffect } from "@watchdog/core/proposals";
import { activity, db } from "@watchdog/db";
import {
  buildEntityCreateOp,
  TEST_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import { listAllGraphHistory, resetTestDb, seedCase } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

const KEY_ID = "key-366";

describe("a key-made Graph change records the key id (#366)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("Dossier-channel edit: history and activity carry the key id and the owner", async () => {
    const cased = await seedCase(db);
    const entity = await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "person",
        name: "Ada",
        slug: "ada",
        actorId: TEST_ACTOR_ID,
        actorLabel: "api-key:cli",
        actorKeyId: KEY_ID,
      })
    );

    const history = (await listAllGraphHistory()).filter(
      (row) => row.rowId === entity.id
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      channel: "dossier",
      actorId: TEST_ACTOR_ID,
      actorLabel: "api-key:cli",
      actorKeyId: KEY_ID,
    });

    const entries = (await db.select().from(activity)).filter(
      (entry) => entry.subjectId === entity.id
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: TEST_ACTOR_ID,
      actorKeyId: KEY_ID,
    });
  });

  it("agent-write channel: history and activity carry the key id", async () => {
    const cased = await seedCase(db);
    await runDomain(
      writeGraphFromAgentEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
        actorLabel: "api-key:cli",
        actorKeyId: KEY_ID,
        userOverride: true,
        patch: [buildEntityCreateOp("Grace", "grace", "person")],
      })
    );

    const history = (await listAllGraphHistory()).filter(
      (row) => row.kind === "entity" && row.op === "create"
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      channel: "agent_write",
      actorKeyId: KEY_ID,
    });
    const keyed = (await db.select().from(activity)).filter(
      (entry) => entry.actorKeyId === KEY_ID
    );
    expect(keyed.length).toBeGreaterThan(0);
  });

  it("a session edit records no key id", async () => {
    const cased = await seedCase(db);
    const entity = await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "person",
        name: "Bob",
        slug: "bob",
        actorId: TEST_ACTOR_ID,
      })
    );
    const history = (await listAllGraphHistory()).find(
      (row) => row.rowId === entity.id
    );
    expect(history?.actorKeyId).toBeNull();
    const entry = (await db.select().from(activity)).find(
      (row) => row.subjectId === entity.id
    );
    expect(entry?.actorKeyId).toBeNull();
  });
});
