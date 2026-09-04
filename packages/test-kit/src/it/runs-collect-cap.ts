import { Effect } from "effect";
import { expect, it } from "vitest";

import type {
  CapContext,
  CapInterpretOpts,
  CapInterpretResult,
  CapRun,
} from "@watchdog/cap-sdk";
import { runCap } from "@watchdog/cap-sdk";
import {
  parseJsonValue,
  REPORT_JSON_ARTIFACT,
  type JsonValue,
} from "@watchdog/schemas";

import { testId } from "../fixtures/ids.ts";

const SHA = "ab".repeat(32);

export interface CapRunHarness<
  I extends Record<string, unknown> = Record<string, unknown>,
> {
  ctx: CapContext<I>;
  artifacts: {
    name: string;
    mime: string;
    uri: string;
    sha256: string;
    bytes: Uint8Array;
  }[];
  credentialCalls: string[];
}

export function createCapRunHarness<
  I extends Record<string, unknown> = Record<string, unknown>,
>(opts?: {
  signal?: AbortSignal;
  secrets?: Record<string, string>;
  input?: I;
  evidenceSnapshot?: CapContext<I>["evidenceSnapshot"];
}): CapRunHarness<I> {
  const artifacts: CapRunHarness<I>["artifacts"] = [];
  const credentialCalls: string[] = [];
  const ctx: CapContext<I> = {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- default input is empty; callers pass `input` when I is specific
    input: opts?.input ?? ({} as I),
    caseId: testId(1),
    jobId: testId(2),
    signal: opts?.signal ?? new AbortController().signal,
    uploadArtifact: ({ bytes, mime, name }) => {
      const art = {
        name: name ?? "blob.bin",
        mime,
        uri: `s3://test/${name ?? "blob.bin"}`,
        sha256: SHA,
        bytes,
      };
      artifacts.push(art);
      return Effect.succeed({
        name: art.name,
        mime: art.mime,
        uri: art.uri,
        sha256: art.sha256,
      });
    },
    readArtifact: () => Effect.succeed(new Uint8Array()),
    scratchDir: "/tmp",
    getCredential: (name) => {
      credentialCalls.push(name);
      const secret = opts?.secrets?.[name];
      if (secret === undefined) {
        return Effect.die(new Error(`missing credential ${name}`));
      }
      return Effect.succeed(secret);
    },
    hasCredential: (name) =>
      Effect.succeed(opts?.secrets?.[name] !== undefined),
    allowThirdPartyEgress: true,
    log: (_message: string) => {},
    ...(opts?.evidenceSnapshot === undefined
      ? {}
      : { evidenceSnapshot: opts.evidenceSnapshot }),
  };
  return { ctx, artifacts, credentialCalls };
}

export function itRunsCollectCap<I extends Record<string, unknown>>(opts: {
  cap: {
    id: string;
    run: (ctx: CapContext<I>) => CapRun;
    interpret?: (
      report: JsonValue,
      opts: CapInterpretOpts<I>
    ) => CapInterpretResult;
  };
  input: I;
  setup?: () => void;
  credentialName?: string;
  secrets?: Record<string, string>;
  /** Substring that must appear in report.json (proves fetch, not an empty stub). */
  reportContains?: string;
  abort?: boolean;
}): void {
  it(`run() uploads ${REPORT_JSON_ARTIFACT} for ${opts.cap.id}`, async () => {
    opts.setup?.();
    const harness = createCapRunHarness({
      secrets: opts.secrets,
      input: opts.input,
    });
    const result = await runCap(opts.cap.run(harness.ctx));
    expect(
      result.artifacts.some((row) => row.name === REPORT_JSON_ARTIFACT)
    ).toBe(true);
    const report = harness.artifacts.find(
      (row) => row.name === REPORT_JSON_ARTIFACT
    );
    expect(report).toBeDefined();
    if (report === undefined) {
      throw new TypeError("expected report.json bytes");
    }
    const decoded = new TextDecoder().decode(report.bytes);
    if (opts.reportContains !== undefined) {
      expect(decoded).toContain(opts.reportContains);
    }
    const parsed = parseJsonValue(decoded);
    expect(opts.cap.interpret).toBeDefined();
    const interpreted = opts.cap.interpret?.(parsed, {
      input: opts.input,
    });
    expect(interpreted).toBeDefined();
    if (interpreted === undefined) {
      throw new TypeError("expected interpret result");
    }
    expect(interpreted.patch.length).toBeGreaterThan(0);
    if (opts.credentialName !== undefined) {
      expect(harness.credentialCalls).toContain(opts.credentialName);
    }
  });

  if (opts.abort === true) {
    it(`run() rejects when aborted for ${opts.cap.id}`, async () => {
      opts.setup?.();
      const controller = new AbortController();
      controller.abort();
      const harness = createCapRunHarness({
        secrets: opts.secrets,
        input: opts.input,
        signal: controller.signal,
      });
      await expect(runCap(opts.cap.run(harness.ctx))).rejects.toThrow(/abort/i);
    });
  }
}
