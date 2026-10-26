import { memoizeImport } from "@/shared/lib/preload-import";

export const loadEvidencePreviewDrawer = memoizeImport(
  async () => import("@/domains/dossier/components/evidence-preview-drawer")
);
