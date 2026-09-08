import { createServerFn } from "@tanstack/react-start";

import { getArtifactContentInputSchema } from "@/domains/jobs/types";

/**
 * Fetch artifact content from MinIO for display in the job Detail.
 * Returns text content for JSON/text artifacts, null for binary.
 */
export const getArtifactContentFn = createServerFn({ method: "POST" })
  .validator(getArtifactContentInputSchema)
  .handler(async ({ data, context }): Promise<{ text: string | null }> => {
    // Dynamic import keeps @watchdog/api / @watchdog/core off the client graph
    // (artifact-queries is pulled in by Collect route prefetch).
    const { fetchArtifactContent } = await import("./jobs-artifact.server");
    return fetchArtifactContent(data, context);
  });
