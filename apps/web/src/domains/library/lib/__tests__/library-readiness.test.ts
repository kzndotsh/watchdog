import { describe, expect, it } from "vitest";

import { buildCapRunView } from "@/domains/jobs/lib/cap-run-view";
import { buildPlaybookSeedView } from "@/domains/jobs/lib/playbook-seed-view";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import {
  KEYS_UNKNOWN_REASON,
  libraryReadiness,
  readinessRank,
  runBlockedReason,
} from "@/domains/library/lib/library-readiness";
import { buildCapListItem, buildPlaybookListItem } from "@/testing/records";

const KEY = "SHODAN_API_KEY";

describe("libraryReadiness", () => {
  it("is ready when nothing is needed", () => {
    expect(libraryReadiness({ credentials: undefined }, new Set())).toEqual({
      state: "ready",
    });
  });

  it("needs a key until the vault slot is configured", () => {
    const entry = { credentials: [{ name: KEY }] };
    expect(libraryReadiness(entry, new Set())).toEqual({
      state: "needs_key",
      slots: [KEY],
    });
    expect(libraryReadiness(entry, new Set([KEY]))).toEqual({
      state: "ready",
    });
  });

  it("accepts any slot of an anyOf spec and ignores optional ones", () => {
    const anyOf = { credentials: [{ anyOf: ["A", "B"] }] };
    expect(libraryReadiness(anyOf, new Set(["B"])).state).toBe("ready");
    expect(libraryReadiness(anyOf, new Set())).toEqual({
      state: "needs_key",
      slots: ["A", "B"],
    });
    expect(
      libraryReadiness(
        { credentials: [{ name: "X", optional: true }] },
        new Set()
      ).state
    ).toBe("ready");
  });

  it("is off by the operator before it asks for a key", () => {
    expect(
      libraryReadiness(
        { disabledReason: "breach_disabled", credentials: [{ name: KEY }] },
        new Set()
      )
    ).toEqual({ state: "off_by_operator" });
  });

  it("is unavailable, with a reason, when the vault could not be read and the entry needs a key", () => {
    expect(libraryReadiness({ credentials: [{ name: KEY }] }, null)).toEqual({
      state: "unavailable",
      reason: KEYS_UNKNOWN_REASON,
    });
    // A keyless entry does not depend on the vault, as in Collect.
    expect(libraryReadiness({ credentials: [] }, null)).toEqual({
      state: "ready",
    });
    expect(
      libraryReadiness(
        { disabledReason: "breach_disabled", credentials: [] },
        null
      ).state
    ).toBe("off_by_operator");
  });

  it("ranks ready before every other state", () => {
    expect(readinessRank({ state: "ready" })).toBe(0);
    expect(readinessRank({ state: "needs_key", slots: [] })).toBeGreaterThan(0);
    expect(readinessRank({ state: "off_by_operator" })).toBeGreaterThan(
      readinessRank({ state: "needs_key", slots: [] })
    );
  });
});

const CAP_CASES: { name: string; cap: CapListItem; configured: string[] }[] = [
  { name: "no key needed", cap: buildCapListItem(), configured: [] },
  {
    name: "key missing",
    cap: buildCapListItem({ credentials: [{ name: KEY }] }),
    configured: [],
  },
  {
    name: "key configured",
    cap: buildCapListItem({ credentials: [{ name: KEY }] }),
    configured: [KEY],
  },
  {
    name: "either key",
    cap: buildCapListItem({ credentials: [{ anyOf: ["A", "B"] }] }),
    configured: ["B"],
  },
  {
    name: "breach Cap, setting off",
    cap: buildCapListItem({ disabledReason: "breach_disabled" }),
    configured: [],
  },
  {
    name: "breach Cap off and key missing",
    cap: buildCapListItem({
      disabledReason: "breach_disabled",
      credentials: [{ name: KEY }],
    }),
    configured: [],
  },
];

const PLAYBOOK_CASES: {
  name: string;
  playbook: PlaybookListItem;
  configured: string[];
}[] = [
  { name: "no key needed", playbook: buildPlaybookListItem(), configured: [] },
  {
    name: "key missing",
    playbook: buildPlaybookListItem({
      requires: {
        credentials: [{ name: KEY }],
        egress: ["local"],
        contacts: [],
        flags: [],
      },
    }),
    configured: [],
  },
  {
    name: "key configured",
    playbook: buildPlaybookListItem({
      requires: {
        credentials: [{ name: KEY }],
        egress: ["local"],
        contacts: [],
        flags: [],
      },
    }),
    configured: [KEY],
  },
  {
    name: "breach step, setting off",
    playbook: buildPlaybookListItem({ disabledReason: "breach_disabled" }),
    configured: [],
  },
];

describe("Library readiness agrees with Collect", () => {
  it.each(CAP_CASES)(
    "Cap, $name: ready exactly when the Cap run form would allow a run",
    ({ cap, configured }) => {
      const set = new Set(configured);
      const collect = buildCapRunView({
        caps: [cap],
        capabilityId: cap.id,
        runInput: "example.com",
        entityId: "",
        // The Case's egress switch is per Case; the Library shows egress as its own mark.
        allowedEgress: [
          "local",
          "target",
          "public_lookup",
          "account_lookup",
          "model",
        ],
        configuredCredentials: set,
      });
      const library = libraryReadiness(
        { disabledReason: cap.disabledReason, credentials: cap.credentials },
        set
      );
      expect(library.state === "ready").toBe(collect.canRun);
      if (library.state === "needs_key") {
        expect(library.slots).toEqual(collect.missingCredentials);
      }
    }
  );

  it.each(PLAYBOOK_CASES)(
    "Playbook, $name: ready exactly when the Playbook run form would allow a run",
    ({ playbook, configured }) => {
      const set = new Set(configured);
      const collect = buildPlaybookSeedView({
        playbooks: [playbook],
        playbookId: playbook.id,
        host: "example.com",
        url: "",
        evidenceId: "",
        ip: "",
        email: "",
        hash: "",
        handle: "",
        urlDumpCount: 0,
        allowedEgress: [
          "local",
          "target",
          "public_lookup",
          "account_lookup",
          "model",
        ],
        configuredCredentials: set,
      });
      const library = libraryReadiness(
        {
          disabledReason: playbook.disabledReason,
          credentials: playbook.requires.credentials,
        },
        set
      );
      expect(library.state === "ready").toBe(collect.canRun);
      if (library.state === "needs_key") {
        expect(library.slots).toEqual(collect.missingCredentials);
      }
    }
  );
});

describe("runBlockedReason", () => {
  it("is null for a ready entry and says why for the others", () => {
    expect(runBlockedReason({ state: "ready" })).toBeNull();
    expect(runBlockedReason({ state: "needs_key", slots: ["A", "B"] })).toBe(
      "Add A or B in Settings first."
    );
    expect(runBlockedReason({ state: "off_by_operator" })).toMatch(/operator/);
    expect(runBlockedReason({ state: "unavailable", reason: "Nope" })).toBe(
      "Nope."
    );
  });
});
