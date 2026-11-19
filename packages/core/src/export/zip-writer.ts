import { Effect, Stream } from "effect";
import { Zip, ZipDeflate, strToU8 } from "fflate";

import { InternalError } from "../errors/tagged-errors";

/**
 * Where a zip's bytes go: a response body, an S3 multipart upload. `write` completes when the
 * sink can take more, so a slow reader slows the export instead of filling memory.
 */
export type ZipSink = {
  readonly write: (chunk: Uint8Array) => Effect.Effect<void, InternalError>;
  readonly end: Effect.Effect<void, InternalError>;
};

/**
 * A `ZipSink` over a promise-based writer (a web `WritableStream`, a test buffer): a rejection
 * is the sink's `InternalError`, with the cause kept.
 */
export function zipSinkFromPromises(writer: {
  readonly write: (chunk: Uint8Array) => Promise<void>;
  readonly end: () => Promise<void>;
}): ZipSink {
  return {
    write: (chunk) =>
      Effect.tryPromise({
        try: () => writer.write(chunk),
        catch: (cause) =>
          new InternalError({ reason: "Couldn't write the archive", cause }),
      }),
    end: Effect.tryPromise({
      try: () => writer.end(),
      catch: (cause) =>
        new InternalError({ reason: "Couldn't finish the archive", cause }),
    }),
  };
}

const DEFLATE_LEVEL = 6;

/** One entry being written chunk by chunk: `push` as often as needed, then `end` once. */
export type ZipEntryWriter = {
  readonly push: (chunk: Uint8Array) => Effect.Effect<void, InternalError>;
  readonly end: Effect.Effect<void, InternalError>;
};

/**
 * A streaming zip: entries go in one at a time, and every compressed chunk is handed to the sink
 * as it is produced. Memory is one chunk of the entry being written plus what the sink buffers;
 * it does not grow with the number or size of the entries. Interrupting a write stops the entry
 * at the chunk in flight.
 */
export type ZipWriter = {
  /** Start an entry that is written in pieces over time (its caller owns the pacing). */
  readonly startEntry: (path: string) => ZipEntryWriter;
  /** Add an entry that is already in memory (markdown, an attestation). */
  readonly addText: (
    path: string,
    text: string
  ) => Effect.Effect<void, InternalError>;
  /** Add an entry from a stream; each chunk is compressed and flushed before the next is pulled. */
  readonly addStream: <E>(
    path: string,
    chunks: Stream.Stream<Uint8Array, E>
  ) => Effect.Effect<void, InternalError | E>;
  /** Write the central directory and end the sink. */
  readonly finish: Effect.Effect<void, InternalError>;
};

export function makeZipWriter(sink: ZipSink): ZipWriter {
  const ready: Uint8Array[] = [];
  let failure: Error | undefined;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else ready.push(chunk);
  });

  const healthy = Effect.suspend(() =>
    failure === undefined
      ? Effect.void
      : Effect.fail(
          new InternalError({
            reason: "The archive compressor failed",
            cause: failure,
          })
        )
  );

  // Chunks go to the sink one at a time: its backpressure is the point.
  const drain: Effect.Effect<void, InternalError> = Effect.suspend(() => {
    const chunk = ready.shift();
    return chunk === undefined
      ? Effect.void
      : sink.write(chunk).pipe(Effect.andThen(drain));
  });
  // A failed compressor takes no more chunks, and none of its output is written.
  const flush = healthy.pipe(Effect.andThen(drain), Effect.andThen(healthy));

  const startEntry = (path: string): ZipEntryWriter => {
    const entry = new ZipDeflate(path, { level: DEFLATE_LEVEL });
    zip.add(entry);
    return {
      push: (chunk) =>
        flush.pipe(
          Effect.andThen(
            Effect.sync(() => {
              entry.push(chunk, false);
            })
          ),
          Effect.andThen(flush)
        ),
      end: flush.pipe(
        Effect.andThen(
          Effect.sync(() => {
            entry.push(new Uint8Array(0), true);
          })
        ),
        Effect.andThen(flush)
      ),
    };
  };

  const addStream = <E>(
    path: string,
    chunks: Stream.Stream<Uint8Array, E>
  ): Effect.Effect<void, InternalError | E> =>
    Effect.suspend(() => {
      const entry = startEntry(path);
      return Stream.runForEach(chunks, entry.push).pipe(
        Effect.andThen(entry.end)
      );
    });

  return {
    startEntry,
    addText: (path, text) => addStream(path, Stream.make(strToU8(text))),
    addStream,
    finish: Effect.sync(() => {
      zip.end();
    }).pipe(Effect.andThen(flush), Effect.andThen(sink.end)),
  };
}
