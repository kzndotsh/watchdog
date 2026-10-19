import { createServerFn } from "@tanstack/react-start";

import type { ClaimRecord } from "@/domains/entities/claims/types";
import { listAllPages } from "@/lib/list-pages.server";
import { orpcFromContext } from "@/lib/orpc.server";
import {
  createClaimInputSchema,
  listClaimsInputSchema,
  retractClaimInputSchema,
  updateClaimInputSchema,
} from "@watchdog/schemas/graph";

export type { ClaimRecord } from "@/domains/entities/claims/types";

export const listClaimsFn = createServerFn({ method: "GET" })
  .validator(listClaimsInputSchema)
  .handler(async ({ data, context }): Promise<ClaimRecord[]> =>
    listAllPages(async (page) =>
      orpcFromContext(context).claims.list({
        caseId: data.caseId,
        entityId: data.entityId,
        includeRetracted: data.includeRetracted,
        ...page,
      })
    )
  );

export const createClaimFn = createServerFn({ method: "POST" })
  .validator(createClaimInputSchema)
  .handler(async ({ data, context }): Promise<ClaimRecord> =>
    orpcFromContext(context).claims.create(data)
  );

export const retractClaimFn = createServerFn({ method: "POST" })
  .validator(retractClaimInputSchema)
  .handler(async ({ data, context }): Promise<ClaimRecord> =>
    orpcFromContext(context).claims.retract(data)
  );

export const updateClaimFn = createServerFn({ method: "POST" })
  .validator(updateClaimInputSchema)
  .handler(async ({ data, context }): Promise<ClaimRecord> =>
    orpcFromContext(context).claims.update(data)
  );
