import { describe, expect, it, vi } from "vitest";

import {
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  isChunkLoadError,
  reloadOnceForStaleChunk,
} from "../chunk-reload";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

const chunkError = new TypeError(
  "Failed to fetch dynamically imported module: https://wd.example.test/assets/x-1a2b.js"
);

describe("isChunkLoadError", () => {
  it.each([
    "Failed to fetch dynamically imported module: /assets/a.js",
    "error loading dynamically imported module: /assets/a.js",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/a.css",
    "Loading chunk 12 failed.",
  ])("recognises %s", (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it("recognises a ChunkLoadError by name", () => {
    const error = new Error("boom");
    error.name = "ChunkLoadError";
    expect(isChunkLoadError(error)).toBe(true);
  });

  it("ignores everything else", () => {
    expect(isChunkLoadError(new Error("Case not found"))).toBe(false);
    expect(
      isChunkLoadError("Failed to fetch dynamically imported module")
    ).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("reloadOnceForStaleChunk", () => {
  it("reloads once, then not again while the failure persists (no loop)", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    let now = 1_000_000;
    const deps = { storage, reload, now: () => now };

    expect(reloadOnceForStaleChunk(chunkError, deps)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    // the page reloaded and the chunk is still missing: a second failure seconds later
    now += 5000;
    expect(reloadOnceForStaleChunk(chunkError, deps)).toBe(false);
    now += 5000;
    expect(reloadOnceForStaleChunk(chunkError, deps)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("allows another reload after the guard window (a later deploy)", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    let now = 1_000_000;
    const deps = { storage, reload, now: () => now };

    reloadOnceForStaleChunk(chunkError, deps);
    now += CHUNK_RELOAD_WINDOW_MS + 1;
    expect(reloadOnceForStaleChunk(chunkError, deps)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("sets the flag before it reloads", () => {
    const storage = memoryStorage();
    reloadOnceForStaleChunk(chunkError, {
      storage,
      now: () => 42,
      reload: () => {
        expect(storage.data.get(CHUNK_RELOAD_KEY)).toBe("42");
      },
    });
    expect(storage.data.get(CHUNK_RELOAD_KEY)).toBe("42");
  });

  it("does not reload for another error", () => {
    const reload = vi.fn();
    expect(
      reloadOnceForStaleChunk(new Error("nope"), {
        storage: memoryStorage(),
        reload,
      })
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("never reloads when the guard cannot be stored", () => {
    const reload = vi.fn();
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(
      reloadOnceForStaleChunk(chunkError, { storage: throwing, reload })
    ).toBe(false);
    expect(reloadOnceForStaleChunk(chunkError, { storage: null, reload })).toBe(
      false
    );
    expect(reload).not.toHaveBeenCalled();
  });
});
