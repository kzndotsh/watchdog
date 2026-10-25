import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

import { createCapRunHarness, createRecordedRun } from "../../../testing";
import { dnsReverse } from "../../dns.reverse/cap.ts";
import { mailConfig } from "../../domain.mail_config/cap.ts";
import { dnsLookup } from "../cap.ts";

const { stub } = vi.hoisted(() => ({
  stub: {
    cancel: vi.fn(),
    resolve4: vi.fn(async () => ["1.2.3.4"]),
    resolve6: vi.fn(async () => [] as string[]),
    resolveMx: vi.fn(async () => [
      { exchange: "mx.mailhost.test", priority: 5 },
    ]),
    resolveTxt: vi.fn(async (name: string) =>
      name === "mailhost.test" ? [["v=spf1 -all"]] : []
    ),
    resolveNs: vi.fn(async () => ["ns.mailhost.test"]),
    reverse: vi.fn(async () => ["host.mailhost.test"]),
  },
}));

vi.mock("node:dns/promises", () => ({
  Resolver: function Resolver() {
    return stub;
  },
}));

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

describe("DNS Caps record every question at the Job's door", () => {
  it("network.dns.lookup: one dns call per record type, answer as canonical JSON", async () => {
    const recorded = createRecordedRun();
    const harness = createCapRunHarness({
      input: { host: "MailHost.test.", entityId: testId(20) },
    });

    await recorded.run(dnsLookup.run(harness.ctx));

    const calls = [...recorded.recordedCalls()].sort((a, b) =>
      a.method.localeCompare(b.method)
    );
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["A", "dns:mailhost.test?type=A"],
      ["AAAA", "dns:mailhost.test?type=AAAA"],
      ["MX", "dns:mailhost.test?type=MX"],
      ["NS", "dns:mailhost.test?type=NS"],
      ["TXT", "dns:mailhost.test?type=TXT"],
    ]);
    for (const call of calls) {
      expect(call).toMatchObject({
        transport: "dns",
        bodyKind: "dns_answer_json",
        outcome: "response",
        status: 0,
      });
    }
    const a = calls.find((c) => c.method === "A");
    expect(a?.body).toMatchObject({
      state: "stored",
      sha256: sha256('["1.2.3.4"]'),
    });
    const mx = calls.find((c) => c.method === "MX");
    expect(mx?.body).toMatchObject({
      sha256: sha256('[{"exchange":"mx.mailhost.test","priority":5}]'),
    });
  });

  it("network.dns.reverse: a PTR call under the address", async () => {
    const recorded = createRecordedRun();
    const harness = createCapRunHarness({
      input: { ip: "9.9.9.9", entityId: testId(21) },
    });

    await recorded.run(dnsReverse.run(harness.ctx));

    const [call, ...rest] = recorded.recordedCalls();
    expect(rest).toEqual([]);
    expect(call).toMatchObject({
      transport: "dns",
      method: "PTR",
      url: "dns:9.9.9.9?type=PTR",
      status: 0,
      body: { sha256: sha256('["host.mailhost.test"]') },
    });
  });

  it("network.domain.mail_config: service-label names (_dmarc, _domainkey) are recorded as asked", async () => {
    const recorded = createRecordedRun();
    const harness = createCapRunHarness({
      input: { host: "mailhost.test", entityId: testId(22) },
    });

    await recorded.run(mailConfig.run(harness.ctx));

    const urls = recorded.recordedCalls().map((c) => c.url);
    expect(urls).toContain("dns:mailhost.test?type=MX");
    expect(urls).toContain("dns:_dmarc.mailhost.test?type=TXT");
    expect(urls).toContain("dns:default._domainkey.mailhost.test?type=TXT");
    expect(recorded.recordedCalls().every((c) => c.transport === "dns")).toBe(
      true
    );
  });
});
