import { describe, expect, it, vi } from "vitest";

const loads = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/shared/ui/rich-text/rich-text-editor", () => {
  loads.count += 1;
  if (loads.count === 1) throw new Error("chunk failed");
  return { RichTextEditor: () => null };
});

import { preloadRichTextEditor } from "@/shared/ui/rich-text/load-rich-text-editor";

describe("preloadRichTextEditor", () => {
  it("does not cache a failed import: the next call retries and succeeds", async () => {
    await expect(preloadRichTextEditor()).rejects.toThrow();

    await expect(preloadRichTextEditor()).resolves.toHaveProperty(
      "RichTextEditor"
    );
    expect(loads.count).toBe(2);

    await preloadRichTextEditor();
    expect(loads.count).toBe(2);
  });
});
