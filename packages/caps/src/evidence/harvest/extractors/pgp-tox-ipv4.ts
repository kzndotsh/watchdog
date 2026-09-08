import { isPublicIpv4, pushId } from "../harvest-helpers";
import * as P from "../harvest-patterns";
import type { HarvestExtractor } from "./types";

const pgpExtractor: HarvestExtractor = {
  id: "pgp",
  collect(ctx) {
    for (const m of ctx.cleaned.matchAll(P.PGP_RE)) {
      const raw = m[0] ?? "";
      const norm = raw.replaceAll(/[\s:]/g, "").toUpperCase();
      if (norm.length !== 40 || !/[A-F]/.test(norm)) continue;
      pushId(ctx.identifiers, ctx.seen, "pgp", norm, ctx.sourceText, {
        notes: "pgp_fingerprint",
        quoteNeedle: raw,
      });
    }
  },
};

const toxExtractor: HarvestExtractor = {
  id: "tox",
  collect(ctx) {
    for (const m of ctx.cleaned.matchAll(P.TOX_RE)) {
      pushId(ctx.identifiers, ctx.seen, "other", m[0] ?? "", ctx.sourceText, {
        notes: "tox",
      });
    }
  },
};

const publicIpv4Extractor: HarvestExtractor = {
  id: "public_ipv4",
  collect(ctx) {
    for (const m of ctx.cleaned.matchAll(P.IPV4_RE)) {
      const ip = m[0] ?? "";
      if (!isPublicIpv4(ip)) continue;
      pushId(ctx.identifiers, ctx.seen, "ip", ip, ctx.sourceText);
    }
  },
};

export { pgpExtractor, publicIpv4Extractor, toxExtractor };
