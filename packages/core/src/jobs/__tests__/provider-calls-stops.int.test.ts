import { Effect, Fiber, Layer, Result } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, jobsRepo, providerCallsRepo } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { resetTestDb, seedCase, seedJob } from "@watchdog/test-db";
import { createServedCache, makeJobEgress } from "@watchdog/tools/http";

import { recordingBlobStore } from "../../infra/blob-store";
import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import { createJobLog } from "../job-log";
import { persistProviderCallsBestEffort } from "../provider-calls";
import { collectEffect } from "../stages/collect";
import {
  collectLayer,
  fakeCap,
  getText,
  respondWith,
  runningState,
  startProvider,
  type LoopbackProvider,
} from "./helpers/provider-calls-harness";

// The Job's request must open a real connection to the loopback provider.
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

/** A store whose body upload never answers. */
function hungStore() {
  return recordingBlobStore({
    respond: async (call) =>
      call.command === "PutObjectCommand"
        ? new Promise<undefined>(() => {
            // Never settles: a hung store.
          })
        : undefined,
  });
}

describe("stops and failures while the record is being saved", () => {
  let caseId: CaseId;

  beforeEach(async () => {
    await resetTestDb();
    caseId = (await seedCase(db)).id;
  });

  it("flags the Job incomplete when a stop lands while the outcomes are being saved", async () => {
    const host = await provide({ "/v1/host": respondWith('{"ok":true}') });
    const store = hungStore();
    const cap = fakeCap(
      "test.collect",
      caseId,
      getText(`${host.origin}/v1/host`)
    );
    const state = await runningState(caseId, cap);

    const fiber = Effect.runFork(collect(store, state));
    await expect
      .poll(() =>
        store.calls.some((call) => call.command === "PutObjectCommand")
      )
      .toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect((await jobsRepo.get(db, state.jobId))?.provenanceState).toBe(
      "incomplete"
    );
  });

  it("holds a stop for one budget, not two, when the store and the database are both stuck", async () => {
    const job = await seedJob(db, caseId, { status: "running" });
    const scope = {
      caseId,
      jobId: job.id,
      runId: "00000000-0000-4000-8000-0000000000d1",
    };
    const { ledger } = makeJobEgress({
      fetch: async () => new Response("x"),
      fetchPrivateOrigin: async () => new Response("x"),
    });
    ledger
      .beginDirect({
        transport: "dns",
        method: "A",
        url: "dns:example.test?type=A",
        bodyKind: "dns_answer_json",
      })
      .answered({ status: 0, body: new TextEncoder().encode("[]") });
    // A stuck database: another transaction holds the Job's row, so the flag's UPDATE waits.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const holding = db.transaction(async (tx) => {
      await jobsRepo.lockStatus(tx, caseId, job.id);
      locked();
      await gate;
    });
    await lockTaken;

    // A direct call has a kept body, so the hung store stalls the save.
    const budgetMs = 800;
    const started = Date.now();
    await runDomainWith(Layer.mergeAll(Db.layer, hungStore().layer))(
      persistProviderCallsBestEffort(scope, () => ledger.drain(), budgetMs)
    );
    const held = Date.now() - started;
    release();
    await holding;

    expect(held).toBeLessThan(budgetMs + 500);
  });
});

describe("an in-process cache and the calls behind it", () => {
  let caseId: CaseId;

  beforeEach(async () => {
    await resetTestDb();
    caseId = (await seedCase(db)).id;
  });

  const feed = (
    cache: ReturnType<typeof createServedCache<string>>,
    url: string
  ) =>
    Effect.gen(function* feedGen() {
      const cached = yield* cache.get("feed");
      if (cached !== undefined) return cached;
      const text = yield* getText(url);
      yield* cache.set("feed", text, url);
      return text;
    });

  it("serves a later Job from the call once it is saved, recording a served_from call", async () => {
    const host = await provide({ "/feed": respondWith("feed body") });
    const cache = createServedCache<string>(60_000);
    const cap = fakeCap(
      "test.feed",
      caseId,
      feed(cache, `${host.origin}/feed`)
    );
    const store = recordingBlobStore();
    const first = await runningState(caseId, cap);
    const second = await runningState(caseId, cap);

    const a = await Effect.runPromise(collect(store, first));
    await Effect.runPromise(collect(store, second));

    expect(host.hits()).toEqual(["/feed"]);
    const [served] = await providerCallsRepo.listForJob(
      db,
      caseId,
      second.jobId
    );
    expect(served?.outcome).toMatchObject({
      outcome: "served_from",
      servedFromCallId: a.providerCallIds[0],
    });
  });

  it("does not serve a later Job from a call whose save failed: it fetches again", async () => {
    const host = await provide({ "/feed": respondWith("feed body") });
    const cache = createServedCache<string>(60_000);
    const cap = fakeCap(
      "test.feed",
      caseId,
      feed(cache, `${host.origin}/feed`)
    );
    const failing = recordingBlobStore({
      respond: (call) => {
        if (call.command === "PutObjectCommand") throw new Error("store down");
      },
    });
    const first = await runningState(caseId, cap);
    const second = await runningState(caseId, cap);

    const lost = await Effect.runPromise(
      Effect.result(collect(failing, first))
    );
    expect(Result.isFailure(lost)).toBe(true);
    await Effect.runPromise(collect(recordingBlobStore(), second));

    expect(host.hits()).toEqual(["/feed", "/feed"]);
    const [own] = await providerCallsRepo.listForJob(db, caseId, second.jobId);
    expect(own?.outcome?.outcome).toBe("response");
    expect(own?.outcome?.servedFromCallId).toBeNull();
  });
});
