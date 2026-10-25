import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { ProviderCallRow } from "@/domains/jobs/components/provider-calls/provider-call-row";
import { couldnt } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { queryEnabledFlag } from "@/shared/lib/query-enabled";
import { queryLoadError } from "@/shared/lib/query-load-error";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import { IdChip } from "@/shared/ui/id-chip";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { PendingRegion } from "@/shared/ui/pending-region";
import type {
  ProviderCallCacheHit,
  ProviderCallList,
} from "@watchdog/core/jobs";

type ProviderCallsSectionProps = {
  caseId: string;
  /** The calls of a Job or of one Evidence item (`jobProviderCallsQuery`, `evidenceProviderCallsQuery`). */
  options: UseQueryOptions<ProviderCallList>;
  /** Whose calls these are; it words the cache and empty notes. */
  subject: "job" | "evidence";
};

function CacheHitNote({
  hit,
  subject,
}: {
  hit: ProviderCallCacheHit;
  subject: ProviderCallsSectionProps["subject"];
}) {
  const lead =
    subject === "job"
      ? "Served from cache: this Job reused a cached result"
      : "Served from cache: this Evidence came from a cached result";
  return (
    <p className="text-muted-foreground text-xs">
      {hit.sourceJobId === null ? (
        `${lead}. The Job it came from is not in this Case.`
      ) : (
        <span className="inline-flex flex-wrap items-center gap-1">
          {lead} of Job <IdChip value={hit.sourceJobId} isCopyable />.
        </span>
      )}
    </p>
  );
}

function emptyCopy(
  list: ProviderCallList,
  subject: ProviderCallsSectionProps["subject"]
) {
  if (list.cacheHits.length > 0) {
    return {
      title: "No calls of its own",
      description:
        "The result was reused from a cache, so no request went to a provider for it.",
    };
  }
  return {
    title: "No provider calls recorded",
    description:
      subject === "job"
        ? "This Job made no request to a provider, or it ran before calls were recorded."
        : "No provider call is linked to this Evidence: it was added by hand, or captured before calls were recorded.",
  };
}

type ProviderCallsBodyProps = {
  caseId: string;
  list: ProviderCallList;
  subject: ProviderCallsSectionProps["subject"];
};

/** The calls, or why there are none: a gap in the record is never worded as "no calls". */
function CallsOrEmpty({ caseId, list, subject }: ProviderCallsBodyProps) {
  if (list.calls.length > 0) {
    return (
      <ul className="flex flex-col gap-2">
        {list.calls.map((call) => (
          <ProviderCallRow key={call.id} caseId={caseId} call={call} />
        ))}
      </ul>
    );
  }
  if (list.provenance === "incomplete") return null;
  const copy = emptyCopy(list, subject);
  return (
    <EmptyState
      size="sm"
      intent="blank-slate"
      items="provider calls"
      title={copy.title}
      description={copy.description}
    />
  );
}

function ProviderCallsBody({ caseId, list, subject }: ProviderCallsBodyProps) {
  const isIncomplete = list.provenance === "incomplete";
  return (
    <div className="flex flex-col gap-3">
      {isIncomplete ? (
        <FormInlineWarning>
          The provider-call record is incomplete: some calls or outcomes were
          not saved, so this list may be missing calls.
        </FormInlineWarning>
      ) : null}
      {list.cacheHits.map((hit) => (
        <CacheHitNote key={hit.jobId} hit={hit} subject={subject} />
      ))}
      <CallsOrEmpty caseId={caseId} list={list} subject={subject} />
      {list.isTruncated ? (
        <p className="text-muted-foreground text-xs">
          Showing the first {list.calls.length} calls.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The provider calls behind a result, for Evidence detail and Job detail. A record with a gap is
 * shown as one, never as "no calls". Pending, failed and empty states follow the Detail chrome.
 */
export function ProviderCallsSection({
  caseId,
  options,
  subject,
}: ProviderCallsSectionProps) {
  const query = useQuery(options);
  const isEnabled = queryEnabledFlag(options.enabled);
  const isPending = listPending(query, { isEnabled });
  const loadError = queryLoadError(
    query,
    isPending,
    couldnt("load", "provider calls")
  );

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
  return (
    <PendingRegion
      isLoading={isPending}
      label="Loading provider calls"
      fallback={<InlineLoading label="Loading provider calls…" />}
      className={placeholderDeemphasisClass(query.isPlaceholderData)}
    >
      {query.data === undefined ? null : (
        <ProviderCallsBody
          caseId={caseId}
          list={query.data}
          subject={subject}
        />
      )}
    </PendingRegion>
  );
}
