import {
  bodySummary,
  callOutcomeLabel,
  formatCallDuration,
  isCallFailure,
  transportLabel,
} from "@/domains/jobs/lib/provider-call-view";
import { cn } from "@/lib/utils";
import { providerCallResponsePath } from "@/shared/lib/api-urls";
import { IdChip } from "@/shared/ui/id-chip";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { MetaGrid } from "@/shared/ui/meta-grid";
import { MetaGridItem } from "@/shared/ui/meta-grid-item";
import { Button } from "@/shared/ui/primitives/button";
import { capabilityLabel } from "@/shared/ui/vocab";
import type { ProviderCallRecord } from "@watchdog/core/jobs";

type ProviderCallRowProps = {
  caseId: string;
  call: ProviderCallRecord;
};

function ServedFrom({ call }: { call: ProviderCallRecord }) {
  if (!call.isServedFromCache) return null;
  return (
    <MetaGridItem label="Served from">
      {call.original === null ? (
        <span>Cache. The original call is not in this Case.</span>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-1">
          Cache. Original call in Job{" "}
          <IdChip value={call.original.jobId} isCopyable />
        </span>
      )}
    </MetaGridItem>
  );
}

/**
 * One provider call: what was asked (method and redacted URL, shown as text, never a link to the
 * provider), how it ended, what was kept of the body, and which Cap and version made it.
 */
export function ProviderCallRow({ caseId, call }: ProviderCallRowProps) {
  const { body } = call;
  return (
    <li className="border-border flex flex-col gap-2 rounded-md border px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground font-mono text-xs">
          {call.method}
        </span>
        <span className="min-w-0 font-mono text-xs break-all">{call.url}</span>
      </div>
      <MetaGrid className="text-xs">
        <MetaGridItem label="Result">
          <span className={cn(isCallFailure(call) && "text-destructive")}>
            {callOutcomeLabel(call)}
          </span>
        </MetaGridItem>
        <MetaGridItem label="Transport">
          {transportLabel(call.transport)}
        </MetaGridItem>
        <MetaGridItem label="Started">
          <LocalDateTime value={call.startedAt} />
        </MetaGridItem>
        <MetaGridItem label="Duration">
          {formatCallDuration(call.durationMs)}
        </MetaGridItem>
        {body === null ? null : (
          <>
            <MetaGridItem label="Response body">
              {bodySummary(body)}
              {body.contentType === null ? null : (
                <span className="text-muted-foreground">
                  {" "}
                  · {body.contentType}
                </span>
              )}
            </MetaGridItem>
            {body.sha256 === null ? null : (
              <MetaGridItem label="Body hash">
                <IdChip
                  value={body.sha256}
                  preset="sha256"
                  isCopyable
                  className="min-w-0"
                />
              </MetaGridItem>
            )}
          </>
        )}
        <MetaGridItem label="Cap">
          <span className="inline-flex flex-wrap items-center gap-1">
            {capabilityLabel(call.capabilityId)}
            {call.capVersion === null ? null : (
              <IdChip value={call.capVersion} isCopyable />
            )}
          </span>
        </MetaGridItem>
        <ServedFrom call={call} />
      </MetaGrid>
      {body?.isDownloadable === true ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a
                href={providerCallResponsePath(caseId, call.id)}
                download
                aria-label={`Download the raw response of ${call.method} ${call.url}`}
              />
            }
          >
            Download raw response
          </Button>
        </div>
      ) : null}
    </li>
  );
}
