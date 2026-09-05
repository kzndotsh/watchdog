import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import {
  artifactContentInput,
  artifactQueryText,
  artifactShaChipValue,
  resolveArtifactHeaderAction,
  resolveArtifactTextContent,
} from "@/domains/jobs/components/artifact-content-helpers";
import { artifactContentQuery } from "@/domains/jobs/queries";
import { artifactBodyFromContent } from "@/shared/ui/artifact-body-from-content";
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
  const { data, isPending, isError } = useQuery({
    ...artifactContentQuery(contentInput),
    enabled: open,
  });

  const content = resolveArtifactTextContent(
    open,
    isPending,
    isError,
    artifactQueryText(data)
  );
  const shaChip = sha256Chip(artifactShaChipValue(sha256));

  return (
    <ArtifactPreview
      name={name}
      mime={mime}
      className={className}
      open={open}
      onOpenChange={setOpen}
      headerAction={resolveArtifactHeaderAction(headerAction, shaChip)}
      body={artifactBodyFromContent(content, mime)}
    />
  );
}
