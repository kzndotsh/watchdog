import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  evidenceMatchesPickerFilter,
  type EvidenceOption,
} from "@/shared/ui/intake/evidence-option";
import { SearchedEvidencePicker } from "@/shared/ui/intake/searched-evidence-picker";
import {
  memoryPickerPort,
  pickerTestWrapper,
} from "@/testing/memory-picker-port";
import { preloadSharedLazyChunks } from "@/testing/shared-lazy-chunks";
import { testId } from "@watchdog/test-kit";

const PASSPORT = {
  id: testId(1),
  kind: "file" as const,
  label: "passport.pdf",
};
const PROFILE = {
  id: testId(2),
  kind: "url_archive" as const,
  label: "profile page",
};
const OLD = { id: testId(3), kind: "other" as const, label: "old note" };

function setup(selectedIds: string[] = []) {
  // `limit` 2: the old note is past the recent page, as on a large Case.
  const fake = memoryPickerPort<EvidenceOption>([PASSPORT, PROFILE, OLD], {
    matches: evidenceMatchesPickerFilter,
    limit: 2,
  });
  const onChange = vi.fn();
  render(
    <SearchedEvidencePicker
      port={fake.port}
      selectedIds={selectedIds}
      onChange={onChange}
    />,
    { wrapper: pickerTestWrapper() }
  );
  return { ...fake, onChange, user: userEvent.setup() };
}

beforeAll(preloadSharedLazyChunks);

describe("SearchedEvidencePicker", () => {
  it("asks nothing until opened, then shows one page of recent Evidence", async () => {
    const { user, search } = setup();
    expect(search).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText("Add evidence"));

    expect(await screen.findByText("passport.pdf")).toBeInTheDocument();
    expect(screen.getByText("profile page")).toBeInTheDocument();
    expect(screen.queryByText("old note")).not.toBeInTheDocument();
    expect(search).toHaveBeenCalledWith(null);
  });

  it("searches on the server from 3 characters and never with fewer", async () => {
    const { user, search } = setup();
    await user.click(screen.getByLabelText("Add evidence"));
    await screen.findByText("passport.pdf");

    await user.click(screen.getByLabelText("Search evidence"));
    await user.paste("ol");
    expect(screen.getByText(/Type 3\+ characters/)).toBeInTheDocument();

    await user.paste("d");
    expect(await screen.findByText("old note")).toBeInTheDocument();
    expect(screen.queryByText("passport.pdf")).not.toBeInTheDocument();
    expect(search).toHaveBeenCalledWith("old");
    expect(search).not.toHaveBeenCalledWith("ol");
  });

  it("titles a selected item by id even when it is not on the page, and picks from matches", async () => {
    const { user, byIds, onChange } = setup([OLD.id]);

    expect(await screen.findByText("old note")).toBeInTheDocument();
    expect(byIds).toHaveBeenCalledWith([OLD.id]);

    await user.click(screen.getByLabelText("Add evidence, 1 selected"));
    await user.click(await screen.findByRole("checkbox", { name: /passport/ }));
    expect(onChange).toHaveBeenCalledWith([OLD.id, PASSPORT.id]);
  });
});
