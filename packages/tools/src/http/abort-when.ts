import { Effect } from "effect";

export function abortWhen(signal: AbortSignal): Effect.Effect<never> {
  return Effect.callback<never>((resume) => {
    const onAbort = () => {
      resume(Effect.interrupt);
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    return Effect.sync(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}
