import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";

import type { PickerPort } from "@/shared/hooks/use-picker-source";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { memoryPickerKeys } from "@/testing/memory-picker-keys";
import { RouteCaseProvider } from "@/testing/route-case";

/**
 * A picker port over in-memory rows for shared-UI tests (#559): `search(q)` answers one page
 * (`limit`) of the rows `matches` keeps, or the first rows when `q` is null; `byIds` answers the
 * rows with those ids. Both are spies, so a test asserts what the picker asked the server for.
 */
export function memoryPickerPort<T extends { readonly id: string }>(
  rows: readonly T[],
  {
    matches,
    limit = 20,
  }: {
    readonly matches: (row: T, q: string) => boolean;
    readonly limit?: number;
  }
) {
  const search = vi.fn(async (q: string | null) =>
    rows.filter((row) => q === null || matches(row, q)).slice(0, limit)
  );
  const byIds = vi.fn(async (ids: readonly string[]) =>
    rows.filter((row) => ids.includes(row.id))
  );
  const port: PickerPort<T> = {
    search: (q) => ({
      queryKey: memoryPickerKeys.search(q),
      queryFn: async () => search(q),
    }),
    byIds: (ids) => ({
      queryKey: memoryPickerKeys.byIds(ids),
      queryFn: async () => byIds(ids),
      enabled: ids.length > 0,
    }),
  };
  return { port, search, byIds };
}

/** A fresh client (no retries) and its provider, for a component that reads through a port. */
export function pickerTestWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function PickerTestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

/** An Entity picker port over no rows, for a screen test that never opens the picker. */
export function emptyEntityPickerPort() {
  return memoryPickerPort<EntityOption>([], { matches: () => false }).port;
}

/** `pickerTestWrapper` inside the Case route's context, for a Work screen part that also reads its Case. */
export function pickerRouteCaseWrapper() {
  const Picker = pickerTestWrapper();
  return function PickerRouteCaseWrapper({
    children,
  }: {
    children: ReactNode;
  }) {
    return (
      <RouteCaseProvider>
        <Picker>{children}</Picker>
      </RouteCaseProvider>
    );
  };
}
