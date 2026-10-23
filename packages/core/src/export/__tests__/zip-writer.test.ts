import { randomBytes } from "node:crypto";

import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { ZipWriter, type ZipSink } from "../zip-writer";

function collect(): ZipSink & {
  archive: () => Uint8Array;
  ended: () => boolean;
} {
  const chunks: Uint8Array[] = [];
  let ended = false;
  return {
    write: (chunk) => {
      chunks.push(chunk);
      return Promise.resolve();
    },
    end: () => {
      ended = true;
      return Promise.resolve();
    },
    archive: () => Buffer.concat(chunks),
    ended: () => ended,
  };
}

function* chunked(parts: readonly string[]): Generator<Uint8Array> {
  for (const part of parts) yield new TextEncoder().encode(part);
}

describe("ZipWriter", () => {
  it("writes text and streamed entries into one readable archive, and ends the sink", async () => {
    const sink = collect();
    const zip = new ZipWriter(sink);
    await zip.addText("case/CASE.md", "# Case");
    await zip.addStream(
      "case/evidence/a.txt",
      chunked(["hello ", "stream", "ed"])
    );
    await zip.finish();

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
      write: () => {
        aheadAtWrite.push(pulled);
        return Promise.resolve();
      },
      end: () => Promise.resolve(),
    };
    function* source(): Generator<Uint8Array> {
      for (let i = 0; i < 6; i += 1) {
        pulled += 1;
        yield randomBytes(256 * 1024);
      }
    }
    await new ZipWriter(sink).addStream("big.bin", source());
    expect(pulled).toBe(6);
    // The k-th write (1-based) sees at most k + 1 pulls: a source drained up front would show 6.
    expect(aheadAtWrite.length).toBeGreaterThan(1);
    for (const [index, ahead] of aheadAtWrite.entries()) {
      expect(ahead).toBeLessThanOrEqual(index + 2);
    }
  });

  it("stops an entry at the next chunk once its signal aborts", async () => {
    const controller = new AbortController();
    const zip = new ZipWriter(collect());
    async function* source(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array(10);
      controller.abort();
      yield new Uint8Array(10);
    }
    await expect(
      zip.addStream("a.bin", source(), controller.signal)
    ).rejects.toThrow();
  });
});
