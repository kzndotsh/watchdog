import { EventEmitter } from "node:events";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";

import { testCaseId } from "@watchdog/schemas/testing";
import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";

import { CAPABILITIES } from "../registry";
import type { CapabilityDef } from "../sdk";
import {
  createCapRunHarness,
  createRecordedRun,
  undeclaredHosts,
  unusedContacts,
} from "../testing";
import { EVIDENCE_ID, type DeclarationCase } from "./declaration/case";
import { NETWORK_CASES } from "./declaration/cases-network";
import { PEOPLE_CASES } from "./declaration/cases-people";
import { THREAT_CASES } from "./declaration/cases-threat";

/*
 * Declaration tests (#496): every Cap runs against fixtures under a recording Egress, and every
 * host it touched (each HTTP hop, each DNS name, each TLS peer) must be one its `contacts`
 * declare. The same machinery records real Jobs, so a Cap that grows a new host without
 * declaring it fails here, not in a Case that never allowed it.
 */

const { dnsStub, tlsConnect } = vi.hoisted(() => ({
  dnsStub: {
    cancel: vi.fn(),
    resolve4: vi.fn(async () => ["93.184.216.34"]),
    resolve6: vi.fn(async () => [] as string[]),
    resolveMx: vi.fn(async () => [
      { exchange: "mx.mailhost.test", priority: 5 },
    ]),
    resolveTxt: vi.fn(async (name: string) => {
      if (name.endsWith(".origin.asn.cymru.com")) {
        return [["15169 | 9.9.9.0/24 | US | arin | 2000-01-01"]];
      }
      if (name.endsWith(".asn.cymru.com")) {
        return [["15169 | US | arin | 2000-01-01 | GOOGLE, US"]];
      }
      return [["v=spf1 -all"]];
    }),
    resolveNs: vi.fn(async () => ["ns.mailhost.test"]),
    reverse: vi.fn(async () => ["host.mailhost.test"]),
  },
  tlsConnect: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  Resolver: function Resolver() {
    return dnsStub;
  },
}));

vi.mock("node:tls", () => ({ connect: tlsConnect }));

const CASES: readonly DeclarationCase[] = [
  ...PEOPLE_CASES,
  ...NETWORK_CASES,
  ...THREAT_CASES,
];

const SECRET = "declaration-test-secret-1234";

function capById(id: string): CapabilityDef<z.ZodType> {
  const cap = CAPABILITIES.find((c) => c.id === id);
  if (cap === undefined) throw new Error(`no Cap ${id}`);
  return cap;
}

/** Every vault slot the Cap may read, so a keyed Cap gets as far as its request. */
function secretsFor(cap: CapabilityDef<z.ZodType>): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const spec of cap.credentials ?? []) {
    for (const name of "anyOf" in spec ? spec.anyOf : [spec.name]) {
      secrets[name] = SECRET;
    }
  }
  return secrets;
}

const inputRecord = z.record(z.string(), z.unknown());

/** Runs the Cap once and returns what its Job's ledger would hold; a failed run still counts. */
async function recordRun(c: DeclarationCase, input: Record<string, unknown>) {
  const cap = capById(c.id);
  const recorded = createRecordedRun();
  const harness = createCapRunHarness({
    secrets: secretsFor(cap),
    input: inputRecord.parse(cap.input.parse(input)),
    ...(c.evidenceText === undefined
      ? {}
      : {
          evidenceSnapshot: {
            evidenceId: EVIDENCE_ID,
            caseId: testCaseId(10),
            kind: "attestation",
            text: c.evidenceText,
            packedAt: "2026-01-01T00:00:00.000Z",
            packerVersion: 1,
          },
        }),
  });
  await recorded.run(cap.run(harness.ctx)).catch(() => undefined);
  return recorded.recordedCalls();
}

describe("Cap declaration tests", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
    tlsConnect.mockReset();
  });
  afterAll(() => {
    mockServer.close();
  });

  it("has a case for every registered Cap and for nothing else", () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(CAPABILITIES.map((c) => c.id).sort());
  });

  describe.each(CASES.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    it("touches only hosts its contacts declare", async () => {
      mockServer.use(
        http.all(
          "*",
          ({ request }) =>
            c.respond?.(new URL(request.url)) ??
            HttpResponse.json({}, { status: 404 })
        )
      );
      // A TLS peer that refuses: the handshake is recorded the moment it is attempted.
      tlsConnect.mockImplementation(() => {
        // oxlint-disable-next-line unicorn/prefer-event-target -- a node:tls socket is an EventEmitter
        const socket = Object.assign(new EventEmitter(), {
          setTimeout: vi.fn(),
          destroy: vi.fn(),
          end: vi.fn(),
        });
        queueMicrotask(() => socket.emit("error", new Error("refused")));
        return socket;
      });

      const cap = capById(c.id);
      const calls = (
        await Promise.all(c.inputs.map((input) => recordRun(c, input)))
      ).flat();

      expect(undeclaredHosts(cap.contacts, calls, c.run)).toEqual([]);
      // The other way round: a contact no run used is a declaration gone stale.
      expect(unusedContacts(cap.contacts, calls, c.run)).toEqual([]);
      // A declared Cap must have been exercised, or the assertion above proves nothing; a
      // local Cap declares no contact, so any call at all is a failure.
      if (cap.contacts.length === 0) {
        expect(calls).toEqual([]);
      } else {
        expect(calls.length).toBeGreaterThan(0);
      }
    });
  });
});
