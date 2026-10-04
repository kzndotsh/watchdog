import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { CliExitError } from "../io";
import {
  caseArg,
  entityArg,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";

const here = import.meta.dirname;
const mainTs = path.join(here, "../main.ts");
const repoRoot = path.resolve(here, "../../../..");

function runWd(
  args: string[],
  extraEnv: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, VITEST: undefined };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) {
      Reflect.deleteProperty(env, key);
    } else {
      env[key] = value;
    }
  }
  const result = spawnSync(
    path.join(repoRoot, "node_modules/.bin/tsx"),
    [mainTs, ...args],
    {
      cwd: repoRoot,
      encoding: "utf-8",
      env,
    }
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function firstJson(stdout: string): unknown {
  const line = stdout
    .trim()
    .split("\n")
    .find((l) => l.startsWith("{"));
  expect(line, `expected JSON line in: ${stdout}`).toBeTruthy();
  if (line === undefined) {
    expect.fail("expected JSON line");
  }
  return JSON.parse(line);
}

describe("shared noun args", () => {
  it("requiredCaseArg spreads caseArg with required: true", () => {
    expect(requiredCaseArg.case).toEqual({ ...caseArg.case, required: true });
  });

  it("requiredEntityArg spreads entityArg with required: true", () => {
    expect(requiredEntityArg.entity).toEqual({
      ...entityArg.entity,
      required: true,
    });
  });
});

describe("CLI output contract", () => {
  it("emitList prints count, items, and at most three help lines", async () => {
    const prev = process.env.WD_CLI_HELP;
    process.env.WD_CLI_HELP = "1";
    const { emitList } = await import("../io");
    const lines: string[] = [];
    const original = console.log;
    console.log = (msg?: unknown) => {
      lines.push(String(msg));
    };
    try {
      emitList({
        items: [{ id: "a" }],
        help: ["h1", "h2", "h3", "h4"],
      });
    } finally {
      console.log = original;
      if (prev === undefined) {
        Reflect.deleteProperty(process.env, "WD_CLI_HELP");
      } else {
        process.env.WD_CLI_HELP = prev;
      }
    }
    const body = JSON.parse(lines[0] ?? "{}");
    expect(body).toMatchObject({ count: 1, items: [{ id: "a" }] });
    expect(body.help).toEqual(["h1", "h2", "h3"]);
  });

  it("emitList omits help when WD_CLI_HELP=0", async () => {
    const prev = process.env.WD_CLI_HELP;
    process.env.WD_CLI_HELP = "0";
    const { emitList } = await import("../io");
    const lines: string[] = [];
    const original = console.log;
    console.log = (msg?: unknown) => {
      lines.push(String(msg));
    };
    try {
      emitList({ items: [{ id: "a" }], help: ["tip"] });
    } finally {
      console.log = original;
      if (prev === undefined) {
        Reflect.deleteProperty(process.env, "WD_CLI_HELP");
      } else {
        process.env.WD_CLI_HELP = prev;
      }
    }
    const body = JSON.parse(lines[0] ?? "{}");
    expect(body.help).toBeUndefined();
  });

  it("emitOk prints { ok: true, ... }", async () => {
    const { emitOk } = await import("../io");
    const lines: string[] = [];
    const original = console.log;
    console.log = (msg?: unknown) => {
      lines.push(String(msg));
    };
    try {
      emitOk({ deleted: true, id: "x" });
    } finally {
      console.log = original;
    }
    const firstLine = lines[0];
    expect(firstLine !== undefined).toBeTruthy();
    if (firstLine === undefined) {
      expect.fail("expected emitOk output");
    }
    expect(JSON.parse(firstLine)).toEqual({ ok: true, deleted: true, id: "x" });
  });

  it("handleCliError maps tagged domain errors to the JSON envelope", async () => {
    const { handleCliError } = await import("../io");
    const lines: string[] = [];
    const original = console.log;
    console.log = (msg?: unknown) => {
      lines.push(String(msg));
    };
    try {
      expect(() =>
        handleCliError({ _tag: "ConflictError", reason: "duplicate slug" })
      ).toThrow(CliExitError);
    } finally {
      console.log = original;
    }
    const body = JSON.parse(lines[0] ?? "{}");
    expect(body).toMatchObject({
      ok: false,
      error: { code: "conflict", message: "duplicate slug" },
    });
  });

  describe("handleCliError exit status", () => {
    async function runHandle(error: unknown) {
      const { handleCliError } = await import("../io");
      const lines: string[] = [];
      const original = console.log;
      console.log = (msg?: unknown) => {
        lines.push(String(msg));
      };
      let thrown: unknown;
      try {
        handleCliError(error);
      } catch (error) {
        thrown = error;
      } finally {
        console.log = original;
      }
      return { thrown, body: JSON.parse(lines[0] ?? "{}") };
    }

    it("exits 3 with a generic message for a tagged InternalError", async () => {
      const { thrown, body } = await runHandle({
        _tag: "InternalError",
        reason: "Failed to create Case",
      });
      expect(thrown).toBeInstanceOf(CliExitError);
      expect((thrown as CliExitError).exitCode).toBe(3);
      expect(body.error).toEqual({
        code: "internal",
        message: "Internal server error",
      });
    });

    it("prints the stable data.code (not the transport code) for API errors", async () => {
      const { thrown, body } = await runHandle({
        name: "ORPCError",
        code: "NOT_FOUND",
        message: "Case not found",
        status: 404,
        data: { code: "not_found" },
      });
      expect((thrown as CliExitError).exitCode).toBe(1);
      expect(body.error).toEqual({
        code: "not_found",
        message: "Case not found",
        status: 404,
      });
    });

    it("prefers a tagged error's own code and prints the cause only in debug mode", async () => {
      const prev = process.env.WD_CLI_DEBUG;
      const writes: string[] = [];
      const spy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation((chunk: unknown) => {
          writes.push(String(chunk));
          return true;
        });
      const error = {
        _tag: "InternalError",
        code: "internal",
        reason: "Failed to create Case",
        cause: "pg down",
      };
      try {
        delete process.env.WD_CLI_DEBUG;
        const quiet = await runHandle(error);
        expect(quiet.body.error.code).toBe("internal");
        expect(writes.join("")).not.toContain("pg down");
        process.env.WD_CLI_DEBUG = "1";
        const verbose = await runHandle(error);
        expect(verbose.body.error.message).toBe("Internal server error");
        expect(writes.join("")).toContain("cause: pg down");
      } finally {
        spy.mockRestore();
        if (prev === undefined) delete process.env.WD_CLI_DEBUG;
        else process.env.WD_CLI_DEBUG = prev;
      }
    });

    it("exits 3 for a server-side API error and 1 for invalid input", async () => {
      const server = await runHandle({
        name: "ORPCError",
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
        status: 500,
      });
      const invalid = await runHandle({
        name: "ORPCError",
        code: "BAD_REQUEST",
        message: "Name must contain letters or numbers",
        status: 400,
      });
      expect((server.thrown as CliExitError).exitCode).toBe(3);
      expect((invalid.thrown as CliExitError).exitCode).toBe(1);
    });
  });

  it("fail prints { ok: false, error } and throws CliExitError", async () => {
    const { fail } = await import("../io");
    const lines: string[] = [];
    const original = console.log;
    console.log = (msg?: unknown) => {
      lines.push(String(msg));
    };
    try {
      expect(() =>
        fail("USAGE", "missing case", {
          help: ["wd entities list -c <caseId>"],
        })
      ).toThrow(CliExitError);
    } finally {
      console.log = original;
    }
    const firstLine = lines[0];
    expect(firstLine !== undefined).toBeTruthy();
    if (firstLine === undefined) {
      expect.fail("expected fail output");
    }
    const body = JSON.parse(firstLine);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "USAGE", message: "missing case" },
      help: ["wd entities list -c <caseId>"],
    });
  });

  it("content-first entities without --case emits USAGE JSON with --case", () => {
    const { status, stdout } = runWd(["entities"], {
      WD_API_KEY: "test-key",
      WD_API_URL: "http://127.0.0.1:9/api/v1",
    });
    expect(status).toBe(1);
    const body = firstJson(stdout);
    if (typeof body !== "object" || body === null || !("ok" in body)) {
      expect.fail("expected error envelope");
    }
    expect(Reflect.get(body, "ok")).toBe(false);
    const error = Reflect.get(body, "error");
    if (typeof error !== "object" || error === null) {
      expect.fail("expected error object");
    }
    expect(Reflect.get(error, "code")).toBe("USAGE");
    expect(String(Reflect.get(error, "message"))).toMatch(/--case/);
  });
});
