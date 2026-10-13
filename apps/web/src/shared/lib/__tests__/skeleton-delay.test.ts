import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  SKELETON_DELAY_CLASS,
  SKELETON_SHOW_DELAY_MS,
} from "@/shared/lib/skeleton-delay";

const css = readFileSync(
  path.resolve(import.meta.dirname, "../../../styles/wd-overrides.css"),
  "utf-8"
);

describe("skeleton show-delay stylesheet", () => {
  it("defines the delay custom property equal to the exported constant", () => {
    const match = /--skeleton-show-delay:\s*(\d+)ms;/.exec(css);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(SKELETON_SHOW_DELAY_MS);
  });

  it("reveals the wrapper class with a delayed opacity keyframe", () => {
    expect(css).toMatch(
      /@keyframes wd-skeleton-reveal\s*{\s*from\s*{\s*opacity:\s*0;\s*}\s*to\s*{\s*opacity:\s*1;\s*}\s*}/
    );
    const rule = new RegExp(
      `\\.${SKELETON_DELAY_CLASS}\\s*{[^}]*animation:\\s*wd-skeleton-reveal 1ms linear var\\(--skeleton-show-delay\\) both;`
    );
    expect(css).toMatch(rule);
  });
});
