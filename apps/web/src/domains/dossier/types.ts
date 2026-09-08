import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";

export type { EvidenceOption };

/** Overview nest = muted line; dedicated tab = EmptyState panel. */
export type DossierEmptyPresentation = "inline" | "panel";

/** Shared props for dossier CRUD list sections — Case + Entity scope. */
export interface DossierSectionProps {
  caseId: string;
  entityId: string;
  /** Entity slug for `invalidateAfterEntityChanged` / detail cache keys. */
  entitySlug: string;
  /**
   * How to render list blank-slates.
   * `inline` for Overview nest; `panel` for dedicated tabs.
   */
  emptyPresentation?: DossierEmptyPresentation;
}

/** Sections that link Evidence chips in composers / rows. */
export type DossierSectionWithEvidenceProps = DossierSectionProps & {
  evidenceOptions: readonly EvidenceOption[];
  /** Resolve linked evidence ids to labels (includes hidden rows). */
  evidenceTitleById?: ReadonlyMap<string, string>;
  onEvidenceClick?: (evidenceId: string) => void;
};
