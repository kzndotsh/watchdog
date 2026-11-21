import { describe, expect, it } from "vitest";

import { decodeHtml, isHtml, isMarkdown, mergeUnique } from "../sniff.ts";

describe("html sniff", () => {
  it("detects html from bytes and content-type", () => {
    const bytes = new TextEncoder().encode("<!doctype html><html></html>");
    expect(isHtml(null, bytes)).toBe(true);
    expect(isHtml("text/html", new Uint8Array())).toBe(true);
    expect(isMarkdown("text/markdown")).toBe(true);
    expect(mergeUnique(["b"], ["a", "b"])).toEqual(["a", "b"]);
    expect(decodeHtml(bytes)).toMatch(/doctype/i);
  });
});
