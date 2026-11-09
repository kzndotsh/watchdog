import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const cli = path.resolve(import.meta.dirname, "../migrate-cli.ts");

function run(env: Record<string, string>) {
  return spawnSync("pnpm", ["exec", "tsx", cli], {
    cwd: path.resolve(import.meta.dirname, "../.."),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: "utf-8",
    timeout: 30_000,
  });
}

describe("migrate-cli in production", () => {
  it("refuses an owner URL with a placeholder or development password before connecting", () => {
    const result = run({
      NODE_ENV: "production",
      DATABASE_URL_MIGRATE: "postgresql://postgres:postgres@127.0.0.1:1/wd",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("placeholder or a development default");
  });

  it("does not apply the rule outside production", () => {
    const result = run({
      NODE_ENV: "development",
      DATABASE_URL_MIGRATE: "postgresql://postgres:postgres@127.0.0.1:1/wd",
    });
    expect(result.stderr).not.toContain("placeholder or a development default");
  });
});
