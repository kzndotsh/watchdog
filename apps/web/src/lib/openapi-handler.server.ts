import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

import { createApiContext } from "@/auth/api-context.server";
import { watchdogCorsPlugin } from "@/lib/api-cors.server";
import { router } from "@watchdog/api";

const openApiHandler = new OpenAPIHandler(router, {
  plugins: [
    watchdogCorsPlugin,
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: {
        info: {
          title: "Watchdog API",
          version: "0.1.0",
          description:
            "HTTP surface for agents/CLI. Auth: session cookie or API key (Bearer / x-api-key).",
        },
        servers: [{ url: "/api/v1" }],
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
      },
    }),
  ],
});

export async function handleOpenApiRequest(
  request: Request
): Promise<Response> {
  const { matched, response } = await openApiHandler.handle(request, {
    prefix: "/api/v1",
    context: await createApiContext(request),
  });

  if (matched && response) return response;
  return new Response("Not Found", { status: 404 });
}
