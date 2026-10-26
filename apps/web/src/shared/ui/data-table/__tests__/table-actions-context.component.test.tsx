import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  EntityTableActionsProvider,
  useEntityTableActions,
  type EntityTableActions,
} from "@/domains/entities/components/entity-table.columns";
import {
  IdentifiersTableActionsProvider,
  useIdentifiersTableActions,
  type IdentifiersTableActions,
} from "@/domains/entities/components/identifiers-table.columns";
import {
  IdentifierTableActionsProvider,
  useIdentifierTableActions,
  type IdentifierTableActions,
} from "@/shared/ui/identifiers/identifier-cells";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { memoryPickerPort } from "@/testing/memory-picker-port";
import { testCaseId } from "@watchdog/schemas/testing";

const ENTITY_ACTIONS: EntityTableActions = {
  updateKind: vi.fn(),
  updateSummary: vi.fn(),
  updateNotes: vi.fn(),
  caseId: testCaseId(10),
  createConnection: vi.fn(),
  updateConnection: vi.fn(),
  deleteConnection: vi.fn(),
  onOpenEntity: vi.fn(),
  onCopyEntityLink: vi.fn(),
  onCopyEntityMarkdown: vi.fn(),
  onDeleteEntity: vi.fn(),
};

const NO_EVIDENCE = {
  port: memoryPickerPort<EvidenceOption>([], { matches: () => false }).port,
  titles: new Map<string, EvidenceOption>(),
};

const IDENTIFIERS_ACTIONS: IdentifiersTableActions = {
  evidence: NO_EVIDENCE,
  updateField: vi.fn(),
  saveEvidence: vi.fn(),
  saveNotes: vi.fn(),
  onOpenSubject: vi.fn(),
  onCopyValue: vi.fn(),
  onDeleteIdentifier: vi.fn(),
};

const DOSSIER_ACTIONS: IdentifierTableActions = {
  updateField: vi.fn(),
  evidence: NO_EVIDENCE,
  saveEvidence: vi.fn(),
  saveNotes: vi.fn(),
  onCopyValue: vi.fn(),
  onDeleteIdentifier: vi.fn(),
};

// The type guard: a table's cells read its actions with a typed hook, and its provider takes
// only the full actions shape, so a table that forgets or mis-shapes them fails to compile (or
// throws here) instead of failing on the first click.
describe("table actions context", () => {
  it("hands each hook the actions its provider was given", () => {
    const entity = renderHook(() => useEntityTableActions(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <EntityTableActionsProvider value={ENTITY_ACTIONS}>
          {children}
        </EntityTableActionsProvider>
      ),
    });
    expect(entity.result.current).toBe(ENTITY_ACTIONS);
    const identifiers = renderHook(() => useIdentifiersTableActions(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <IdentifiersTableActionsProvider value={IDENTIFIERS_ACTIONS}>
          {children}
        </IdentifiersTableActionsProvider>
      ),
    });
    expect(identifiers.result.current).toBe(IDENTIFIERS_ACTIONS);
    const dossier = renderHook(() => useIdentifierTableActions(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <IdentifierTableActionsProvider value={DOSSIER_ACTIONS}>
          {children}
        </IdentifierTableActionsProvider>
      ),
    });
    expect(dossier.result.current).toBe(DOSSIER_ACTIONS);
  });

  it("throws when a cell renders outside its provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useEntityTableActions())).toThrow(
        /EntityTableActions/
      );
      expect(() => renderHook(() => useIdentifiersTableActions())).toThrow(
        /IdentifiersTableActions/
      );
      expect(() => renderHook(() => useIdentifierTableActions())).toThrow(
        /IdentifierTableActions/
      );
    } finally {
      error.mockRestore();
    }
  });

  it("rejects a provider value of the wrong shape", () => {
    const partial = { updateKind: vi.fn() };
    renderHook(() => useEntityTableActions(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        // @ts-expect-error a partial actions object is a compile error
        <EntityTableActionsProvider value={partial}>
          {children}
        </EntityTableActionsProvider>
      ),
    });
  });
});
