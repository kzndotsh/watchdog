import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";

import { useRestoreCase } from "@/domains/cases/hooks/use-restore-case";
import {
  daysLabel,
  deletedByLabel,
  restoreBlockedReason,
  restoreWindowLabel,
} from "@/domains/cases/lib/deleted-case-copy";
import {
  deletedCaseListView,
  deletionPolicyQuery,
} from "@/domains/cases/queries";
import type { DeletedCaseRecord } from "@/domains/cases/types";
import { cn } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { ListBody, ListCount, ListToolbar } from "@/shared/ui/list";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { Button } from "@/shared/ui/primitives/button";
import { QueueSkeleton } from "@/shared/ui/skeletons";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import type { deletedCaseList } from "@watchdog/schemas/cases";
import type { ListSearch, ListSearchPatch } from "@watchdog/schemas/shared";

// The purge confirmation opens on a click, so it loads then.
const LoadedPurgeDialog = lazy(async () => {
  const { PurgeCaseDialog } =
    await import("@/domains/cases/components/purge-case-dialog");
  return { default: PurgeCaseDialog };
});

type DeletedCaseRowProps = {
  deleted: DeletedCaseRecord;
  isCompact: boolean;
  isRestoring: boolean;
  onRestore: (deleted: DeletedCaseRecord) => void;
  onPurge: (deleted: DeletedCaseRecord) => void;
};

function DeletedCaseRow({
  deleted,
  isCompact,
  isRestoring,
  onRestore,
  onPurge,
}: DeletedCaseRowProps) {
  const blockedReason = restoreBlockedReason(deleted);
  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        isCompact ? "py-1.5" : "py-3"
      )}
    >
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
        <WithTooltip content={blockedReason} shouldWrapSpan>
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={isRestoring}
            disabled={blockedReason !== null}
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

type DeletedCasesViewProps = {
  /** The route's view (`validateSearch`): filters, `q` and sort. */
  search: ListSearch<typeof deletedCaseList>;
  onSearchChange: (patch: ListSearchPatch<typeof deletedCaseList>) => void;
};

/**
 * Deleted Cases (owners and admins), a page at a time (ADR-0007): who deleted each Case, when,
 * and how long it can still be restored, with Restore and Purge now (typed confirmation). The
 * standard toolbar and footer; the blank state restates the restore window.
 */
export function DeletedCasesView({
  search,
  onSearchChange,
}: DeletedCasesViewProps) {
  const list = useList(deletedCaseListView, {
    scope: {},
    search,
    onSearchChange,
  });
  const display = useListDisplay("deleted-cases");
  const { data: policy } = useQuery(deletionPolicyQuery());
  const restore = useRestoreCase();
  const [purgeTarget, setPurgeTarget] = useState<DeletedCaseRecord | null>(
    null
  );
  const windowDays = policy?.restoreWindowDays;

  return (
    <Page>
      <PageHeader
        count={
          <ListCount
            count={list.count}
            noun={list.def.noun}
            variant="compact"
            isLive={false}
          />
        }
        countOn="deleted-cases"
      />
      <div className="flex max-w-3xl flex-col gap-3">
        <ListToolbar list={list} display={display} />
        <ListBody
          list={list}
          skeleton={<QueueSkeleton />}
          blankSlateAction={
            <p className="text-muted-foreground max-w-md text-sm">
              {windowDays === undefined
                ? "A Case you delete waits here until it is purged."
                : `A Case you delete waits here for ${daysLabel(windowDays)} before it is purged.`}
            </p>
          }
        >
          {(rows) => (
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs">
                {windowDays === undefined
                  ? "A deleted Case can be restored until it is purged."
                  : `A deleted Case can be restored for ${daysLabel(windowDays)}. After that it is purged: its entities, evidence and files are erased and only a short deletion record stays.`}
              </p>
              <ul className="divide-y">
                {rows.map((deleted) => (
                  <DeletedCaseRow
                    key={deleted.id}
                    deleted={deleted}
                    isCompact={display.density === "compact"}
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
            </div>
          )}
        </ListBody>
      </div>
      {purgeTarget === null ? null : (
        <Suspense fallback={null}>
          <LoadedPurgeDialog
            target={purgeTarget}
            open
            onOpenChange={(isOpen) => {
              if (!isOpen) setPurgeTarget(null);
            }}
          />
        </Suspense>
      )}
    </Page>
  );
}
