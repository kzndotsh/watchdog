import { eq } from "drizzle-orm";

import {
  activityEvents,
  activityEventsRepo,
  cases,
  casesRepo,
  claims,
  claimsRepo,
  edges,
  edgesRepo,
  entities,
  entitiesRepo,
  events,
  eventsRepo,
  evidence,
  evidenceLinksRepo,
  evidenceRepo,
  findingSuppressionsRepo,
  graphWrites,
  graphWritesRepo,
  identifiers,
  identifiersRepo,
  jobs,
  jobsRepo,
  playbookRuns,
  playbookRunsRepo,
  proposals,
  proposalsRepo,
  questions,
  questionsRepo,
  tasks,
  tasksRepo,
  type DbExec,
  type NewProposal,
} from "@watchdog/db";
import {
  fingerprintPatchOp,
  type ActivityKind,
  type ClaimClass,
  type ConfidenceTier,
  type EdgePredicate,
  type EntityKind,
  type EvidenceKind,
  type IdentifierStatus,
  type IdentifierType,
  type JobHandoff,
  type JobStatus,
  type JsonObject,
  type PatchOp,
  type PlaybookRunStatus,
  type QuestionStatus,
  type TaskPriority,
  type TaskStatus,
} from "@watchdog/schemas";

export interface SeedTally {
  cases: number;
  entities: number;
  identifiers: number;
  claims: number;
  edges: number;
  evidence: number;
  events: number;
  questions: number;
  tasks: number;
  jobs: number;
  proposals: number;
  activity: number;
}

export function emptyTally(): SeedTally {
  return {
    cases: 0,
    entities: 0,
    identifiers: 0,
    claims: 0,
    edges: 0,
    evidence: 0,
    events: 0,
    questions: 0,
    tasks: 0,
    jobs: 0,
    proposals: 0,
    activity: 0,
  };
}

/** Hours before now. Activity and lists sort on these stamps. */
export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function must<T>(label: string, row: T | null): T {
  if (row === null) {
    throw new Error(`demo seed: ${label} was not written`);
  }
  return row;
}

export class SeedKit {
  private readonly exec: DbExec;
  private readonly actorId: string;
  private readonly tally: SeedTally;

  constructor(exec: DbExec, actorId: string, tally: SeedTally) {
    this.exec = exec;
    this.actorId = actorId;
    this.tally = tally;
  }

  async openCase(input: {
    name: string;
    slug: string;
    description: string;
    at: Date;
    allowThirdPartyEgress?: boolean;
    organizationId: string;
  }): Promise<string> {
    const created = must(
      `case ${input.slug}`,
      await casesRepo.create(this.exec, {
        name: input.name,
        slug: input.slug,
        description: input.description,
        organizationId: input.organizationId,
      })
    );
    await this.exec
      .update(cases)
      .set({
        createdAt: input.at,
        ...(input.allowThirdPartyEgress === true
          ? { allowThirdPartyEgress: true }
          : {}),
      })
      .where(eq(cases.id, created.id));
    this.tally.cases += 1;
    return created.id;
  }

  async entity(input: {
    caseId: string;
    kind: EntityKind;
    name: string;
    slug: string;
    summary?: string;
    notes?: string;
    at: Date;
  }): Promise<string> {
    const created = must(
      `entity ${input.slug}`,
      await entitiesRepo.create(this.exec, {
        caseId: input.caseId,
        kind: input.kind,
        name: input.name,
        slug: input.slug,
        summary: input.summary ?? null,
        notes: input.notes ?? null,
      })
    );
    await this.exec
      .update(entities)
      .set({ createdAt: input.at })
      .where(eq(entities.id, created.id));
    this.tally.entities += 1;
    return created.id;
  }

  async identifier(input: {
    entityId: string;
    type: IdentifierType;
    value: string;
    platform?: string;
    confidence: ConfidenceTier;
    status?: IdentifierStatus;
    notes?: string;
    at: Date;
    evidenceIds?: string[];
  }): Promise<string> {
    const created = must(
      `identifier ${input.type} ${input.value}`,
      await identifiersRepo.create(this.exec, {
        entityId: input.entityId,
        type: input.type,
        platform: input.platform ?? "",
        value: input.value,
        confidence: input.confidence,
        status: input.status ?? "unknown",
        notes: input.notes ?? null,
      })
    );
    await this.exec
      .update(identifiers)
      .set({ createdAt: input.at })
      .where(eq(identifiers.id, created.id));
    if (input.evidenceIds !== undefined && input.evidenceIds.length > 0) {
      const linked = await evidenceLinksRepo.linkIdentifier(
        this.exec,
        created.id,
        input.evidenceIds
      );
      if (!linked) {
        throw new Error(`demo seed: identifier evidence link failed`);
      }
    }
    this.tally.identifiers += 1;
    return created.id;
  }

  async claim(input: {
    entityId: string;
    text: string;
    class: ClaimClass;
    confidence: ConfidenceTier;
    at: Date;
    evidenceIds?: string[];
    retract?: { kind: "retracted" | "contested" | "disproved"; reason: string };
  }): Promise<string> {
    const created = must(
      "claim",
      await claimsRepo.create(this.exec, {
        entityId: input.entityId,
        text: input.text,
        class: input.class,
        confidence: input.confidence,
      })
    );
    await this.exec
      .update(claims)
      .set({ createdAt: input.at })
      .where(eq(claims.id, created.id));
    if (input.evidenceIds !== undefined && input.evidenceIds.length > 0) {
      const linked = await evidenceLinksRepo.linkClaim(
        this.exec,
        created.id,
        input.evidenceIds
      );
      if (!linked) {
        throw new Error("demo seed: claim evidence link failed");
      }
    }
    if (input.retract !== undefined) {
      const retracted = await claimsRepo.retract(this.exec, created.id, {
        retractKind: input.retract.kind,
        retractedReason: input.retract.reason,
        retractedBy: this.actorId,
      });
      if (retracted === null) {
        throw new Error("demo seed: claim retract failed");
      }
      await this.exec
        .update(claims)
        .set({ retractedAt: input.at })
        .where(eq(claims.id, created.id));
    }
    this.tally.claims += 1;
    return created.id;
  }

  async edge(input: {
    fromId: string;
    toId: string;
    predicate: EdgePredicate;
    confidence: ConfidenceTier;
    notes?: string;
    at: Date;
    evidenceIds?: string[];
  }): Promise<string> {
    const created = must(
      `edge ${input.predicate}`,
      await edgesRepo.create(this.exec, {
        fromId: input.fromId,
        toId: input.toId,
        predicate: input.predicate,
        confidence: input.confidence,
        notes: input.notes ?? null,
      })
    );
    await this.exec
      .update(edges)
      .set({ createdAt: input.at })
      .where(eq(edges.id, created.id));
    if (input.evidenceIds !== undefined && input.evidenceIds.length > 0) {
      const linked = await evidenceLinksRepo.linkEdge(
        this.exec,
        created.id,
        input.evidenceIds
      );
      if (!linked) {
        throw new Error("demo seed: edge evidence link failed");
      }
    }
    this.tally.edges += 1;
    return created.id;
  }

  async evidence(input: {
    caseId: string;
    entityId?: string;
    kind?: EvidenceKind;
    label: string;
    text?: string;
    notes?: string;
    sourceUrl?: string;
    at: Date;
    processed?: boolean;
  }): Promise<string> {
    const created = must(
      `evidence ${input.label}`,
      await evidenceRepo.create(this.exec, {
        caseId: input.caseId,
        entityId: input.entityId ?? null,
        kind: input.kind ?? "attestation",
        label: input.label,
        notes: input.notes ?? null,
        mime: "text/plain",
        uri: null,
        sha256: null,
        text: input.text ?? null,
        sourceUrl: input.sourceUrl ?? null,
        actorId: this.actorId,
        actorLabel: null,
      })
    );
    await this.exec
      .update(evidence)
      .set({ createdAt: input.at, capturedAt: input.at })
      .where(eq(evidence.id, created.id));
    if (input.processed !== false) {
      const marked = await evidenceRepo.markProcessed(
        this.exec,
        input.caseId,
        created.id
      );
      if (!marked) {
        throw new Error(`demo seed: mark processed failed for ${input.label}`);
      }
    }
    this.tally.evidence += 1;
    return created.id;
  }

  async event(input: {
    entityId: string;
    when: string;
    what: string;
    whereText?: string;
    at: Date;
  }): Promise<string> {
    const created = must(
      "event",
      await eventsRepo.create(this.exec, {
        entityId: input.entityId,
        when: input.when,
        what: input.what,
        whereText: input.whereText ?? null,
      })
    );
    await this.exec
      .update(events)
      .set({ createdAt: input.at })
      .where(eq(events.id, created.id));
    this.tally.events += 1;
    return created.id;
  }

  async question(input: {
    entityId: string;
    text: string;
    status?: QuestionStatus;
    resolvedNote?: string;
    at: Date;
  }): Promise<string> {
    const created = must(
      "question",
      await questionsRepo.create(this.exec, {
        entityId: input.entityId,
        text: input.text,
        status: "open",
      })
    );
    await this.exec
      .update(questions)
      .set({ createdAt: input.at })
      .where(eq(questions.id, created.id));
    if (input.status === "resolved") {
      const resolved = await questionsRepo.resolve(this.exec, created.id, {
        resolvedNote: input.resolvedNote ?? null,
      });
      if (resolved === null) {
        throw new Error("demo seed: question resolve failed");
      }
    }
    this.tally.questions += 1;
    return created.id;
  }

  async task(input: {
    caseId: string;
    title: string;
    description?: string;
    status: TaskStatus;
    priority?: TaskPriority;
    entityId?: string;
    dueDate?: Date;
    position: number;
    at: Date;
  }): Promise<string> {
    const created = must(
      `task ${input.title}`,
      await tasksRepo.create(this.exec, {
        caseId: input.caseId,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        priority: input.priority ?? null,
        entityId: input.entityId ?? null,
        dueDate: input.dueDate ?? null,
        position: input.position,
      })
    );
    await this.exec
      .update(tasks)
      .set({ createdAt: input.at })
      .where(eq(tasks.id, created.id));
    this.tally.tasks += 1;
    return created.id;
  }

  async activity(input: {
    caseId: string;
    kind: ActivityKind;
    action: "created" | "status_changed" | "updated" | "deleted";
    subjectId: string;
    label: string;
    at: Date;
    fromValue?: string;
    toValue?: string;
  }): Promise<void> {
    const created = must(
      `activity ${input.label}`,
      await activityEventsRepo.create(this.exec, {
        caseId: input.caseId,
        kind: input.kind,
        action: input.action,
        subjectId: input.subjectId,
        label: input.label,
        actorId: this.actorId,
        fromValue: input.fromValue ?? null,
        toValue: input.toValue ?? null,
      })
    );
    await this.exec
      .update(activityEvents)
      .set({ createdAt: input.at })
      .where(eq(activityEvents.id, created.id));
    this.tally.activity += 1;
  }

  async playbook(input: {
    caseId: string;
    playbookId: string;
    seed: JsonObject;
    status: PlaybookRunStatus;
    at: Date;
    finishedAt?: Date;
  }): Promise<string> {
    const created = must(
      `playbook ${input.playbookId}`,
      await playbookRunsRepo.create(this.exec, {
        caseId: input.caseId,
        playbookId: input.playbookId,
        seed: input.seed,
        status: "running",
        actorId: this.actorId,
        actorLabel: null,
      })
    );
    if (input.status !== "running") {
      const finished = await playbookRunsRepo.setStatus(
        this.exec,
        created.id,
        input.status,
        input.finishedAt ?? input.at
      );
      if (finished === null) {
        throw new Error(`demo seed: playbook status ${input.playbookId}`);
      }
    }
    await this.exec
      .update(playbookRuns)
      .set({ createdAt: input.at })
      .where(eq(playbookRuns.id, created.id));
    return created.id;
  }

  async job(input: {
    caseId: string;
    capabilityId: string;
    input: JsonObject;
    status: JobStatus;
    at: Date;
    startedAt?: Date;
    finishedAt?: Date;
    resultSummary?: string;
    error?: string;
    interpretError?: string;
    logs?: string[];
    playbookRunId?: string;
    playbookStep?: number;
    handoff?: JobHandoff;
    evidenceIds?: string[];
    proposalId?: string;
    fromCache?: boolean;
    suppressedCount?: number;
  }): Promise<string> {
    const created = must(
      `job ${input.capabilityId}`,
      await jobsRepo.create(this.exec, {
        caseId: input.caseId,
        capabilityId: input.capabilityId,
        input: input.input,
        status: input.status,
        actorId: this.actorId,
        actorLabel: null,
        logs: input.logs ?? [],
        playbookRunId: input.playbookRunId ?? null,
        playbookStep: input.playbookStep ?? null,
        playbookFanIndex: 0,
        handoff: input.handoff ?? null,
        evidenceIds: input.evidenceIds ?? null,
      })
    );
    const updated = await jobsRepo.update(this.exec, created.id, {
      resultSummary: input.resultSummary ?? null,
      error: input.error ?? null,
      interpretError: input.interpretError ?? null,
      proposalId: input.proposalId ?? null,
      fromCache: input.fromCache ?? false,
      suppressedCount: input.suppressedCount ?? 0,
      startedAt: input.startedAt ?? input.at,
      finishedAt: input.finishedAt ?? null,
      evidenceIds: input.evidenceIds ?? null,
    });
    if (updated === null) {
      throw new Error(`demo seed: job update ${input.capabilityId}`);
    }
    await this.exec
      .update(jobs)
      .set({ createdAt: input.at })
      .where(eq(jobs.id, created.id));
    this.tally.jobs += 1;
    return created.id;
  }

  async proposal(input: {
    caseId: string;
    summary: string;
    patch: PatchOp[];
    at: Date;
    jobId?: string;
    evidenceIds?: string[];
    agentSourced?: boolean;
    suppressedCount?: number;
    status?: NewProposal["status"];
    rejectReason?: string;
  }): Promise<string> {
    const created = must(
      "proposal",
      await proposalsRepo.create(this.exec, {
        caseId: input.caseId,
        status: "pending",
        patch: input.patch,
        summary: input.summary,
        jobId: input.jobId ?? null,
        evidenceIds: input.evidenceIds ?? [],
        agentSourced: input.agentSourced ?? false,
        suppressedCount: input.suppressedCount ?? 0,
        createdBy: input.agentSourced === true ? this.actorId : null,
      })
    );
    if (input.jobId !== undefined) {
      const linked = await jobsRepo.update(this.exec, input.jobId, {
        proposalId: created.id,
      });
      if (linked === null) {
        throw new Error("demo seed: job proposal link failed");
      }
    }
    if (input.status === "accepted") {
      const accepted = await proposalsRepo.accept(
        this.exec,
        input.caseId,
        created.id,
        { decidedBy: this.actorId, decidedAt: input.at }
      );
      if (accepted === null) {
        throw new Error("demo seed: proposal accept failed");
      }
    } else if (input.status === "rejected") {
      const rejected = await proposalsRepo.reject(
        this.exec,
        input.caseId,
        created.id,
        {
          decidedBy: this.actorId,
          decidedAt: input.at,
          rejectReason: input.rejectReason ?? "Not supported",
        }
      );
      if (rejected === null) {
        throw new Error("demo seed: proposal reject failed");
      }
      const rows = input.patch.flatMap((op) => {
        const fingerprint = fingerprintPatchOp(op);
        if (fingerprint === null) return [];
        return [
          {
            caseId: input.caseId,
            fingerprint,
            reason: "rejected",
            proposalId: created.id,
          },
        ];
      });
      await findingSuppressionsRepo.insertMany(this.exec, rows);
    }
    await this.exec
      .update(proposals)
      .set({ createdAt: input.at })
      .where(eq(proposals.id, created.id));
    this.tally.proposals += 1;
    return created.id;
  }

  async graphWrite(input: {
    caseId: string;
    summary: string;
    patch: PatchOp[];
    confidence: ConfidenceTier;
    at: Date;
    idempotencyKey: string;
  }): Promise<void> {
    const created = must(
      "graph write",
      await graphWritesRepo.create(this.exec, {
        caseId: input.caseId,
        actorId: this.actorId,
        actorLabel: null,
        channel: "agent_write",
        userOverridden: true,
        confidence: input.confidence,
        summary: input.summary,
        patch: input.patch,
        idempotencyKey: input.idempotencyKey,
      })
    );
    await this.exec
      .update(graphWrites)
      .set({ createdAt: input.at })
      .where(eq(graphWrites.id, created.id));
  }
}

export function identifierOp(input: {
  entityId: string;
  type: IdentifierType;
  value: string;
  platform?: string;
  status?: IdentifierStatus;
  notes?: string;
  evidenceIds?: string[];
}): PatchOp {
  return {
    op: "create",
    resource: "identifier",
    id: crypto.randomUUID(),
    data: {
      entityId: input.entityId,
      type: input.type,
      platform: input.platform ?? "",
      value: input.value,
      status: input.status ?? "unknown",
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    },
    ...(input.evidenceIds === undefined
      ? {}
      : { evidenceIds: input.evidenceIds }),
  };
}

export function claimOp(input: {
  entityId: string;
  text: string;
  class?: ClaimClass;
  evidenceIds?: string[];
}): PatchOp {
  return {
    op: "create",
    resource: "claim",
    id: crypto.randomUUID(),
    data: {
      entityId: input.entityId,
      text: input.text,
      class: input.class ?? "observation",
    },
    ...(input.evidenceIds === undefined
      ? {}
      : { evidenceIds: input.evidenceIds }),
  };
}

export function entityOp(input: {
  kind: EntityKind;
  name: string;
  slug: string;
  summary?: string;
}): PatchOp {
  return {
    op: "create",
    resource: "entity",
    id: crypto.randomUUID(),
    data: {
      kind: input.kind,
      name: input.name,
      slug: input.slug,
      ...(input.summary === undefined ? {} : { summary: input.summary }),
    },
  };
}

export function edgeOp(input: {
  fromId: string;
  toId: string;
  predicate: EdgePredicate;
  notes?: string;
}): PatchOp {
  return {
    op: "create",
    resource: "edge",
    id: crypto.randomUUID(),
    data: {
      fromId: input.fromId,
      toId: input.toId,
      predicate: input.predicate,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    },
  };
}

export function questionOp(input: { entityId: string; text: string }): PatchOp {
  return {
    op: "create",
    resource: "question",
    id: crypto.randomUUID(),
    data: {
      entityId: input.entityId,
      text: input.text,
    },
  };
}
