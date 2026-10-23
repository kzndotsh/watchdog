import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { ValidationVendorError } from "../../errors";
import { analyzeFileBytes } from "../analyze.ts";
import { analyzeEmlText, EML_PARSE_LIMITS } from "../eml.ts";
import { EML_MAX_INPUT_BYTES, FILE_MAX_INPUT_BYTES } from "../limits.ts";

/**
 * Explicit time budget per generated input: generous for a loaded CI runner,
 * far below what super-linear work on inputs this size would take.
 */
const BUDGET_MS = 3000;

const id = testId(50);
const HEAD = "From: a@mailhost.test\nSubject: s\n";

async function timed<T>(
  run: () => Promise<T> | T
): Promise<{ ms: number; out: T }> {
  const start = performance.now();
  const out = await run();
  return { ms: performance.now() - start, out };
}

async function failure(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return null;
}

describe("analyzeEmlText stays bounded on generated input", () => {
  it("deeply nested multipart is refused within budget", async () => {
    let text = `${HEAD}MIME-Version: 1.0\nContent-Type: multipart/mixed; boundary="b0"\n\n`;
    for (let i = 0; i < 5000; i += 1) {
      text += `--b${i}\nContent-Type: multipart/mixed; boundary="b${i + 1}"\n\n`;
    }
    const { ms, out } = await timed(() =>
      failure(() => analyzeEmlText(id, text))
    );
    expect(out).toBeInstanceOf(ValidationVendorError);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("an enormous header line finishes within budget", async () => {
    const text = `${HEAD}X-Big: ${"a".repeat(8_000_000)}\n\nbody`;
    const { ms, out } = await timed(() =>
      failure(() => analyzeEmlText(id, text))
    );
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(out === null || out instanceof ValidationVendorError).toBe(true);
  });

  it("many headers are refused within budget", async () => {
    const text = `${HEAD}${"X-H: v\n".repeat(400_000)}\nbody`;
    const { ms, out } = await timed(() =>
      failure(() => analyzeEmlText(id, text))
    );
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(out).toBeInstanceOf(ValidationVendorError);
  });

  it("many parts are refused within budget", async () => {
    const parts = "--b\nContent-Type: text/plain\n\nx\n".repeat(
      EML_PARSE_LIMITS.maxPartCount * 5
    );
    const text = `${HEAD}Content-Type: multipart/mixed; boundary=b\n\n${parts}--b--\n`;
    const { ms, out } = await timed(() =>
      failure(() => analyzeEmlText(id, text))
    );
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(out).toBeInstanceOf(ValidationVendorError);
  });

  it("pathological boundaries finish within budget", async () => {
    const dashes = "-".repeat(2_000_000);
    const boundary = "-".repeat(70);
    const text = `${HEAD}Content-Type: multipart/mixed; boundary="${boundary}"\n\n${dashes}\n--${boundary}x\n${dashes}\n`;
    const { ms } = await timed(() => failure(() => analyzeEmlText(id, text)));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("address and URL lookalikes extract in linear time", async () => {
    const body = [
      "a".repeat(1_000_000),
      "a.".repeat(500_000),
      "a@".repeat(500_000),
      "http://".repeat(300_000),
      `x@${"a-".repeat(500_000)}`,
    ].join("\n");
    const { ms, out } = await timed(() =>
      analyzeEmlText(id, `${HEAD}\n${body}`)
    );
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(out.emails.length).toBeLessThanOrEqual(50);
    expect(out.urls.length).toBeLessThanOrEqual(50);
  });

  it("refuses input over the size cap without parsing it", async () => {
    const text = "a".repeat(EML_MAX_INPUT_BYTES + 1);
    const { ms, out } = await timed(() =>
      failure(() => analyzeEmlText(id, text))
    );
    expect(out).toBeInstanceOf(ValidationVendorError);
    expect(out).toHaveProperty(
      "message",
      "EML input exceeds the 25 MiB analysis limit"
    );
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("counts bytes, not characters, against the cap", async () => {
    const text = "é".repeat(Math.ceil(EML_MAX_INPUT_BYTES / 2) + 1);
    expect(await failure(() => analyzeEmlText(id, text))).toBeInstanceOf(
      ValidationVendorError
    );
  });
});

function jpegWithExif(tiff: Uint8Array): Uint8Array {
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = payload.length + 2;
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe1,
    Math.floor(len / 256),
    len % 256,
    ...payload,
    0xff,
    0xd9,
  ]);
}

describe("analyzeFileBytes stays bounded on generated input", () => {
  it("reads EXIF tag presence from a JPEG", () => {
    // Little-endian TIFF, IFD0 at offset 8 holding Make (0x010f) and Software (0x0131).
    const tiff = [
      0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 2, 0, 0x0f, 0x01, 2, 0, 1, 0, 0, 0, 0, 0,
      0, 0, 0x31, 0x01, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ];
    const snap = analyzeFileBytes(id, jpegWithExif(Uint8Array.from(tiff)));
    expect(snap.exifHints).toEqual(["Make", "Software"]);
  });

  it("a huge IFD entry count finishes within budget", async () => {
    const tiff = new Uint8Array(65_000);
    tiff.set([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 0xff, 0xff]);
    for (let i = 0; i < 5000; i += 1) {
      tiff.set([0x69, 0x87, 4, 0, 1, 0, 0, 0, 8, 0, 0, 0], 10 + i * 12);
    }
    const { ms, out } = await timed(() =>
      analyzeFileBytes(id, jpegWithExif(tiff))
    );
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(Array.isArray(out.exifHints)).toBe(true);
  });

  it("many JPEG segments and a long PDF key run finish within budget", async () => {
    const jpeg = new Uint8Array(4_000_000);
    jpeg.set([0xff, 0xd8]);
    for (let i = 2; i + 4 <= jpeg.length; i += 4) {
      jpeg.set([0xff, 0xe0, 0, 2], i);
    }
    const pdf = new TextEncoder().encode(
      `%PDF-1.7\n${"/Author".repeat(40_000)}${"(".repeat(200_000)}`
    );
    const a = await timed(() => analyzeFileBytes(id, jpeg));
    const b = await timed(() => analyzeFileBytes(id, pdf));
    expect(a.ms).toBeLessThan(BUDGET_MS);
    expect(b.ms).toBeLessThan(BUDGET_MS);
  });

  it("refuses an oversized file within budget", async () => {
    const big = new Uint8Array(FILE_MAX_INPUT_BYTES + 1);
    const { ms, out } = await timed(() =>
      failure(() => analyzeFileBytes(id, big))
    );
    expect(out).toBeInstanceOf(ValidationVendorError);
    expect(out).toHaveProperty(
      "message",
      "File input exceeds the 64 MiB analysis limit"
    );
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
