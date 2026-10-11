import type { AppAction } from "@/shared/lib/app-action";

export function ActionIcon({ action }: { action: AppAction }) {
  if (!action.icon) return null;
  const Icon = action.icon;
  return <Icon />;
}
