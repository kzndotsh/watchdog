import type { ArtifactPreviewBody } from "@/shared/ui/artifact-preview";

/** Sentinel distinct from any possible artifact text content. */
export const ARTIFACT_LOADING = Symbol("artifact-loading");

/** Map loaded text + mime into an ArtifactPreview body state. */
export function artifactBodyFromContent(
  content: string | null | typeof ARTIFACT_LOADING,
  mime: string
): ArtifactPreviewBody {
  if (content === ARTIFACT_LOADING) return { kind: "loading" };
  if (content === null) return { kind: "binary" };

  if (mime.includes("json")) {
    try {
      return {
        kind: "json",
        data: JSON.parse(content) as unknown,
        defaultExpanded: 1,
      };
    } catch {
      // fall through
    }
  }

  return { kind: "text", code: content, mime };
}
