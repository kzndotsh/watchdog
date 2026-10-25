import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

import { createCapRunHarness, createRecordedRun } from "../../../testing";
import { tlsAudit } from "../cap.ts";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("node:tls", () => ({ connect }));

const LEAF_DER = Buffer.from([0x30, 0x03, 0x01, 0x02, 0x03]);

describe("network.host.tls_audit records its handshake at the Job's door", () => {
  it("one tls call whose body is the peer's DER chain", async () => {
    connect.mockImplementation((_options: unknown, onSecure: () => void) => {
      const leaf = {
        raw: LEAF_DER,
        subject: { CN: "tls.test" },
        issuer: { CN: "Test CA" },
        valid_from: "Jan  1 00:00:00 2026 GMT",
        valid_to: "Jan  1 00:00:00 2027 GMT",
        fingerprint256: "AA:BB",
        serialNumber: "01",
        subjectaltname: "DNS:tls.test",
      };
      // oxlint-disable-next-line unicorn/prefer-event-target -- a node:tls socket is an EventEmitter
      const socket = Object.assign(new EventEmitter(), {
        authorized: true,
        authorizationError: undefined,
        getPeerCertificate: () => ({ ...leaf, issuerCertificate: undefined }),
        getProtocol: () => "TLSv1.3",
        getCipher: () => ({ name: "TLS_AES_128_GCM_SHA256" }),
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      });
      queueMicrotask(onSecure);
      return socket;
    });
    const recorded = createRecordedRun();
    const harness = createCapRunHarness({
      input: { host: "TLS.test", port: 8443, entityId: testId(30) },
    });

    await recorded.run(tlsAudit.run(harness.ctx));

    const [call, ...rest] = recorded.recordedCalls();
    expect(rest).toEqual([]);
    expect(call).toMatchObject({
      transport: "tls",
      method: "TLS",
      url: "tls://tls.test:8443",
      bodyKind: "tls_peer_chain_der",
      outcome: "response",
      status: 0,
      body: {
        state: "stored",
        sha256: createHash("sha256").update(LEAF_DER).digest("hex"),
        bytes: LEAF_DER.length,
      },
    });
  });
});
