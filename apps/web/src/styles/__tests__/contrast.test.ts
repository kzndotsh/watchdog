import { describe, expect, it } from "vitest";

import { AA_TEXT, tokenContrast, type Theme } from "@/testing/contrast";

/** Text token on the surface it renders over. Each pair below is text the UI draws. */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["--foreground", "--background"],
  ["--muted-foreground", "--background"],
  ["--muted-foreground", "--muted"],
  ["--primary", "--background"],
  ["--destructive", "--background"],
  ["--signal", "--background"],
  ["--success", "--background"],
];

const THEMES: readonly Theme[] = ["light", "dark"];

describe("token contrast", () => {
  for (const theme of THEMES) {
    for (const [fg, bg] of TEXT_PAIRS) {
      it(`${theme}: ${fg} on ${bg} meets WCAG AA (4.5:1)`, () => {
        expect(tokenContrast(fg, bg, theme)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }
});
