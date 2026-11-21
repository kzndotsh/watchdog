import { EntityIdentifierTypeValues } from "@/domains/entities/components/entity-identifier-type-values";
import { IdentifierTypeGroups } from "@/domains/entities/components/identifier-type-groups";
import { identifierList } from "@watchdog/domain/schemas/graph";
import { opsOf } from "@watchdog/domain/schemas/shared";

type EntityIdentifiersPreviewProps = {
  readonly caseId: string;
  readonly entityId: string;
};

/** An expanded Entities table row: the Entity's Identifiers grouped by type, read only. */
export function EntityIdentifiersPreview({
  caseId,
  entityId,
}: EntityIdentifiersPreviewProps) {
  const query = opsOf(identifierList).queryOf({}, { entityId });
  return (
    <div className="py-1">
      <IdentifierTypeGroups
        caseId={caseId}
        query={query}
        renderGroup={(type) => (
          <EntityIdentifierTypeValues
            caseId={caseId}
            entityId={entityId}
            type={type}
          />
        )}
      />
    </div>
  );
}
