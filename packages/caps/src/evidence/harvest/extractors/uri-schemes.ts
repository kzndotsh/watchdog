import { isJunkEmail, pushId, validBtc } from "../harvest-helpers";
import * as P from "../harvest-patterns";
import type { HarvestExtractor } from "./types";

const uriSchemesExtractor: HarvestExtractor = {
  id: "uri_schemes",
  collect(ctx) {
    for (const m of ctx.cleaned.matchAll(P.URI_SCHEMES_RE)) {
      const raw = (m[0] ?? "").replace(/[.,;:!?)]+$/, "");
      const scheme = raw.split(":")[0]?.toLowerCase() ?? "";
      if (scheme === "mailto") {
        const email = raw.slice("mailto:".length).split("?")[0]?.toLowerCase();
        if (email && !isJunkEmail(email)) {
          pushId(ctx.identifiers, ctx.seen, "email", email, ctx.sourceText, {
            quoteNeedle: raw,
          });
        }
      } else if (scheme === "bitcoin" || scheme === "bitcoincash") {
        const addr = raw.slice(raw.indexOf(":") + 1).split("?")[0] ?? "";
        if (addr === "" || !validBtc(addr)) continue;
        pushId(ctx.identifiers, ctx.seen, "crypto", addr, ctx.sourceText, {
          platform: "bitcoin",
          notes: scheme,
          quoteNeedle: raw,
        });
      } else if (scheme === "ethereum") {
        const addr = raw.slice(raw.indexOf(":") + 1).split("?")[0] ?? "";
        if (addr === "") continue;
        pushId(
          ctx.identifiers,
          ctx.seen,
          "crypto",
          addr.toLowerCase(),
          ctx.sourceText,
          {
            platform: "ethereum",
            quoteNeedle: raw,
          }
        );
      } else if (scheme === "monero") {
        const addr = raw.slice(raw.indexOf(":") + 1).split("?")[0] ?? "";
        if (addr === "") continue;
        pushId(ctx.identifiers, ctx.seen, "crypto", addr, ctx.sourceText, {
          platform: "monero",
          quoteNeedle: raw,
        });
      } else if (scheme === "tel") {
        pushId(
          ctx.identifiers,
          ctx.seen,
          "phone",
          raw.slice(4),
          ctx.sourceText,
          {
            quoteNeedle: raw,
          }
        );
      } else {
        pushId(ctx.identifiers, ctx.seen, "url", raw, ctx.sourceText, {
          notes: `uri_${scheme}`,
        });
      }
    }
  },
};

/** Telegram / Bluesky / Session / Discord / Steam / SimpleX. */

export { uriSchemesExtractor };
