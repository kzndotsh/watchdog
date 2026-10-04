import {
  normalizeIdentifierPlatform,
  resolveIdentifierPlatform,
} from "@watchdog/schemas/shared";

import { isJunkEmail, pushClaim, pushId } from "../harvest-helpers";
import * as P from "../harvest-patterns";
import type { HarvestExtractor } from "./types";

const claimsExtractor: HarvestExtractor = {
  id: "claims",
  collect(ctx) {
    for (const m of ctx.cleaned.matchAll(P.NUMBERED_CLAIM_RE)) {
      const claim = (m[1] ?? "").trim();
      if (claim.length < 3) continue;
      pushClaim(ctx.claims, ctx.seen, claim, ctx.sourceText, m[0]);
    }
    for (const { re, kind } of P.CROSSPLATFORM) {
      for (const m of P.matchAllUnlessNegated(ctx.cleaned, re)) {
        const raw = m[0] ?? "";
        if (kind === "email_self") {
          const email = (m[1] ?? "").toLowerCase();
          if (email && !isJunkEmail(email)) {
            pushId(ctx.identifiers, ctx.seen, "email", email, ctx.sourceText, {
              notes: "self_disclosure",
              quoteNeedle: raw,
            });
          }
          pushClaim(ctx.claims, ctx.seen, raw.trim(), ctx.sourceText, raw);
          continue;
        }
        if (kind === "handle_on_platform") {
          const handle = m[1];
          const plat = m[2];
          if (handle && plat) {
            const platform =
              resolveIdentifierPlatform(plat) ??
              normalizeIdentifierPlatform(plat);
            pushId(
              ctx.identifiers,
              ctx.seen,
              "handle",
              `@${handle}`,
              ctx.sourceText,
              {
                platform,
                notes: "self_disclosure",
                quoteNeedle: raw,
              }
            );
          }
        }
        if (kind === "platform_claim") {
          const plat = m[1];
          const handle = m[2];
          if (handle && plat) {
            const platform =
              resolveIdentifierPlatform(plat) ??
              normalizeIdentifierPlatform(plat);
            pushId(
              ctx.identifiers,
              ctx.seen,
              "handle",
              `@${handle}`,
              ctx.sourceText,
              {
                platform,
                notes: "self_disclosure",
                quoteNeedle: raw,
              }
            );
          }
        }
        pushClaim(ctx.claims, ctx.seen, raw.trim(), ctx.sourceText, raw);
      }
    }
    for (const m of P.matchAllUnlessNegated(
      ctx.cleaned,
      P.NAME_DISCLOSURE_RE
    )) {
      const name = (m[1] ?? "").trim();
      if (name.length < 2) continue;
      pushId(ctx.identifiers, ctx.seen, "other", name, ctx.sourceText, {
        notes: "name_disclosure",
        quoteNeedle: m[0],
      });
      pushClaim(
        ctx.claims,
        ctx.seen,
        `Self-disclosed name: ${name}`,
        ctx.sourceText,
        m[0]
      );
    }
  },
};

export { claimsExtractor };
