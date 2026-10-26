/**
 * Type test (#550): the generated client's inputs for the declared lists are exact. `pnpm
 * typecheck` compiles this file; each `@ts-expect-error` is the assertion (an unused one is
 * TS2578), so an unknown key, a bad enum value, `false` on a flag or an undeclared sort that
 * starts to compile fails the build. The functions are never invoked.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import type { WatchdogClient } from "../index.ts";

type EvidenceListInput = Parameters<WatchdogClient["evidence"]["list"]>[0];
type IdentifierListInput = Parameters<WatchdogClient["identifiers"]["list"]>[0];

const caseId = "00000000-0000-4000-8000-000000000001";

function evidenceListInputs(client: WatchdogClient) {
  void client.evidence.list({
    caseId,
    hidden: true,
    kind: ["file", "url_archive"],
    entityId: caseId,
    q: "example",
    sort: "label.asc",
    cursor: "c",
    limit: 50,
  });
  // @ts-expect-error -- the legacy flag names are gone
  void client.evidence.list({ caseId, hiddenOnly: true });
  // @ts-expect-error -- not an Evidence kind
  void client.evidence.list({ caseId, kind: ["pdf"] });
  // @ts-expect-error -- a flag is true or absent, never false
  void client.evidence.list({ caseId, hidden: false });
  // @ts-expect-error -- an Identifier sort, not an Evidence one
  void client.evidence.list({ caseId, sort: "value.asc" });
}

function identifierListInputs(client: WatchdogClient) {
  void client.identifiers.list({
    caseId,
    type: ["email"],
    status: ["current"],
    confidence: ["possible"],
    entityId: caseId,
    q: "example",
    sort: "added.desc",
  });
  // @ts-expect-error -- not a filter of the Identifier list
  void client.identifiers.list({ caseId, kind: ["file"] });
  // @ts-expect-error -- not an Identifier type
  void client.identifiers.list({ caseId, type: ["fax"] });
  // @ts-expect-error -- a declared key with an undeclared direction
  void client.identifiers.list({ caseId, sort: "added.sideways" });
  void client.identifiers.getMany({ caseId, ids: [caseId] });
  // @ts-expect-error -- ids are required
  void client.identifiers.getMany({ caseId });
}

describe("declared list inputs in the client", () => {
  it("compiles (the assertions above are type-level)", () => {
    expectTypeOf<EvidenceListInput["sort"]>().toEqualTypeOf<
      "captured.desc" | "captured.asc" | "label.asc" | "label.desc" | undefined
    >();
    expectTypeOf<IdentifierListInput["sort"]>().toEqualTypeOf<
      "value.asc" | "value.desc" | "added.desc" | "added.asc" | undefined
    >();
    expectTypeOf<EvidenceListInput["hidden"]>().toEqualTypeOf<
      true | undefined
    >();
    expect(typeof evidenceListInputs).toBe("function");
    expect(typeof identifierListInputs).toBe("function");
  });
});
