import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { firstJson, runWd } from "../../__tests__/run-wd";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

let server: Server | undefined;

/** A stand-in API answering `GET /api/v1/auth/whoami`; resolves its base URL. */
async function serveWhoami(body: unknown, seen: string[]): Promise<string> {
  server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });
  const listening = server;
  await new Promise<void>((resolve) => {
    listening.listen(0, "127.0.0.1", resolve);
  });
  const address = listening.address();
  if (address === null || typeof address === "string") {
    throw new Error("stand-in API is not listening on a port");
  }
  return `http://127.0.0.1:${address.port}/api/v1`;
}

afterEach(async () => {
  const closing = server;
  server = undefined;
  if (closing === undefined) return;
  await new Promise<void>((resolve) => {
    closing.close(() => {
      resolve();
    });
  });
});

describe("wd auth status", () => {
  it("prints the key's scopes and organization, and what it lacks", async () => {
    const seen: string[] = [];
    const url = await serveWhoami(
      {
        credential: "apiKey",
        keyId: "key-1",
        scopes: ["cases:read", "proposals:write"],
        organizationId: "org-1",
      },
      seen
    );

    const run = await runWd(["auth", "status"], {
      WD_API_KEY: "wd_test",
      WD_API_URL: url,
    });

    expect(run.status).toBe(0);
    expect(seen[0]).toBe("GET /api/v1/auth/whoami");
    expect(firstJson(run.stdout)).toEqual({
      credential: "apiKey",
      keyId: "key-1",
      scopes: ["cases:read", "proposals:write"],
      organizationId: "org-1",
      help: [
        "Missing scopes: evidence:write, graph:write. Create a key with them in Settings → API Keys.",
      ],
    });
  });

  it("adds no help to a key that holds every scope", async () => {
    const url = await serveWhoami(
      {
        credential: "apiKey",
        keyId: "key-2",
        scopes: [
          "cases:read",
          "evidence:write",
          "proposals:write",
          "graph:write",
        ],
        organizationId: "org-1",
      },
      []
    );

    const run = await runWd(["auth", "status"], {
      WD_API_KEY: "wd_test",
      WD_API_URL: url,
    });

    expect(firstJson(run.stdout)).not.toHaveProperty("help");
  });
});
