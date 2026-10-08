/**
 * A barrier for forcing a race: `arrive()` resolves only once `parties` callers
 * have arrived, so every party is at the same point (for example, each inside
 * its own open transaction) before any proceeds. Unlike a sleep it does not
 * depend on how fast the database or the runner is.
 */
export function rendezvous(parties: number): () => Promise<void> {
  const waiting: (() => void)[] = [];
  return async () => {
    // oxlint-disable-next-line promise/avoid-new -- a barrier has no library promise to return
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
      if (waiting.length >= parties) {
        for (const release of waiting) release();
      }
    });
  };
}
