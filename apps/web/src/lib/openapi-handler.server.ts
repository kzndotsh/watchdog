import { SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

import { createApiContext } from "@/auth/api-context.server";
import {
  applyWatchdogCors,
  corsPreflightResponse,
} from "@/lib/api-cors.server";
import { openApiSpecGenerateOptions, router } from "@watchdog/api";

const zodJsonSchemaConverter = new ZodToJsonSchemaConverter();

const openApiHandler = new OpenAPIHandler(router, {
  plugins: [
    new SmartCoercionPlugin({
      schemaConverters: [zodJsonSchemaConverter],
    }),
    new OpenAPIReferencePlugin({
      schemaConverters: [zodJsonSchemaConverter],
      specGenerateOptions: openApiSpecGenerateOptions("/api/v1"),
      // Scalar loads its fonts from a third-party host by default; the page uses system fonts instead.
      docsConfig: { withDefaultFonts: false },
    }),
  ],
});

/**
 * `/api/v1/*`. Cross-origin access is decided here, not by the OpenAPI handler:
 * only origins in the trusted-origins allowlist get CORS headers (`api-cors.server.ts`).
 */
export async function handleOpenApiRequest(
  request: Request
): Promise<Response> {
  const preflight = await corsPreflightResponse(request);
  if (preflight !== null) return preflight;

  const { matched, response } = await openApiHandler.handle(request, {
    prefix: "/api/v1",
    context: await createApiContext(request),
  });

  return applyWatchdogCors(
    request,
    matched && response ? response : new Response("Not Found", { status: 404 })
  );
}
