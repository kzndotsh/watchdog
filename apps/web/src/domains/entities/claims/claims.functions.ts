import { createServerFn } from "@tanstack/react-start";

import type { ClaimRecord } from "@/domains/entities/claims/types";
import { orpcFromContext } from "@/lib/orpc.server";
import {
  claimList,
  createClaimInputSchema,
  retractClaimInputSchema,
  updateClaimInputSchema,
} from "@watchdog/schemas/graph";
import type { ListPage } from "@watchdog/schemas/shared";

export type { ClaimRecord } from "@/domains/entities/claims/types";

/**
 * One page of the Case's Claim list (`claimList`, ADR-0007): the declared filters, `q`, sort and
 * cursor pass through whole. One Entity's Claims are this list with `entityId` set.
 */
export const listClaimsPageFn = createServerFn({ method: "GET" })
  .validator(claimList.input)
  .handler(async ({ data, context }): Promise<ListPage<ClaimRecord>> =>
    orpcFromContext(context).claims.list(data)
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
