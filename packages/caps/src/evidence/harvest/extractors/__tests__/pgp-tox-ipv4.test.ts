import { describe, expect, it } from "vitest";

import {
  pgpExtractor,
  publicIpv4Extractor,
  toxExtractor,
} from "../pgp-tox-ipv4";
import type { HarvestCtx } from "../types";

function makeCtx(text: string): HarvestCtx {
  return {
    sourceText: text,
    cleaned: text,
    quotedAuthor: null,
    identifiers: [],
    claims: [],
    questions: [],
    seen: new Set(),
    fediSkip: new Set(),
  };
}

describe("pgp-tox-ipv4 extractors", () => {
  it("collects PGP fingerprint, Tox id, and public IPv4", () => {
    const pgp =
      "ABCD 1234 ABCD 1234 ABCD 1234 ABCD 1234 ABCD 1234 ABCD 1234 ABCD 1234 ABCD 1234 ABCD 1234 ABCD 1234 ABCD 1234";
    const tox = "A".repeat(76);
    const ctx = makeCtx(`PGP ${pgp} tox ${tox} host 8.8.8.8`);

    pgpExtractor.collect(ctx);
    toxExtractor.collect(ctx);
    publicIpv4Extractor.collect(ctx);

    expect(
      ctx.identifiers.some(
        (i) =>
          i.type === "pgp" &&
          i.notes === "pgp_fingerprint" &&
          i.value.includes("ABCD")
      )
    ).toBe(true);
    expect(ctx.identifiers.some((i) => i.notes === "tox")).toBe(true);
    expect(
      ctx.identifiers.some((i) => i.type === "ip" && i.value === "8.8.8.8")
    ).toBe(true);
  });
});
