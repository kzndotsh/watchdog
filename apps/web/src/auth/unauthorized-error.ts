import { ORPCError } from "@orpc/client";

/**
 * Whether a call failed because the caller has no session: oRPC's `UNAUTHORIZED` (the router
 * raises it before any procedure runs), or a Better Auth client call answering with the exact
 * message `Unauthorized` (not a substring, so "Forbidden: unauthorized caller" is not a session
 * problem). A `FORBIDDEN` (no organization, a missing scope) is not a session problem either.
 */
export function isUnauthorizedFailure(error: unknown): boolean {
  if (error instanceof ORPCError) return error.code === "UNAUTHORIZED";
  return error instanceof Error && error.message === "Unauthorized";
}
