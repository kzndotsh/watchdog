import { Effect, Fiber, Layer, Result } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, jobsRepo, providerCallsRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  backdateJob,
  listCaseEvidence,
  resetTestDb,
  seedCase,
  seedJob,
} from "@watchdog/test-db";
import { ValidationVendorError } from "@watchdog/tools/errors";
import { makeJobEgress } from "@watchdog/tools/http";

import { recordingBlobStore } from "../../infra/blob-store";
import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import { createJobLog } from "../job-log";
import { recordingJobQueue } from "../job-queue";
import { reconcileJobsEffect } from "../lifecycle/reconcile";
import {
  persistProviderCallsBestEffort,
  persistProviderCallsEffect,
  providerCallWriter,
} from "../provider-calls";
import { collectEffect } from "../stages/collect";
import { landEvidenceEffect } from "../stages/land-evidence";
import {
  collectLayer,
  fakeCap,
  getText,
  hang,
  respondWith,
  runningState,
  sha256,
  startProvider,
  type LoopbackProvider,
} from "./helpers/provider-calls-harness";

// The shared setup routes undici's fetch to the global one; the Job's request must open a
// real connection to the loopback provider.
vi.unmock("undici");

const providers: LoopbackProvider[] = [];
afterEach(async () => {
  await Promise.all(providers.splice(0).map(async (p) => p.close()));
});

async function provide(routes: Parameters<typeof startProvider>[0]) {
  const started = await startProvider(routes);
  providers.push(started);
  return started;
}

function collect(
  store: ReturnType<typeof recordingBlobStore>,
  state: Awaited<ReturnType<typeof runningState>>
) {
  return collectEffect(
    state,
    createJobLog(),
    new AbortController().signal
  ).pipe(Effect.provide(collectLayer(store)));
}

describe("the provider calls of a Job's run", () => {
  let caseId: CaseId;

  beforeEach(async () => {
    await resetTestDb();
    caseId = (await seedCase(db)).id;
  });

  it("stores the request, the outcome and the raw body of a call before Evidence lands, and links the Evidence", async () => {
    const payload = '{"ok":true}';
    const host = await provide({
      "/v1/host": respondWith(payload, {
        "set-cookie": "sid=abc123",
        "x-request-id": "req-1",
      }),
    });
    const store = recordingBlobStore();
    const cap = fakeCap(
      "test.collect",
      caseId,
      getText(`${host.origin}/v1/host?key=abcd1234efgh`)
    );
    const state = await runningState(caseId, cap);

    const collected = await Effect.runPromise(collect(store, state));

    // Everything about the call is stored by the time collect returns, with no Evidence yet.
    expect(await listCaseEvidence(db, caseId)).toEqual([]);
    const [stored, ...rest] = await providerCallsRepo.listForJob(
      db,
      caseId,
      state.jobId
    );
    expect(rest).toEqual([]);
    expect(stored?.call).toMatchObject({
      id: collected.providerCallIds[0],
      jobId: state.jobId,
      seq: 0,
      transport: "http",
      method: "GET",
      urlRedacted: `${host.origin}/v1/host?key=[redacted]`,
      requestBodyState: "none",
    });
    const blobKey = `${caseId}/${sha256(payload)}/provider-response`;
    expect(stored?.outcome).toMatchObject({
      outcome: "response",
      status: 200,
      bodyState: "stored",
      bodyReason: null,
      bodySha256: sha256(payload),
      bodyBytes: payload.length,
      blobKey,
      servedFromCallId: null,
    });
    expect(stored?.outcome?.responseHeaders).toMatchObject({
      "x-request-id": "req-1",
    });
    expect(stored?.outcome?.responseHeaders).not.toHaveProperty("set-cookie");
    expect(new TextDecoder().decode(store.objects.get(blobKey))).toBe(payload);

    // Landing the Evidence links it to the run's call.
    const landed = await runDomainWith(collectLayer(store))(
      landEvidenceEffect(state, collected)
    );
    const behind = await providerCallsRepo.listForEvidence(
      db,
      caseId,
      landed[0] ?? ""
    );
    expect(behind.map((row) => row.call.id)).toEqual(collected.providerCallIds);
  });

  it("fails the Job when the outcome cannot be saved, flags the gap and lands no Evidence", async () => {
    const host = await provide({ "/v1/host": respondWith('{"ok":true}') });
    const store = recordingBlobStore({
      respond: (call) => {
        if (call.command === "PutObjectCommand") throw new Error("store down");
      },
    });
    const cap = fakeCap(
      "test.collect",
      caseId,
      getText(`${host.origin}/v1/host`)
    );
    const state = await runningState(caseId, cap);

    const exit = await Effect.runPromise(Effect.result(collect(store, state)));

    expect(Result.isFailure(exit) && exit.failure).toMatchObject({
      _tag: "InternalError",
      reason: "Failed to save the provider calls",
    });
    expect(await listCaseEvidence(db, caseId)).toEqual([]);
    expect((await jobsRepo.get(db, state.jobId))?.provenanceState).toBe(
      "incomplete"
    );
    // The request side was stored before the call was sent, so the row is still there.
    const calls = await providerCallsRepo.listForJob(db, caseId, state.jobId);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.outcome).toBeNull();
  });

  it("keeps the calls of a failed run with the outcome each had", async () => {
    const host = await provide({ "/v1/host": respondWith('{"partial":1}') });
    const store = recordingBlobStore();
    const cap = fakeCap(
      "test.collect",
      caseId,
      getText(`${host.origin}/v1/host`).pipe(
        Effect.andThen(
          Effect.fail(new ValidationVendorError({ message: "Fixed failure" }))
        )
      )
    );
    const state = await runningState(caseId, cap);

    const exit = await Effect.runPromise(Effect.result(collect(store, state)));

    expect(Result.isFailure(exit)).toBe(true);
    const [stored] = await providerCallsRepo.listForJob(
      db,
      caseId,
      state.jobId
    );
    expect(stored?.outcome).toMatchObject({
      outcome: "response",
      status: 200,
      bodyState: "stored",
    });
    expect((await jobsRepo.get(db, state.jobId))?.provenanceState).toBe(
      "complete"
    );
  });

  it("refuses a request the Cap did not declare, with a fixed message, and stores the refusal as a failed call", async () => {
    const host = await provide({ "/v1/host": respondWith('{"ok":true}') });
    const store = recordingBlobStore();
    // Declares a different host: the loopback provider is not one of its contacts.
    const cap = fakeCap(
      "test.collect",
      caseId,
      getText(`${host.origin}/v1/host?q=seed-value`),
      {
        contacts: [
          { kind: "provider", host: "declared.test", access: "anonymous" },
        ],
      }
    );
    const state = await runningState(caseId, cap);

    const error = await Effect.runPromise(Effect.flip(collect(store, state)));

    // A declaration bug is the server's, never the caller's input.
    expect(error._tag).toBe("InternalError");
    expect(JSON.stringify(error)).not.toContain(host.origin);
    expect(JSON.stringify(error)).not.toContain("seed-value");
    const [stored, ...rest] = await providerCallsRepo.listForJob(
      db,
      caseId,
      state.jobId
    );
    expect(rest).toEqual([]);
    expect(stored?.outcome).toMatchObject({
      outcome: "failed",
      status: null,
      bodyState: "none",
    });
    expect(stored?.outcome).toMatchObject({
      failureTag: "BlockedTargetError",
      failureReason: "undeclared",
    });
    expect(host.hits()).toEqual([]);
  });

  it("stores the request side before the call is sent, and keeps what a cancelled run had", async () => {
    const host = await provide({ "/hang": hang });
    const store = recordingBlobStore();
    const cap = fakeCap("test.collect", caseId, getText(`${host.origin}/hang`));
    const state = await runningState(caseId, cap);

    const fiber = Effect.runFork(collect(store, state));
    await host.arrived("/hang");

    // In flight: the request row is already stored, there is no outcome yet.
    const inFlight = await providerCallsRepo.listForJob(
      db,
      caseId,
      state.jobId
    );
    expect(inFlight).toHaveLength(1);
    expect(inFlight[0]?.outcome).toBeNull();

    await Effect.runPromise(Fiber.interrupt(fiber));

    // The cancel saved the call that was cut short, as an outcome that says so.
    const [ended] = await providerCallsRepo.listForJob(db, caseId, state.jobId);
    expect(ended?.outcome).toMatchObject({ status: null, bodyState: "none" });
    expect(ended?.outcome?.outcome).toBe("unfinished");
    expect((await jobsRepo.get(db, state.jobId))?.provenanceState).toBe(
      "complete"
    );
  });

  it("leaves the request row of a call whose worker died, and flags the Job incomplete when reconcile fails it", async () => {
    const host = await provide({ "/hang": hang });
    const job = await seedJob(db, caseId, {
      capabilityId: "network.dns.lookup",
      status: "running",
    });
    const { egress } = makeJobEgress(
      {
        fetch: async (input, init) =>
          fetch(input, { ...init, signal: init?.signal }),
        fetchPrivateOrigin: async (input, init) =>
          fetch(input, { ...init, signal: init?.signal }),
      },
      {
        onCallStart: providerCallWriter(db, {
          caseId,
          jobId: job.id,
          runId: "00000000-0000-4000-8000-0000000000aa",
        }),
      }
    );
    const abort = new AbortController();
    // The worker "dies" mid-call: nothing ever saves an outcome.
    const sending = egress.fetch(`${host.origin}/hang`, {
      signal: abort.signal,
    });
    sending.catch(() => undefined);
    await host.arrived("/hang");
    abort.abort();

    const [afterCrash] = await providerCallsRepo.listForJob(db, caseId, job.id);
    expect(afterCrash?.call.urlRedacted).toBe(`${host.origin}/hang`);
    expect(afterCrash?.outcome).toBeNull();

    await backdateJob(db, job.id, {
      updatedAt: new Date(Date.now() - 2 * 86_400_000),
    });
    await runDomainWith(Layer.mergeAll(Db.layer, recordingJobQueue().layer))(
      reconcileJobsEffect()
    );

    const failed = await jobsRepo.get(db, job.id);
    expect(failed).toMatchObject({
      status: "failed",
      errorCode: "stale",
      provenanceState: "incomplete",
    });
    expect(await providerCallsRepo.listForJob(db, caseId, job.id)).toHaveLength(
      1
    );
  });

  it("flags the Job incomplete when saving a stopped run's calls runs out of time, and does not hold the stop", async () => {
    const job = await seedJob(db, caseId, { status: "running" });
    const scope = {
      caseId,
      jobId: job.id,
      runId: "00000000-0000-4000-8000-0000000000bb",
    };
    const { ledger } = makeJobEgress({
      fetch: async () => new Response("x"),
      fetchPrivateOrigin: async () => new Response("x"),
    });
    const direct = ledger.beginDirect({
      transport: "dns",
      method: "A",
      url: "dns:example.test?type=A",
      bodyKind: "dns_answer_json",
    });
    direct.answered({ status: 0, body: new TextEncoder().encode("[]") });
    // A hung object store: the body upload never answers.
    const hung = recordingBlobStore({
      respond: async () =>
        new Promise<undefined>(() => {
          // Never settles: a hung store.
        }),
    });

    // The flag gets half the budget (at most 1 s): 50 ms left it 25 ms, less than one UPDATE on a
    // loaded CI database, so the flag itself timed out. 800 ms gives it 400 ms and still proves
    // the stop is bounded by the budget, far below the 5 s production default.
    const started = Date.now();
    await runDomainWith(Layer.mergeAll(Db.layer, hung.layer))(
      persistProviderCallsBestEffort(scope, () => ledger.drain(), 800)
    );

    expect(Date.now() - started).toBeLessThan(2000);
    expect((await jobsRepo.get(db, job.id))?.provenanceState).toBe(
      "incomplete"
    );
  });

  it("saves a call a cache served as served_from the original, which may be in another Case", async () => {
    const other = (await seedCase(db, { slug: "other" })).id;
    const originalJob = await seedJob(db, other, { status: "succeeded" });
    const originalScope = {
      caseId: other,
      jobId: originalJob.id,
      runId: "00000000-0000-4000-8000-0000000000c1",
    };
    const first = makeJobEgress({
      fetch: async () => new Response("feed body"),
      fetchPrivateOrigin: async () => new Response("feed body"),
    });
    const firstCall = first.ledger.beginDirect({
      transport: "dns",
      method: "A",
      url: "dns:feed.test?type=A",
      bodyKind: "dns_answer_json",
    });
    firstCall.answered({
      status: 0,
      body: new TextEncoder().encode("feed body"),
    });
    const store = recordingBlobStore();
    await runDomainWith(collectLayer(store))(
      persistProviderCallsEffect(originalScope, first.ledger.drain())
    );
    const [original] = first.ledger.drain();
    if (original === undefined) throw new Error("no original call");

    const job = await seedJob(db, caseId, { status: "running" });
    const second = makeJobEgress({
      fetch: async () => new Response("unused"),
      fetchPrivateOrigin: async () => new Response("unused"),
    });
    await Effect.runPromise(
      second.egress.recordServed({
        callId: original.id,
        transport: original.transport,
        method: original.method,
        url: original.url,
        bodyKind: original.bodyKind,
        status: original.status,
        responseHeaders: original.responseHeaders,
        body: { sha256: sha256("feed body"), bytes: 9 },
      })
    );
    await runDomainWith(collectLayer(store))(
      persistProviderCallsEffect(
        {
          caseId,
          jobId: job.id,
          runId: "00000000-0000-4000-8000-0000000000c2",
        },
        second.ledger.drain()
      )
    );

    const [served] = await providerCallsRepo.listForJob(db, caseId, job.id);
    expect(served?.outcome).toMatchObject({
      outcome: "served_from",
      servedFromCallId: original.id,
      bodyState: "hashed",
      bodyReason: "served_from",
      bodySha256: sha256("feed body"),
      blobKey: null,
    });
  });
});

describe("what is stored of a response body", () => {
  let caseId: CaseId;

  beforeEach(async () => {
    await resetTestDb();
    caseId = (await seedCase(db)).id;
  });

  it("stores no response body for a breach Cap: the hash and size stay", async () => {
    const payload = "recovered credentials ".repeat(20);
    const host = await provide({ "/dump": respondWith(payload) });
    const store = recordingBlobStore();
    const cap = fakeCap(
      "breach.fake.lookup",
      caseId,
      getText(`${host.origin}/dump`)
    );
    const state = await runningState(caseId, cap);

    await Effect.runPromise(collect(store, state));

    const [stored] = await providerCallsRepo.listForJob(
      db,
      caseId,
      state.jobId
    );
    expect(stored?.outcome).toMatchObject({
      outcome: "response",
      bodyState: "hashed",
      bodyReason: "hash_only",
      bodySha256: sha256(payload),
      bodyBytes: payload.length,
      blobKey: null,
    });
    expect(store.calls.filter((c) => c.command === "PutObjectCommand")).toEqual(
      []
    );
    expect(store.objects.size).toBe(0);
  });

  it("withholds a body over the Cap's keep limit and keeps its hash", async () => {
    const payload = "x".repeat(100);
    const host = await provide({ "/big": respondWith(payload) });
    const store = recordingBlobStore();
    const cap = fakeCap("test.collect", caseId, getText(`${host.origin}/big`), {
      rawResponse: { keep: { maxBytes: 10 } },
    });
    const state = await runningState(caseId, cap);

    await Effect.runPromise(collect(store, state));

    const [stored] = await providerCallsRepo.listForJob(
      db,
      caseId,
      state.jobId
    );
    expect(stored?.outcome).toMatchObject({
      bodyState: "hashed",
      bodyReason: "over_limit",
      bodySha256: sha256(payload),
      blobKey: null,
    });
    expect(store.objects.size).toBe(0);
  });
});
