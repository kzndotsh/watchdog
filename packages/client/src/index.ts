import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";

import { contract } from "@watchdog/contract";
import type { AppRouter } from "@watchdog/contract/app-router";

export type { AppRouter } from "@watchdog/contract/app-router";
export type WatchdogClient = JsonifiedClient<ContractRouterClient<AppRouter>>;

export interface CreateWatchdogClientOptions {
  /** Base URL including `/api/v1` (default: `WD_API_URL`, else localhost). */
  baseUrl?: string;
  /** Better Auth API key (`x-api-key`). */
  apiKey: string;
}

const DEFAULT_API_URL = "http://localhost:3000/api/v1";

function resolveBaseUrl(explicit?: string): string {
  const fromOpts = explicit?.trim();
  if (fromOpts !== undefined && fromOpts !== "")
    return fromOpts.replace(/\/$/, "");
  const fromEnv =
    typeof process === "undefined" ? undefined : process.env.WD_API_URL?.trim();
  return (fromEnv ?? DEFAULT_API_URL).replace(/\/$/, "");
}

/**
 * Typed OpenAPI client for agents/CLI.
 * Regenerated contract: `pnpm generate:client` → `@watchdog/contract`.
 */
export function createWatchdogClient(
  opts: CreateWatchdogClientOptions
): WatchdogClient {
  // contract.json is the generated OpenAPI contract (data only); AppRouter's
  // procedure/handler types have no runtime representation to validate
  // against, so OpenAPILink's documented pattern is to assert the JSON
  // payload as the router type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  const link = new OpenAPILink(contract as unknown as AppRouter, {
    url: resolveBaseUrl(opts.baseUrl),
    headers: () => ({
      "x-api-key": opts.apiKey,
    }),
  });
  return createORPCClient(link);
}
