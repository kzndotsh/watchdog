import { describe, it, expect } from "vitest";

import "../../registry.ts";
import {
  checkPlaybookAvailability,
  requirePlaybook,
  hostFromUrl,
  listPlaybooks,
  materializeBoundInput,
  materializeFanOutInputs,
  planPlaybook,
  playbookCapabilityIds,
  predecessorFromJob,
  seedValuesToCandidateInput,
  toPlaybookDescriptor,
} from "../index.ts";

describe("plan", () => {
  it("host-footprint emits only the first DNS step", () => {
    const plan = planPlaybook(requirePlaybook("host-footprint"), {
      host: "example.com",
    });
    expect(!("kind" in plan)).toBeTruthy();
    if ("kind" in plan) return;
    expect(plan.step.playbookStep).toBe(0);
    expect(plan.step.capabilityId).toBe("network.dns.lookup");
    expect(plan.step.input.host).toBe("example.com");
  });

  it("host-footprint rejects missing host seed", () => {
    const plan = planPlaybook(requirePlaybook("host-footprint"), {});
    expect(plan).toEqual({ kind: "missing_seed", seed: "host" });
  });

  it("host-posture plans invasive TLS then HTTP probe", () => {
    const plan = planPlaybook(requirePlaybook("host-posture"), {
      host: "example.com",
    });
    expect(!("kind" in plan)).toBeTruthy();
    if ("kind" in plan) return;
    expect(plan.step.capabilityId).toBe("network.host.tls_audit");
    expect(plan.step.playbookStep).toBe(0);
    expect(plan.step.input.host).toBe("example.com");
  });

  it("url-capture requires url + evidence; harvest blocked on enrich", () => {
    const missing = planPlaybook(requirePlaybook("url-capture"), {
      url: "https://example.com",
    });
    expect(missing).toEqual({ kind: "missing_seed", seed: "evidence" });

    const plan = planPlaybook(requirePlaybook("url-capture"), {
      url: "https://example.com",
      evidenceId: "00000000-0000-4000-8000-000000000001",
    });
    expect(!("kind" in plan)).toBeTruthy();
    if ("kind" in plan) return;
    expect(plan.step.capabilityId).toBe("network.url.enrich");
    expect(plan.step.input.sourceEvidenceId).toBe(
      "00000000-0000-4000-8000-000000000001"
    );
  });

  it("url-capture-ai descriptor requires third_party egress", () => {
    const desc = toPlaybookDescriptor(requirePlaybook("url-capture-ai"));
    expect(desc.requires.egress).toBe("third_party");
    expect(desc.requires.flags.includes("needs_key")).toBeTruthy();

    const blocked = checkPlaybookAvailability(desc.requires, {
      hasCredential: () => true,
      allowThirdPartyEgress: false,
      thirdPartyCapabilityId: "evidence.extract.ai",
    });
    expect(blocked).toEqual({
      ok: false,
      kind: "egress_blocked",
      capabilityId: "evidence.extract.ai",
    });

    const missingKey = checkPlaybookAvailability(desc.requires, {
      hasCredential: () => false,
      allowThirdPartyEgress: true,
    });
    expect(missingKey.ok).toBe(false);
    if (!missingKey.ok) {
      expect(missingKey.kind).toBe("missing_credential");
    }
  });

  it("no evidence:file soft-link — enrich alone does not satisfy harvest without seed evidence", () => {
    const plan = planPlaybook(
      {
        id: "url-only",
        title: "t",
        description: "d",
        seedKinds: ["url"],
        steps: ["network.url.enrich", "evidence.harvest"],
      },
      { url: "https://example.com" }
    );
    expect("kind" in plan && plan.kind).toBe("invalid_input");
  });

  it("rejects a later step with invalid input at plan time", () => {
    const plan = planPlaybook(
      {
        id: "host-bad-later",
        title: "t",
        description: "d",
        seedKinds: ["host"],
        steps: [
          "network.dns.lookup",
          { capabilityId: "network.whois.lookup", input: { host: 1 } },
        ],
      },
      { host: "example.com" }
    );
    expect("kind" in plan && plan.kind).toBe("invalid_input");
  });

  it("query alias: email-corpus / handle-presence / ip-exposure plan from typed seed only", () => {
    const corpus = planPlaybook(requirePlaybook("email-corpus"), {
      email: "a@example.com",
    });
    expect(!("kind" in corpus)).toBeTruthy();
    if ("kind" in corpus) return;
    expect(corpus.step.input.query).toBe("a@example.com");

    const handle = planPlaybook(requirePlaybook("handle-presence"), {
      handle: "octocat",
    });
    expect(!("kind" in handle)).toBeTruthy();
    if ("kind" in handle) return;
    expect(handle.step.input.handle).toBe("octocat");

    const exposure = planPlaybook(requirePlaybook("ip-exposure"), {
      ip: "1.2.3.4",
    });
    expect(!("kind" in exposure)).toBeTruthy();
    if ("kind" in exposure) return;
    expect(exposure.step.capabilityId).toBe("network.shodan.lookup");
    expect(exposure.step.input.ip ?? exposure.step.input.query).toBe("1.2.3.4");
  });

  it("url-history plans with only url and derives host; pins wayback limit", () => {
    const plan = planPlaybook(requirePlaybook("url-history"), {
      url: "https://www.Example.com/path",
    });
    expect(!("kind" in plan)).toBeTruthy();
    if ("kind" in plan) return;
    expect(plan.step.capabilityId).toBe("archive.wayback.lookup");
    expect(plan.step.input.url).toBe("https://www.Example.com/path");
    expect(plan.step.input.limit).toBe(25);
  });

  it("new seed kinds plan happy path and missing seed", () => {
    const kinds = [
      ["ip-context", "ip", "8.8.8.8"],
      ["email-identity", "email", "a@example.com"],
      ["hash-malware", "hash", "ab".repeat(32)],
      ["handle-presence", "handle", "octocat"],
    ] as const;
    for (const [id, field, value] of kinds) {
      const ok = planPlaybook(requirePlaybook(id), { [field]: value });
      expect(!("kind" in ok), id).toBeTruthy();
      const missing = planPlaybook(requirePlaybook(id), {});
      expect(missing).toEqual({ kind: "missing_seed", seed: field });
    }
  });

  it("ip-exposure greys without vault; url-capture-ai still egress-blocked", () => {
    const exposure = toPlaybookDescriptor(requirePlaybook("ip-exposure"));
    const grey = checkPlaybookAvailability(exposure.requires, {
      hasCredential: () => false,
      allowThirdPartyEgress: true,
    });
    expect(grey.ok).toBe(false);
    if (!grey.ok) expect(grey.kind).toBe("missing_credential");

    const ai = toPlaybookDescriptor(requirePlaybook("url-capture-ai"));
    const blocked = checkPlaybookAvailability(ai.requires, {
      hasCredential: () => true,
      allowThirdPartyEgress: false,
      thirdPartyCapabilityId: "evidence.extract.ai",
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.kind).toBe("egress_blocked");
    }
  });

  it("hostFromUrl and query alias helpers", () => {
    expect(hostFromUrl("https://Example.COM/x")).toBe("example.com");
    const candidate = seedValuesToCandidateInput({
      email: "a@example.com",
      url: "https://example.com/p",
    });
    expect(candidate.query).toBe("a@example.com");
    expect(candidate.host).toBe("example.com");
  });

  it("host-contacts defers harvest input; bind uses predecessor evidenceId", () => {
    const plan = planPlaybook(requirePlaybook("host-contacts"), {
      host: "example.com",
    });
    expect(!("kind" in plan)).toBeTruthy();
    if ("kind" in plan) return;
    expect(plan.step.capabilityId).toBe("network.whois.lookup");
    expect(plan.step.input).toMatchObject({ host: "example.com" });

    const bound = materializeBoundInput(
      {
        capabilityId: "evidence.harvest",
        bind: { evidenceId: { step: 0, bag: "evidenceId" } },
      },
      {
        host: "example.com",
        evidenceId: "00000000-0000-4000-8000-00000000eee1",
      },
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: ["00000000-0000-4000-8000-00000000aaa1"],
          handoff: {},
        }),
      ]
    );
    expect(!("kind" in bound)).toBeTruthy();
    if ("kind" in bound) return;
    expect(bound.evidenceId).toBe("00000000-0000-4000-8000-00000000aaa1");
  });

  it("predecessorFromJob normalizes padded evidenceIds", () => {
    const pred = predecessorFromJob({
      playbookStep: 0,
      evidenceIds: ["  00000000-0000-4000-8000-00000000aaa1  ", "  "],
      handoff: {},
    });
    expect(pred.bags.evidenceId).toEqual([
      "00000000-0000-4000-8000-00000000aaa1",
    ]);
  });

  it("predecessorFromJob drops evidence bag when stored ids are invalid", () => {
    const pred = predecessorFromJob({
      playbookStep: 0,
      evidenceIds: ["00000000-0000-4000-8000-00000000aaa1", "not-a-uuid"],
      handoff: {},
    });
    expect(pred.bags.evidenceId).toEqual([]);
  });

  it("host-enumerate fans out DNS inputs capped at 25", () => {
    const plan = planPlaybook(requirePlaybook("host-enumerate"), {
      host: "example.com",
    });
    expect(!("kind" in plan)).toBeTruthy();
    if ("kind" in plan) return;
    expect(plan.step.capabilityId).toBe("network.ct.lookup");

    const three = materializeFanOutInputs(
      {
        capabilityId: "network.dns.lookup",
        fanOut: { from: { step: 0, bag: "host" }, to: "host", max: 25 },
      },
      { host: "example.com" },
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [],
          handoff: {
            host: ["a.example.com", "b.example.com", "A.example.com"],
          },
        }),
      ]
    );
    expect(Array.isArray(three)).toBeTruthy();
    if (!Array.isArray(three)) return;
    expect(three).toHaveLength(2);

    const hosts = Array.from({ length: 40 }, (_, i) => `h${i}.example.com`);
    const capped = materializeFanOutInputs(
      {
        capabilityId: "network.dns.lookup",
        fanOut: { from: { step: 0, bag: "host" }, to: "host", max: 25 },
      },
      { host: "example.com" },
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [],
          handoff: { host: hosts },
        }),
      ]
    );
    expect(Array.isArray(capped)).toBeTruthy();
    if (!Array.isArray(capped)) return;
    expect(capped).toHaveLength(25);

    const overMax = materializeFanOutInputs(
      {
        capabilityId: "network.dns.lookup",
        fanOut: { from: { step: 0, bag: "host" }, to: "host", max: 1000 },
      },
      { host: "example.com" },
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [],
          handoff: { host: hosts },
        }),
      ]
    );
    expect(Array.isArray(overMax)).toBeTruthy();
    if (!Array.isArray(overMax)) return;
    expect(overMax).toHaveLength(25);

    const empty = materializeFanOutInputs(
      {
        capabilityId: "network.dns.lookup",
        fanOut: { from: { step: 0, bag: "host" }, to: "host", max: 25 },
      },
      { host: "example.com" },
      [
        predecessorFromJob({
          playbookStep: 0,
          evidenceIds: [],
          handoff: { host: [] },
        }),
      ]
    );
    expect(empty).toEqual([]);
  });
});

describe("authoring gates", () => {
  const forbiddenAct = new Set([
    "archive.url.submit",
    "network.urlscan.submit",
  ]);

  it("no 1-step playbook", () => {
    for (const pb of listPlaybooks()) {
      expect(playbookCapabilityIds(pb).length, pb.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("never harvest + extract.ai in one recipe; no act Caps; no CDX fetch", () => {
    for (const pb of listPlaybooks()) {
      const ids = playbookCapabilityIds(pb);
      expect(
        !(
          ids.includes("evidence.harvest") &&
          ids.includes("evidence.extract.ai")
        ),
        pb.id
      ).toBeTruthy();
      for (const id of ids) {
        expect(forbiddenAct.has(id), `${pb.id} ${id}`).toBe(false);
        expect(id.includes("wayback.fetch") || id.includes("cdx"), pb.id).toBe(
          false
        );
      }
    }
  });

  it("public identity/hash/url books do not require keys; plus siblings do", () => {
    const email = toPlaybookDescriptor(requirePlaybook("email-identity"));
    expect(email.requires.credentials).toEqual([]);
    const emailPlus = toPlaybookDescriptor(
      requirePlaybook("email-identity-plus")
    );
    expect(
      emailPlus.requires.credentials.some((c) =>
        "name" in c ? c.name === "EMAILREP_API_KEY" : false
      )
    ).toBe(true);

    const hash = toPlaybookDescriptor(requirePlaybook("hash-malware"));
    expect(hash.requires.credentials).toEqual([]);
    const hashPlus = toPlaybookDescriptor(requirePlaybook("hash-malware-plus"));
    expect(hashPlus.requires.credentials.length).toBeGreaterThan(0);

    const url = toPlaybookDescriptor(requirePlaybook("url-reputation"));
    expect(url.requires.credentials).toEqual([]);
    const urlPlus = toPlaybookDescriptor(
      requirePlaybook("url-reputation-plus")
    );
    expect(urlPlus.requires.credentials.length).toBeGreaterThan(0);
  });
});
