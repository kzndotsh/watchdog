import { memoizeImport } from "@/shared/lib/preload-import";

/** The Evidence picker's checklist chunk: one request shared by `React.lazy` and the trigger's hover warm. */
export const loadEvidenceChecklist = memoizeImport(
  async () => import("@/shared/ui/intake/evidence-checklist")
);
