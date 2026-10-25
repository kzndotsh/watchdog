import { createHash } from "node:crypto";

import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolver } = vi.hoisted(() => ({
  mockResolver: {
    cancel: vi.fn(),
    resolve4: vi.fn(),
    resolveMx: vi.fn(),
    resolveTxt: vi.fn(),
    reverse: vi.fn(),
  },
}));

vi.mock("node:dns/promises", () => ({
  Resolver: function Resolver() {
    return mockResolver;
  },
}));

import { makeJobEgress } from "../egress";
import { canonicalJson } from "../egress-dns";

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** DNS never touches the HTTP doors, so the client is a pair of stubs. */
function job() {
  return makeJobEgress({ fetch: vi.fn(), fetchPrivateOrigin: vi.fn() });
}

function dnsError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  for (const fn of Object.values(mockResolver)) fn.mockReset();
});

describe("canonicalJson", () => {
  it("sorts keys at every depth, keeps array order and writes no whitespace", () => {
    expect(
      canonicalJson([{ priority: 10, exchange: "mx.example.com" }, ["b", "a"]])
    ).toBe('[{"exchange":"mx.example.com","priority":10},["b","a"]]');
    expect(canonicalJson([])).toBe("[]");
  });
});

describe("Egress.resolve", () => {
  it("records the call: transport, record type, name, status and the answer as canonical JSON", async () => {
    mockResolver.resolveMx.mockResolvedValueOnce([
      { priority: 10, exchange: "mx.example.com" },
    ]);
    const { egress, ledger } = job();

    const answer = await Effect.runPromise(
      egress.resolve(
        { type: "MX", name: "example.com" },
        new AbortController().signal
      )
    );

    expect(answer).toEqual([{ priority: 10, exchange: "mx.example.com" }]);
    const json = '[{"exchange":"mx.example.com","priority":10}]';
    const [call] = ledger.drain();
    expect(call).toMatchObject({
      transport: "dns",
      method: "MX",
      url: "dns:example.com?type=MX",
      bodyKind: "dns_answer_json",
      outcome: "response",
      status: 0,
      failure: null,
      hops: [{ url: "dns:example.com?type=MX", status: 0, attempts: 1 }],
      body: { state: "stored", sha256: sha256(json), bytes: json.length },
    });
    if (call?.body.state !== "stored") throw new Error("expected stored");
    expect(Buffer.from(call.body.data).toString()).toBe(json);
  });

  it("normalizes the name with the tools host normalizer and allows service labels", async () => {
    mockResolver.resolveTxt.mockResolvedValue([["v=DMARC1; p=none"]]);
    const { egress, ledger } = job();
    const signal = new AbortController().signal;

    await Effect.runPromise(
      egress.resolve({ type: "TXT", name: "_DMARC.Example.COM." }, signal)
    );

    expect(mockResolver.resolveTxt).toHaveBeenLastCalledWith(
      "_dmarc.example.com"
    );
    expect(ledger.drain()[0]?.url).toBe("dns:_dmarc.example.com?type=TXT");
  });

  it("records NXDOMAIN and no-data as answers with their response code", async () => {
    mockResolver.resolve4.mockRejectedValueOnce(dnsError("ENOTFOUND"));
    mockResolver.resolve4.mockRejectedValueOnce(dnsError("ENODATA"));
    mockResolver.resolve4.mockRejectedValueOnce(dnsError("ESERVFAIL"));
    const { egress, ledger } = job();
    const signal = new AbortController().signal;

    // Started in order, so each takes the next mocked answer.
    const answers = await Promise.all(
      ["a.example.com", "b.example.com", "c.example.com"].map(async (name) =>
        Effect.runPromise(egress.resolve({ type: "A", name }, signal))
      )
    );
    expect(answers).toEqual([[], [], []]);

    expect(ledger.drain().map((c) => [c.status, c.outcome])).toEqual([
      [3, "response"],
      [0, "response"],
      [2, "response"],
    ]);
    expect(ledger.drain()[0]?.body).toMatchObject({
      state: "stored",
      sha256: sha256("[]"),
    });
  });

  it("records a PTR query under the address it reverses", async () => {
    mockResolver.reverse.mockResolvedValueOnce(["one.one.one.one"]);
    const { egress, ledger } = job();

    await Effect.runPromise(
      egress.resolve(
        { type: "PTR", name: "1.1.1.1" },
        new AbortController().signal
      )
    );

    expect(ledger.drain()[0]).toMatchObject({
      method: "PTR",
      url: "dns:1.1.1.1?type=PTR",
      status: 0,
    });
  });

  it("refuses a malformed name before any call is made or recorded", async () => {
    const { egress, ledger } = job();
    const exit = await Effect.runPromiseExit(
      egress.resolve(
        { type: "A", name: "not a host!" },
        new AbortController().signal
      )
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(ledger.count()).toBe(0);
    expect(mockResolver.resolve4).not.toHaveBeenCalled();
  });

  it("records another resolver fault as a failed call, by class only", async () => {
    mockResolver.resolve4.mockRejectedValueOnce(dnsError("ECONNREFUSED"));
    const { egress, ledger } = job();

    const exit = await Effect.runPromiseExit(
      egress.resolve(
        { type: "A", name: "example.com" },
        new AbortController().signal
      )
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(ledger.drain()[0]).toMatchObject({
      outcome: "failed",
      status: null,
      body: { state: "none" },
      failure: { tag: "UnexpectedToolError" },
    });
  });

  it("an aborted signal is a defect, cancels nothing it never started, and is recorded failed", async () => {
    const { egress, ledger } = job();
    const controller = new AbortController();
    controller.abort();

    const exit = await Effect.runPromiseExit(
      egress.resolve({ type: "A", name: "example.com" }, controller.signal)
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(mockResolver.resolve4).not.toHaveBeenCalled();
    expect(ledger.drain()[0]).toMatchObject({
      outcome: "failed",
      failure: { tag: "AbortedError" },
    });
  });

  it("cancels the resolver when the signal aborts mid-query", async () => {
    mockResolver.resolve4.mockImplementationOnce(
      // oxlint-disable-next-line promise/avoid-new -- a query that only ends when cancelled
      async () =>
        new Promise((_resolve, reject) => {
          mockResolver.cancel.mockImplementationOnce(() => {
            reject(dnsError("ECANCELLED"));
          });
        })
    );
    const { egress, ledger } = job();
    const controller = new AbortController();

    const pending = Effect.runPromiseExit(
      egress.resolve({ type: "A", name: "example.com" }, controller.signal)
    );
    await vi.waitFor(() => {
      expect(mockResolver.resolve4).toHaveBeenCalled();
    });
    controller.abort();

    expect(Exit.isFailure(await pending)).toBe(true);
    expect(mockResolver.cancel).toHaveBeenCalled();
    expect(ledger.drain()[0]).toMatchObject({
      outcome: "failed",
      failure: { tag: "AbortedError" },
    });
  });
});
