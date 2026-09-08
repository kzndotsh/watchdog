import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { artifactContentQuery } from "@/domains/jobs/artifact-queries";
import {
  artifactContentInput,
  artifactQueryText,
  artifactShaChipValue,
  resolveArtifactHeaderAction,
  resolveArtifactTextContent,
} from "@/domains/jobs/components/artifact-content-helpers";
import { cn, errMessage } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { queryEnabledFlag } from "@/shared/lib/query-enabled";
import { artifactBodyFromContent } from "@/shared/ui/artifact-body-from-content";
import { ArtifactPreview } from "@/shared/ui/artifact-preview";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { IdChip } from "@/shared/ui/id-chip";

type ArtifactContentProps = {
  mime: string;
  name: string;
  /** When set, shows a sha256 IdChip in the artifact header. */
  sha256?: string;
  className?: string;
  headerAction?: ReactNode;
  /** Forwarded to ArtifactPreview — start open or collapsed. */
  defaultOpen?: boolean;
} & (
  | {
      caseId: string;
      jobId: string;
      sha256: string;
    }
  | {
      caseId: string;
      evidenceId: string;
    }
);

function sha256Chip(shaValue: string | null): ReactNode | null {
  if (shaValue === null) return null;
  return (
    <IdChip value={shaValue} preset="sha256" copyable className="min-w-0" />
  );
}

/**
 * Fetches artifact bytes via Query + `getArtifactContentFn`.
 * Shared by Jobs + Intake Detail.
 */
export function ArtifactContent(props: ArtifactContentProps) {
  const {
    mime,
    name,
    sha256,
    className,
    headerAction,
    defaultOpen = true,
  } = props;
  const [open, setOpen] = useState(defaultOpen);

  const contentInput = artifactContentInput(props, mime);
  const contentQueryOptions = artifactContentQuery(contentInput);
  const contentQueryEnabled =
    open && queryEnabledFlag(contentQueryOptions.enabled);
  const contentQuery = useQuery({
    ...contentQueryOptions,
    enabled: contentQueryEnabled,
  });
  const contentPending = listPending(contentQuery, {
    enabled: contentQueryEnabled,
  });
  const contentLoadError =
    open && !contentPending && !contentQuery.isFetching && contentQuery.isError;

  const content = resolveArtifactTextContent(
    open,
    contentPending || (open && contentQuery.isFetching && contentQuery.isError),
    contentLoadError,
    artifactQueryText(contentQuery.data)
  );
  const shaChip = sha256Chip(artifactShaChipValue(sha256));
  const body = contentLoadError
    ? {
        kind: "custom" as const,
        children: (
          <FetchErrorAlert
            error={errMessage(contentQuery.error, "Failed to load artifact")}
            onRetry={() => {
              void contentQuery.refetch();
            }}
          />
        ),
      }
    : artifactBodyFromContent(content, mime);

  return (
    <ArtifactPreview
      name={name}
      mime={mime}
      className={cn(
        className,
        placeholderDeemphasisClass(contentQuery.isPlaceholderData)
      )}
      open={open}
      onOpenChange={setOpen}
      headerAction={resolveArtifactHeaderAction(headerAction, shaChip)}
      body={body}
    />
  );
}
