import { ORPCError, safe } from "@orpc/client";

/** Map oRPC NOT_FOUND → null for optional lookups (a ServerFn, or the oRPC client in the browser). */
export async function orpcNullIfNotFound<T>(
  promise: Promise<T>
): Promise<T | null> {
  const [error, data] = await safe(promise);
  if (!error) return data;
  if (error instanceof ORPCError && error.code === "NOT_FOUND") {
    return null;
  }
  throw error;
}
