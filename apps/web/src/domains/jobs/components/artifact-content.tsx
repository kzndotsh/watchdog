import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { artifactContentQuery } from "@/domains/jobs/queries";
import type { GetArtifactContentInput } from "@/domains/jobs/types";
import {
  ARTIFACT_LOADING,
  artifactBodyFromContent,
} from "@/shared/ui/artifact-body-from-content";
import { ArtifactPreview } from "@/shared/ui/artifact-preview";
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

  const contentInput: GetArtifactContentInput =
    "jobId" in props
      ? {
          source: "job",
          caseId: props.caseId,
          jobId: props.jobId,
          sha256: props.sha256,
          mime,
        }
      : {
          source: "evidence",
          caseId: props.caseId,
          evidenceId: props.evidenceId,
          mime,
        };

  const { data, isPending, isError } = useQuery({
    ...artifactContentQuery(contentInput),
    enabled: open,
  });

  let content: string | null | typeof ARTIFACT_LOADING;
  if (!open) {
    content = null;
  } else if (isPending) {
    content = ARTIFACT_LOADING;
  } else if (isError) {
    content = null;
  } else {
    content = data?.text ?? null;
  }

  const shaChip =
    sha256 !== undefined && sha256 !== "" ? (
      <IdChip value={sha256} preset="sha256" copyable className="min-w-0" />
    ) : null;

  return (
    <ArtifactPreview
      name={name}
      mime={mime}
      className={className}
      open={open}
      onOpenChange={setOpen}
      headerAction={headerAction ?? shaChip ?? undefined}
      body={artifactBodyFromContent(content, mime)}
    />
  );
}
