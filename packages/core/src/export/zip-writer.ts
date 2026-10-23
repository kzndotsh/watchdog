import { Zip, ZipDeflate, strToU8 } from "fflate";

/**
 * Where a zip's bytes go: a response body, an S3 multipart upload. `write` resolves when the sink
 * can take more, so a slow reader slows the export instead of filling memory.
 */
export type ZipSink = {
  readonly write: (chunk: Uint8Array) => Promise<void>;
  readonly end: () => Promise<void>;
};

const DEFLATE_LEVEL = 6;

/** One entry being written chunk by chunk: `push` as often as needed, then `end` once. */
export type ZipEntryWriter = {
  readonly push: (chunk: Uint8Array, signal?: AbortSignal) => Promise<void>;
  readonly end: () => Promise<void>;
};

/**
 * A streaming zip: entries go in one at a time, and every compressed chunk is handed to the sink
 * as it is produced. Memory is one chunk of the entry being written plus what the sink buffers;
 * it does not grow with the number or size of the entries.
 */
export class ZipWriter {
  private readonly zip: Zip;
  private readonly sink: ZipSink;
  private readonly ready: Uint8Array[] = [];
  private failure: Error | undefined;

  constructor(sink: ZipSink) {
    this.sink = sink;
    this.zip = new Zip((error, chunk) => {
      if (error) this.failure = error;
      else this.ready.push(chunk);
    });
  }

  private assertHealthy(): void {
    if (this.failure) throw this.failure;
  }

  private async flush(): Promise<void> {
    // A failed compressor takes no more chunks, and none of its output is written.
    this.assertHealthy();
    for (let chunk = this.ready.shift(); chunk; chunk = this.ready.shift()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the sink's backpressure is the point
      await this.sink.write(chunk);
    }
    this.assertHealthy();
  }

  /** Start an entry that is written in pieces over time (its caller owns the pacing). */
  startEntry(path: string): ZipEntryWriter {
    const entry = new ZipDeflate(path, { level: DEFLATE_LEVEL });
    this.zip.add(entry);
    return {
      push: async (chunk, signal) => {
        signal?.throwIfAborted();
        await this.flush();
        entry.push(chunk, false);
        await this.flush();
      },
      end: async () => {
        await this.flush();
        entry.push(new Uint8Array(0), true);
        await this.flush();
      },
    };
  }

  /** Add an entry that is already in memory (markdown, an attestation). */
  async addText(
    path: string,
    text: string,
    signal?: AbortSignal
  ): Promise<void> {
    await this.addStream(path, [strToU8(text)], signal);
  }

  /**
   * Add an entry from chunks; each chunk is compressed and flushed before the next is pulled.
   * An aborted `signal` stops the entry at the next chunk.
   */
  async addStream(
    path: string,
    chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
    signal?: AbortSignal
  ): Promise<void> {
    const entry = this.startEntry(path);
    for await (const chunk of chunks) {
      await entry.push(chunk, signal);
    }
    await entry.end();
  }

  /** Write the central directory and end the sink. */
  async finish(): Promise<void> {
    this.zip.end();
    await this.flush();
    await this.sink.end();
  }
}
