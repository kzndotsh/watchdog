import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { NOT_FOUND_ENTITIES } from "@watchdog/core/errors";

/**
 * The oRPC error map every procedure declares (`os.errors(apiErrorMap)`), the
 * contract for what `toOrpcError` puts in the error `data`. Declaring it
 * types `error.data.code` in the generated client (`isDefinedError` from
 * `@orpc/client` narrows to it) and documents the responses in the OpenAPI
 * spec. One entry per transport code `toOrpcError` produces; each `code` is the
 * stable tag code from `@watchdog/core/errors` (`DomainTagCode`), kept in sync
 * by `__tests__/error-map.test.ts`.
 */
export const apiErrorMap = {
  NOT_FOUND: {
    status: 404,
    message: "Not found",
    data: z.object({
      code: z.literal("not_found"),
      entity: z.enum(NOT_FOUND_ENTITIES),
      id: z.string(),
    }),
  },
  CONFLICT: {
    status: 409,
    message: "Conflict",
    data: z.object({ code: z.literal("conflict") }),
  },
  BAD_REQUEST: {
    status: 400,
    message: "Invalid input",
    data: z.object({
      code: z.literal("invalid"),
      issues: z.array(z.unknown()).optional(),
    }),
  },
  FORBIDDEN: {
    status: 403,
    message: "Forbidden",
    data: z.object({ code: z.literal("forbidden") }),
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    message: "Internal server error",
    data: z.object({ code: z.literal("internal") }),
  },
} as const;

function dataCode(data: unknown): unknown {
  return typeof data === "object" && data !== null && "code" in data
    ? data.code
    : undefined;
}

/** Stable `data.code` for transport codes oRPC raises without one. */
const FALLBACK_CODE: Readonly<Record<string, string>> = {
  BAD_REQUEST: "invalid",
  INTERNAL_SERVER_ERROR: "internal",
  FORBIDDEN: "forbidden",
};

/**
 * Give every error the declared `data.code` before it leaves a procedure, so
 * the types in {@link apiErrorMap} hold for errors oRPC raises itself:
 * input-validation failures (`BAD_REQUEST`, `invalid`), output-validation
 * failures and unrecognized defects (`INTERNAL_SERVER_ERROR`, `internal`) and
 * a bare `FORBIDDEN`. A `data.code` that is not the one the transport code declares
 * is replaced. Errors `toOrpcError` mapped already carry the right code and pass
 * through untouched, as does every code outside the map (`UNAUTHORIZED`).
 */
export function withStableCode(error: unknown): unknown {
  if (!(error instanceof ORPCError)) {
    return new ORPCError("INTERNAL_SERVER_ERROR", {
      defined: true,
      message: apiErrorMap.INTERNAL_SERVER_ERROR.message,
      data: { code: "internal" },
      cause: error,
    });
  }
  const transport: unknown = error.code;
  const data: unknown = error.data;
  if (typeof transport !== "string") return error;
  const code = FALLBACK_CODE[transport];
  // Outside the map, or already carrying the code that transport declares.
  if (code === undefined || dataCode(data) === code) return error;
  return new ORPCError(transport, {
    defined: true,
    message: error.message,
    data: { ...(typeof data === "object" && data !== null ? data : {}), code },
    cause: error.cause,
  });
}
