import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfidenceSelect } from "@/shared/ui/confidence-select";

describe("ConfidenceSelect", () => {
  it("renders the current confidence label", () => {
    render(<ConfidenceSelect value="possible" onChange={vi.fn()} />);

    expect(
      screen.getByRole("combobox", { name: "Confidence" })
    ).toHaveTextContent("Possible");
  });

  it("renders all confidence tier labels", () => {
    render(<ConfidenceSelect value="unverified" onChange={vi.fn()} />);
    expect(
      screen.getByRole("combobox", { name: "Confidence" })
    ).toHaveTextContent("Unverified");
  });
});
