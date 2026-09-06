import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { minifyContractRouter } from "@orpc/contract";

import { generateOpenAPISpec } from "./openapi";
import { router } from "./router";

/** Export minified oRPC contract and OpenAPI JSON for @watchdog/contract. */
export async function exportContract(outDir: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  const contract = minifyContractRouter(router);
  writeFileSync(
    path.join(outDir, "contract.json"),
    `${JSON.stringify(contract, null, 2)}\n`
  );

  const spec = await generateOpenAPISpec("/api/v1");
  writeFileSync(
    path.join(outDir, "openapi.json"),
    `${JSON.stringify(spec, null, 2)}\n`
  );
}
