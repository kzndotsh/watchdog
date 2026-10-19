import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ClaimRecord } from "@/domains/entities/claims/types";
import { testId } from "@watchdog/test-kit";

// Only the network boundary is faked: the section reads claims through the real
// `claimsListQuery` under a real QueryClient, so a wrong query key or a broken fetch shows
// as a missing claim (docs/contributing/testing/standards.md Mock policy).
vi.mock("@/domains/entities/claims/claims.functions", () => ({
  listClaimsFn: vi.fn(),
  createClaimFn: vi.fn(),
  updateClaimFn: vi.fn(),
  retractClaimFn: vi.fn(),
}));

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { ClaimsSection } from "@/domains/dossier/components/claims-section";
import {
  listClaimsFn,
  retractClaimFn,
  updateClaimFn,
} from "@/domains/entities/claims/claims.functions";
import { toast } from "@/shared/ui/toast";

const ACTIVE: ClaimRecord = {
  version: 1,
  id: testId(1),
  entityId: testId(20),
  text: "Observed at the scene",
  class: "observation",
  confidence: "possible",
  evidenceIds: [],
  retracted: false,
  retractKind: null,
  retractedReason: null,
  retractedBy: null,
  retractedAt: null,
};

function renderClaims(
  claims: ClaimRecord[],
  opts?: { evidenceTitleById?: ReadonlyMap<string, string> }
) {
  vi.mocked(listClaimsFn).mockResolvedValue(claims);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ClaimsSection
        caseId={testId(10)}
        entityId={testId(20)}
        entitySlug="alpha"
        evidenceOptions={[]}
        evidenceTitleById={opts?.evidenceTitleById}
      />
    </QueryClientProvider>
  );
}

describe("ClaimsSection", () => {
  it("shows inline empty copy when there are no active claims", async () => {
    renderClaims([]);
    expect(
      await screen.findByText("No claims yet — add one or run a Capability.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("lists non-retracted claims", async () => {
    renderClaims([ACTIVE]);
    expect(
      await screen.findByText("Observed at the scene")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Claim actions" })
    ).toBeInTheDocument();
  });

  it("shows evidence titles on linked chips when provided", async () => {
    const evidenceId = testId(99);
    const onEvidenceClick = vi.fn();
    vi.mocked(listClaimsFn).mockResolvedValue([
      { ...ACTIVE, evidenceIds: [evidenceId] },
    ]);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ClaimsSection
          caseId={testId(10)}
          entityId={testId(20)}
          entitySlug="alpha"
          evidenceOptions={[]}
          evidenceTitleById={new Map([[evidenceId, "leaked-db.csv"]])}
          onEvidenceClick={onEvidenceClick}
        />
      </QueryClientProvider>
    );
    expect(
      await screen.findByRole("button", {
        name: "Preview evidence: leaked-db.csv",
      })
    ).toBeInTheDocument();
  });

  it.each([
    ["Contest", "Couldn't contest claim"],
    ["Disprove", "Couldn't disprove claim"],
    ["Retract", "Couldn't retract claim"],
  ])("reads %s failures as house failure copy", async (label, expected) => {
    // Non-Error rejection, so the fallback copy is what renders.
    vi.mocked(retractClaimFn).mockRejectedValueOnce("boom");
    const user = userEvent.setup();
    renderClaims([ACTIVE]);

    await user.click(
      await screen.findByRole("button", { name: "Claim actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: label }));
    await user.type(screen.getByRole("textbox"), "because");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it("refetches the list after a retract so the claim leaves it", async () => {
    // The refetch happens only if the mutation invalidates the key the list reads.
    vi.mocked(retractClaimFn).mockResolvedValueOnce({
      ...ACTIVE,
      retracted: true,
      retractKind: "retracted",
    });
    const user = userEvent.setup();
    renderClaims([ACTIVE]);
    vi.mocked(listClaimsFn).mockResolvedValue([]);

    await user.click(
      await screen.findByRole("button", { name: "Claim actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Retract" }));
    await user.type(screen.getByRole("textbox"), "because");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("No claims yet — add one or run a Capability.")
    ).toBeInTheDocument();
  });

  it("sends the version the editor opened at, and a stale save offers Reload (#307)", async () => {
    const opened = { ...ACTIVE, version: 7 };
    const stale = Object.assign(
      new Error("Claim changed since you opened it"),
      {
        code: "CONFLICT",
        status: 409,
        data: {
          code: "stale_version",
          entity: "Claim",
          id: ACTIVE.id,
          currentVersion: 8,
        },
      }
    );
    vi.mocked(updateClaimFn).mockRejectedValueOnce(stale);
    const user = userEvent.setup();
    renderClaims([opened]);

    await user.click(
      await screen.findByRole("button", { name: "Claim actions" })
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    // Another writer saved while the editor was open: the list now holds version 8.
    vi.mocked(listClaimsFn).mockResolvedValue([
      { ...opened, version: 8, text: "Changed by someone else" },
    ]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateClaimFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        claimId: ACTIVE.id,
        expectedVersion: 7,
      }),
    });
    expect(
      await screen.findByText("Claim changed since you opened it")
    ).toBeInTheDocument();
    const [toastArgs] = vi.mocked(toast.add).mock.calls[0] ?? [];
    expect(toastArgs).toMatchObject({
      title: "This claim changed since you opened it.",
      type: "error",
      actionProps: { children: "Reload" },
    });

    // Reload refetches the list and closes the editor on the fresh row.
    render(
      <button type="button" onClick={toastArgs?.actionProps?.onClick}>
        Toast action
      </button>
    );
    await user.click(screen.getByRole("button", { name: "Toast action" }));
    expect(
      await screen.findByText("Changed by someone else")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
