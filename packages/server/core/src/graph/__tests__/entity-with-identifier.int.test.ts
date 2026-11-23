import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "#core/errors";
import {
  createEntityEffect,
  getEntityByCaseSlugEffect,
  listIdentifiersEffect,
} from "#core/graph";
import { runDomain } from "#core/infra";
import { resetTestDb, seedCase, seedEvidence, testDb as db } from "#test-db";
import { identifierList } from "@watchdog/domain/schemas/graph";
import type { CaseId } from "@watchdog/domain/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/domain/schemas/testing";

function identifiersOf(caseId: CaseId, entityId: string) {
  return runDomain(
    listIdentifiersEffect(
      caseId,
      TEST_ORGANIZATION_ID,
      identifierList.input.parse({ caseId, entityId })
    ).pipe(Effect.map((page) => page.items))
  );
}

describe("createEntity with an Identifier", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates the Entity holding the Identifier, normalized and citing the Evidence", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id);

    const entity = await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "infra",
        name: "mirror.acme.test",
        slug: "mirror-acme-test",
        identifier: {
          type: "domain",
          value: "Mirror.Acme.Test",
          confidence: "unverified",
          status: "unknown",
          evidenceIds: [evidence.id],
        },
      })
    );

    const identifiers = await identifiersOf(cased.id, entity.id);
    expect(identifiers).toEqual([
      expect.objectContaining({
        entityId: entity.id,
        type: "domain",
        value: "mirror.acme.test",
        confidence: "unverified",
        status: "unknown",
        evidenceIds: [evidence.id],
      }),
    ]);
  });

  it("creates neither when the Identifier is refused", async () => {
    const cased = await seedCase(db);

    const error = await runDomain(
      createEntityEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        kind: "infra",
        name: "Confirmed Without Evidence",
        slug: "confirmed-without-evidence",
        identifier: {
          type: "domain",
          value: "acme.test",
          confidence: "confirmed",
          status: "unknown",
        },
      })
    ).catch((error_: unknown) => error_);

    expect(isDomainTag(error) && error._tag).toBe("InvalidError");
    const missing = await runDomain(
      getEntityByCaseSlugEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        "confirmed-without-evidence"
      )
    ).catch((error_: unknown) => error_);
    expect(isDomainTag(missing) && missing._tag).toBe("NotFoundError");
  });
});
