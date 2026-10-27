import { z } from "zod";

/*
 * Zod probes `new Function` once to choose its compiled parser. The CSP has no
 * 'unsafe-eval', so the browser reports that probe as a violation (and posts it to
 * /api/csp-report) even though Zod catches the refusal. `jitless` skips the probe.
 * Imported first in `router.tsx` so it runs before any module parses a schema.
 */
if (typeof window !== "undefined") {
  z.config({ jitless: true });
}
