/** Default cap for repo search/list limits when callers omit validation. */
export const MAX_REPO_SEARCH_LIMIT = 50;

export function clampSearchLimit(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_REPO_SEARCH_LIMIT;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_REPO_SEARCH_LIMIT);
}
