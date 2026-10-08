import { beforeEach, describe, expect, it } from "vitest";

import { listRecentActivityEffect } from "@watchdog/core/activity";
import { NotFoundError } from "@watchdog/core/errors";
import { runDomain } from "@watchdog/core/infra";
import { createTaskEffect, updateTaskEffect } from "@watchdog/core/tasks";
import { activityLogRepo, db, evidenceRepo, proposalsRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  buildClaimCreateOp,
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  seedJob,
  seedPlaybookRun,
  seedProposal,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import { setJobStatusEffect } from "../../jobs/set-job-status.ts";

async function appendActivityRow(
  caseId: CaseId,
  kind: "evidence",
  action: string,
  subjectId: string
): Promise<void> {
  const row = await activityLogRepo.append(db, {
    caseId,
    kind,
    action,
    subjectId,
  });
  if (row === null) throw new Error("append failed");
}

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
    for (const step of [0, 1, 2]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- entries must land in step order
      await seedJob(db, cased.id, {
        playbookRunId: run.id,
        playbookStep: step,
        capabilityId: "network.dns.lookup",
        input: { host: "example.com" },
        status: step === 2 ? "running" : "succeeded",
        resultSummary: step === 1 ? "dns ok" : null,
      });
    }

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    const jobItems = items.filter((row) => row.kind === "job");
    expect(jobItems).toHaveLength(1);
    expect(jobItems[0]?.label).toBe("Host Footprint Lite — dns ok");
    expect(jobItems[0]?.action).toBe("Running");
    expect(jobItems[0]?.status).toBe("running");
  });

  it("shows a solo Job as history: queued, running and succeeded rows", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
    });
    for (const status of ["running", "succeeded"] as const) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one entry per transition, in order
      await runDomain(
        setJobStatusEffect(job.id, { status }, { caseId: cased.id })
      );
    }

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    const jobItems = items.filter((row) => row.kind === "job");
    expect(jobItems.map((row) => row.action)).toEqual([
      "Succeeded",
      "Running",
      "Queued",
    ]);
    expect(new Set(jobItems.map((row) => row.id)).size).toBe(3);
    expect(jobItems.every((row) => row.actor === TEST_ACTOR_ID)).toBe(true);
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

  it("shows a pending Proposal as proposed, with its summary", async () => {
    const cased = await seedCase(db);
    await seedProposal(db, cased.id, [], { summary: "Registrar is Acme" });

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    const row = items.find((item) => item.kind === "proposal");
    expect(row).toMatchObject({
      action: "Proposed",
      label: "Registrar is Acme",
      status: "pending",
    });
  });

  it("keeps a decided Proposal as history: proposed, then accepted or rejected", async () => {
    const cased = await seedCase(db);
    await seedProposal(db, cased.id, [], {
      summary: "Took the lead",
      status: "accepted",
    });
    await seedProposal(db, cased.id, [], {
      summary: "Dead end",
      status: "rejected",
    });

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    const proposals = items.filter((item) => item.kind === "proposal");
    expect(
      proposals.map((item) => `${item.action}:${item.label}`).sort()
    ).toEqual([
      "Accepted:Took the lead",
      "Proposed:Dead end",
      "Proposed:Took the lead",
      "Rejected:Dead end",
    ]);
    const accepted = proposals.find((item) => item.action === "Accepted");
    expect(accepted).toMatchObject({
      status: "accepted",
      fromStatus: "pending",
      toStatus: "accepted",
    });
  });

  it("shows Evidence from its captured entry and not its other verbs", async () => {
    const cased = await seedCase(db);
    const ev = await seedEvidence(db, cased.id, { label: "photo.png" });
    await appendActivityRow(cased.id, "evidence", "hidden", ev.id);
    await appendActivityRow(cased.id, "evidence", "processed", ev.id);

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        caseId: cased.id,
        limit: 20,
      })
    );

    const rows = items.filter((item) => item.kind === "evidence");
    expect(rows.map((item) => item.action)).toEqual(["Captured"]);
    expect(rows[0]).toMatchObject({ label: "photo.png", actor: TEST_ACTOR_ID });
  });

  it("reads only the log: rows written without an entry are not shown", async () => {
    const cased = await seedCase(db);
    await evidenceRepo.create(db, {
      caseId: cased.id,
      entityId: null,
      kind: "attestation",
      label: "no entry",
      notes: null,
      mime: "text/plain",
      uri: null,
      sha256: null,
      text: "body",
      sourceUrl: null,
      actorId: TEST_ACTOR_ID,
    });
    await proposalsRepo.create(db, {
      caseId: cased.id,
      status: "pending",
      patch: [],
      summary: "no entry",
      evidenceIds: [],
    });

    const items = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        limit: 20,
      })
    );

    expect(items).toEqual([]);
  });

  it("never returns another organization's activity, for the feed or a Case filter", async () => {
    const mine = await seedCase(db);
    const theirs = await seedCase(db, {
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    await seedEvidence(db, mine.id, { label: "mine" });
    await seedEvidence(db, theirs.id, { label: "theirs" });
    await seedProposal(db, theirs.id, [], { summary: "theirs too" });
    await seedJob(db, theirs.id);

    const all = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        limit: 50,
      })
    );
    expect(all.map((item) => item.label)).toEqual(["mine"]);
    expect(all.every((item) => item.caseId === mine.id)).toBe(true);

    const theirFeed = await runDomain(
      listRecentActivityEffect({
        organizationId: TEST_OTHER_ORGANIZATION_ID,
        limit: 50,
      })
    );
    expect(theirFeed.every((item) => item.caseId === theirs.id)).toBe(true);

    await expect(
      runDomain(
        listRecentActivityEffect({
          organizationId: TEST_ORGANIZATION_ID,
          caseId: theirs.id,
        })
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
