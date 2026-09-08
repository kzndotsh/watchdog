import type { Query } from "@tanstack/react-query";

export function queryEnabledFlag<TData = unknown>(
  enabled:
    | boolean
    | ((query: Query<TData, Error, TData>) => boolean)
    | undefined
): boolean {
  if (enabled === false) return false;
  return true;
}
