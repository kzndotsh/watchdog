import { z } from "zod";

import { pub } from "../os";

// public: liveness probe for load balancers and uptime monitors, which call it without a session
export const health = pub
  .route({
    method: "GET",
    path: "/health",
    summary: "Health check",
    tags: ["system"],
  })
  .output(
    z.object({
      ok: z.literal(true),
      service: z.literal("watchdog"),
    })
  )
  .handler(async () => ({ ok: true as const, service: "watchdog" as const }));
