import type { Effect } from "effect";

import type { BlobStore } from "@watchdog/core/blob";
import { checkReadinessEffect } from "@watchdog/core/infra";
import type { Db, ReadinessReport } from "@watchdog/core/infra";

import { pub } from "../os";
import { runApp } from "../runtime";
import { readinessSchema } from "../schemas";

/** The slice of `runApp` readiness needs; tests pass `runAppWith(layer)`. */
type ReadinessRunner = (
  effect: Effect.Effect<ReadinessReport, never, Db | BlobStore>
) => Promise<ReadinessReport>;

// public: readiness probe for load balancers and orchestrators, which call it without a session; it reports dependency status codes only and reads no tenant data
export function makeReady(run: ReadinessRunner) {
  return pub
    .route({
      method: "GET",
      path: "/ready",
      summary: "Readiness check",
      description:
        "200 when the database and object storage answer, 503 when either does not. Each dependency is `ok` or a fixed reason (`timeout`, `unreachable`); the 503 body carries the same report in `data`.",
      tags: ["system"],
    })
    .errors({
      SERVICE_UNAVAILABLE: {
        status: 503,
        message: "Not ready",
        data: readinessSchema,
      },
    })
    .output(readinessSchema)
    .handler(async ({ errors }) => {
      const report = await run(checkReadinessEffect);
      if (!report.ok) throw errors.SERVICE_UNAVAILABLE({ data: report });
      return report;
    });
}

export const ready = makeReady(runApp);
