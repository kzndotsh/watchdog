import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DumpDialogs } from "@/domains/intake/components/dump-dialogs";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/intake/components/file-drop-zone", () => ({
  FileDropZone: () => <div>File drop zone</div>,
}));

vi.mock("@/domains/intake/components/paste-form", () => ({
  PasteForm: () => <div>Paste form</div>,
}));

vi.mock("@/domains/intake/components/url-form", () => ({
  UrlForm: () => <div>URL form</div>,
}));

vi.mock("@/shared/ui/entity-combobox", () => ({
  EntityCombobox: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => (
    <select aria-label={ariaLabel} />
  ),
}));

const defaults = {
  onOpenChange: vi.fn(),
  isBusy: false,
  isUploading: false,
  isDumpingPaste: false,
  isDumpingUrl: false,
  uploadStatus: null as string | null,
  entityId: "",
  onEntityIdChange: vi.fn(),
  onFiles: vi.fn(),
  onPaste: vi.fn(),
  onUrl: vi.fn(),
};

describe("DumpDialogs", () => {
  it("renders the upload dialog with association field", () => {
    render(
      <DumpDialogs
        {...defaults}
        open="file"
        entities={[
          { id: testId(1), name: "Alpha", slug: "alpha", kind: "person" },
        ]}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Upload files" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Target entity")).toBeInTheDocument();
    expect(screen.getByText("File drop zone")).toBeInTheDocument();
  });

  it("renders paste and url dialogs with submit actions", () => {
    const { rerender } = render(<DumpDialogs {...defaults} open="paste" />);
    expect(
      screen.getByRole("heading", { name: "Paste evidence" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Evidence" })
    ).toBeInTheDocument();

    rerender(<DumpDialogs {...defaults} open="url" />);
    expect(
      screen.getByRole("heading", { name: "Add URL" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add link" })
    ).toBeInTheDocument();
  });
});
