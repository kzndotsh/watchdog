import { parseArgs } from "citty";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evidenceList } from "@watchdog/schemas/evidence";
import { identifierList, caseScopeInputSchema } from "@watchdog/schemas/graph";
import { defineList, tags } from "@watchdog/schemas/shared";
import type { AnyListDef } from "@watchdog/schemas/shared";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

import { CliExitError } from "../io";
import { listFlags, listInputFromFlags } from "../list-flags";

const caseId = testCaseId(1);
const entityId = testId(2);

/** argv through citty with the list's flags, as `wd <noun> list` parses it. */
function argsOf(def: AnyListDef, argv: string[]): Record<string, unknown> {
  return parseArgs(argv, listFlags(def));
}

/** The JSON error envelope a refused flag prints, with the thrown exit. */
async function refusal(run: () => Promise<unknown>): Promise<unknown> {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    await expect(run()).rejects.toThrow(CliExitError);
    const printed = log.mock.calls.at(-1)?.[0];
    return typeof printed === "string" ? JSON.parse(printed) : undefined;
  } finally {
    log.mockRestore();
  }
}

/** A list with a `tags` filter, so each of the four kinds is parsed here. */
const taggedList = defineList({
  name: "tagged",
  noun: { one: "row", many: "rows" },
  scope: caseScopeInputSchema,
  filters: { capabilityId: tags("Cap", { maxLength: 80 }) },
  sorts: { created: { label: "Created", type: "time", dirs: ["desc"] } },
  defaultSort: "created.desc",
});

describe("listFlags", () => {
  it("derives one flag per filter, then --search and --sort, from the declaration", () => {
    expect(Object.keys(listFlags(evidenceList))).toEqual([
      "hidden",
      "unprocessed",
      "unattached",
      "kind",
      "entity-id",
      "search",
      "sort",
    ]);
    expect(Object.keys(listFlags(identifierList))).toEqual([
      "type",
      "status",
      "confidence",
      "entity-id",
      "search",
      "sort",
    ]);
    expect(Object.keys(listFlags(taggedList))).toEqual([
      "capability-id",
      "sort",
    ]);
  });

  it("describes each flag with the declaration's labels", () => {
    const flags = listFlags(evidenceList);
    expect(flags.hidden).toMatchObject({ type: "boolean" });
    expect(flags.kind?.description).toBe(
      "Kind: file, url_archive, attestation, other (comma-separated)"
    );
    expect(flags["entity-id"]?.description).toBe("Entity (UUID or slug)");
    expect(flags.search?.description).toBe(
      "Search label, notes or URL (3+ characters)"
    );
    expect(flags.sort?.description).toBe(
      "One of: captured.desc, captured.asc, label.asc, label.desc (default captured.desc)"
    );
  });
});

describe("listInputFromFlags", () => {
  /** The API at the network boundary: `entities.get` by slug answers this Entity. */
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ id: entityId, slug: "jane-doe" })
  );

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubEnv("WD_API_URL", "http://127.0.0.1:3000/api/v1");
    vi.stubEnv("WD_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses flags to the declared input", async () => {
    const args = argsOf(evidenceList, [
      "--unprocessed",
      "--kind",
      "other, file",
      "--entity-id",
      entityId,
      "--search",
      "  example ",
      "--sort",
      "label.asc",
    ]);
    await expect(
      listInputFromFlags(evidenceList, { caseId }, args)
    ).resolves.toEqual({
      caseId,
      unprocessed: true,
      kind: ["other", "file"],
      entityId,
      q: "example",
      sort: "label.asc",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for flags that were not passed", async () => {
    await expect(
      listInputFromFlags(identifierList, { caseId }, argsOf(identifierList, []))
    ).resolves.toEqual({ caseId });
  });

  it("resolves an Entity slug given to --entity-id", async () => {
    const args = argsOf(identifierList, ["--entity-id", "jane-doe"]);
    await expect(
      listInputFromFlags(identifierList, { caseId }, args)
    ).resolves.toEqual({ caseId, entityId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [request] = fetchMock.mock.calls[0] ?? [];
    const url = request instanceof Request ? request.url : String(request);
    expect(url).toBe(
      `http://127.0.0.1:3000/api/v1/cases/${caseId}/entities/jane-doe`
    );
  });

  it("parses a tags filter as a comma-separated list", async () => {
    const args = argsOf(taggedList, ["--capability-id", "b.cap, a.cap,b.cap"]);
    await expect(
      listInputFromFlags(taggedList, { caseId }, args)
    ).resolves.toEqual({ caseId, capabilityId: ["b.cap", "a.cap", "b.cap"] });
  });

  it.each([
    [
      "a two-character --search",
      ["--search", "ab"],
      "--search: Search needs at least 3 characters",
    ],
    ["an undeclared --kind", ["--kind", "pdf"], "--kind: "],
    ["an undeclared --sort", ["--sort", "value.asc"], "--sort: "],
    [
      "an exclusive pair",
      ["--hidden", "--unattached"],
      "--unattached: Hidden and Unattached cannot both be set",
    ],
  ])("refuses %s as a usage error", async (_name, argv, message) => {
    const printed = await refusal(async () =>
      listInputFromFlags(evidenceList, { caseId }, argsOf(evidenceList, argv))
    );
    expect(printed).toMatchObject({
      ok: false,
      error: {
        code: "USAGE",
        message: expect.stringContaining(message),
      },
    });
  });

  it("refuses --search on a list that declares none", async () => {
    const printed = await refusal(async () =>
      listInputFromFlags(taggedList, { caseId }, { search: "example" })
    );
    expect(printed).toMatchObject({
      error: { code: "USAGE", message: "wd tagged list takes no --search" },
    });
  });
});
