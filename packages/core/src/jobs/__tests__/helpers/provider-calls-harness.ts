import { createHash } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { Effect, Layer } from "effect";
import { z } from "zod";

import {
  defineCapability,
  defineProvider,
  type CapabilityDef,
  type CapServices,
} from "@watchdog/caps/sdk";
import { db, jobsRepo, type JobRow } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import { seedJob } from "@watchdog/test-db";
import { mapToolsCatch, type ToolsTag } from "@watchdog/tools/errors";
import {
  Egress,
  isBlockedAddress,
  outboundClientLayerWith,
} from "@watchdog/tools/http";

import { recordingBlobStore } from "../../../infra/blob-store";
import { Db } from "../../../infra/db-service";
import { fakeVault } from "../../../infra/vault-fake";
import type { PreflightState } from "../../stages/preflight";

const LOOPBACK = "127.0.0.1";

export const sha256 = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

const provider = defineProvider({
  name: "Test provider",
  url: "https://example.com",
  termsUrl: "https://example.com/terms",
  tier: "self",
  commercialUse: "allowed",
});

/** A loopback provider: `routes` by path; `arrived(path)` settles when a request for it reached the server. */
export type LoopbackProvider = {
  readonly origin: string;
  readonly arrived: (path: string) => Promise<void>;
  readonly hits: () => readonly string[];
  readonly close: () => Promise<void>;
};

export async function startProvider(
  routes: Record<string, (res: ServerResponse) => void>
): Promise<LoopbackProvider> {
  const hits: string[] = [];
  type Arrival = { readonly promise: Promise<void>; readonly open: () => void };
  const arrivals = new Map<string, Arrival>();
  const arrival = (path: string): Arrival => {
    const known = arrivals.get(path);
    if (known !== undefined) return known;
    let open: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    const created = { promise, open };
    arrivals.set(path, created);
    return created;
  };
  // Routes are looked up by value in a fixed list, never called through a request-derived key.
  const table = Object.entries(routes).map(([routePath, handle]) => ({
    routePath,
    handle,
  }));
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    hits.push(path);
    arrival(path).open();
    const route = table.find((entry) => entry.routePath === path);
    if (route === undefined) {
      res.writeHead(404).end();
      return;
    }
    route.handle(res);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, LOOPBACK, resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://${LOOPBACK}:${port}`,
    arrived: async (path) => arrival(path).promise,
    hits: () => hits,
    close: async () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

export function respondWith(
  body: string,
  headers: Record<string, string> = {}
) {
  return (res: ServerResponse) => {
    res.writeHead(200, { "content-type": "application/json", ...headers });
    res.end(body);
  };
}

/** Never answers: the call stays in flight until the client drops it. */
export const hang = () => undefined;

/** GET `url` through the Job's `Egress`, as a Cap's `run` does; the fiber's abort ends the request. */
export function getText(url: string) {
  return Effect.gen(function* getTextGen() {
    const egress = yield* Egress;
    const res = yield* Effect.tryPromise({
      try: async (signal) => egress.fetch(url, { signal }),
      catch: mapToolsCatch,
    });
    return yield* Effect.tryPromise({
      try: async () => res.text(),
      catch: mapToolsCatch,
    });
  });
}

export function artifactFor(caseId: CaseId, name = "result.json") {
  const sha = sha256(`${caseId}/${name}`);
  return {
    name,
    mime: "application/json",
    uri: `${caseId}/${sha}/${name}`,
    sha256: sha,
  };
}

type FakeCapOptions = Partial<
  Pick<CapabilityDef<z.ZodType>, "rawResponse" | "jobPolicy" | "kind">
>;

/** A Cap whose `run` is the given Effect, returning one artifact unless it fails. */
export function fakeCap(
  id: string,
  caseId: CaseId,
  run: Effect.Effect<unknown, ToolsTag, CapServices>,
  options: FakeCapOptions = {}
): CapabilityDef<z.ZodType> {
  return defineCapability({
    id,
    title: id,
    provider,
    contacts: [],
    input: z.object({}),
    ...options,
    run: () =>
      run.pipe(Effect.map(() => ({ artifacts: [artifactFor(caseId)] }))),
  });
}

export async function runningState(
  caseId: CaseId,
  cap: CapabilityDef<z.ZodType>
): Promise<PreflightState> {
  const seeded = await seedJob(db, caseId, {
    capabilityId: cap.id,
    status: "running",
    input: {},
  });
  const job: JobRow | null = await jobsRepo.get(db, seeded.id);
  if (job === null) throw new Error("job missing");
  return {
    jobId: job.id,
    job,
    capVersion: "test-version",
    cap,
    policy: cap.jobPolicy ?? {},
    input: {},
    reclaimArtifacts: null,
    reclaimEvidenceIds: [],
  };
}

/** The services a collect run needs: the pool, the given blob store, a fake vault, and a client for loopback. */
export function collectLayer(store: ReturnType<typeof recordingBlobStore>) {
  return Layer.mergeAll(
    Db.layer,
    store.layer,
    fakeVault().layer,
    outboundClientLayerWith({
      resolve: async () => [{ address: LOOPBACK, family: 4 }],
      isBlocked: (address) => address !== LOOPBACK && isBlockedAddress(address),
    })
  );
}
