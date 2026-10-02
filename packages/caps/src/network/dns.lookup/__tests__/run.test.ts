import { describe, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

import { itRunsCollectCap } from "../../../testing";
import { dnsLookup } from "../cap.ts";

vi.mock("node:dns/promises", () => {
  const stub = {
    cancel() {
      return stub;
    },
    async resolve4() {
      return ["1.2.3.4"];
    },
    async resolve6() {
      return [] as string[];
    },
    async resolveMx() {
      return [] as { exchange: string; priority: number }[];
    },
    async resolveTxt() {
      return [] as string[][];
    },
    async resolveNs() {
      return [] as string[];
    },
  };
  return {
    Resolver: function Resolver() {
      return stub;
    },
  };
});

describe("network.dns.lookup run", () => {
  itRunsCollectCap({
    cap: dnsLookup,
    input: { host: "mailhost.test", entityId: testId(20) },
    reportContains: "1.2.3.4",
    abort: true,
  });
});
