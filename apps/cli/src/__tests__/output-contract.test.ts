import { describe, expect, it, vi } from "vitest";

import { CliExitError } from "../io";
import {
  caseArg,
  entityArg,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";
import { firstJson, runWd } from "./run-wd";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

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

    it("maps the API's stale_version conflict to a message that says what to retry with", async () => {
      const { thrown, body } = await runHandle({
        name: "ORPCError",
        code: "CONFLICT",
        status: 409,
        message: "Claim changed since you opened it",
        data: {
          code: "stale_version",
          entity: "Claim",
          id: "c1",
          currentVersion: 5,
        },
      });
      expect(thrown).toBeInstanceOf(CliExitError);
      expect(body.ok).toBe(false);
      expect(body.error).toMatchObject({ code: "stale_version", status: 409 });
      expect(body.error.message).toContain("Claim changed since you opened it");
      expect(body.error.message).toContain("now at version 5");
      expect(body.error.message).toContain("--expected-version 5");
    });

    it("maps the API's cursor_stale refusal to a message that says how to go on", async () => {
      const { thrown, body } = await runHandle({
        name: "ORPCError",
        code: "BAD_REQUEST",
        status: 400,
        message: "Cursor is stale",
        data: { code: "cursor_stale", list: "evidence" },
      });
      expect(thrown).toBeInstanceOf(CliExitError);
      expect((thrown as CliExitError).exitCode).toBe(1);
      expect(body.error).toMatchObject({ code: "cursor_stale", status: 400 });
      expect(body.error.message).toContain("another sort, filter or search");
      expect(body.error.message).toContain("without --cursor");
      expect(body.help?.join(" ")).toContain("--cursor <nextCursor>");
    });

    it("maps the API's job_start_limited refusal to a code, the wait and what to do", async () => {
      const { thrown, body } = await runHandle({
        name: "ORPCError",
        code: "TOO_MANY_REQUESTS",
        status: 429,
        message:
          "Job start limit reached for this API key (120 per 3600 s). Try again in 90 s.",
        data: {
          code: "job_start_limited",
          scope: "key",
          limit: 120,
          windowSeconds: 3600,
          retryAfterSeconds: 90,
        },
      });
      expect(thrown).toBeInstanceOf(CliExitError);
      expect((thrown as CliExitError).exitCode).toBe(1);
      expect(body.error).toEqual({
        code: "job_start_limited",
        message:
          "Job start limit reached for this API key (120 per 3600 s). Try again in 90 s.",
        status: 429,
        retryAfterSeconds: 90,
      });
      expect(body.help?.join(" ")).toContain("in 90 s");
    });

    it("maps a tagged JobStartLimitError to the stable code", async () => {
      const { body } = await runHandle({
        _tag: "JobStartLimitError",
        code: "job_start_limited",
        message: "Job start limit reached",
      });
      expect(body.error).toMatchObject({ code: "job_start_limited" });
    });

    it("maps a tagged StaleVersionError to the stable code", async () => {
      const { body } = await runHandle({
        _tag: "StaleVersionError",
        code: "stale_version",
        message: "Edge changed since you opened it",
      });
      expect(body.error).toEqual({
        code: "stale_version",
        message: "Edge changed since you opened it",
      });
    });

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

    it("names the missing scope and where to get a key with it (insufficient_scope)", async () => {
      const prev = process.env.WD_CLI_HELP;
      process.env.WD_CLI_HELP = "1";
      try {
        const { thrown, body } = await runHandle({
          name: "ORPCError",
          code: "FORBIDDEN",
          message: "This API key lacks the graph:write scope",
          status: 403,
          data: { code: "insufficient_scope", requiredScope: "graph:write" },
        });
        expect((thrown as CliExitError).exitCode).toBe(1);
        expect(body.error).toEqual({
          code: "insufficient_scope",
          message: "This API key lacks the graph:write scope",
          status: 403,
        });
        expect(body.help.join("\n")).toContain("graph:write");
        expect(body.help.join("\n")).toContain("Settings → API Keys");
      } finally {
        if (prev === undefined) {
          Reflect.deleteProperty(process.env, "WD_CLI_HELP");
        } else {
          process.env.WD_CLI_HELP = prev;
        }
      }
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

  it("content-first entities without --case emits USAGE JSON with --case", async () => {
    const { status, stdout } = await runWd(["entities"], {
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
