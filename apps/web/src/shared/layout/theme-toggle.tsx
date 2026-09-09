/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- theme hooks + sidebar menu item */
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { DropdownMenuItem } from "@/shared/ui/shadcn/dropdown-menu";

export type ThemeMode = "light" | "dark" | "auto";

const THEME_STORAGE_KEY = "theme";
const themeModeListeners = new Set<() => void>();

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "auto";
}

/** Client snapshot — reflects the persisted choice once hydrated. */
function getStoredThemeMode(): ThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "auto";
}

/** Server snapshot — matches first paint so hydration never mismatches. */
function getServerThemeMode(): ThemeMode {
  return "auto";
}

// oxlint-disable-next-line promise/prefer-await-to-callbacks -- useSyncExternalStore subscribe contract requires a sync callback
function subscribeToThemeMode(callback: () => void) {
  // `storage` covers cross-tab changes; the local Set covers same-tab writes.
  window.addEventListener("storage", callback);
  themeModeListeners.add(callback);
  return () => {
    window.removeEventListener("storage", callback);
    themeModeListeners.delete(callback);
  };
}

export function persistThemeMode(mode: ThemeMode) {
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  for (const listener of themeModeListeners) listener();
}

function resolveThemeMode(
  mode: ThemeMode,
  prefersDark: boolean
): "light" | "dark" {
  if (mode === "auto") return prefersDark ? "dark" : "light";
  return mode;
}

function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveThemeMode(mode, prefersDark);

  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);

  if (mode === "auto") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = mode;
  }

  document.documentElement.style.colorScheme = resolved;
}

export function modeLabel(mode: ThemeMode): string {
  switch (mode) {
    case "auto": {
      return "System";
    }
    case "dark": {
      return "Dark";
    }
    case "light": {
      return "Light";
    }
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function nextThemeMode(mode: ThemeMode): ThemeMode {
  switch (mode) {
    case "light": {
      return "dark";
    }
    case "dark": {
      return "auto";
    }
    case "auto": {
      return "light";
    }
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function themeModeIcon(mode: ThemeMode) {
  switch (mode) {
    case "auto": {
      return MonitorIcon;
    }
    case "dark": {
      return MoonIcon;
    }
    case "light": {
      return SunIcon;
    }
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function onAutoThemePreferenceChange(): void {
  applyThemeMode("auto");
}

function subscribeAutoThemePreference(
  media: MediaQueryList,
  onChange: () => void
): () => void {
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
}

function useAutoThemePreference(mode: ThemeMode): void {
  useEffect(() => {
    if (mode !== "auto") {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return requires an explicit value alongside the cleanup-returning branch below
      return undefined;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    return subscribeAutoThemePreference(media, onAutoThemePreferenceChange);
  }, [mode]);
}

export function useThemeMode() {
  const mode = useSyncExternalStore(
    subscribeToThemeMode,
    getStoredThemeMode,
    getServerThemeMode
  );

  useEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  useAutoThemePreference(mode);

  function toggleMode() {
    persistThemeMode(nextThemeMode(mode));
  }

  function setMode(next: ThemeMode) {
    persistThemeMode(next);
  }

  const Icon = themeModeIcon(mode);

  const ariaLabel =
    mode === "auto"
      ? "Theme mode: auto (system). Click to switch to light mode."
      : `Theme mode: ${mode}. Click to switch mode.`;

  return { mode, toggleMode, setMode, Icon, ariaLabel };
}

/** Theme cycle control for the sidebar user dropdown. */
export function ThemeMenuItem() {
  const { mode, toggleMode, Icon, ariaLabel } = useThemeMode();

  return (
    <DropdownMenuItem
      closeOnClick={false}
      onClick={toggleMode}
      aria-label={ariaLabel}
    >
      <Icon />
      {modeLabel(mode)}
    </DropdownMenuItem>
  );
}
