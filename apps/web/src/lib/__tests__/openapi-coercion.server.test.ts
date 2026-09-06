import { SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { os } from "@orpc/server";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { testHttpOrigin } from "@watchdog/test-kit";

const coerceProbe = os
  .route({ method: "GET", path: "/coerce-probe" })
  .input(
    z.object({
      limit: z.number(),
      flag: z.boolean(),
    })
  )
  .handler(async ({ input }) => input);

const probeRouter = { coerceProbe };

describe("OpenAPI GET smart coercion", () => {
  it("coerces query string number and boolean false with SmartCoercionPlugin", async () => {
    const handler = new OpenAPIHandler(probeRouter, {
      plugins: [
        new SmartCoercionPlugin({
          schemaConverters: [new ZodToJsonSchemaConverter()],
        }),
      ],
    });

    const { matched, response } = await handler.handle(
      new Request(
        testHttpOrigin("localhost", "/coerce-probe?limit=5&flag=false")
      ),
      { prefix: "/", context: {} }
    );

    expect(matched).toBe(true);
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      limit: 5,
      flag: false,
    });
  });

  it("rejects string query values as number/boolean without the plugin", async () => {
    const handler = new OpenAPIHandler(probeRouter);

    const { matched, response } = await handler.handle(
      new Request(
        testHttpOrigin("localhost", "/coerce-probe?limit=5&flag=false")
      ),
      { prefix: "/", context: {} }
    );

    expect(matched).toBe(true);
    expect(response?.status).toBeGreaterThanOrEqual(400);
  });
});
