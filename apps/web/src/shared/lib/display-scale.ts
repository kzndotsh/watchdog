export const DISPLAY_SCALE_STORAGE_KEY = "wd-display-scale";

/** Default (1.1) is the readable baseline; Large (1.35) for hi-DPI. */
export const DISPLAY_SCALE_PRESETS = [1.1, 1.2, 1.35] as const;

export type DisplayScale = (typeof DISPLAY_SCALE_PRESETS)[number];

/** Product default when no preference is stored (Default). */
export const DEFAULT_DISPLAY_SCALE: DisplayScale = 1.1;

export const DISPLAY_SCALE_LABELS: Record<DisplayScale, string> = {
  1.1: "Default",
  1.2: "Comfortable",
  1.35: "Large",
};

export function isDisplayScaleValue(value: number): value is DisplayScale {
  for (const preset of DISPLAY_SCALE_PRESETS) {
    if (value === preset) return true;
  }
  return false;
}

function parseDisplayScaleInput(
  value: string | number | null | undefined
): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number.NaN;
}

/** Normalize persisted or parsed values to an allowed preset. */
export function normalizeDisplayScale(
  value: string | number | null | undefined
): DisplayScale {
  const parsed = parseDisplayScaleInput(value);

  if (!Number.isFinite(parsed) || !isDisplayScaleValue(parsed)) {
    return DEFAULT_DISPLAY_SCALE;
  }

  return parsed;
}

export function applyDisplayScale(scale: DisplayScale): void {
  document.documentElement.style.setProperty(
    "--wd-display-scale",
    String(scale)
  );
  document.documentElement.dataset.displayScale = String(scale);
}
