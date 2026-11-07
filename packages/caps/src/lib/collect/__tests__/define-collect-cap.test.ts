import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";

import { defineProvider, runCap } from "../../../sdk";
import { createCapRunHarness } from "../../../testing/runs-collect-cap";
import { defineCollectCap } from "../define-collect-cap";

const baseDef = {
  provider: defineProvider({
    name: "Test provider",
    url: "https://example.com",
    termsUrl: "https://example.com/terms",
    tier: "self",
    commercialUse: "allowed",
  }),
  id: "test.collect",
  contacts: [],
  title: "Test collect",
  description: "unit test cap",
  dataSource: "test",
  input: z.object({}),
  schema: z.object({ ok: z.boolean() }),
  reportLabel: "test",
};

const interpreted = { patch: [], summary: "interpreted" };

describe("defineCollectCap", () => {
  it("run uploads the fetched snapshot as report.json and as the named artifact", async () => {
    const harness = createCapRunHarness<Record<string, never>>();
    const cap = defineCollectCap({
      ...baseDef,
      fetch: () =>
        Effect.succeed({ snap: { ok: true }, artifactName: "data.json" }),
      interpretSnap: () => interpreted,
    });

    const runResult = await runCap(cap.run(harness.ctx));

    expect(
      runResult.artifacts.map(({ name, mime }) => ({ name, mime }))
    ).toEqual([
      { name: REPORT_JSON_ARTIFACT, mime: "application/json" },
      { name: "data.json", mime: "application/json" },
    ]);
    const bodies = harness.artifacts.map(({ bytes }) =>
      new TextDecoder().decode(bytes)
    );
    expect(bodies).toEqual([
      JSON.stringify({ ok: true }, null, 2),
      JSON.stringify({ ok: true }, null, 2),
    ]);
  });

  it("run uploads nothing when the fetch fails", async () => {
    const harness = createCapRunHarness<Record<string, never>>();
    const cap = defineCollectCap({
      ...baseDef,
      fetch: () => Effect.die(new Error("provider down")),
      interpretSnap: () => interpreted,
    });

    await expect(runCap(cap.run(harness.ctx))).rejects.toThrow();
    expect(harness.artifacts).toEqual([]);
  });

  it("interpret hands the schema-parsed report and the options to interpretSnap", () => {
    const received: unknown[] = [];
    const cap = defineCollectCap({
      ...baseDef,
      fetch: () => Effect.die(new Error("unused")),
      interpretSnap: (snap, opts) => {
        received.push(snap, opts);
        return interpreted;
      },
    });

    const result = cap.interpret?.(
      { ok: true, extra: "dropped" },
      { input: {} }
    );

    expect(received).toEqual([{ ok: true }, { input: {} }]);
    expect(result).toEqual(interpreted);
  });

  it("interpret throws on invalid report shape", () => {
    let called = false;
    const cap = defineCollectCap({
      ...baseDef,
      fetch: () => Effect.die(new Error("unused")),
      interpretSnap: () => {
        called = true;
        return interpreted;
      },
    });

    expect(() => cap.interpret?.({ bad: true }, { input: {} })).toThrow(
      /Invalid test report/
    );
    expect(called).toBe(false);
  });
});
