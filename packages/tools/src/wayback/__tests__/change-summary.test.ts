import { describe, expect, it } from "vitest";

import { pageTextOf, summarizeChange } from "../change-summary";

const html = (title: string, body: string) =>
  new TextEncoder().encode(
    `<html><head><title>${title}</title></head><body>${body}</body></html>`
  );

describe("pageTextOf", () => {
  it("reads the title and visible text of HTML, without scripts", () => {
    const page = pageTextOf(
      html("Ada", "<p>One</p><script>secret()</script><p>Two</p>"),
      "text/html"
    );
    expect(page?.title).toBe("Ada");
    expect(page?.text).toContain("One");
    expect(page?.text).toContain("Two");
    expect(page?.text).not.toContain("secret");
  });

  it("is null for a body that is not text", () => {
    expect(
      pageTextOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png")
    ).toBeNull();
  });
});

describe("summarizeChange", () => {
  const before = { title: "Ada", text: "alpha\nbeta\ngamma" };

  it("reports a title change, the text length delta and line counts", () => {
    const after = {
      title: "Ada Lovelace",
      text: "alpha\ngamma\ndelta\nepsilon",
    };
    const change = summarizeChange(before, after);
    expect(change.titleChanged).toBe(true);
    expect(change.previousTitle).toBe("Ada");
    expect(change.textLengthDelta).toBe(after.text.length - before.text.length);
    expect(change.linesAdded).toBe(2);
    expect(change.linesRemoved).toBe(1);
    expect(change.sampleAdded).toEqual(["delta", "epsilon"]);
    expect(change.sampleRemoved).toEqual(["beta"]);
  });

  it("reports no change for identical text and title", () => {
    const change = summarizeChange(before, { ...before });
    expect(change).toMatchObject({
      titleChanged: false,
      textLengthDelta: 0,
      linesAdded: 0,
      linesRemoved: 0,
      sampleAdded: [],
      sampleRemoved: [],
    });
  });

  it("counts a repeated line each time it was added", () => {
    const change = summarizeChange(
      { title: null, text: "a" },
      { title: null, text: "a\na\na" }
    );
    expect(change.linesAdded).toBe(2);
  });

  it("stays bounded on a large page: few samples, each cut short", () => {
    const longLine = "x".repeat(10_000);
    const lines = Array.from({ length: 20_000 }, (_, i) => `line ${i}`);
    const change = summarizeChange(
      { title: null, text: "" },
      { title: null, text: [longLine, ...lines].join("\n") }
    );
    expect(change.sampleAdded).toHaveLength(3);
    expect(change.sampleAdded[0]?.length).toBeLessThanOrEqual(121);
    expect(change.linesAdded).toBeLessThanOrEqual(5000);
  });
});
