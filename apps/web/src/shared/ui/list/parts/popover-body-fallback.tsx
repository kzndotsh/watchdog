/**
 * What a popover shows for the one frame its lazy body is still loading: the body's own padding
 * and a line of height, so the popup keeps its width and does not jump when the body lands.
 */
export function PopoverBodyFallback() {
  return (
    <div aria-hidden data-slot="list-popover-fallback" className="min-h-16" />
  );
}
