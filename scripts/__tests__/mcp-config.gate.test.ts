import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Structural gate for the committed project MCP config (`.mcp.json`): the three
 * dev servers present, local packages pinned to exact versions, Postgres
 * connecting as the local-only read-only role over loopback, remote servers
 * limited to an https host allowlist with no headers/env/credentials, and no
 * literal credentials.
 * Reads the file as data; the validator below is also run against bad configs so
 * the rules themselves are proven to fail.
 */
const repoRoot = path.resolve(import.meta.dirname, "../..");

type Json = Record<string, unknown>;

const EXACT_PINNED_PACKAGE =
  /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** `${VAR:-postgresql://watchdog_readonly:watchdog_readonly@127.0.0.1:5432/watchdog}` */
const READONLY_DSN_EXPANSION =
  /^\$\{[A-Z][A-Z0-9_]*:-postgres(?:ql)?:\/\/watchdog_readonly:watchdog_readonly@(?:127\.0\.0\.1|localhost):\d+\/[\w-]+\}$/;

/** `scheme://user:password@host`, anywhere in a string. */
const URL_WITH_PASSWORD = /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i;

/** Remote (HTTP) MCP servers are outside the npm pins: only these hosts. */
const REMOTE_HOST_ALLOWLIST = new Set(["mcp.better-auth.com"]);

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

function server(config: Json, name: string): Json | undefined {
  const servers = config.mcpServers as Record<string, Json> | undefined;
  return servers?.[name];
}

/** A server that must exist (test fixtures only). */
function must(config: Json, name: string): Json {
  const srv = server(config, name);
  if (!srv) throw new Error(`fixture has no server "${name}"`);
  return srv;
}

/** The package an `npx` server runs: first argument that is not a flag. */
function npxPackage(srv: Json): string | undefined {
  if (srv.command !== "npx") return undefined;
  return ((srv.args as string[] | undefined) ?? []).find(
    (a) => !a.startsWith("-")
  );
}

/** Problems with a remote (`type: "http"`) server entry. */
function remoteProblems(name: string, srv: Json): string[] {
  const problems: string[] = [];
  if (srv.command !== undefined || srv.args !== undefined) {
    problems.push(`${name}: a remote server must not have command/args`);
  }
  if (srv.headers !== undefined) {
    problems.push(`${name}: a remote server must not set headers`);
  }
  if (srv.env !== undefined) {
    problems.push(`${name}: a remote server must not set env`);
  }
  let url: URL | undefined;
  try {
    url = typeof srv.url === "string" ? new URL(srv.url) : undefined;
  } catch {
    url = undefined;
  }
  if (!url) {
    problems.push(`${name}: url must be a valid absolute URL`);
    return problems;
  }
  if (url.protocol !== "https:") {
    problems.push(`${name}: remote url must be https`);
  }
  if (!REMOTE_HOST_ALLOWLIST.has(url.hostname)) {
    problems.push(`${name}: host "${url.hostname}" is not on the allowlist`);
  }
  if (url.username || url.password || url.search || url.hash) {
    problems.push(
      `${name}: remote url must not carry credentials, a query string or a fragment`
    );
  }
  return problems;
}

/** Every violation found in an MCP config (empty means it passes). */
function validateMcpConfig(config: Json): string[] {
  const problems: string[] = [];
  const servers = (config.mcpServers ?? {}) as Record<string, Json>;

  for (const name of ["postgres", "playwright", "better-auth"]) {
    if (!servers[name]) problems.push(`missing server "${name}"`);
  }

  for (const [name, srv] of Object.entries(servers)) {
    if (srv.type !== undefined) {
      if (srv.type === "http") {
        problems.push(...remoteProblems(name, srv));
      } else {
        problems.push(`${name}: type must be "http" when present`);
      }
      continue;
    }
    if (srv.command !== "npx") {
      problems.push(`${name}: command must be npx with a pinned package`);
      continue;
    }
    const pkg = npxPackage(srv);
    if (!pkg || !EXACT_PINNED_PACKAGE.test(pkg)) {
      problems.push(
        `${name}: package "${pkg ?? ""}" is not pinned to an exact version`
      );
    }
  }

  for (const s of strings(config)) {
    if (URL_WITH_PASSWORD.test(s) && !READONLY_DSN_EXPANSION.test(s)) {
      problems.push(`literal credentials in "${s}"`);
    }
  }

  const pg = server(config, "postgres");
  if (pg) {
    const env = (pg.env ?? {}) as Record<string, unknown>;
    const dsn = env.DATABASE_URL;
    if (typeof dsn !== "string" || !READONLY_DSN_EXPANSION.test(dsn)) {
      problems.push(
        "postgres: DATABASE_URL must expand to the loopback watchdog_readonly URL"
      );
    }
    const writes = env.ALLOW_WRITES;
    if (
      writes !== undefined &&
      !(typeof writes === "string" && ["", "0", "false"].includes(writes))
    ) {
      problems.push("postgres: ALLOW_WRITES must not be enabled");
    }
  }

  const pw = server(config, "playwright");
  if (pw) {
    const args = (pw.args as string[] | undefined) ?? [];
    if (!args.includes("--headless")) {
      problems.push("playwright: must run --headless");
    }
    const origins = args.find((a) => a.startsWith("--allowed-origins="));
    if (!origins?.includes("http://127.0.0.1:3000")) {
      problems.push(
        "playwright: --allowed-origins must name the local web dev origin http://127.0.0.1:3000"
      );
    }
  }

  return problems;
}

const committed = JSON.parse(
  readFileSync(path.join(repoRoot, ".mcp.json"), "utf-8")
) as Json;

const clone = (): Json => structuredClone(committed);

/** Mutate a copy of the committed config and validate it. */
function mutated(change: (cfg: Json) => void): string[] {
  const cfg = clone();
  change(cfg);
  return validateMcpConfig(cfg);
}

describe(".mcp.json", () => {
  it("passes: all servers present, pinned or allowlisted, read-only role, no literal credentials", () => {
    expect(validateMcpConfig(committed)).toEqual([]);
    expect(Object.keys(committed.mcpServers as Json).sort()).toEqual([
      "better-auth",
      "playwright",
      "postgres",
    ]);
  });

  it("pins the Postgres MCP package and Playwright MCP to exact versions", () => {
    expect(npxPackage(must(committed, "postgres"))).toMatch(
      /^@yawlabs\/postgres-mcp@\d+\.\d+\.\d+$/
    );
    expect(npxPackage(must(committed, "playwright"))).toMatch(
      /^@playwright\/mcp@\d+\.\d+\.\d+$/
    );
  });

  it("fails when a server is missing", () => {
    expect(
      mutated((c) => {
        delete (c.mcpServers as Json).playwright;
      })
    ).toContain('missing server "playwright"');
  });

  it.each(["latest", "^0.13.7", "~0.13.7", "0.13", ">=0.13.7", ""])(
    "fails when the Postgres package version is %j",
    (version) => {
      const problems = mutated((c) => {
        const args = must(c, "postgres").args as string[];
        const i = args.findIndex((a) => a.startsWith("@yawlabs/"));
        args[i] = version
          ? `@yawlabs/postgres-mcp@${version}`
          : "@yawlabs/postgres-mcp";
      });
      expect(problems.join("\n")).toContain("not pinned to an exact version");
    }
  );

  it("fails when Playwright is unpinned", () => {
    const problems = mutated((c) => {
      const args = must(c, "playwright").args as string[];
      args[args.findIndex((a) => a.startsWith("@playwright/"))] =
        "@playwright/mcp@latest";
    });
    expect(problems.join("\n")).toContain("not pinned to an exact version");
  });

  it("fails on a server that is not run through a pinned npx package", () => {
    const problems = mutated((c) => {
      must(c, "playwright").command = "playwright-mcp";
    });
    expect(problems.join("\n")).toContain("command must be npx");
  });

  it.each([
    "postgresql://postgres:postgres@127.0.0.1:5432/watchdog",
    "postgresql://watchdog_app:watchdog@127.0.0.1:5432/watchdog",
    "postgresql://watchdog_readonly:hunter2@127.0.0.1:5432/watchdog",
    `\${DATABASE_URL}`,
    `\${WATCHDOG_MCP_DATABASE_URL:-postgresql://watchdog_readonly:watchdog_readonly@db.example.com:5432/watchdog}`,
    `\${WATCHDOG_MCP_DATABASE_URL:-postgresql://watchdog_app:watchdog@127.0.0.1:5432/watchdog}`,
  ])("fails when the Postgres connection is %s", (dsn) => {
    const problems = mutated((c) => {
      (must(c, "postgres").env as Json).DATABASE_URL = dsn;
    });
    expect(problems.length).toBeGreaterThan(0);
  });

  it("fails on a literal credential URL anywhere in the file", () => {
    const problems = mutated((c) => {
      must(c, "playwright").env = {
        UPSTREAM: "https://admin:s3cret@example.com/x",
      };
    });
    expect(problems.join("\n")).toContain("literal credentials");
  });

  it("fails when writes are enabled for the Postgres server", () => {
    const problems = mutated((c) => {
      (must(c, "postgres").env as Json).ALLOW_WRITES = "1";
    });
    expect(problems).toContain("postgres: ALLOW_WRITES must not be enabled");
  });

  it("fails when Playwright is headed or not scoped to the local web origin", () => {
    const headed = mutated((c) => {
      const pw = must(c, "playwright");
      pw.args = (pw.args as string[]).filter((a) => a !== "--headless");
    });
    expect(headed).toContain("playwright: must run --headless");
    const scoped = mutated((c) => {
      const pw = must(c, "playwright");
      pw.args = (pw.args as string[]).filter(
        (a) => !a.startsWith("--allowed-origins")
      );
    });
    expect(scoped.join("\n")).toContain("--allowed-origins");
  });

  describe("remote servers", () => {
    it("declares better-auth as a plain https http server", () => {
      expect(must(committed, "better-auth")).toEqual({
        type: "http",
        url: "https://mcp.better-auth.com/mcp",
      });
    });

    it.each([
      [
        "a non-https url",
        { url: "http://mcp.better-auth.com/mcp" },
        "must be https",
      ],
      [
        "an unknown host",
        { url: "https://evil.example.com/mcp" },
        "not on the allowlist",
      ],
      [
        "a look-alike host",
        { url: "https://mcp.better-auth.com.evil.io/mcp" },
        "not on the allowlist",
      ],
      [
        "a header",
        { headers: { Authorization: "Bearer x" } },
        "must not set headers",
      ],
      ["an env block", { env: { TOKEN: "x" } }, "must not set env"],
      [
        "credentials in the url",
        { url: "https://u:p@mcp.better-auth.com/mcp" },
        "credentials",
      ],
      [
        "a token in the query string",
        { url: "https://mcp.better-auth.com/mcp?token=abc" },
        "query string",
      ],
      [
        "a command",
        { command: "npx", args: ["-y", "x@1.0.0"] },
        "command/args",
      ],
      ["a malformed url", { url: "not a url" }, "valid absolute URL"],
    ])("fails on %s", (_label, change, expected) => {
      const problems = mutated((c) => {
        Object.assign(must(c, "better-auth"), change);
      });
      expect(problems.join("\n")).toContain(expected);
    });

    it.each(["sse", "streamable-http", "HTTP", "", 1])(
      "fails on type %j",
      (type) => {
        const problems = mutated((c) => {
          must(c, "better-auth").type = type;
        });
        expect(problems.join("\n")).toContain('type must be "http"');
      }
    );

    it("fails when the better-auth server is removed", () => {
      expect(
        mutated((c) => {
          delete (c.mcpServers as Json)["better-auth"];
        })
      ).toContain('missing server "better-auth"');
    });
  });
});
