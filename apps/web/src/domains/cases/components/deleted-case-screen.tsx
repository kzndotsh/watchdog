import { Link, useNavigate } from "@tanstack/react-router";

import { useRestoreCase } from "@/domains/cases/hooks/use-restore-case";
import {
  deletedByLabel,
  restoreBlockedReason,
  restoreWindowLabel,
} from "@/domains/cases/lib/deleted-case-copy";
import type { DeletedCaseRecord } from "@/domains/cases/types";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { RouteNotFoundCenter } from "@/shared/layout/route-not-found-center";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/with-tooltip";

/**
 * What an owner or admin sees at the URL of a deleted Case: when it was deleted and by whom,
 * with Restore. Anyone else gets the ordinary not-found screen instead (the route decides), so
 * this screen never confirms that a deleted Case exists to a member.
 */
export function DeletedCaseScreen({ deleted }: { deleted: DeletedCaseRecord }) {
  const navigate = useNavigate();
  const restore = useRestoreCase();
  const blockedReason = restoreBlockedReason(deleted);

  return (
    <Page className="min-h-0">
      <PageHeader current="Deleted" description={deleted.name} />
      <RouteNotFoundCenter
        title="Case deleted"
        description={
          <>
            This Case was deleted on <LocalDateTime value={deleted.deletedAt} />{" "}
            by {deletedByLabel(deleted)}. {restoreWindowLabel(deleted)}.
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <WithTooltip content={blockedReason} shouldWrapSpan>
            <Button
              type="button"
              loading={restore.isPending}
              disabled={blockedReason !== null}
              onClick={() => {
                restore.mutate(deleted, {
                  onSuccess: (restored) => {
                    void navigate({
                      to: "/cases/$caseSlug",
                      params: { caseSlug: restored.slug },
                    });
                  },
                });
              }}
            >
              Restore case
            </Button>
          </WithTooltip>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/deleted-cases" />}
          >
            Deleted Cases
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/cases" />}
          >
            Back to Cases
          </Button>
        </div>
      </RouteNotFoundCenter>
    </Page>
  );
}
