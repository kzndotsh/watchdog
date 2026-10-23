import { describe, expect, it } from "vitest";

import { generateOpenAPISpec, markExtensibleEnums } from "../openapi";

describe("generateOpenAPISpec", () => {
  it("builds Watchdog API metadata with auth schemes", async () => {
    const spec = await generateOpenAPISpec("http://127.0.0.1:3000/api/v1");

    expect(spec.info?.title).toBe("Watchdog API");
    expect(spec.servers?.[0]?.url).toBe("http://127.0.0.1:3000/api/v1");
    expect(spec.components?.securitySchemes).toMatchObject({
      bearerAuth: { type: "http", scheme: "bearer" },
      apiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
    });
  });
});

describe("extensible error enums", () => {
  it("declares the growing error data enums x-extensible-enum, with no closed enum beside them", async () => {
    const spec = await generateOpenAPISpec();
    const text = JSON.stringify(spec);
    expect(text).toContain('"x-extensible-enum"');
    const notFound = JSON.stringify(
      spec.paths?.["/cases"]?.get?.responses?.["404"]
    );
    expect(notFound).toContain('"x-extensible-enum"');
    expect(notFound).not.toMatch(/"entity":\{"enum"/);
  });

  it("moves enum to x-extensible-enum only on error data properties", () => {
    const data = {
      properties: {
        code: { const: "not_found" },
        entity: { type: "string", enum: ["Case"] },
        other: { type: "string", enum: ["a"] },
      },
    };
    markExtensibleEnums({ x: [data] });
    expect(data.properties.entity).toEqual({
      type: "string",
      "x-extensible-enum": ["Case"],
    });
    expect(data.properties.other).toEqual({ type: "string", enum: ["a"] });
  });
});
