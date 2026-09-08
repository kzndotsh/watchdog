import { beforeEach, describe, expect, it } from "vitest";

import {
  createTaskEffect,
  listRecentActivityEffect,
  updateTaskEffect,
  runDomain,
} from "@watchdog/core";
import { db, evidenceRepo } from "@watchdog/db";
import {
  TEST_ACTOR_ID,
  TEST_ORGANIZATION_ID,
  buildClaimCreateOp,
  testId,
} from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedJob,
  seedPlaybookRun,
  seedProposal,
} from "@watchdog/test-kit/db";

describe("listRecentActivity", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("merges a task status change from the database", async () => {
    const cased = await seedCase(db);
    const task = await runDomain(
      createTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        title: "Follow up WHOIS",
        actorId: TEST_ACTOR_ID,
      })
    );
    await runDomain(
      updateTaskEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        taskId: task.id,
        status: "in_progress",
        actorId: TEST_ACTOR_ID,
      })
    );
    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );
    expect(items.some((row) => row.kind === "task")).toBe(true);
    expect(
      items.some((row) => row.kind === "task" && row.actor === TEST_ACTOR_ID)
    ).toBe(true);
  });

  it("labels pending proposals with capability and entity name", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(30),
      name: "Beta Holdings",
      slug: "beta-holdings",
    });
    const job = await seedJob(db, cased.id, {
      capabilityId: "network.shodan.lookup",
    });
    await seedProposal(
      db,
      cased.id,
      [buildClaimCreateOp(entity.id, "observed", { id: testId(31) })],
      { summary: "", jobId: job.id }
    );

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    expect(
      items.some(
        (row) =>
          row.kind === "proposal" &&
          row.label === "Shodan Lookup · Beta Holdings"
      )
    ).toBe(true);
  });

  it("labels playbook jobs with playbook title and seed subject", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint-lite",
      seed: { host: "example.com" },
    });
    await seedJob(db, cased.id, {
      playbookRunId: run.id,
      playbookStep: 0,
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
      status: "running",
    });

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    expect(
      items.some(
        (row) =>
          row.kind === "job" &&
          row.label === "Host Footprint Lite — example.com"
      )
    ).toBe(true);
  });

  it("labels playbook-linked proposals with playbook title", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(32),
      name: "Gamma LLC",
      slug: "gamma-llc",
    });
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint-lite",
    });
    const job = await seedJob(db, cased.id, {
      playbookRunId: run.id,
      capabilityId: "network.dns.lookup",
    });
    await seedProposal(
      db,
      cased.id,
      [buildClaimCreateOp(entity.id, "observed", { id: testId(33) })],
      { summary: "", jobId: job.id }
    );

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    expect(
      items.some(
        (row) =>
          row.kind === "proposal" &&
          row.label === "Host Footprint Lite · Gamma LLC"
      )
    ).toBe(true);
  });

  it("collapses playbook steps into one recent job activity row", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint-lite",
      seed: { host: "example.com" },
    });
    await Promise.all(
      [0, 1, 2].map((step) =>
        seedJob(db, cased.id, {
          playbookRunId: run.id,
          playbookStep: step,
          capabilityId: "network.dns.lookup",
          input: { host: "example.com" },
          status: step === 2 ? "running" : "succeeded",
          resultSummary: step === 1 ? "dns ok" : null,
        })
      )
    );

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    const jobItems = items.filter((row) => row.kind === "job");
    expect(jobItems).toHaveLength(1);
    expect(jobItems[0]?.id).toBe(run.id);
    expect(jobItems[0]?.label).toBe("Host Footprint Lite — dns ok");
    expect(jobItems[0]?.action).toBe("Running");
  });

  it("labels evidence without user label using source URL host", async () => {
    const cased = await seedCase(db);
    await seedEvidence(db, cased.id, {
      label: null,
      kind: "url_archive",
      sourceUrl: "https://example.com/page",
    });

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    expect(
      items.some(
        (row) => row.kind === "evidence" && row.label === "example.com"
      )
    ).toBe(true);
  });

  it("labels process jobs with evidence title from input evidenceId", async () => {
    const cased = await seedCase(db);
    const ev = await seedEvidence(db, cased.id, {
      label: "screenshot.png",
      kind: "file",
    });
    await seedJob(db, cased.id, {
      capabilityId: "evidence.harvest",
      input: { evidenceId: ev.id },
      status: "running",
    });

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    expect(
      items.some(
        (row) => row.kind === "job" && row.label === "Harvest — screenshot.png"
      )
    ).toBe(true);
  });

  it("labels process jobs with hidden evidence title from input evidenceId", async () => {
    const cased = await seedCase(db);
    const ev = await seedEvidence(db, cased.id, {
      label: "hidden-screenshot.png",
      kind: "file",
    });
    await evidenceRepo.softDelete(db, cased.id, ev.id);
    await seedJob(db, cased.id, {
      capabilityId: "evidence.harvest",
      input: { evidenceId: ev.id },
      status: "running",
    });

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    expect(
      items.some(
        (row) =>
          row.kind === "job" && row.label === "Harvest — hidden-screenshot.png"
      )
    ).toBe(true);
  });

  it("labels entity-scoped jobs with entity display name from input entityId", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(34),
      name: "Delta Corp",
      slug: "delta-corp",
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.shodan.lookup",
      input: { entityId: entity.id },
      status: "running",
    });

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    expect(
      items.some(
        (row) =>
          row.kind === "job" && row.label === "Shodan Lookup — Delta Corp"
      )
    ).toBe(true);
  });
});
