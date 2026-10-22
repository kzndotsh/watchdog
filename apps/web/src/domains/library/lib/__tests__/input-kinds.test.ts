import { describe, expect, it } from "vitest";

import {
  buildInputKindIndex,
  capInputKind,
  capInputKinds,
  inputKindLabel,
  inputKindOptions,
  playbookInputKinds,
} from "@/domains/library/lib/input-kinds";

describe("input kinds", () => {
  it("names a Cap's consumed kinds the way an investigator would", () => {
    expect(capInputKind({ kind: "identifier", type: "handle" })).toBe(
      "username"
    );
    expect(capInputKind({ kind: "identifier", type: "email" })).toBe("email");
    expect(capInputKind({ kind: "host" })).toBe("domain");
    expect(capInputKind({ kind: "ip" })).toBe("ip");
    expect(capInputKind({ kind: "hash" })).toBe("hash");
    expect(capInputKind({ kind: "evidence", evidenceKind: "file" })).toBe(
      "file"
    );
  });

  it("merges a host and a domain identifier into one kind, once per Cap", () => {
    expect(
      capInputKinds([
        { kind: "host" },
        { kind: "identifier", type: "domain" },
        { kind: "identifier", type: "handle" },
      ])
    ).toEqual(["domain", "username"]);
    expect(capInputKinds(undefined)).toEqual([]);
  });

  it("maps Playbook seed kinds into the same vocabulary", () => {
    expect(
      playbookInputKinds(["host", "handle", "evidence", "email", "ip"])
    ).toEqual(["domain", "username", "file", "email", "ip"]);
  });

  it("indexes entry keys by input kind, so a kind lists exactly what takes it", () => {
    const index = buildInputKindIndex([
      { key: "cap:a", inputKinds: ["email"] },
      { key: "cap:b", inputKinds: ["domain", "ip"] },
      { key: "playbook:c", inputKinds: ["email", "domain"] },
    ]);
    expect([...(index.get("email") ?? [])]).toEqual(["cap:a", "playbook:c"]);
    expect([...(index.get("domain") ?? [])]).toEqual(["cap:b", "playbook:c"]);
    expect([...(index.get("ip") ?? [])]).toEqual(["cap:b"]);
    expect(index.has("phone")).toBe(false);
  });

  it("orders the options with the common kinds first and counts each", () => {
    const index = buildInputKindIndex([
      { key: "cap:a", inputKinds: ["zebra", "ip", "email"] },
      { key: "cap:b", inputKinds: ["ip", "aardvark"] },
    ]);
    expect(inputKindOptions(index)).toEqual([
      { value: "email", label: "Email address", count: 1 },
      { value: "ip", label: "IP address", count: 2 },
      { value: "aardvark", label: "Aardvark", count: 1 },
      { value: "zebra", label: "Zebra", count: 1 },
    ]);
  });

  it("labels an unknown kind from its key", () => {
    expect(inputKindLabel("mac_address")).toBe("Mac address");
  });

  it("spells URL archive with URL in capitals", () => {
    expect(inputKindLabel("url_archive")).toBe("URL archive");
  });

  it("calls an identifier with no narrower type an Identifier", () => {
    expect(inputKindLabel("other")).toBe("Identifier");
  });
});
