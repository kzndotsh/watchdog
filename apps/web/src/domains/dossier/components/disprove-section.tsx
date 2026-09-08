import { useMemo } from "react";

import { DossierSection } from "@/domains/dossier/components/dossier-section";
import { DossierSectionQueryGate } from "@/domains/dossier/components/dossier-section-query-gate";
import { useDossierSectionQuery } from "@/domains/dossier/hooks/use-dossier-section-query";
import type { DossierSectionProps } from "@/domains/dossier/types";
import { claimsListQuery } from "@/domains/entities/claims/queries";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { ClaimClassBadge, StatusBadge } from "@/shared/ui/vocab";
import type { RetractKind } from "@watchdog/schemas";

export function DisproveSection({
  caseId,
  entityId,
}: Pick<DossierSectionProps, "caseId" | "entityId">) {
  const {
    data: claimsRaw,
    placeholder,
    pending,
    loadError,
    retry,
  } = useDossierSectionQuery(claimsListQuery(caseId, entityId));
  const rows = useMemo(
    () =>
      claimsRaw
        .filter((r) => r.retracted)
        .sort((a, b) => {
          const aTime = a.retractedAt ? Date.parse(a.retractedAt) : 0;
          const bTime = b.retractedAt ? Date.parse(b.retractedAt) : 0;
          return bTime - aTime;
        }),
    [claimsRaw]
  );

  return (
    <DossierSectionQueryGate
      loadError={loadError}
      pending={pending}
      onRetry={retry}
    >
      {rows.length === 0 ? null : (
        <DossierSection
          title="Disproved / Retracted"
          empty={false}
          className={placeholderDeemphasisClass(placeholder)}
        >
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
                        <span className="text-label-mono-sm text-muted-foreground">
                          {new Date(row.retractedAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </DossierSection>
      )}
    </DossierSectionQueryGate>
  );
}
