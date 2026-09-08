import { beforeEach, describe, expect, it } from "vitest";

import { searchCaseEffect, runDomain } from "@watchdog/core";
import { db, edgesRepo, evidenceRepo, jobsRepo, tasksRepo } from "@watchdog/db";
import {
  TEST_ORGANIZATION_ID,
  buildClaimCreateOp,
  buildEntityCreateOp,
  testId,
} from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEntityBlankDisplayName,
  seedEvidence,
  seedIdentifier,
  seedJob,
  seedPlaybookRun,
  seedProposal,
} from "@watchdog/test-kit/db";

describe("searchCase", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("hits an entity by name", async () => {
    const cased = await seedCase(db, {
      name: "Search Case",
      slug: "search-case",
    });
    await seedEntity(db, cased.id, {
      id: testId(20),
      name: "Ada Lovelace",
      slug: "ada-lovelace",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "Ada",
      })
    );
    expect(result.entities.some((hit) => hit.name === "Ada Lovelace")).toBe(
      true
    );
  });

  it("accepts a padded case id", async () => {
    const cased = await seedCase(db, {
      name: "Padded Search Case",
      slug: "padded-search-case",
    });
    await seedEntity(db, cased.id, {
      id: testId(21),
      name: "Padding Subject",
      slug: "padding-subject",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: `  ${cased.id}  `,
        organizationId: TEST_ORGANIZATION_ID,
        q: "Padding",
      })
    );
    expect(result.entities.some((hit) => hit.slug === "padding-subject")).toBe(
      true
    );
  });

  it("hits an entity by notes", async () => {
    const cased = await seedCase(db, {
      name: "Search Case",
      slug: "search-case-notes",
    });
    await seedEntity(db, cased.id, {
      id: testId(25),
      name: "Quiet Subject",
      slug: "quiet-subject",
      notes: "Former contractor at Acme Labs",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "acme labs",
      })
    );
    expect(result.entities.some((hit) => hit.slug === "quiet-subject")).toBe(
      true
    );
  });

  it("hits an entity by kind display label", async () => {
    const cased = await seedCase(db);
    await seedEntity(db, cased.id, {
      id: testId(27),
      name: "Acme Holdings",
      slug: "acme-holdings",
      kind: "org",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "Org",
      })
    );
    expect(result.entities.some((hit) => hit.slug === "acme-holdings")).toBe(
      true
    );
  });

  it("hits an entity by connection peer name", async () => {
    const cased = await seedCase(db);
    const subject = await seedEntity(db, cased.id, {
      id: testId(29),
      name: "Alice Subject",
      slug: "alice-subject",
    });
    const peer = await seedEntity(db, cased.id, {
      id: testId(30),
      name: "Bob Corp",
      slug: "bob-corp",
    });
    const edge = await edgesRepo.create(db, {
      fromId: subject.id,
      toId: peer.id,
      predicate: "owns",
      confidence: "unverified",
      notes: null,
    });
    if (!edge) throw new Error("edge");

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "bob corp",
      })
    );

    expect(result.entities.some((hit) => hit.slug === "alice-subject")).toBe(
      true
    );
  });

  it("hits an entity by connection edge notes", async () => {
    const cased = await seedCase(db);
    const subject = await seedEntity(db, cased.id, {
      id: testId(35),
      name: "Alice Subject",
      slug: "alice-subject-edge-notes",
    });
    const peer = await seedEntity(db, cased.id, {
      id: testId(36),
      name: "Quiet Peer",
      slug: "quiet-peer-edge-notes",
    });
    const edge = await edgesRepo.create(db, {
      fromId: subject.id,
      toId: peer.id,
      predicate: "related_to",
      confidence: "unverified",
      notes: "Shared registrar contact",
    });
    if (!edge) throw new Error("edge");

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "registrar contact",
      })
    );

    expect(
      result.entities.some((hit) => hit.slug === "alice-subject-edge-notes")
    ).toBe(true);
  });

  it("hits an entity by connection peer notes", async () => {
    const cased = await seedCase(db);
    const subject = await seedEntity(db, cased.id, {
      id: testId(33),
      name: "Alice Subject",
      slug: "alice-subject-notes",
    });
    const peer = await seedEntity(db, cased.id, {
      id: testId(34),
      name: "Quiet Peer",
      slug: "quiet-peer",
      notes: "Mailbox tied to the fraud thread",
    });
    const edge = await edgesRepo.create(db, {
      fromId: subject.id,
      toId: peer.id,
      predicate: "owns",
      confidence: "unverified",
      notes: null,
    });
    if (!edge) throw new Error("edge");

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "fraud thread",
      })
    );

    expect(
      result.entities.some((hit) => hit.slug === "alice-subject-notes")
    ).toBe(true);
  });

  it("hits an identifier by notes", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(26) });
    await seedIdentifier(db, entity.id, {
      type: "handle",
      value: "burner42",
      platform: "twitter",
      notes: "Archived burner account",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "burner account",
      })
    );
    expect(result.identifiers.some((hit) => hit.value === "burner42")).toBe(
      true
    );
  });

  it("hits an identifier by attached entity notes", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(31),
      notes: "Mailbox tied to the fraud thread",
    });
    await seedIdentifier(db, entity.id, {
      type: "email",
      value: "gamma@example.com",
    });

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "fraud thread",
      })
    );

    expect(
      result.identifiers.some((hit) => hit.value === "gamma@example.com")
    ).toBe(true);
  });

  it("hits an identifier by value", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    await seedIdentifier(db, entity.id, {
      type: "email",
      value: "ada@mailhost.test",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "ada@mailhost",
      })
    );
    expect(
      result.identifiers.some((hit) => hit.value === "ada@mailhost.test")
    ).toBe(true);
  });

  it("returns slug-backed entityName on identifier hits when entity name is blank", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntityBlankDisplayName(db, cased.id, {
      id: testId(24),
      name: "   ",
      slug: "slug-only-entity",
    });
    await seedIdentifier(db, entity.id, {
      type: "domain",
      value: "slug-only.example",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "slug-only.example",
      })
    );
    expect(
      result.identifiers.some(
        (hit) =>
          hit.value === "slug-only.example" &&
          hit.entityName === "slug-only-entity"
      )
    ).toBe(true);
  });

  it("hits an identifier by attached entity name", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(22),
      name: "Alpha Corp",
      slug: "alpha-corp",
    });
    await seedIdentifier(db, entity.id, {
      type: "domain",
      value: "alpha.example",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "alpha corp",
      })
    );
    expect(
      result.identifiers.some((hit) => hit.value === "alpha.example")
    ).toBe(true);
  });

  it("hits an identifier by status and confidence", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(37) });
    await seedIdentifier(db, entity.id, {
      type: "email",
      value: "ops@acme.test",
      platform: "",
      status: "current",
      confidence: "confirmed",
    });
    const byStatus = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "current",
      })
    );
    expect(
      byStatus.identifiers.some((hit) => hit.value === "ops@acme.test")
    ).toBe(true);
    const byConfidence = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "confirmed",
      })
    );
    expect(
      byConfidence.identifiers.some((hit) => hit.value === "ops@acme.test")
    ).toBe(true);
  });

  it("hits a job by playbook id", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
    });
    await seedJob(db, cased.id, {
      playbookRunId: run.id,
      playbookStep: 0,
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
      resultSummary: "dns ok",
      status: "succeeded",
    });
    await seedJob(db, cased.id, {
      playbookRunId: run.id,
      playbookStep: 1,
      capabilityId: "network.shodan.lookup",
      input: { ip: "198.51.100.42" },
      status: "running",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "host-footprint",
      })
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.id).toBe(run.id);
    expect(result.jobs[0]?.playbookId).toBe("host-footprint");
    expect(result.jobs[0]?.status).toBe("running");
    expect(result.jobs[0]?.resultSummary).toBe("dns ok");
  });

  it("hits a job by humanized capability id", async () => {
    const cased = await seedCase(db);
    await seedJob(db, cased.id, {
      capabilityId: "network.shodan.lookup",
      input: { ip: "198.51.100.42" },
      status: "running",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "network shodan",
      })
    );
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.jobs[0]?.capabilityId).toBe("network.shodan.lookup");
  });

  it("hits a job by humanized playbook id", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
    });
    await seedJob(db, cased.id, {
      playbookRunId: run.id,
      playbookStep: 0,
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
      status: "succeeded",
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "host footprint",
      })
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.playbookId).toBe("host-footprint");
  });

  it("hits a failed job by error and interpret error", async () => {
    const cased = await seedCase(db);
    const failed = await seedJob(db, cased.id, {
      capabilityId: "network.shodan.lookup",
      status: "failed",
      input: { ip: "198.51.100.42" },
    });
    await jobsRepo.update(db, failed.id, {
      error: "Connection timed out",
    });
    const interpretFailed = await seedJob(db, cased.id, {
      capabilityId: "evidence.harvest",
      status: "failed",
      input: { evidenceId: testId(99) },
    });
    await jobsRepo.update(db, interpretFailed.id, {
      interpretError: "proposal payload invalid",
    });

    const byError = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "timed out",
      })
    );
    expect(byError.jobs.some((hit) => hit.id === failed.id)).toBe(true);

    const byInterpret = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "payload invalid",
      })
    );
    expect(byInterpret.jobs.some((hit) => hit.id === interpretFailed.id)).toBe(
      true
    );
  });

  it("hits a process job by attached evidence label and returns evidenceLabels", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, {
      label: "Vendor Report PDF",
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.shodan.lookup",
      input: { evidenceId: evidence.id },
      status: "succeeded",
      resultSummary: null,
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "vendor report",
      })
    );
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.evidenceLabels[evidence.id]).toBe("Vendor Report PDF");
  });

  it("hits a job by linked entity name and returns entityLabels", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      name: "Quiet Holdings",
      slug: "quiet-holdings",
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      input: { entityId: entity.id, host: "example.com" },
      status: "queued",
      resultSummary: null,
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "quiet holdings",
      })
    );
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.entityLabels[entity.id]).toBe("Quiet Holdings");
  });

  it("returns evidenceLabels for jobs referencing hidden evidence", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, {
      label: "Hidden Vendor PDF",
    });
    await evidenceRepo.softDelete(db, cased.id, evidence.id);
    await seedJob(db, cased.id, {
      capabilityId: "network.shodan.lookup",
      input: { evidenceId: evidence.id },
      status: "running",
      resultSummary: null,
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "shodan",
      })
    );
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.evidenceLabels[evidence.id]).toBe("Hidden Vendor PDF");
  });

  it("hits a job by hidden evidence label text", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, {
      label: "Hidden Vendor PDF",
    });
    await evidenceRepo.softDelete(db, cased.id, evidence.id);
    await seedJob(db, cased.id, {
      capabilityId: "network.shodan.lookup",
      input: { evidenceId: evidence.id },
      status: "running",
      resultSummary: null,
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "hidden vendor",
      })
    );
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.evidenceLabels[evidence.id]).toBe("Hidden Vendor PDF");
  });

  it("returns playbookId on proposal search hits", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
    });
    const job = await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      playbookRunId: run.id,
      playbookStep: 0,
    });
    await seedProposal(db, cased.id, [], {
      summary: "playbook probe",
      jobId: job.id,
    });

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "host-footprint",
      })
    );

    expect(
      result.proposals.some((hit) => hit.playbookId === "host-footprint")
    ).toBe(true);
  });

  it("returns proposal entity name on search hits", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(23),
      name: "Gamma LLC",
      slug: "gamma-llc",
    });
    const job = await seedJob(db, cased.id, {
      capabilityId: "network.shodan.lookup",
    });
    await seedProposal(
      db,
      cased.id,
      [buildClaimCreateOp(entity.id, "observed", { id: testId(33) })],
      { summary: null, jobId: job.id }
    );

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "shodan",
      })
    );

    expect(
      result.proposals.some(
        (hit) => hit.entityName === "Gamma LLC" && hit.capabilityId !== null
      )
    ).toBe(true);
  });

  it("returns task and evidence entity names on search hits", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(26),
      name: "Delta Corp",
      slug: "delta-corp",
    });
    const task = await tasksRepo.create(db, {
      caseId: cased.id,
      entityId: entity.id,
      title: "Review filings",
      status: "backlog",
    });
    if (!task) throw new Error("task");
    await seedEvidence(db, cased.id, {
      entityId: entity.id,
      label: "screenshot",
    });

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "delta corp",
      })
    );

    expect(
      result.tasks.some(
        (hit) => hit.id === task.id && hit.entityName === "Delta Corp"
      )
    ).toBe(true);
    expect(result.evidence.some((hit) => hit.entityName === "Delta Corp")).toBe(
      true
    );
  });

  it("hits a task by attached entity notes", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(28),
      name: "Epsilon Subject",
      slug: "epsilon-subject",
      notes: "Primary witness for the fraud thread",
    });
    const task = await tasksRepo.create(db, {
      caseId: cased.id,
      entityId: entity.id,
      title: "Schedule interview",
      status: "backlog",
    });
    if (!task) throw new Error("task");

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "fraud thread",
      })
    );

    expect(result.tasks.some((hit) => hit.id === task.id)).toBe(true);
  });

  it("hits a task by status and priority", async () => {
    const cased = await seedCase(db);
    const task = await tasksRepo.create(db, {
      caseId: cased.id,
      title: "Close the loop",
      status: "done",
      priority: "high",
    });
    if (!task) throw new Error("task");

    const byStatus = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "done",
      })
    );
    expect(byStatus.tasks.some((hit) => hit.id === task.id)).toBe(true);

    const byPriority = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "high",
      })
    );
    expect(byPriority.tasks.some((hit) => hit.id === task.id)).toBe(true);
  });

  it("hits a failed job by status", async () => {
    const cased = await seedCase(db);
    const failed = await seedJob(db, cased.id, {
      capabilityId: "network.shodan.lookup",
      status: "failed",
      input: { ip: "198.51.100.42" },
    });
    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "failed",
      })
    );
    expect(result.jobs.some((hit) => hit.id === failed.id)).toBe(true);
  });

  it("includes evidence sourceUrl on search hits", async () => {
    const cased = await seedCase(db);
    await seedEvidence(db, cased.id, {
      label: null,
      kind: "url_archive",
      sourceUrl: "https://example.com/page",
    });

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "example.com",
      })
    );

    expect(
      result.evidence.some(
        (hit) => hit.sourceUrl === "https://example.com/page"
      )
    ).toBe(true);
  });

  it("hits evidence by sha256 and mime", async () => {
    const cased = await seedCase(db);
    const ev = await seedEvidence(db, cased.id, {
      label: null,
      kind: "file",
      mime: "application/pdf",
      sha256:
        "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
      text: null,
    });

    const bySha = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "aabbccdd",
      })
    );
    expect(bySha.evidence.some((hit) => hit.id === ev.id)).toBe(true);

    const byMime = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "application/pdf",
      })
    );
    expect(byMime.evidence.some((hit) => hit.id === ev.id)).toBe(true);
  });

  it("returns entity create op name on proposal search hits", async () => {
    const cased = await seedCase(db);
    await seedProposal(
      db,
      cased.id,
      [
        buildEntityCreateOp("New Subject LLC", "new-subject-llc", "org", {
          id: testId(38),
        }),
      ],
      { summary: null, jobId: null, capabilityId: "network.shodan.lookup" }
    );

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "new subject",
      })
    );

    expect(
      result.proposals.some((hit) => hit.entityName === "New Subject LLC")
    ).toBe(true);
  });

  it("hits a pending proposal by attached entity name", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(27),
      name: "Zeta Partners",
      slug: "zeta-partners",
    });
    await seedProposal(
      db,
      cased.id,
      [buildClaimCreateOp(entity.id, "observed", { id: testId(35) })],
      { summary: null, jobId: null }
    );

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "zeta partners",
      })
    );

    expect(
      result.proposals.some((hit) => hit.entityName === "Zeta Partners")
    ).toBe(true);
  });

  it("hits a pending proposal by attached entity notes", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, {
      id: testId(32),
      notes: "Mailbox tied to the fraud thread",
    });
    await seedProposal(
      db,
      cased.id,
      [buildClaimCreateOp(entity.id, "observed", { id: testId(37) })],
      { summary: null, jobId: null }
    );

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "fraud thread",
      })
    );

    expect(result.proposals.length).toBeGreaterThan(0);
  });

  it("returns edge endpoint entity name on proposal search hits", async () => {
    const cased = await seedCase(db);
    const from = await seedEntity(db, cased.id, {
      id: testId(28),
      name: "Edge Alpha",
      slug: "edge-alpha",
    });
    const to = await seedEntity(db, cased.id, {
      id: testId(29),
      name: "Edge Beta",
      slug: "edge-beta",
    });
    await seedProposal(
      db,
      cased.id,
      [
        {
          op: "create",
          resource: "edge",
          id: testId(36),
          data: {
            fromId: from.id,
            toId: to.id,
            predicate: "knows",
          },
        },
      ],
      { summary: null, jobId: null }
    );

    const result = await runDomain(
      searchCaseEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        q: "edge alpha",
      })
    );

    expect(
      result.proposals.some((hit) => hit.entityName === "Edge Alpha")
    ).toBe(true);
  });
});
