import { Effect, Stream } from "effect";

/**
 * Read a byte stream into memory, up to `maxBytes`. Succeeds with `null` the moment the stream
 * passes the limit: at most one chunk beyond it is pulled, and the source is closed (a Node
 * stream behind `Stream.fromAsyncIterable` is destroyed), so a huge body costs a bounded read.
 * String chunks (a web stream of text) are read as UTF-8.
 *
 * @canonical `readBoundedEffect`: A byte stream read into memory up to a limit (`null` past it; the source is closed early): never a hand-written `for await` byte counter
 */
export function readBoundedEffect<E>(
  body: Stream.Stream<Uint8Array | string, E>,
  maxBytes: number
): Effect.Effect<Uint8Array | null, E> {
  return Effect.suspend(() => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    return Stream.runForEachWhile(body, (chunk) =>
      Effect.sync(() => {
        const part = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        total += part.byteLength;
        if (total > maxBytes) return false;
        chunks.push(part);
        return true;
      })
    ).pipe(
      Effect.map(() => {
        if (total > maxBytes) return null;
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          out.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return out;
      })
    );
  });
}
