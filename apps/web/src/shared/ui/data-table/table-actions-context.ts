import { createContext, useContext } from "react";

/**
 * A typed context for one table's row actions and options. The columns are module constants and
 * their cells are module-level components, so a cell's type never changes; they read the actions
 * with `useActions()`, and a new actions object re-renders them instead of remounting them (a
 * cell renderer created per actions object is a new component type to React, which would drop an
 * open draft or popover). The table component that owns the actions renders `Provider` around its
 * `DataTable`; a cell outside it throws.
 */
export function createTableActionsContext<TActions extends object>(
  name: string
) {
  const Context = createContext<TActions | null>(null);

  function useActions(): TActions {
    const actions = useContext(Context);
    if (actions === null) {
      throw new Error(`${name}: render the table inside its actions provider`);
    }
    return actions;
  }

  return { Provider: Context.Provider, useActions };
}
