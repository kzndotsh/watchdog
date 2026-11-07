import { memoizeImport } from "@/shared/lib/preload-import";

export const loadEvidencePreviewDrawer = memoizeImport(
  async () => import("@/domains/intake/components/evidence-preview-drawer")
);
