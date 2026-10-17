import { beforeEach, describe, expect, it, vi } from "vitest";

const loads = vi.hoisted(() => ({ count: 0 }));

describe("preloadRichTextEditor", () => {
  // The loader caches its import in module state and the mock factory counts loads: start
  // every test (and repeat) from fresh modules, a zero count and a freshly registered mock
  // (a `vi.mock` factory's result is cached across `resetModules`).
  beforeEach(() => {
    vi.resetModules();
    loads.count = 0;
    vi.doMock("@/shared/ui/rich-text/rich-text-editor", () => {
      loads.count += 1;
      if (loads.count === 1) throw new Error("chunk failed");
      return { RichTextEditor: () => null };
    });
  });

  it("does not cache a failed import: the next call retries and succeeds", async () => {
    const { preloadRichTextEditor } =
      await import("@/shared/ui/rich-text/load-rich-text-editor");

    await expect(preloadRichTextEditor()).rejects.toThrow();

    await expect(preloadRichTextEditor()).resolves.toHaveProperty(
      "RichTextEditor"
    );
    expect(loads.count).toBe(2);

    await preloadRichTextEditor();
    expect(loads.count).toBe(2);
  });
});
