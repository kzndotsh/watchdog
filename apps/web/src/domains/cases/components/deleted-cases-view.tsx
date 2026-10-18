import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { PurgeCaseDialog } from "@/domains/cases/components/purge-case-dialog";
import { useRestoreCase } from "@/domains/cases/hooks/use-restore-case";
import {
  deletedByLabel,
  restoreWindowLabel,
} from "@/domains/cases/lib/deleted-case-copy";
import {
  deletedCasesQuery,
  deletionPolicyQuery,
} from "@/domains/cases/queries";
import type { DeletedCaseRecord } from "@/domains/cases/types";
import { couldnt } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";
import { queryLoadError } from "@/shared/lib/query-load-error";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/with-tooltip";

const EMPTY_ITEMS: DeletedCaseRecord[] = [];

type DeletedCaseRowProps = {
  deleted: DeletedCaseRecord;
  isRestoring: boolean;
  onRestore: (deleted: DeletedCaseRecord) => void;
  onPurge: (deleted: DeletedCaseRecord) => void;
};

function DeletedCaseRow({
  deleted,
  isRestoring,
  onRestore,
  onPurge,
}: DeletedCaseRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm">{deleted.name}</p>
        <p className="text-muted-foreground text-xs">
          Deleted <LocalDateTime value={deleted.deletedAt} /> by{" "}
          {deletedByLabel(deleted)} · {restoreWindowLabel(deleted)}
        </p>
        {deleted.purgeError === null ? null : (
          <p className="text-destructive text-xs" role="status">
            The last purge attempt failed. It is retried automatically, or purge
            it again now.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <WithTooltip
          content={
            deleted.purging
              ? "A purge has begun, so this Case can no longer be restored."
              : null
          }
          shouldWrapSpan
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={isRestoring}
            disabled={deleted.purging}
            onClick={() => {
              onRestore(deleted);
            }}
          >
            Restore
          </Button>
        </WithTooltip>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => {
            onPurge(deleted);
          }}
        >
          Purge now
        </Button>
      </div>
    </li>
  );
}

/**
 * Deleted Cases (owners and admins): who deleted each Case, when, and how long it can still be
 * restored, with Restore and Purge now (typed confirmation). Region states: pending, error with
 * retry, and an empty state that restates the restore window.
 */
export function DeletedCasesView() {
  const query = useInfiniteQuery(deletedCasesQuery());
  const { data: policy } = useQuery(deletionPolicyQuery());
  const restore = useRestoreCase();
  const [purgeTarget, setPurgeTarget] = useState<DeletedCaseRecord | null>(
    null
  );

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? EMPTY_ITEMS,
    [query.data]
  );
  const isPending = listPending(query);
  const loadError = queryLoadError(
    query,
    isPending,
    couldnt("load", "deleted Cases")
  );
  const windowDays = policy?.restoreWindowDays;

  if (isPending) return <InlineLoading label="Loading deleted Cases…" />;

  if (loadError !== null) {
    return (
      <FetchErrorAlert
        error={loadError}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        intent="blank-slate"
        items="Deleted Cases"
        title="No Deleted Cases"
        description={
          windowDays === undefined
            ? "A Case you delete waits here until it is purged."
            : `A Case you delete waits here for ${windowDays} ${windowDays === 1 ? "day" : "days"} before it is purged.`
        }
        size="sm"
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-muted-foreground text-xs">
        {windowDays === undefined
          ? "A deleted Case can be restored until it is purged."
          : `A deleted Case can be restored for ${windowDays} ${windowDays === 1 ? "day" : "days"}. After that it is purged: its entities, evidence and files are erased and only a short deletion record stays.`}
      </p>
      <ul className="divide-y">
        {items.map((deleted) => (
          <DeletedCaseRow
            key={deleted.id}
            deleted={deleted}
            isRestoring={
              restore.isPending && restore.variables?.id === deleted.id
            }
            onRestore={(row) => {
              restore.mutate(row);
            }}
            onPurge={setPurgeTarget}
          />
        ))}
      </ul>
      {query.hasNextPage ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          Show more
        </Button>
      ) : null}
      <PurgeCaseDialog
        target={purgeTarget}
        open={purgeTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPurgeTarget(null);
        }}
      />
    </div>
  );
}
