import { z } from "zod";

import { processExtractDraftSchema } from "@watchdog/ai";

/** Process report body — draft fields plus sha256 for hash playbook handoff. */
export const fileAnalyzeReportSchema = processExtractDraftSchema.extend({
  sha256: z.string().min(1),
});
