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

export async function generateOpenAPISpec(baseUrl = "/api/v1") {
  return await generator.generate(router, openApiSpecGenerateOptions(baseUrl));
}
