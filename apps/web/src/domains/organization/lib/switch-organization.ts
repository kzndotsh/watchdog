/**
 * Hard navigation after the active organization changes. Everything cached or
 * streamed (Query cache, the SSE stream bound to the old org, the active-Case cookie)
 * belongs to the previous organization, so start clean instead of patching each layer.
 */
export function reloadIntoOrganization(): void {
  window.location.assign("/");
}
