import type { ReactNode } from "react";

import type { GetArtifactContentInput } from "@/domains/jobs/types";
import { ARTIFACT_LOADING } from "@/shared/ui/artifact-body-from-content";

type ArtifactSourceProps =
  | {
      caseId: string;
      jobId: string;
      sha256: string;
    }
  | {
      caseId: string;
      evidenceId: string;
    };

export function artifactContentInput(
  props: ArtifactSourceProps,
  mime: string
): GetArtifactContentInput {
  if ("jobId" in props) {
    return {
      source: "job",
      caseId: props.caseId,
      jobId: props.jobId,
      sha256: props.sha256,
      mime,
    };
  }
  return {
    source: "evidence",
    caseId: props.caseId,
    evidenceId: props.evidenceId,
    mime,
  };
}

export function resolveArtifactTextContent(
  open: boolean,
  isPending: boolean,
  isError: boolean,
  text: string | null | undefined
): string | null | typeof ARTIFACT_LOADING {
  if (!open) return null;
  if (isPending) return ARTIFACT_LOADING;
  if (isError) return null;
  if (text === undefined) return null;
  if (text === null) return null;
  return text;
}

export function artifactQueryText(
  data: { text?: string | null } | undefined
): string | null | undefined {
  if (data === undefined) return undefined;
  return data.text;
}

export function artifactShaChipValue(
  sha256: string | undefined
): string | null {
  if (sha256 === undefined) return null;
  if (sha256 === "") return null;
  return sha256;
}

export function resolveArtifactHeaderAction(
  headerAction: ReactNode | undefined,
  shaChip: ReactNode | null
): ReactNode | undefined {
  if (headerAction !== undefined) return headerAction;
  if (shaChip === null) return undefined;
  return shaChip;
}
