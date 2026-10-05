import { Deferred, Effect, Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { casesRepo, db } from "@watchdog/db";
import { resetTestDb, seedCase } from "@watchdog/test-db";

import { readArtifactBytesEffect } from "../blob";
import { BlobStore, recordingBlobStore } from "../blob-store";
import { Db } from "../db-service";
import {
  claimCaseExportEffect,
  ExportWriteServices,
  isolatedExportWriteServices,
  scheduleCaseExportEffect,
} from "../export-sync";
import { tryDbWith } from "../postgres-effect";
import { transact } from "../postgres-tx";
import { runDomainWith } from "../run-domain";

const ROLLBACK = new Error("rollback");

describe("detached export write services", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("uses the pool, not the caller's transaction, once that transaction rolled back", async () => {
    const row = await seedCase(db, { name: "Exported" });
    const seen: string[] = [];
    const writeExport = (id: string) =>
      tryDbWith((exec) => casesRepo.getByIdUnchecked(exec, id)).pipe(
        Effect.tap((found) =>
          Effect.sync(() => {
            seen.push(found?.id ?? "missing");
          })
        ),
        Effect.orDie
      );
    let waitForWrite: Effect.Effect<void> = Effect.void;
    await db
      .transaction(async (tx) => {
        waitForWrite = await runDomainWith(Db.layerOf(tx))(
          claimCaseExportEffect(row.id, writeExport)
        );
        throw ROLLBACK;
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error;
      });
    // The caller's tx is rolled back by now; the write still completes.
    await Effect.runPromise(waitForWrite);
    expect(seen).toEqual([row.id]);
  });

  it("completes after the interpreting call returned, on its own BlobStore", async () => {
    const uri = "artifacts/a.txt";
    const caller = recordingBlobStore();
    const own = recordingBlobStore({
      objects: new Map([[uri, new TextEncoder().encode("bytes")]]),
    });
    const read: Uint8Array[] = [];
    const callerDestroyedAtWrite: boolean[] = [];

    const program = Effect.gen(function* programGen() {
      const gate = yield* Deferred.make<undefined>();
      const writeExport = () =>
        Effect.gen(function* writeExportGen() {
          yield* Deferred.await(gate);
          callerDestroyedAtWrite.push(caller.destroyed());
          read.push(yield* readArtifactBytesEffect(uri));
        }).pipe(Effect.orDie);
      const waitForWrite = yield* claimCaseExportEffect(
        "11111111-1111-4111-8111-000000000077",
        writeExport
      ).pipe(
        Effect.provide(caller.layer),
        Effect.provideService(
          ExportWriteServices,
          Layer.mergeAll(Db.layer, own.layer)
        )
      );
      return { gate, waitForWrite };
    });

    // The interpreting call returns (and releases the caller's store) first.
    const { gate, waitForWrite } = await Effect.runPromise(program);
    expect(caller.destroyed()).toBe(true);
    expect(own.destroyed()).toBe(false);

    await Effect.runPromise(
      Deferred.succeed(gate, undefined).pipe(Effect.andThen(waitForWrite))
    );

    expect(callerDestroyedAtWrite).toEqual([true]);
    expect(new TextDecoder().decode(read[0])).toBe("bytes");
    expect(caller.calls).toEqual([]);
    expect(own.calls.map((call) => call.command)).toEqual(["GetObjectCommand"]);
    // The write fiber released its own store when the write ended.
    expect(own.destroyed()).toBe(true);
  });

  it("claimed inside a transact body, the write may open its own transact", async () => {
    const row = await seedCase(db, { name: "Claimed" });
    let wrote = false;
    const writeExport = () =>
      transact(() =>
        Effect.sync(() => {
          wrote = true;
        })
      ).pipe(Effect.orDie);
    const waitForWrite = await Effect.runPromise(
      Effect.provide(
        transact(() => claimCaseExportEffect(row.id, writeExport)),
        Db.layer
      )
    );
    await Effect.runPromise(waitForWrite);
    expect(wrote).toBe(true);
  });

  it("isolatedExportWriteServices keeps the write off real S3", async () => {
    const endpoint = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* endpointGen() {
          const store = yield* BlobStore;
          return yield* Effect.promise(async () => {
            const resolved = await store.client.config.endpoint?.();
            return resolved?.hostname ?? "";
          });
        }).pipe(Effect.provide(isolatedExportWriteServices()))
      )
    );
    expect(endpoint).toBe("blob.test.invalid");
  });

  it("schedule needs no caller services", async () => {
    let ran = 0;
    await Effect.runPromise(
      scheduleCaseExportEffect("11111111-1111-4111-8111-000000000078", () =>
        Effect.sync(() => {
          ran += 1;
        })
      )
    );
    expect(ran).toBe(1);
  });
});
