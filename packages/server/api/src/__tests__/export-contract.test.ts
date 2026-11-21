import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { exportContract } from "../export-contract";

const contractShape = z.object({
  health: z.object({
    "~orpc": z.object({
      route: z.object({ method: z.string(), path: z.string() }),
    }),
  }),
});
const openapiShape = z.object({
  openapi: z.string(),
  paths: z.record(z.string(), z.object({ get: z.unknown().optional() })),
});

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "export-contract-"));
  dirs.push(dir);
  return dir;
}

describe("exportContract", () => {
  it("writes the contract and the OpenAPI document as JSON that names a known route", async () => {
    const out = path.join(tempDir(), "nested", "generated");

    await exportContract(out);

    expect(readdirSync(out).sort()).toEqual(["contract.json", "openapi.json"]);
    const contract = contractShape.parse(
      JSON.parse(readFileSync(path.join(out, "contract.json"), "utf-8"))
    );
    const openapi = openapiShape.parse(
      JSON.parse(readFileSync(path.join(out, "openapi.json"), "utf-8"))
    );

    expect(contract.health["~orpc"].route).toMatchObject({
      method: "GET",
      path: "/health",
    });
    expect(openapi.openapi).toMatch(/^3\./);
    expect(openapi.paths["/health"]?.get).toBeDefined();
  });
});
