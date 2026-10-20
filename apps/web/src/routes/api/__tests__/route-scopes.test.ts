import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every route file under `routes/api` and how it treats an API key (#367). A route that accepts a
 * key outside the oRPC router must call the shared `requireScope` with the scope it needs; a new
 * route file fails this test until it is listed here.
 */
const ROUTES = {
  "events.ts": { kind: "scoped", scope: "cases:read" },
  "v1/cases.$caseId.export[.]zip.ts": { kind: "scoped", scope: "cases:read" },
  "v1/cases.$caseId.entities.$slug.export[.]md.ts": {
    kind: "scoped",
    scope: "cases:read",
  },
  "v1.ts": { kind: "router" },
  "v1.$.ts": { kind: "router" },
  "auth/$.ts": { kind: "no-key" },
  "client-errors.ts": { kind: "no-key" },
  "csp-report.ts": { kind: "no-key" },
  "signup-allowed.ts": { kind: "no-key" },
} as const;

const root = path.join(import.meta.dirname, "..");

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__") return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? routeFiles(full) : [path.relative(root, full)];
  });
}

const read = (file: string) => readFileSync(path.join(root, file), "utf-8");

describe("routes under routes/api that accept an API key", () => {
  it("lists every route file", () => {
    expect(routeFiles(root).sort()).toEqual(Object.keys(ROUTES).sort());
  });

  for (const [file, route] of Object.entries(ROUTES)) {
    it(`${file}: ${route.kind}`, () => {
      const source = read(file);
      if (route.kind === "scoped") {
        expect(source).toContain("createApiContext");
        expect(source).toMatch(
          new RegExp(
            String.raw`requireScope\(\s*ctx\.credential,\s*"${route.scope}"\s*\)`
          )
        );
      } else if (route.kind === "router") {
        // Procedures declare their scope in `.meta`; the router test enumerates them.
        expect(source).toContain("handleOpenApiRequest");
      } else {
        expect(source).not.toContain("createApiContext");
      }
    });
  }
});
