import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import { testId } from "@watchdog/test-kit";
import { HttpResponse, http, mockServer } from "@watchdog/test-kit/http";

import { runCap } from "../../../sdk";
import { createCapRunHarness } from "../../../testing";
import { pgpLookup } from "../cap.ts";

const INDEX = [
  "info:1:1",
  "pub:0D59D2B15144766A14D241C66BAF400B05C3E651:1:4096:1421581556::",
  "uid:Debian Security Team <security@debian.org>:1421581556::",
].join("\n");

function serve(host: string, respond: () => Response): void {
  mockServer.use(http.get(`https://${host}/pks/lookup`, respond));
}

describe("identity.pgp.lookup run", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it("succeeds when some keyservers fail and reports each status", async () => {
    serve("keyserver.ubuntu.com", () => new HttpResponse(INDEX));
    serve("keys.openpgp.org", () => new HttpResponse("nope", { status: 404 }));
    serve("pgp.mit.edu", () => new HttpResponse("down", { status: 503 }));
    serve("keys.mailvelope.com", () => HttpResponse.error());
    serve("pgpkeys.eu", () => new HttpResponse(INDEX));

    const input = { query: "security@debian.org", entityId: testId(20) };
    const harness = createCapRunHarness({ input });
    await runCap(pgpLookup.run(harness.ctx));

    const report = harness.artifacts.find(
      (row) => row.name === REPORT_JSON_ARTIFACT
    );
    expect(report).toBeDefined();
    const snap: unknown = JSON.parse(
      new TextDecoder().decode(report?.bytes ?? new Uint8Array())
    );
    expect(snap).toMatchObject({
      queryKind: "email",
      keys: [
        {
          fingerprint: "0D59D2B15144766A14D241C66BAF400B05C3E651",
          servers: ["keyserver.ubuntu.com", "pgpkeys.eu"],
        },
      ],
    });
    expect(
      (snap as { servers: { host: string; status: string }[] }).servers.map(
        (s) => `${s.host}:${s.status}`
      )
    ).toEqual([
      "keyserver.ubuntu.com:ok",
      "keys.openpgp.org:empty",
      "pgp.mit.edu:error",
      "keys.mailvelope.com:error",
      "pgpkeys.eu:ok",
    ]);
  });

  it("asks only the servers that support a name query", async () => {
    const asked: string[] = [];
    for (const host of ["keyserver.ubuntu.com", "pgp.mit.edu", "pgpkeys.eu"]) {
      serve(host, () => {
        asked.push(host);
        return new HttpResponse("", { status: 404 });
      });
    }
    const input = { query: "Debian Security", entityId: testId(20) };
    const harness = createCapRunHarness({ input });
    await runCap(pgpLookup.run(harness.ctx));
    expect([...asked].sort()).toEqual([
      "keyserver.ubuntu.com",
      "pgp.mit.edu",
      "pgpkeys.eu",
    ]);
  });
});
