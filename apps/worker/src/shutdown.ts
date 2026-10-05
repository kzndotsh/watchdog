import { Context, Deferred, Effect, Exit, Layer } from "effect";

import { WorkerListenError } from "./errors";
import { emitOnce, logWorkerError } from "./worker-log";

/**
 * Worker shutdown, now that the queue is scoped (ADR-0002 phase 3).
 *
 * The first SIGTERM/SIGINT is `NodeRuntime.runMain`'s: it interrupts the main
 * fiber, the boot scope closes, and the worker queue Layer drains pg-boss on
 * release. This service keeps what runMain does not do: a repeated signal
 * force-exits (143 SIGTERM, 130 SIGINT, 1 otherwise), and a failed LISTEN
 * connection fails the boot with `WorkerListenError`: the same release runs
 * (queue drain first), then the process exits 1 so a restart-on-failure
 * supervisor brings Cap Job processing and export sync back. It records the
 * first signal and logs `shutting down (SIGTERM)` / `(SIGINT)` on its own
 * release (`(interrupt)` / `(failure)` / `(exit)` when no signal was seen). Its Layer is
 * provided outermost (`provideWorkerLayers`), so the listeners exist from
 * process start and outlive the queue drain.
 */

export function repeatShutdownExitCode(signal: string): number {
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  return 1;
}

/** How the process is shutting down when no signal was seen. */
function exitLabel(exit: Exit.Exit<unknown, unknown>): string {
  if (Exit.isSuccess(exit)) return "exit";
  return Exit.hasInterrupts(exit) ? "interrupt" : "failure";
}

export interface WorkerShutdownApi {
  /** Fails with `WorkerListenError` when the LISTEN connection fails; the boot races it against the event stream. */
  readonly listenFailed: Deferred.Deferred<never, WorkerListenError>;
  readonly onListenError: (error: unknown) => void;
  /** The first shutdown signal seen (`SIGTERM` / `SIGINT`), if any. */
  readonly signal: () => string | undefined;
}

export class WorkerShutdown extends Context.Service<
  WorkerShutdown,
  WorkerShutdownApi
>()("@watchdog/worker/WorkerShutdown") {}

/** Listeners are removed when the Layer's scope closes (after the queue drain). */
export const workerShutdownLayer: Layer.Layer<WorkerShutdown> = Layer.effect(
  WorkerShutdown,
  Effect.gen(function* workerShutdownGen() {
    const listenFailed = yield* Deferred.make<never, WorkerListenError>();
    const state: { shuttingDown: boolean; signal: string | undefined } = {
      shuttingDown: false,
      signal: undefined,
    };

    const onSignal = (signal: string) => () => {
      if (state.shuttingDown) {
        process.exit(repeatShutdownExitCode(signal));
        return;
      }
      state.shuttingDown = true;
      state.signal ??= signal;
    };
    const onSigterm = onSignal("SIGTERM");
    const onSigint = onSignal("SIGINT");

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        process.on("SIGTERM", onSigterm);
        process.on("SIGINT", onSigint);
      }),
      (_listeners, exit) =>
        Effect.sync(() => {
          process.removeListener("SIGTERM", onSigterm);
          process.removeListener("SIGINT", onSigint);
          // Outermost release: the queue has drained and the other services are
          // released. The signal is only visible here, not to the queue Layer.
          emitOnce("worker.shutdown", {
            message: `shutting down (${state.signal ?? exitLabel(exit)})`,
          });
        })
    );

    return WorkerShutdown.of({
      listenFailed,
      signal: () => state.signal,
      onListenError: (error) => {
        logWorkerError("export-sync.listen", "LISTEN connection failed", error);
        if (state.shuttingDown) {
          process.exit(repeatShutdownExitCode("LISTEN"));
          return;
        }
        state.shuttingDown = true;
        Deferred.doneUnsafe(
          listenFailed,
          Exit.fail(new WorkerListenError({ cause: error }))
        );
      },
    });
  })
);
