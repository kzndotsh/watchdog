import { describe, expect, it, vi } from "vitest";

import { firstJson, runWd } from "./run-wd";
import { API_KEY, API_URL, standInApi } from "./stand-in-api";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const standIn = standInApi();
const API = { WD_API_KEY: API_KEY, WD_API_URL: API_URL };

describe("wd without a subcommand", () => {
  it("prints the root command index with the number of Cases", async () => {
    standIn.json("get", "/cases", {
      items: [{ id: "case-1" }],
      nextCursor: null,
    });

    const run = await runWd([], API);

    expect(run.status).toBe(0);
    expect(firstJson(run.stdout)).toMatchObject({
      bin: "wd",
      count: 1,
      commands: expect.arrayContaining(["cases", "jobs", "proposals"]),
    });
  });

  it("prints a CONFIG error without a key", async () => {
    const run = await runWd([]);

    expect(run.status).toBe(1);
    expect(firstJson(run.stdout)).toMatchObject({
      ok: false,
      error: { code: "CONFIG" },
    });
    expect(standIn.seen).toEqual([]);
  });
});
