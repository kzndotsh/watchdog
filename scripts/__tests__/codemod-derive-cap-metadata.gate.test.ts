/**
 * The derive-cap-metadata codemod (#313): it removes the Cap metadata that is now derived
 * and leaves everything else, including a user agent that is not `watchdogUserAgent(id)`.
 */
import { describe, expect, it } from "vitest";

import { transformCapSource } from "../codemods/derive-cap-metadata.mjs";

const CAP = `import { Effect } from "effect";

const UA = "Watchdog/1.0 (+threat.demo.lookup; OSINT)";

export const demo = defineCollectCap({
  id: "threat.demo.lookup",
  flags: ["needs_key", "third_party", "slow"],
  egress: "third_party",
  credentials: [{ name: "DEMO_KEY" }],
  reportLabel: "demo.lookup",
  fetch: (ctx) =>
    Effect.gen(function* () {
      return fetchDemo(ctx.input.ip, ctx.signal, { userAgent: UA });
    }),
});
`;

describe("derive-cap-metadata codemod", () => {
  it("drops derived flags, the label copy and the UA const", () => {
    const { source, counts, notes } = transformCapSource(CAP, "cap.ts");
    expect(source).toContain('flags: ["slow"]');
    expect(source).not.toContain("reportLabel");
    expect(source).not.toContain("const UA");
    expect(source).toContain("fetch: (ctx, { userAgent }) =>");
    expect(source).toContain("{ userAgent }");
    expect(source).toContain('egress: "third_party"');
    expect(counts).toMatchObject({
      needsKeyFlag: 1,
      thirdPartyFlag: 1,
      reportLabelShortened: 1,
      uaConst: 1,
      uaUses: 1,
    });
    expect(notes).toEqual([]);
  });

  it("removes a flags array that held only derived flags", () => {
    const { source } = transformCapSource(
      CAP.replace('["needs_key", "third_party", "slow"]', '["third_party"]'),
      "cap.ts"
    );
    expect(source).not.toContain("flags:");
  });

  it("is idempotent", () => {
    const once = transformCapSource(CAP, "cap.ts").source;
    const twice = transformCapSource(once, "cap.ts");
    expect(twice.source).toBe(once);
  });

  it("leaves a user agent that is not the helper's format, and says so", () => {
    const custom = CAP.replace("(+threat.demo.lookup; OSINT)", "(+custom)");
    const { source, notes } = transformCapSource(custom, "cap.ts");
    expect(source).toContain('const UA = "Watchdog/1.0 (+custom)"');
    expect(source).toContain("userAgent: UA");
    expect(notes.join("\n")).toContain("UA is not watchdogUserAgent(id)");
  });
});
