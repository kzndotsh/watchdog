import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No `.env` of the checkout leaks into the test's environment.
vi.mock("dotenv", () => ({ config: vi.fn() }));

// The poll interval is a real five seconds in the CLI: the test does not wait it out.
vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn(async () => {}),
}));

import { downloadToFile } from "../download";
import { resetCliEnvForTests } from "../env";
import { CliExitError } from "../io";

const STATUS_URL = "/api/v1/cases/case-1/exports/job-1";
const SIGNED_URL =
  "https://files.example.test/exports/case-1/job-1.zip?sig=abc";
const accepted = () =>
  new Response("{}", { status: 202, headers: { Location: STATUS_URL } });
const pending = () => new Response("{}", { status: 202 });
const redirect = () =>
  new Response(null, { status: 302, headers: { Location: SIGNED_URL } });

describe("downloadToFile: a large Case export that runs as a Job", () => {
  let dir: string;

  let printed: string[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "wd-download-"));
    vi.stubEnv("WD_API_URL", "http://127.0.0.1:3000/api/v1");
    vi.stubEnv("WD_API_KEY", "test-key");
    resetCliEnvForTests();
    printed = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      printed.push(String(line));
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetCliEnvForTests();
  });

  const run = (outName = "case.zip") =>
    downloadToFile({
      urlPath: "/cases/case-1/export.zip",
      outPath: path.join(dir, outName),
      fallbackFilename: "fallback.zip",
    });

  it("waits through 202s, follows the 302 and streams the archive to disk, without the API key on the object store request", async () => {
    const calls: { url: string; headers: Headers }[] = [];
    const answers = [accepted(), pending(), pending(), redirect()];
    const archive = new Response("zip-bytes-of-a-large-case", {
      status: 200,
      headers: { "content-disposition": 'attachment; filename="x.zip"' },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, headers: new Headers(init?.headers) });
        if (url === SIGNED_URL) return archive;
        const next = answers.shift();
        if (next === undefined) throw new Error("polled too often");
        return next;
      })
    );

    const out = await run();

    expect(readFileSync(out, "utf-8")).toBe("zip-bytes-of-a-large-case");
    expect(readdirSync(dir)).toEqual(["case.zip"]);
    expect(calls.map((call) => call.url)).toEqual([
      "http://127.0.0.1:3000/api/v1/cases/case-1/export.zip",
      "http://127.0.0.1:3000/api/v1/cases/case-1/exports/job-1",
      "http://127.0.0.1:3000/api/v1/cases/case-1/exports/job-1",
      "http://127.0.0.1:3000/api/v1/cases/case-1/exports/job-1",
      SIGNED_URL,
    ]);
    // The API calls carry the key; the signed object URL carries neither it nor an Authorization.
    for (const call of calls.slice(0, -1)) {
      expect(call.headers.get("x-api-key")).toBe("test-key");
    }
    const objectCall = calls.at(-1);
    expect(objectCall?.headers.get("x-api-key")).toBeNull();
    expect(objectCall?.headers.get("authorization")).toBeNull();
  });

  it("fails and writes nothing when the Job ended without an archive (409)", async () => {
    const answers = [
      accepted(),
      pending(),
      Response.json({ status: "failed", error: "boom" }, { status: 409 }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answers.shift() ?? new Response("", { status: 500 }))
    );

    await expect(run()).rejects.toBeInstanceOf(CliExitError);

    expect(printed.join("\n")).toContain("DOWNLOAD_FAILED");
    expect(printed.join("\n")).toContain("HTTP 409");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("leaves no file that looks like the archive when the stream dies halfway", async () => {
    let sent = false;
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode("half of the arch"));
          return;
        }
        controller.error(new Error("connection reset"));
      },
    });
    const answers = [accepted(), redirect()];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === SIGNED_URL
          ? new Response(broken, { status: 200 })
          : (answers.shift() ?? new Response("", { status: 500 }))
      )
    );

    await expect(run()).rejects.toBeInstanceOf(CliExitError);

    expect(printed.join("\n")).toContain("connection reset");
    expect(existsSync(path.join(dir, "case.zip"))).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });
});
