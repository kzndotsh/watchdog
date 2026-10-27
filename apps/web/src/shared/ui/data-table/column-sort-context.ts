import { createContext } from "react";

/**
 * The header's current sort, provided by `DataTable` per header cell. React Compiler memoizes a
 * column's header function on `column`, which TanStack keeps across sort changes, so a header that
 * read `column.getIsSorted()` would keep its first state; context reaches it through the memo.
 */
export const ColumnSortContext = createContext<
  false | "asc" | "desc" | undefined
>(undefined);
