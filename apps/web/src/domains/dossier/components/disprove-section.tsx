import { DossierSection } from "@/domains/dossier/components/dossier-section";
import type { DossierSectionProps } from "@/domains/dossier/types";
import { claimListView } from "@/domains/entities/claims/queries";
import { useList } from "@/shared/hooks/list/use-list";
import { ListBody } from "@/shared/ui/list";
import { ClaimClassBadge, StatusBadge } from "@/shared/ui/vocab";
import type { claimList } from "@watchdog/schemas/graph";
import type { RetractKind, UnfixedSearch } from "@watchdog/schemas/shared";

/** Most recently added first: the latest retraction reads at the top. */
const NEWEST_FIRST: UnfixedSearch<typeof claimList, "entityId" | "retracted"> =
  { sort: "created.desc" };
/** The section has no toolbar: nothing ever changes its view. */
const keepView = (): void => undefined;

/**
 * An Entity's retracted, contested and disproved Claims: the Claim list's `retracted` view with
 * `entityId` fixed, most recently added first (a page at a time, with Load more). Hidden while there are none.
 */
export function DisproveSection({
  caseId,
  entityId,
}: Pick<DossierSectionProps, "caseId" | "entityId">) {
  const list = useList(claimListView, {
    scope: { caseId },
    fixed: { entityId, retracted: true },
    search: NEWEST_FIRST,
    onSearchChange: keepView,
  });
  if (list.status === "blank" || list.status === "pending") return null;

  return (
    <DossierSection title="Disproved / Retracted" isEmpty={false}>
      <ListBody list={list} skeleton={null}>
        {(rows) => (
          <ol className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const retractKind: RetractKind = row.retractKind ?? "retracted";
              return (
                <li
                  key={row.id}
                  className="flex items-start gap-2 text-sm opacity-60"
                >
                  <span className="text-muted-foreground w-4 shrink-0 pt-0.5 text-xs tabular-nums">
                    {i + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug line-through">{row.text}</p>
                    {row.retractedReason !== null &&
                    row.retractedReason !== "" ? (
                      <p className="border-destructive/30 text-muted-foreground mt-1 border-l-2 pl-2.5 text-xs">
                        {row.retractedReason}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <ClaimClassBadge claimClass={row.class} />
                      <StatusBadge status={retractKind} />
                      {row.retractedAt !== null && row.retractedAt !== "" ? (
                        <span className="text-2xs text-muted-foreground font-mono">
                          {new Date(row.retractedAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </ListBody>
    </DossierSection>
  );
}
