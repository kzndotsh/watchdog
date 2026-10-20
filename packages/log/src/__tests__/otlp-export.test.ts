import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Socket } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createScrubber } from "../error-scrub.ts";
import {
  createOtlpExporter,
  parseOtlpSettings,
  setUpOtlpExport,
  type OtlpExporter,
} from "../otlp-export.ts";

type Received = {
  readonly url: string;
  readonly headers: IncomingMessage["headers"];
  readonly raw: string;
};

type Behavior = "ok" | "error" | "hang";

/** A real OTLP/HTTP receiver on a loopback port. */
async function startReceiver(behavior: Behavior = "ok") {
  const received: Received[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        url: req.url ?? "",
        headers: req.headers,
        raw: Buffer.concat(chunks).toString("utf-8"),
      });
      if (behavior === "hang") return;
      res.statusCode = behavior === "error" ? 500 : 200;
      res.setHeader("content-type", "application/json");
      res.end("{}");
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("receiver has no port");
  }
  const { port } = address;
  return {
    received,
    endpoint: `http://127.0.0.1:${port}`,
    port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  vi.restoreAllMocks();
});

async function receiver(behavior: Behavior = "ok") {
  const started = await startReceiver(behavior);
  closers.push(started.close);
  return started;
}

function exporterFor(
  endpoint: string,
  extra: Partial<Parameters<typeof setUpOtlpExport>[0] & object> = {}
): OtlpExporter {
  const { exporter, warning } = setUpOtlpExport(
    {
      endpoint,
      headers: "x-api-key-test=k-123456789,DD-API-KEY=dd-secret-value",
      resourceAttributes: "deployment.region=eu",
      release: "1.4.0",
      environment: "production",
      secrets: ["super-secret-env-value-0001"],
      ...extra,
    },
    "watchdog-web"
  );
  expect(warning).toBeNull();
  if (exporter === null) throw new Error("exporter expected");
  return exporter;
}

function pushAll(
  exporter: OtlpExporter,
  ...events: Record<string, unknown>[]
): void {
  for (const event of events) exporter.push(event);
}

type AttrList = { key: string; value: Record<string, unknown> }[];
type Payload = {
  resourceLogs: {
    resource: { attributes: AttrList };
    scopeLogs: {
      logRecords: {
        severityText: string;
        severityNumber: number;
        traceId?: string;
        spanId?: string;
        body: { stringValue: string };
        attributes: AttrList;
      }[];
    }[];
  }[];
};

function attr(list: AttrList, key: string): unknown {
  const found = list.find((entry) => entry.key === key);
  return found === undefined ? undefined : Object.values(found.value)[0];
}

describe("OTLP settings", () => {
  it("is off, without a warning, when no endpoint is set", () => {
    expect(parseOtlpSettings({})).toEqual({ kind: "off" });
    expect(parseOtlpSettings({ endpoint: "   ", headers: "a=b" })).toEqual({
      kind: "off",
    });
    expect(setUpOtlpExport(undefined, "svc")).toEqual({
      exporter: null,
      warning: null,
    });
    expect(setUpOtlpExport({ release: "1" }, "svc")).toEqual({
      exporter: null,
      warning: null,
    });
  });

  it("sends no traffic when unset", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { exporter } = setUpOtlpExport({ headers: "a=b" }, "svc");
    expect(exporter).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["not a url", {}, "WD_OTLP_ENDPOINT"],
    ["ftp://collector.example.test", {}, "WD_OTLP_ENDPOINT"],
    ["https://x.example.test", { headers: "novalue" }, "WD_OTLP_HEADERS"],
    ["https://x.example.test", { headers: "=v" }, "WD_OTLP_HEADERS"],
    ["https://x.example.test", { headers: "bad name=v" }, "WD_OTLP_HEADERS"],
    [
      "https://x.example.test",
      { resourceAttributes: "=x" },
      "WD_OTLP_RESOURCE_ATTRIBUTES",
    ],
  ])(
    "leaves export off with one warning for %s %j",
    (endpoint, extra, name) => {
      const setup = setUpOtlpExport(
        { endpoint, ...extra, secrets: [] },
        "watchdog-web"
      );
      expect(setup.exporter).toBeNull();
      expect(setup.warning).toContain(name);
      expect(setup.warning).not.toContain(endpoint);
    }
  );

  it("accepts base64 padding and a Bearer value in a header", () => {
    const parsed = parseOtlpSettings({
      endpoint: "https://otlp.example.test",
      headers: "Authorization=Basic dXNlcjpwYXNz==,x-a=b",
    });
    expect(parsed.kind).toBe("on");
    if (parsed.kind === "on") {
      expect(parsed.parsed.headers.Authorization).toBe("Basic dXNlcjpwYXNz==");
    }
  });
});

describe("OTLP export", () => {
  it("delivers well-formed records with service, release, severity, request and Job ids", async () => {
    const target = await receiver();
    const exporter = exporterFor(target.endpoint);
    pushAll(
      exporter,
      {
        timestamp: "2026-10-20T10:00:00.000Z",
        level: "error",
        service: "ignored",
        requestId: "req-7f3a",
        method: "POST",
        path: "/api/v1/cases",
        status: 500,
        job: { jobId: "job-42" },
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        message: "request failed",
      },
      { level: "info", message: "fine" }
    );
    await exporter.flush();

    expect(target.received).toHaveLength(1);
    const [request] = target.received;
    expect(request?.url).toBe("/v1/logs");
    expect(request?.headers["content-type"]).toBe("application/json");
    expect(request?.headers["x-api-key-test"]).toBe("k-123456789");
    expect(request?.headers["dd-api-key"]).toBe("dd-secret-value");

    const payload: Payload = JSON.parse(request?.raw ?? "{}");
    const resource = payload.resourceLogs[0]?.resource.attributes ?? [];
    expect(attr(resource, "service.name")).toBe("watchdog-web");
    expect(attr(resource, "service.version")).toBe("1.4.0");
    expect(attr(resource, "deployment.environment")).toBe("production");
    expect(attr(resource, "deployment.region")).toBe("eu");

    const records = payload.resourceLogs[0]?.scopeLogs[0]?.logRecords ?? [];
    expect(records).toHaveLength(2);
    const failed = records.find((r) => r.severityText === "ERROR");
    expect(failed?.severityNumber).toBe(17);
    expect(failed?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(failed?.spanId).toBe("00f067aa0ba902b7");
    expect(attr(failed?.attributes ?? [], "requestId")).toBe("req-7f3a");
    expect(attr(failed?.attributes ?? [], "job.jobId")).toBe("job-42");
    expect(attr(failed?.attributes ?? [], "http.response.status_code")).toBe(
      "500"
    );
    expect(records.find((r) => r.severityText === "INFO")).toBeDefined();
    expect(exporter.stats()).toEqual({
      accepted: 2,
      dropped: 0,
      failedBatches: 0,
    });
  });

  it("scrubs secrets, tokens and Evidence content from every exported record", async () => {
    const target = await receiver();
    const exporter = exporterFor(target.endpoint);
    exporter.push({
      level: "warn",
      message:
        "call failed Bearer tok-abcdef123456 with super-secret-env-value-0001 for someone@example.test",
      url: "https://api.example.test/hook?key=querysecret99",
      session_token: "tok-field-00001",
      headers: { authorization: "Bearer hdr-token-0002", "x-trace": "ok" },
      evidence: { id: "ev-1", content: "RAW EVIDENCE BODY: passport 9988" },
      requestBody: "REQUEST BODY with account 1234",
      notes: "header leak dd-secret-value and k-123456789",
      cap: { capabilityId: "cap-1", output: { content: "SCRAPED CONTENT" } },
    });
    await exporter.flush();

    const raw = target.received.map((r) => r.raw).join("\n");
    expect(raw).toContain("call failed");
    for (const leaked of [
      "tok-abcdef123456",
      "super-secret-env-value-0001",
      "someone@example.test",
      "querysecret99",
      "tok-field-00001",
      "hdr-token-0002",
      "RAW EVIDENCE BODY",
      "passport 9988",
      "REQUEST BODY",
      "dd-secret-value",
      "k-123456789",
      "SCRAPED CONTENT",
    ]) {
      expect(raw).not.toContain(leaked);
    }
  });

  it("keeps case and evidence ids, and drops a malformed trace id", async () => {
    const target = await receiver();
    const exporter = exporterFor(target.endpoint);
    const caseId = "00000000-0000-4000-8000-000000000001";
    exporter.push({
      level: "info",
      case: { caseId },
      traceId: "not-a-trace-id",
    });
    await exporter.flush();
    const raw = target.received.map((r) => r.raw).join("\n");
    expect(raw).toContain(caseId);
    expect(raw).not.toContain("not-a-trace-id");
  });
});

describe("OTLP export failure", () => {
  const quick = { timeoutMs: 100, retryDelayMs: 5 } as const;

  async function failing(behavior: Behavior) {
    const target = await receiver(behavior);
    const { exporter } = setUpOtlpExport(
      { endpoint: target.endpoint },
      "watchdog-web"
    );
    if (exporter === null) throw new Error("exporter expected");
    return { target, exporter };
  }

  it("never makes push wait, whatever the receiver does", async () => {
    for (const behavior of ["error", "hang"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one receiver at a time
      const { exporter } = await failing(behavior);
      const started = performance.now();
      for (let i = 0; i < 200; i += 1) {
        exporter.push({ level: "info", message: `m${i}` });
      }
      expect(performance.now() - started).toBeLessThan(250);
    }
  });

  it("counts a batch the receiver rejects, without throwing", async () => {
    const target = await receiver("error");
    const exporter = createOtlpExporter({
      parsed: {
        endpoint: target.endpoint,
        headers: {},
        resourceAttributes: {},
      },
      service: "watchdog-worker",
      scrubber: createScrubber(),
      ...quick,
    });
    pushAll(
      exporter,
      { level: "info", message: "one" },
      { level: "info", message: "two" }
    );
    await expect(exporter.flush()).resolves.toBeUndefined();
    // two attempts: the pipeline retries a failed batch once
    expect(target.received.length).toBeGreaterThanOrEqual(2);
    expect(exporter.stats()).toEqual({
      accepted: 2,
      dropped: 2,
      failedBatches: 1,
    });
  });

  it("gives up on a hanging receiver at the timeout", async () => {
    const target = await receiver("hang");
    const exporter = createOtlpExporter({
      parsed: {
        endpoint: target.endpoint,
        headers: {},
        resourceAttributes: {},
      },
      service: "watchdog-worker",
      scrubber: createScrubber(),
      ...quick,
    });
    exporter.push({ level: "info", message: "stuck" });
    const started = performance.now();
    await exporter.flush();
    expect(performance.now() - started).toBeLessThan(2000);
    expect(exporter.stats().failedBatches).toBe(1);
  });

  it("counts events when the receiver is down", async () => {
    const target = await startReceiver();
    await target.close();
    const exporter = createOtlpExporter({
      parsed: {
        endpoint: target.endpoint,
        headers: {},
        resourceAttributes: {},
      },
      service: "watchdog-worker",
      scrubber: createScrubber(),
      ...quick,
    });
    exporter.push({ level: "info", message: "nobody home" });
    await exporter.flush();
    expect(exporter.stats()).toMatchObject({ accepted: 1, dropped: 1 });
  });

  it("drops the oldest event when the buffer is full", async () => {
    const target = await receiver("hang");
    const exporter = createOtlpExporter({
      parsed: {
        endpoint: target.endpoint,
        headers: {},
        resourceAttributes: {},
      },
      service: "watchdog-worker",
      scrubber: createScrubber(),
      maxBuffer: 3,
      batchSize: 100,
      intervalMs: 60_000,
      ...quick,
    });
    for (let i = 0; i < 5; i += 1) exporter.push({ level: "info" });
    expect(exporter.stats().dropped).toBe(2);
  });
});
