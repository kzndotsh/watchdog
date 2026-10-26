/** Overview nest = muted line; dedicated tab = EmptyState panel. */
export type DossierEmptyPresentation = "inline" | "panel";

/** Shared props for dossier CRUD list sections — Case + Entity scope. */
export type DossierSectionProps = {
  caseId: string;
  entityId: string;
  /** Entity slug for `invalidateAfterEntityChanged` / detail cache keys. */
  entitySlug: string;
  /**
   * How to render list blank-slates.
   * `inline` for Overview nest; `panel` for dedicated tabs.
   */
  emptyPresentation?: DossierEmptyPresentation;
};

/**
 * Case + Entity a dossier write was started for. Mutation hooks take it in the
 * mutation variables, never in hook props: props follow re-renders (an Active
 * Case switch) and would redirect the invalidation of a pending write.
 */
export type DossierEntityScope = Pick<
  DossierSectionProps,
  "caseId" | "entityId" | "entitySlug"
>;

/**
 * Sections that link Evidence in composers and rows. Each reads what it shows itself (#559): the
 * picker searches the Case's Evidence on the server, and linked titles come from a by-ids read.
 */
export type DossierSectionWithEvidenceProps = DossierSectionProps & {
  onEvidenceClick?: (evidenceId: string) => void;
};
