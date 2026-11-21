type TtlCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export type TtlCache<T> = {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  delete: (key: string) => void;
  clear: () => void;
};

/**
 * Minimal in-memory TTL cache — single process, lazy expiry on read.
 * No background sweep; stale entries are evicted on next `get`/`set` of that key.
 */
export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  const store = new Map<string, TtlCacheEntry<T>>();

  return {
    get(key) {
      const entry = store.get(key);
      let result: T | undefined;
      if (entry && entry.expiresAt > Date.now()) {
        result = entry.value;
      } else if (entry) {
        store.delete(key);
      }
      return result;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    delete(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}
