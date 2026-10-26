/**
 * One shared dynamic import per lazy chunk. `React.lazy` and the intent handlers (pointer enter
 * or focus on the control that opens it) call the same function, so the chunk is requested
 * once. Call `prefetchImport` from event handlers and effects, never during render. A failed
 * fetch is not cached: the next hover, focus or open retries it.
 */
export function memoizeImport<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return async () => {
    pending ??= load();
    try {
      return await pending;
    } catch (error) {
      pending = undefined;
      throw error;
    }
  };
}

/** Warm a chunk on hover or focus; a failure shows at the first open instead. */
export async function prefetchImport(
  load: () => Promise<unknown>
): Promise<void> {
  try {
    await load();
  } catch {
    // The first open retries the import and shows its own failure.
  }
}
