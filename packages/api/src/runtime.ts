import { Effect, Layer, ManagedRuntime } from "effect";

import type { ActivityTailer } from "@watchdog/core/activity";
import { activityTailerLayer } from "@watchdog/core/activity";
import type { BlobStore } from "@watchdog/core/blob";
import { blobStoreLayer } from "@watchdog/core/blob";
import type { DomainTag } from "@watchdog/core/errors";
import { Db } from "@watchdog/core/infra";
import type { JobQueue } from "@watchdog/core/jobs";
import { jobQueueProducerLayer } from "@watchdog/core/jobs";
import type { Vault } from "@watchdog/core/vault";
import { vaultLayer } from "@watchdog/core/vault";

import { toOrpcError } from "./map-domain-error";

/**
 * Composition root (ADR-0002 phases 2-3): the live `Db` Layer, the
 * producer-role `JobQueue` Layer (the web/API process only enqueues; the
 * worker composes the worker role instead), the `Vault` Layer (credential
 * access over `Db` and the vault crypto) and the `BlobStore` Layer (one
 * `S3Client`, destroyed when the runtime is disposed). The producer starts
 * pg-boss lazily on the first enqueue, so building `AppLive` never touches the
 * database. The vault Layer is the live credential reader over `Db`. The
 * `ActivityTailer` (ADR-0005, one per process) opens its LISTEN connection on
 * the first SSE subscriber, never at build.
 */
export const AppLive = Layer.mergeAll(
  Layer.provideMerge(vaultLayer, Db.layer),
  jobQueueProducerLayer,
  blobStoreLayer,
  Layer.provide(activityTailerLayer, Db.layer)
);

/** The slice of Vite's `import.meta.hot` this module uses. */
interface HotContext {
  readonly dispose: (callback: () => void | Promise<void>) => void;
  readonly on: (event: string, callback: () => void | Promise<void>) => void;
}

interface ModuleMeta {
  readonly url: string;
  readonly hot?: HotContext;
}

/**
 * A runtime over `layer` that is disposed when this module is re-evaluated by
 * Vite HMR (`import.meta.hot`, absent in production and under plain Node). The
 * old runtime's scope closes, so the producer's pg-boss stops and its pool
 * closes instead of accumulating one per reload. `hot` is injectable for tests.
 *
 * Two hooks, because Vite's SSR module runner does not call `dispose` handlers
 * on a full reload (what an edit to this module or a procedure triggers under
 * `vite dev`): it fires `vite:beforeFullReload` and then drops every evaluated
 * module (measured on Vite 8). `dispose` covers a module-level HMR update.
 * `ManagedRuntime.dispose` is idempotent, and a runtime that never ran builds
 * nothing. Dev only: an importer that Vite does not re-evaluate after a
 * dispose keeps the disposed runtime until the dev server restarts.
 */
export function makeAppRuntime<ROut, E>(
  layer: Layer.Layer<ROut, E>,
  hot: HotContext | undefined = (import.meta as ModuleMeta).hot
): ManagedRuntime.ManagedRuntime<ROut, E> {
  const runtime = ManagedRuntime.make(layer);
  const dispose = async () => runtime.dispose();
  hot?.dispose(dispose);
  hot?.on("vite:beforeFullReload", dispose);
  return runtime;
}

/**
 * Production shutdown is deliberately not hooked: the web server
 * (TanStack Start build) installs no signal handler of its own, and adding one
 * here would change its exit behavior. The producer holds no handlers or
 * queued work (only in-flight sends), so the process exiting is safe. Call
 * `appRuntime.dispose()` from a shutdown hook if the server gains one.
 */
export const appRuntime = makeAppRuntime(AppLive);

/**
 * Run an application Effect. Maps `DomainTag` in `E` to oRPC errors before
 * `runPromise`, so handlers only see transport errors. Services come from
 * `AppLive`.
 */
export async function runApp<A>(
  effect: Effect.Effect<
    A,
    DomainTag,
    Db | JobQueue | BlobStore | Vault | ActivityTailer
  >
): Promise<A> {
  return appRuntime.runPromise(effect.pipe(Effect.mapError(toOrpcError)));
}

/**
 * `runApp` with an override Layer for tests, e.g.
 * `runAppWith(Db.layerOf(spy))(effect)`. The override wins over `AppLive`.
 */
export function runAppWith<ROut>(layer: Layer.Layer<ROut>) {
  return async <A>(effect: Effect.Effect<A, DomainTag, ROut>): Promise<A> =>
    appRuntime.runPromise(
      effect.pipe(Effect.mapError(toOrpcError), Effect.provide(layer))
    );
}
