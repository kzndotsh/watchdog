import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDossierSectionEditor } from "@/domains/dossier/hooks/use-dossier-section-editor";

describe("useDossierSectionEditor", () => {
  it("tracks add/edit lifecycle and empty row detection", () => {
    const onResetCreate = vi.fn();
    const { result } = renderHook(() =>
      useDossierSectionEditor({ onResetCreate })
    );

    expect(result.current.isEmpty(0)).toBe(true);

    act(() => {
      result.current.handleStartAdding();
    });
    expect(result.current.isAdding).toBe(true);
    expect(result.current.isEmpty(0)).toBe(false);

    act(() => {
      result.current.handleOpenEdit("row-1");
    });
    expect(result.current.isAdding).toBe(false);
    expect(result.current.editId).toBe("row-1");
    expect(onResetCreate).toHaveBeenCalled();

    act(() => {
      result.current.handleCloseEdit();
      result.current.handleError("Save failed");
    });
    expect(result.current.editId).toBeNull();
    expect(result.current.error).toBe("Save failed");
  });
});
