import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { Layer } from "effect";
import { describe, expect, it } from "vitest";

import { recordingBlobStore } from "@watchdog/core/blob";
import { Db } from "@watchdog/core/infra";
import { testDb } from "@watchdog/test-db";

import { runAppWith } from "../../runtime";
import { makeReady } from "../ready";

const LEAKY =
  "connect ECONNREFUSED 10.9.8.7:5432 postgres://app:hunter2@db.internal/app";

/** The real pool, except `select` (the one verb the check uses) throws driver-like text. */
const dbDown = Db.layerOf(
  new Proxy(testDb, {
    get(target, prop, receiver) {
      if (prop === "select") {
        return () => {
          throw new Error(LEAKY);
        };
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  })
);

function storage(up: boolean) {
  return recordingBlobStore({
    respond: () => {
      if (!up) throw new Error(LEAKY);
      return {};
    },
  }).layer;
}

/** `GET /ready` through the OpenAPI handler, with the real Db pool behind the procedure. */
async function getReady(db: Layer.Layer<Db>, storageUp: boolean) {
  const handler = new OpenAPIHandler({
    ready: makeReady(runAppWith(Layer.mergeAll(db, storage(storageUp)))),
  });
  const { response } = await handler.handle(
    new Request("http://localhost/api/v1/ready"),
    {
      prefix: "/api/v1",
      context: { headers: new Headers(), actor: null, authMethod: "session" },
    }
  );
  if (!response) throw new Error("no route for /ready");
  return { status: response.status, text: await response.text() };
}

describe("GET /ready against the real database", () => {
  it("is 200 when Postgres answers and storage heads its bucket", async () => {
    const { status, text } = await getReady(Db.layer, true);
    expect(status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      ok: true,
      database: "ok",
      storage: "ok",
    });
  });

  it("is 503 naming the database when it fails, with no driver text", async () => {
    const { status, text } = await getReady(dbDown, true);
    expect(status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({
      data: { ok: false, database: "unreachable", storage: "ok" },
    });
    expect(text).not.toMatch(/ECONNREFUSED|hunter2|10\.9\.8\.7|db\.internal/);
  });

  it("is 503 naming storage when it fails, with no driver text", async () => {
    const { status, text } = await getReady(Db.layer, false);
    expect(status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({
      data: { ok: false, database: "ok", storage: "unreachable" },
    });
    expect(text).not.toMatch(/ECONNREFUSED|hunter2|10\.9\.8\.7|db\.internal/);
  });

  it("is 503 naming both when both fail", async () => {
    const { status, text } = await getReady(dbDown, false);
    expect(status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({
      data: { ok: false, database: "unreachable", storage: "unreachable" },
    });
  });
});
