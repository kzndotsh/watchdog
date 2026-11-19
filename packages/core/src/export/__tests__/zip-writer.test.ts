import { randomBytes } from "node:crypto";

import { Deferred, Effect, Exit, Fiber, Stream } from "effect";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { InternalError } from "../../errors/tagged-errors";
import {
  makeZipWriter,
  zipSinkFromPromises,
  type ZipSink,
} from "../zip-writer";

function collect(): ZipSink & {
  archive: () => Uint8Array;
  ended: () => boolean;
} {
  const chunks: Uint8Array[] = [];
  let ended = false;
  return {
    ...zipSinkFromPromises({
      write: (chunk) => {
        chunks.push(chunk);
        return Promise.resolve();
      },
      end: () => {
        ended = true;
        return Promise.resolve();
      },
    }),
    archive: () => Buffer.concat(chunks),
    ended: () => ended,
  };
}

/** One chunk per pull, as a Node stream delivers them. */
function chunked(parts: readonly string[]): Stream.Stream<Uint8Array> {
  return Stream.fromIterable(
    parts.map((part) => new TextEncoder().encode(part)),
    { chunkSize: 1 }
  );
}

describe("ZipWriter", () => {
  it("writes text and streamed entries into one readable archive, and ends the sink", async () => {
    const sink = collect();
    const zip = makeZipWriter(sink);
    await Effect.runPromise(
      Effect.gen(function* writeArchive() {
        yield* zip.addText("case/CASE.md", "# Case");
        yield* zip.addStream(
          "case/evidence/a.txt",
          chunked(["hello ", "stream", "ed"])
        );
        yield* zip.finish;
      })
    );

    expect(sink.ended()).toBe(true);
    const files = unzipSync(sink.archive());
    expect(Object.keys(files).sort()).toEqual([
      "case/CASE.md",
      "case/evidence/a.txt",
    ]);
    expect(new TextDecoder().decode(files["case/evidence/a.txt"])).toBe(
      "hello streamed"
    );
  });

  it("never pulls more than one chunk ahead of what the sink has taken (a slow reader slows the source)", async () => {
    let pulled = 0;
    const aheadAtWrite: number[] = [];
    const sink: ZipSink = {
      write: () =>
        Effect.sync(() => {
          aheadAtWrite.push(pulled);
        }),
      end: Effect.void,
    };
    function* source(): Generator<Uint8Array> {
      for (let i = 0; i < 6; i += 1) {
        pulled += 1;
        yield randomBytes(256 * 1024);
      }
    }
    await Effect.runPromise(
      makeZipWriter(sink).addStream(
        "big.bin",
        Stream.fromIterable(source(), { chunkSize: 1 })
      )
    );
    expect(pulled).toBe(6);
    // The k-th write (1-based) sees at most k + 1 pulls: a source drained up front would show 6.
    expect(aheadAtWrite.length).toBeGreaterThan(1);
    for (const [index, ahead] of aheadAtWrite.entries()) {
      expect(ahead).toBeLessThanOrEqual(index + 2);
    }
  });

  it("stops an entry at the chunk in flight once it is interrupted, and pulls no more", async () => {
    let pulled = 0;
    const exit = await Effect.runPromise(
      Effect.gen(function* interruptEntry() {
        const firstWrite = yield* Deferred.make<undefined>();
        const sink: ZipSink = {
          // The first write never completes: the export is waiting on a slow reader.
          write: () =>
            Deferred.succeed(firstWrite, undefined).pipe(
              Effect.andThen(Effect.never)
            ),
          end: Effect.void,
        };
        const source = Stream.fromIterable(
          Array.from({ length: 4 }, () => randomBytes(256 * 1024)),
          { chunkSize: 1 }
        ).pipe(
          Stream.tap(() =>
            Effect.sync(() => {
              pulled += 1;
            })
          )
        );
        const fiber = yield* Effect.forkChild(
          makeZipWriter(sink).addStream("a.bin", source)
        );
        yield* Deferred.await(firstWrite);
        yield* Fiber.interrupt(fiber);
        return yield* Effect.exit(Fiber.join(fiber));
      })
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(pulled).toBeLessThan(4);
  });

  it("takes no more chunks once the compressor has failed, and writes none of its output", async () => {
    const written: Uint8Array[] = [];
    const sink: ZipSink = {
      write: (chunk) =>
        Effect.sync(() => {
          written.push(chunk);
        }),
      end: Effect.void,
    };
    const entry = makeZipWriter(sink).startEntry("a.bin");
    await Effect.runPromise(entry.end);
    written.length = 0;

    // A push to a finished entry is an error fflate reports through its callback.
    const failure = await Effect.runPromise(
      Effect.flip(entry.push(randomBytes(300_000)))
    );
    expect(failure).toBeInstanceOf(InternalError);
    expect(written).toEqual([]);
  });
});
