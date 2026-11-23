import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { AddFoundValueDialog } from "@/domains/collect/components/add-found-value-dialog";
import { procedureDouble } from "@/testing/orpc-client";
import { buildEntityRecord } from "@/testing/records";
import type { FoundValueRecord } from "@watchdog/domain/schemas/jobs";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

const createEntity = procedureDouble("entities.create");

const CASE_ID = testCaseId(1);
const EVIDENCE_ID = testId(3);

const VALUE: FoundValueRecord = {
  type: "domain",
  platform: "",
  value: "mirror.acme.test",
  sources: ["Certificate name"],
  onEntities: [],
};

function renderDialog() {
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AddFoundValueDialog
        caseId={CASE_ID}
        jobId={testId(2)}
        value={VALUE}
        evidenceIds={[EVIDENCE_ID]}
        onClose={onClose}
      />
    </QueryClientProvider>
  );
  return { onClose };
}

describe("AddFoundValueDialog, New Entity", () => {
  beforeEach(() => {
    createEntity.mockReset();
  });

  it("creates an Entity named after the value, holding it at Unverified with the Job's Evidence", async () => {
    createEntity.mockResolvedValue(
      buildEntityRecord({ id: testId(9), slug: "mirror-acme-test" })
    );
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "New Entity" }));
    expect(screen.getByLabelText("Entity name")).toHaveValue(
      "mirror.acme.test"
    );
    await user.click(screen.getByRole("button", { name: "Create Entity" }));

    expect(createEntity).toHaveBeenCalledTimes(1);
    expect(createEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: CASE_ID,
        kind: "infra",
        name: "mirror.acme.test",
        identifier: expect.objectContaining({
          type: "domain",
          value: "mirror.acme.test",
          status: "unknown",
          confidence: "unverified",
          evidenceIds: [EVIDENCE_ID],
        }),
      })
    );
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("keeps the dialog open with the failure, and needs a name", async () => {
    createEntity.mockRejectedValue(
      new Error('Slug "mirror-acme-test" already exists in this Case')
    );
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "New Entity" }));
    const name = screen.getByLabelText("Entity name");
    await user.clear(name);
    expect(
      screen.getByRole("button", { name: "Create Entity" })
    ).toBeDisabled();

    await user.type(name, "Mirror");
    await user.click(screen.getByRole("button", { name: "Create Entity" }));

    expect(
      await screen.findByText(/already exists in this Case/)
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
