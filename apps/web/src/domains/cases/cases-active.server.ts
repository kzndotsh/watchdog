import "@tanstack/react-start/server-only";
import { ORPCError } from "@orpc/server";

import type { CasesContext } from "@/domains/cases/types";
import type { orpcFromContext } from "@/lib/orpc.server";
import { runApp } from "@watchdog/api";
import { resolveActiveCaseEffect } from "@watchdog/core/cases";
import type { CaseId } from "@watchdog/schemas/shared";

type ActiveCaseFnContext = Parameters<typeof orpcFromContext>[0];

/**
 * The Cases the caller's organization can see and which one is Active for the stored
 * selection (the cookie). The healing rule itself is `resolveActiveCaseEffect` in core;
 * this only supplies the organization from the session and runs the edge. Writing the
 * cookie stays with the caller: it is a request concern.
 */
export async function resolveActiveCase(
  context: ActiveCaseFnContext,
  stored: CaseId | null
): Promise<CasesContext> {
  const { organizationId } = context;
  if (organizationId === null) {
    // Same refusal as the oRPC `authed` procedures the other Case fns go through.
    throw new ORPCError("FORBIDDEN");
  }
  return runApp(resolveActiveCaseEffect(organizationId, stored));
}
