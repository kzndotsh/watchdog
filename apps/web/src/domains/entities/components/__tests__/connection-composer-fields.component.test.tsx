import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConnectionComposerFields } from "@/domains/entities/components/connection-composer-fields";
import { buildEntityRecord } from "@/testing/records";
import { edgePhraseValue } from "@watchdog/schemas/shared";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

// The peer picker's reads (#559): one small page of the Case's Entity list, and by-ids.
const entityReads = vi.hoisted(() => ({
  listEntitiesPageFn: vi.fn(),
  getEntitiesFn: vi.fn(),
}));

vi.mock("@/domains/entities/entities.functions", () => entityReads);

vi.mock("@/shared/ui/field-combobox", () => ({
  FieldCombobox: ({
    value,
    onValueChange,
    "aria-label": ariaLabel,
  }: {
    value: string;
    onValueChange: (next: string) => void;
    "aria-label"?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
      }}
    >
      <option value="">Select…</option>
      <option value={edgePhraseValue("related_to", "forward")}>
        Related to
      </option>
    </select>
  ),
}));

vi.mock("@/shared/ui/entity-combobox", () => ({
  EntityCombobox: ({
    value,
    onValueChange,
    entities,
    "aria-label": ariaLabel,
  }: {
    value: string;
    onValueChange: (next: string) => void;
    entities: { id: string; name: string }[];
    "aria-label"?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => {
        onValueChange(event.target.value);
      }}
    >
      <option value="">Select…</option>
      {entities.map((entity) => (
        <option key={entity.id} value={entity.id}>
          {entity.name}
        </option>
      ))}
    </select>
  ),
}));

const CASE_ID = testCaseId(10);
const CENTER = { id: testId(1), kind: "person" as const };
const PEER = buildEntityRecord({ id: testId(2), name: "Beta", kind: "org" });

function renderFields(ui: ReactElement) {
  entityReads.listEntitiesPageFn.mockResolvedValue({
    items: [PEER],
    nextCursor: null,
    total: { count: 1, isCapped: false },
  });
  entityReads.getEntitiesFn.mockResolvedValue([PEER]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

describe("ConnectionComposerFields", () => {
  it("shows notes input when relationship is related_to", async () => {
    renderFields(
      <ConnectionComposerFields
        caseId={CASE_ID}
        center={CENTER}
        values={{
          peerId: PEER.id,
          peerKind: "org",
          phraseValue: edgePhraseValue("related_to", "forward"),
          notes: "",
        }}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("combobox", { name: "Connection relationship" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Connection peer" })
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "Beta" })
    ).toBeInTheDocument();
  });

  it("searches peers on the server, narrowed to the kinds the relationship allows", async () => {
    renderFields(
      <ConnectionComposerFields
        caseId={CASE_ID}
        center={CENTER}
        values={{
          peerId: "",
          peerKind: null,
          phraseValue: edgePhraseValue("operates", "forward"),
          notes: "",
        }}
        onChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(entityReads.listEntitiesPageFn).toHaveBeenCalledWith({
        data: expect.objectContaining({
          caseId: CASE_ID,
          kind: ["infra", "org"],
        }),
      });
    });
  });

  it("sets the peer and its kind, and picks a relationship for the pair", async () => {
    const onChange = vi.fn();
    renderFields(
      <ConnectionComposerFields
        caseId={CASE_ID}
        center={CENTER}
        values={{ peerId: "", peerKind: null, phraseValue: "", notes: "" }}
        onChange={onChange}
      />
    );

    const peer = screen.getByRole("combobox", { name: "Connection peer" });
    await screen.findByRole("option", { name: "Beta" });
    fireEvent.change(peer, { target: { value: PEER.id } });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ peerId: PEER.id, peerKind: "org" })
    );
    const [last] = onChange.mock.lastCall ?? [];
    expect(last).toMatchObject({ phraseValue: expect.stringContaining(":") });
  });
});
