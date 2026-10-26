import { describe, expect, it, vi } from "vitest";

import { memoizeImport, prefetchImport } from "@/shared/lib/preload-import";

describe("memoizeImport", () => {
  it("starts the import once however many callers ask", async () => {
    const load = vi.fn(async () => Promise.resolve({ ok: true }));
    const once = memoizeImport(load);
    const [a, b] = await Promise.all([once(), once()]);
    await once();
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed import so the next call retries it", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("chunk 404"))
      .mockResolvedValueOnce("chunk");
    const once = memoizeImport(load);
    await expect(once()).rejects.toThrow("chunk 404");
    await expect(once()).resolves.toBe("chunk");
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("prefetchImport", () => {
  it("swallows a failure; the first real open shows it", async () => {
    const once = memoizeImport(async () =>
      Promise.reject(new Error("offline"))
    );
    await expect(prefetchImport(once)).resolves.toBeUndefined();
  });
});
