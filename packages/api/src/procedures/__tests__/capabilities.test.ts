import { createRouterClient } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

const { listCapabilities, listPlaybookDescriptors } = vi.hoisted(() => ({
  listCapabilities: vi.fn(),
  listPlaybookDescriptors: vi.fn(),
}));

vi.mock("@watchdog/caps", () => ({
  listCapabilities,
  listPlaybookDescriptors,
}));

import { list, listPlaybooksProc } from "../capabilities";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

describe("capabilities procedures", () => {
  it("lists capabilities and playbooks", async () => {
    listCapabilities.mockResolvedValueOnce([
      {
        id: "network.dns.lookup",
        version: "1",
        title: "DNS Lookup",
        egress: "third_party",
        input: {},
        inputForm: {},
      },
    ]);
    listPlaybookDescriptors.mockResolvedValueOnce([
      {
        id: "seed-dns",
        title: "Seed DNS",
        description: "Lookup host",
        seedKinds: ["host"],
        steps: ["network.dns.lookup"],
        requires: { credentials: [], egress: "third_party", flags: [] },
      },
    ]);

    const client = createRouterClient(
      { list, listPlaybooks: listPlaybooksProc },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(client.list()).resolves.toHaveLength(1);
    await expect(client.listPlaybooks()).resolves.toHaveLength(1);
  });
});
