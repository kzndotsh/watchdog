import {
  OpenAPIGenerator,
  type OpenAPIGeneratorGenerateOptions,
} from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

import { router } from "./router";

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

/** Shared OpenAPI info / security for committed spec and Scalar. */
export function openApiSpecGenerateOptions(
  baseUrl = "/api/v1"
): OpenAPIGeneratorGenerateOptions {
  return {
    info: {
      title: "Watchdog API",
      version: "0.1.0",
      description:
        "HTTP surface for agents/CLI. Auth: session cookie or API key (Bearer / x-api-key).",
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }, { cookieAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Better Auth API key as Bearer token",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description:
            "Better Auth API key (preferred by @watchdog/client / wd)",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description: "Browser session cookie from Better Auth",
        },
      },
    },
  };
}

/**
 * The properties of an error `data` whose set of values grows with new failure kinds: the entity
 * a `not_found` or `stale_version` names, the scope a key lacks, the scope a Job start limit
 * counts. Their TypeScript types stay closed unions; the contract declares them extensible.
 */
const EXTENSIBLE_ERROR_DATA_PROPERTIES = ["entity", "requiredScope", "scope"];

/**
 * In every error `data` schema (an object whose `code` is a constant), move the `enum` of the
 * properties above to `x-extensible-enum`. oasdiff reports a value added to `enum` in a response
 * as breaking and one added to `x-extensible-enum` as safe; a client must handle a value it does
 * not know. Mutates the spec.
 */
export function markExtensibleEnums(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) markExtensibleEnums(item);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const properties: unknown = Reflect.get(node, "properties");
  if (
    typeof properties === "object" &&
    properties !== null &&
    typeof Reflect.get(Reflect.get(properties, "code") ?? {}, "const") ===
      "string"
  ) {
    for (const name of EXTENSIBLE_ERROR_DATA_PROPERTIES) {
      const schema: unknown = Reflect.get(properties, name);
      if (
        typeof schema === "object" &&
        schema !== null &&
        Array.isArray(Reflect.get(schema, "enum"))
      ) {
        Reflect.set(schema, "x-extensible-enum", Reflect.get(schema, "enum"));
        Reflect.deleteProperty(schema, "enum");
      }
    }
  }
  for (const value of Object.values(node)) markExtensibleEnums(value);
}

export async function generateOpenAPISpec(baseUrl = "/api/v1") {
  const spec = await generator.generate(
    router,
    openApiSpecGenerateOptions(baseUrl)
  );
  markExtensibleEnums(spec);
  return spec;
}
