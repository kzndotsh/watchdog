import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";

import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("node:tls", () => ({ connect }));

import { makeJobEgress } from "../egress";

const ROOT_DER = Buffer.from([0x30, 0x02, 0x09, 0x09]);
const LEAF_DER = Buffer.from([0x30, 0x03, 0x01, 0x02, 0x03]);

type Cert = {
  raw: Buffer;
  subject: { CN: string };
  issuer: { CN: string };
  issuerCertificate?: Cert;
};

function chain(): Cert {
  const root: Cert = {
    raw: ROOT_DER,
    subject: { CN: "Root" },
    issuer: { CN: "Root" },
  };
  root.issuerCertificate = root;
  return {
    raw: LEAF_DER,
    subject: { CN: "example.com" },
    issuer: { CN: "Root" },
    issuerCertificate: root,
  };
}

/** A socket that finishes its handshake on the next tick, showing `peer`. */
function fakeHandshake(peer: Cert | Record<string, never>) {
  connect.mockImplementation((_options: unknown, onSecure: () => void) => {
    // oxlint-disable-next-line unicorn/prefer-event-target -- a node:tls socket is an EventEmitter
    const socket = Object.assign(new EventEmitter(), {
      authorized: false,
      authorizationError: "DEPTH_ZERO_SELF_SIGNED_CERT",
      getPeerCertificate: () => peer,
      getProtocol: () => "TLSv1.3",
      getCipher: () => ({
        name: "TLS_AES_256_GCM_SHA384",
        standardName: "TLS_AES_256_GCM_SHA384",
        version: "TLSv1.3",
      }),
      setTimeout: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn((error?: Error) => {
        if (error !== undefined) socket.emit("error", error);
      }),
    });
    queueMicrotask(onSecure);
    return socket;
  });
}

function job() {
  return makeJobEgress({ fetch: vi.fn(), fetchPrivateOrigin: vi.fn() });
}

const target = (host: string, signal = new AbortController().signal) => ({
  host,
  port: 443,
  servername: host,
  signal,
});

beforeEach(() => {
  connect.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Egress.tlsConnect", () => {
  it("records a tls call whose body is the peer's DER chain, leaf first", async () => {
    fakeHandshake(chain());
    const { egress, ledger } = job();

    const peer = await Effect.runPromise(
      egress.tlsConnect(target("example.com"))
    );

    expect(peer).toMatchObject({
      protocol: "TLSv1.3",
      authorized: false,
      authorizationError: "DEPTH_ZERO_SELF_SIGNED_CERT",
    });
    expect(peer.chain.map((der) => Buffer.from(der).toString("hex"))).toEqual([
      LEAF_DER.toString("hex"),
      ROOT_DER.toString("hex"),
    ]);
    const wire = Buffer.concat([LEAF_DER, ROOT_DER]);
    const [call] = ledger.drain();
    expect(call).toMatchObject({
      transport: "tls",
      method: "TLS",
      url: "tls://example.com:443",
      bodyKind: "tls_peer_chain_der",
      outcome: "response",
      status: 0,
      failure: null,
      body: {
        state: "stored",
        sha256: createHash("sha256").update(wire).digest("hex"),
        bytes: wire.length,
      },
    });
    if (call?.body.state !== "stored") throw new Error("expected stored");
    expect(Buffer.from(call.body.data).equals(wire)).toBe(true);
  });

  it("records an empty chain when the peer sent no certificate", async () => {
    fakeHandshake({});
    const { egress, ledger } = job();

    const peer = await Effect.runPromise(
      egress.tlsConnect(target("example.com"))
    );

    expect(peer.certificate).toBeNull();
    expect(peer.chain).toEqual([]);
    expect(ledger.drain()[0]?.body).toMatchObject({
      state: "stored",
      bytes: 0,
    });
  });

  it("refuses a private host, connects to nothing and records the refusal", async () => {
    const { egress, ledger } = job();

    const exit = await Effect.runPromiseExit(
      egress.tlsConnect(target("127.0.0.1"))
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(connect).not.toHaveBeenCalled();
    expect(ledger.drain()[0]).toMatchObject({
      outcome: "failed",
      url: "tls://127.0.0.1:443",
      failure: { tag: "BlockedTargetError", reason: "address" },
    });
  });

  it("fails closed under an egress proxy and records it", async () => {
    vi.stubEnv("WD_EGRESS_PROXY", "http://proxy.internal:3128");
    const { egress, ledger } = job();

    const exit = await Effect.runPromiseExit(
      egress.tlsConnect(target("example.com"))
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(connect).not.toHaveBeenCalled();
    expect(ledger.drain()[0]).toMatchObject({
      outcome: "failed",
      failure: { tag: "BlockedTargetError", reason: "unproxied" },
    });
  });

  it("an abort during the handshake is a defect and a failed record", async () => {
    connect.mockImplementation(() =>
      // oxlint-disable-next-line unicorn/prefer-event-target -- a node:tls socket is an EventEmitter
      Object.assign(new EventEmitter(), {
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(function destroy(this: EventEmitter, error?: Error) {
          if (error !== undefined) this.emit("error", error);
        }),
      })
    );
    const { egress, ledger } = job();
    const controller = new AbortController();

    const pending = Effect.runPromiseExit(
      egress.tlsConnect(target("example.com", controller.signal))
    );
    await vi.waitFor(() => {
      expect(connect).toHaveBeenCalled();
    });
    controller.abort();

    expect(Exit.isFailure(await pending)).toBe(true);
    expect(ledger.drain()[0]).toMatchObject({
      outcome: "failed",
      failure: { tag: "AbortedError" },
    });
  });
});
