import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import { TYPE_SCALE_ROLES } from "@/routes/_protected/ui/type-scale-roles";
import { useDisplayScale } from "@/shared/lib/display-scale";

interface RoleMetrics {
  px: number;
  rem: number;
  lineHeightPx: number;
  fontWeight: number;
}

function formatPx(px: number): string {
  if (!Number.isFinite(px)) return "…";
  return `${Math.round(px * 10) / 10}px`;
}

function formatRem(rem: number): string {
  return `${Math.round(rem * 1000) / 1000}rem`;
}

function formatWeight(weight: number): string {
  return String(Math.round(weight));
}

/** Computed style lengths include units (e.g. `16px`) — parseFloat, not Number(). */
function parseCssPx(value: string): number {
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- CSS computed values carry unit suffixes
  return Number.parseFloat(value);
}

function measureRoles(
  rootPx: number,
  refs: Map<string, HTMLSpanElement>
): Record<string, RoleMetrics> {
  const next: Record<string, RoleMetrics> = {};

  for (const role of TYPE_SCALE_ROLES) {
    const el = refs.get(role.name);
    if (!el) continue;

    const style = getComputedStyle(el);
    const px = parseCssPx(style.fontSize);
    const lineHeightPx = parseCssPx(style.lineHeight);

    const fontWeight = Math.trunc(parseCssPx(style.fontWeight));

    next[role.name] = {
      px,
      rem: rootPx > 0 ? px / rootPx : 0,
      lineHeightPx: Number.isFinite(lineHeightPx) ? lineHeightPx : 0,
      fontWeight: Number.isFinite(fontWeight) ? fontWeight : 400,
    };
  }

  return next;
}

/** Live type-scale table — computed px/rem updates with display size and root font. */
export function TypeScaleSpecimen({ className }: { className?: string }) {
  const { scale } = useDisplayScale();
  const [rootPx, setRootPx] = useState(0);
  const [metrics, setMetrics] = useState<Record<string, RoleMetrics>>({});
  const sampleRefs = useRef(new Map<string, HTMLSpanElement>());

  const measure = useCallback(() => {
    const root = parseCssPx(
      getComputedStyle(document.documentElement).fontSize
    );
    setRootPx(root);
    setMetrics(measureRoles(root, sampleRefs.current));
  }, []);

  const setSampleRef = useCallback(
    (name: string) => (element: HTMLSpanElement | null) => {
      if (element) {
        sampleRefs.current.set(name, element);
      } else {
        sampleRefs.current.delete(name);
      }
    },
    []
  );

  useLayoutEffect(() => {
    measure();
  }, [measure, scale]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(document.documentElement);
    return () => {
      observer.disconnect();
    };
  }, [measure]);

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-3", className)}>
      <p className="text-muted-foreground text-xs leading-snug">
        Root{" "}
        <span className="text-label-mono-sm text-foreground tabular-nums">
          {rootPx > 0 ? formatPx(rootPx) : "…"}
        </span>
        {" · "}
        display scale{" "}
        <span className="text-label-mono-sm text-foreground tabular-nums">
          {scale}
        </span>
        . Sizes map to Tailwind{" "}
        <span className="text-label-mono-sm text-foreground">
          text-2xs · xs · sm · base · xl · 2xl
        </span>
        ; roles bundle weight and leading. Hi-DPI / 4K adds a viewport factor.
        Change scale in Settings → Appearance to see values update.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="text-label-meta text-muted-foreground border-b">
              <th className="pr-3 pb-2 font-medium">Role</th>
              <th className="pr-3 pb-2 font-medium">rem</th>
              <th className="pr-3 pb-2 font-medium">px</th>
              <th className="pr-3 pb-2 font-medium">Weight</th>
              <th className="pr-3 pb-2 font-medium">Line height</th>
              <th className="pb-2 font-medium">Sample</th>
            </tr>
          </thead>
          <tbody>
            {TYPE_SCALE_ROLES.map((role) => {
              const row = metrics[role.name];
              return (
                <tr
                  key={role.name}
                  className="border-border border-b border-dashed last:border-b-0"
                >
                  <td className="text-label-mono-sm text-muted-foreground py-2 pr-3 align-baseline whitespace-nowrap">
                    {role.name}
                  </td>
                  <td className="text-label-mono-sm py-2 pr-3 align-baseline whitespace-nowrap tabular-nums">
                    {row ? formatRem(row.rem) : "…"}
                  </td>
                  <td className="text-label-mono-sm py-2 pr-3 align-baseline whitespace-nowrap tabular-nums">
                    {row ? formatPx(row.px) : "…"}
                  </td>
                  <td className="text-label-mono-sm py-2 pr-3 align-baseline whitespace-nowrap tabular-nums">
                    {row ? formatWeight(row.fontWeight) : "…"}
                  </td>
                  <td className="text-label-mono-sm text-muted-foreground py-2 pr-3 align-baseline whitespace-nowrap tabular-nums">
                    {row && row.lineHeightPx > 0
                      ? formatPx(row.lineHeightPx)
                      : "…"}
                  </td>
                  <td className="min-w-0 py-2 align-baseline">
                    <span
                      ref={setSampleRef(role.name)}
                      className={cn(role.className, "block truncate")}
                    >
                      {role.sample}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
