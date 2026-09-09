import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TYPE_SCALE_ROLES } from "@/routes/_protected/ui/type-scale-roles";
import { TypeScaleSpecimen } from "@/routes/_protected/ui/type-scale-specimen";
import { DISPLAY_SCALE_STORAGE_KEY } from "@/shared/lib/display-scale";

describe("TypeScaleSpecimen", () => {
  afterEach(() => {
    window.localStorage.removeItem(DISPLAY_SCALE_STORAGE_KEY);
    document.documentElement.style.removeProperty("--wd-display-scale");
    delete document.documentElement.dataset.displayScale;
  });

  it("lists every typography role from wd-typography.css", () => {
    render(<TypeScaleSpecimen />);

    for (const role of TYPE_SCALE_ROLES) {
      expect(screen.getByText(role.name)).toBeInTheDocument();
      expect(screen.getByText(role.sample)).toBeInTheDocument();
    }
  });

  it("shows computed px and weight values after measure", async () => {
    render(<TypeScaleSpecimen />);

    await waitFor(() => {
      expect(screen.getAllByText(/\d+(\.\d+)?px/).length).toBeGreaterThan(0);
      expect(screen.getByText("Weight")).toBeInTheDocument();
      expect(screen.getAllByText(/^(400|500|600)$/).length).toBeGreaterThan(0);
    });
  });

  it("includes text-label-meta-sm", () => {
    render(<TypeScaleSpecimen />);
    expect(screen.getByText("text-label-meta-sm")).toBeInTheDocument();
  });
});
