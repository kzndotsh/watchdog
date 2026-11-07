import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import { db, jobsRepo } from "@watchdog/db";
import { resetTestDb, seedCase, seedJob } from "@watchdog/test-db";

import { failInvalidCapDeliveryEffect } from "../cap-delivery";

describe("failInvalidCapDeliveryEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("fails an open queued Job whose delivery payload was invalid", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "queued" });

    await runDomain(failInvalidCapDeliveryEffect(`  ${job.id}  `));

    const after = await jobsRepo.get(db, job.id);
    expect(after?.status).toBe("failed");
    expect(after?.error).toContain("invalid_payload");
  });

  it("leaves a terminal Job as it was", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "succeeded" });

    await runDomain(failInvalidCapDeliveryEffect(job.id));

    expect((await jobsRepo.get(db, job.id))?.status).toBe("succeeded");
  });

  it("ignores a non-uuid id and an unknown Job", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "queued" });

    await runDomain(failInvalidCapDeliveryEffect("not-a-uuid"));
    await runDomain(
      failInvalidCapDeliveryEffect("00000000-0000-4000-8000-0000000000ff")
    );

    expect((await jobsRepo.get(db, job.id))?.status).toBe("queued");
  });
});
