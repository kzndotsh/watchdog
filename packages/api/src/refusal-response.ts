import { ORPCError } from "@orpc/server";

/** Transport codes of the refusals a route outside the router answers itself. */
const ROUTE_REFUSALS: ReadonlySet<string> = new Set(["FORBIDDEN", "CONFLICT"]);

/**
 * The answer for a route outside the oRPC router (the Case export download) whose domain call
 * was refused as `forbidden` (403) or `conflict` (409): the same JSON error body the router
 * sends, so a client reads one shape. Null for any other error, which the caller rethrows.
 */
export function refusalResponse(error: unknown): Response | null {
  if (!(error instanceof ORPCError)) return null;
  const code: unknown = error.code;
  if (typeof code !== "string" || !ROUTE_REFUSALS.has(code)) return null;
  return Response.json(error.toJSON(), { status: error.status });
}
