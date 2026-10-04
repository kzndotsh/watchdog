import { beforeEach, describe, expect, it } from "vitest";

import { requireCapability } from "@watchdog/caps";
import { updateCaseEffect } from "@watchdog/core/cases";
import { runDomain } from "@watchdog/core/infra";
import { putCredentialEffect } from "@watchdog/core/vault";
import { db } from "@watchdog/db";
import { resetTestDb, seedCase } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { evaluateCapAvailabilityEffect } from "../cap-availability.ts";

describe("evaluateCapAvailability", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("blocks extract.ai without vault credentials even when egress is on", async () => {
    const cased = await seedCase(db);
    await runDomain(
      updateCaseEffect({
        id: cased.id,
        organizationId: cased.organizationId,
        allowThirdPartyEgress: true,
      })
    );
    const cap = requireCapability("evidence.extract.ai");
    const { result } = await runDomain(
      evaluateCapAvailabilityEffect({
        actorId: TEST_ACTOR_ID,
        caseId: cased.id,
        cap,
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("missing_credential");
  });

  it("allows extract.ai when a compatible key is stored", async () => {
    const cased = await seedCase(db);
    await runDomain(
      updateCaseEffect({
        id: cased.id,
        organizationId: cased.organizationId,
        allowThirdPartyEgress: true,
      })
    );
    await runDomain(
      putCredentialEffect({
        userId: TEST_ACTOR_ID,
        name: "AI_COMPAT_API_KEY",
        secret: "sk-test",
      })
    );
    const cap = requireCapability("evidence.extract.ai");
    const { result } = await runDomain(
      evaluateCapAvailabilityEffect({
        actorId: TEST_ACTOR_ID,
        caseId: cased.id,
        cap,
      })
    );
    expect(result.ok).toBe(true);
  });
});
