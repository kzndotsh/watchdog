import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/shared/ui/shadcn/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { DossierExportMenu } from "@/domains/dossier/components/dossier-export-menu";

describe("DossierExportMenu", () => {
  it("renders the copy export trigger", () => {
    render(<DossierExportMenu caseId={testId(10)} entitySlug="alpha" />);
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});
