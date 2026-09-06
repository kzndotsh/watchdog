import { SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

import { createApiContext } from "@/auth/api-context.server";
import { watchdogCorsPlugin } from "@/lib/api-cors.server";
import { openApiSpecGenerateOptions, router } from "@watchdog/api";

const zodJsonSchemaConverter = new ZodToJsonSchemaConverter();

const openApiHandler = new OpenAPIHandler(router, {
  plugins: [
    watchdogCorsPlugin,
    new SmartCoercionPlugin({
      schemaConverters: [zodJsonSchemaConverter],
    }),
    new OpenAPIReferencePlugin({
      schemaConverters: [zodJsonSchemaConverter],
      specGenerateOptions: openApiSpecGenerateOptions("/api/v1"),
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
