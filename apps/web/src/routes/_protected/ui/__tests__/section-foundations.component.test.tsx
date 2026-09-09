import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FoundationsSection } from "@/routes/_protected/ui/-section-foundations";

describe("FoundationsSection", () => {
  it("renders foundation swatches and type role specimens", () => {
    render(<FoundationsSection />);

    expect(
      screen.getByRole("heading", { name: "Foundations" })
    ).toBeInTheDocument();
    expect(screen.getByText("confirmed")).toBeInTheDocument();
    expect(screen.getByText("queued")).toBeInTheDocument();
    expect(screen.getByText("person")).toBeInTheDocument();
    expect(screen.getByText("text-heading-page")).toBeInTheDocument();
    expect(screen.getByText("text-label-meta-sm")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "px" })
    ).toBeInTheDocument();
  });
});
