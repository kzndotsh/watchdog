import {
  normalizeIdentifierPlatform,
  resolveIdentifierPlatform,
} from "@watchdog/schemas/shared";

import { pushId } from "../harvest-helpers";
import * as P from "../harvest-patterns";
import type { HarvestExtractor } from "./types";

const handlesExtractor: HarvestExtractor = {
  id: "handles",
  collect(ctx) {
    for (const m of ctx.cleaned.matchAll(P.HANDLE_PAREN_RE)) {
      const handle = m[1];
      const platRaw = m[2];
      if (!handle || !platRaw) continue;
      const platform =
        resolveIdentifierPlatform(platRaw) ??
        normalizeIdentifierPlatform(platRaw);
      pushId(
        ctx.identifiers,
        ctx.seen,
        "handle",
        `@${handle}`,
        ctx.sourceText,
        {
          platform,
          quoteNeedle: m[0],
        }
      );
    }

    const matrixValues = new Set(
      ctx.identifiers
        .filter((i) => i.platform === "matrix")
        .map((i) => i.value.toLowerCase())
    );
    for (const m of ctx.cleaned.matchAll(P.HANDLE_RE)) {
      const handle = m[2];
      if (!handle) continue;
      const withAt = `@${handle}`;
      const full = m[0] ?? "";
      const afterIdx = (m.index ?? 0) + full.length;
      if (ctx.cleaned[afterIdx] === ":") continue;
      if (ctx.cleaned[afterIdx] === "@") continue;
      if (/^\s*\(/.test(ctx.cleaned.slice(afterIdx))) continue;
      if (matrixValues.has(withAt.toLowerCase())) continue;
      if (
        [...ctx.fediSkip].some((e) => e.startsWith(`${handle.toLowerCase()}@`))
      ) {
        continue;
      }
      if (
        ctx.identifiers.some(
          (i) =>
            i.type === "email" &&
            i.value.toLowerCase().startsWith(`${handle.toLowerCase()}@`)
        )
      ) {
        continue;
      }
      pushId(ctx.identifiers, ctx.seen, "handle", withAt, ctx.sourceText);
    }
    for (const m of ctx.cleaned.matchAll(P.PROFILE_HANDLE_RE)) {
      const handle = m[1];
      if (!handle) continue;
      pushId(
        ctx.identifiers,
        ctx.seen,
        "handle",
        `@${handle}`,
        ctx.sourceText,
        {
          quoteNeedle: m[0],
        }
      );
    }
  },
};

export { handlesExtractor };
