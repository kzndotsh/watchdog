import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { renderCapRegister } from "../cap-register";
import { CAPABILITIES, listCapabilities } from "../registry";

const registerPath = path.join(
  import.meta.dirname,
  "../../../../docs/reference/platform/cap-register.md"
);

describe("cap-register.md", () => {
  it("matches the live providers (run pnpm generate:caps if this fails)", () => {
    const committed = readFileSync(registerPath, "utf-8");
    expect(
      committed,
      "cap-register.md is stale — run: pnpm generate:caps"
    ).toBe(renderCapRegister(listCapabilities()));
  });

  it("lists every Cap once, with a terms link", () => {
    const committed = readFileSync(registerPath, "utf-8");
    for (const cap of CAPABILITIES) {
      const rows = committed
        .split("\n")
        .filter((line) => line.startsWith(`| \`${cap.id}\` |`));
      expect(rows, cap.id).toHaveLength(1);
      expect(rows[0]).toContain(`](${cap.provider.termsUrl})`);
    }
  });

  it("escapes pipes and shows optional and alternative credentials", () => {
    const base = {
      id: "demo.one.lookup",
      title: "Demo",
      provider: {
        name: "A | B",
        url: "https://example.com",
        termsUrl: "https://example.com/terms",
        tier: "freemium" as const,
        commercialUse: "restricted" as const,
        attribution: { text: "Data from A", url: "https://example.com" },
      },
      credentials: [
        { anyOf: ["ONE_KEY", "TWO_KEY"] },
        { name: "THREE", optional: true },
      ],
    };
    const md = renderCapRegister([base]);
    expect(md).toContain("[A \\| B](https://example.com)");
    expect(md).toContain("`ONE_KEY` or `TWO_KEY`, `THREE`?");
    expect(md).toContain("[Data from A](https://example.com)");
    expect(md).toContain("## demo");
  });
});
