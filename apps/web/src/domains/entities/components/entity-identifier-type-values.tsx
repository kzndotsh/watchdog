import { identifierListView } from "@/domains/entities/identifiers/queries";
import { useList } from "@/shared/hooks/list/use-list";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { ListFooter } from "@/shared/ui/list/list-footer";
import { LoadingRegion, TableBodySkeletonLayout } from "@/shared/ui/skeletons";
import {
  IDENTIFIER_STATUS_LABELS,
  type IdentifierType,
} from "@watchdog/schemas/shared";

const NO_SEARCH = {};

function ignoreSearchChange() {
  // The preview has no toolbar: its view never changes.
}

type EntityIdentifierTypeValuesProps = {
  readonly caseId: string;
  readonly entityId: string;
  readonly type: IdentifierType;
};

/**
 * One type's Identifiers under an expanded Entities table row: the values, a page at a time, read
 * only (editing is the Dossier's). A former Identifier says so beside its value.
 */
export function EntityIdentifierTypeValues({
  caseId,
  entityId,
  type,
}: EntityIdentifierTypeValuesProps) {
  const list = useList(identifierListView, {
    scope: { caseId },
    fixed: { entityId, type: [type] },
    search: NO_SEARCH,
    onSearchChange: ignoreSearchChange,
  });
  if (list.status === "error") {
    return (
      <FetchErrorAlert
        error={list.error}
        onRetry={() => {
          list.retry();
        }}
      />
    );
  }
  if (list.status === "pending") {
    return (
      <LoadingRegion label="Loading identifiers">
        <TableBodySkeletonLayout rows={2} columns={1} />
      </LoadingRegion>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {/* A failed Load more keeps the loaded values and says so above them. */}
      <FetchErrorAlert
        error={list.error}
        onRetry={() => {
          list.retry();
        }}
      />
      <ul className="flex flex-col gap-0.5">
        {list.rows.map((row) => (
          <li key={row.id} className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate font-mono text-xs">
              {row.platform === ""
                ? row.value
                : `${row.platform}: ${row.value}`}
            </span>
            {row.status === "former" ? (
              <span className="text-muted-foreground text-2xs">
                {IDENTIFIER_STATUS_LABELS[row.status]}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <ListFooter
        status={list.status}
        count={list.count}
        more={list.more}
        noun={list.def.noun}
      />
    </div>
  );
}
