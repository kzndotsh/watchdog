import type { ColumnDef, HeaderContext } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { useList } from "@/shared/hooks/list/use-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { useListTable } from "@/shared/hooks/list/use-list-table";
import { DataTableColumnHeader } from "@/shared/ui/data-table";
import type { ServerTableFeatures } from "@/shared/ui/data-table/server-table-features";
import { ListTable } from "@/shared/ui/list";
import {
  harnessRows,
  harnessView,
  memoryFetch,
  testQueryClient,
  withClient,
  type HarnessRow,
} from "@/shared/ui/list/__tests__/list-test-fixtures";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";
import type { evidenceList } from "@watchdog/schemas/evidence";
import type { ListSearch } from "@watchdog/schemas/shared";

function labelHeader({
  column,
}: HeaderContext<ServerTableFeatures, HarnessRow>) {
  return <DataTableColumnHeader column={column} title="Label" />;
}

function capturedHeader({
  column,
}: HeaderContext<ServerTableFeatures, HarnessRow>) {
  return <DataTableColumnHeader column={column} title="Captured" />;
}

const COLUMNS: ColumnDef<ServerTableFeatures, HarnessRow>[] = [
  { id: "label", header: labelHeader, cell: ({ row }) => row.original.label },
  { id: "captured", header: capturedHeader, cell: () => null },
];

const VIEW = harnessView(memoryFetch(harnessRows(3)));

function TableHarness() {
  const [search, setSearch] = useState<ListSearch<typeof evidenceList>>({});
  const list = useList(VIEW, {
    scope: "case",
    search,
    onSearchChange: (patch) => {
      setSearch((prev) => ({ ...prev, ...patch }));
    },
  });
  const display = useListDisplay("harness-table");
  const { table } = useListTable(list, {
    columns: COLUMNS,
    sortColumns: { label: "label", captured: "captured" },
    display,
  });
  return <ListTable list={list} table={table} />;
}

/* The header under React Compiler (as the app ships it): the TanStack table instance keeps its
 * identity when the sort changes, so a header memoized on it would keep the old arrow. */
beforeAll(preloadSharedLazyChunks);

describe("a list table's headers, compiled", () => {
  it("flips the sort arrow on every header click", async () => {
    const user = userEvent.setup();
    render(<TableHarness />, { wrapper: withClient(testQueryClient()) });
    await screen.findByText("Item 1");

    const header = () => screen.getByRole("columnheader", { name: /Label/ });
    expect(header()).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: /^Label/ }));
    expect(header()).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: /^Label/ }));
    expect(header()).toHaveAttribute("aria-sort", "descending");
  });
});
