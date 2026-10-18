import { useInfiniteQuery } from "@tanstack/react-query";

import { RowHistoryEntry } from "@/domains/dossier/components/row-history-entry";
import { graphHistoryQuery } from "@/domains/entities/history/queries";
import { couldnt, errMessage } from "@/lib/utils";
import { ActorMention } from "@/shared/ui/actor-mention";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { Button } from "@/shared/ui/primitives/button";
import { RelativeTime } from "@/shared/ui/relative-time";
import type { GraphHistoryAttribution } from "@watchdog/schemas/graph";
import type { GraphHistoryKind } from "@watchdog/schemas/shared";

type AuthorLineProps = {
  verb: string;
  author: string | null;
  at: string;
};

function AuthorLine({ verb, author, at }: AuthorLineProps) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{verb}</span>
      {author === null ? (
        <span className="text-muted-foreground">an unknown author</span>
      ) : (
        <ActorMention label={author} size="sm" />
      )}
      <RelativeTime value={at} className="text-xs" />
    </p>
  );
}

function Attribution({
  attribution,
}: {
  attribution: GraphHistoryAttribution;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <AuthorLine
        verb="Created by"
        author={attribution.createdBy}
        at={attribution.createdAt}
      />
      <AuthorLine
        verb="Last changed by"
        author={attribution.updatedBy}
        at={attribution.updatedAt}
      />
    </div>
  );
}

type RowHistoryPopupProps = {
  caseId: string;
  kind: GraphHistoryKind;
  rowId: string;
};

/**
 * The body of a row's history popover. It mounts only while the popover is
 * open, so a row that is never asked for its history reads nothing.
 */
export function RowHistoryPopup({ caseId, kind, rowId }: RowHistoryPopupProps) {
  const history = useInfiniteQuery(graphHistoryQuery(caseId, kind, rowId));
  const attribution = history.data?.pages[0]?.attribution ?? null;
  const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <>
      {history.isError ? (
        <p role="alert" className="text-destructive text-xs">
          {errMessage(history.error, couldnt("load", "history"))}
        </p>
      ) : null}
      {history.isPending ? <InlineLoading label="Loading…" /> : null}
      {attribution === null ? null : <Attribution attribution={attribution} />}
      {history.isSuccess && entries.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No recorded changes yet. History starts with the first edit.
        </p>
      ) : null}
      {entries.length > 0 ? (
        <ol className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {entries.map((entry) => (
            <RowHistoryEntry key={entry.id} entry={entry} />
          ))}
        </ol>
      ) : null}
      {history.hasNextPage ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={history.isFetchingNextPage}
          onClick={() => {
            void history.fetchNextPage();
          }}
        >
          Show older
        </Button>
      ) : null}
    </>
  );
}
