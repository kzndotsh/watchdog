import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GUIDE_NAV,
  GuideSection,
  GuideToc,
  Specimen,
  Swatch,
} from "@/routes/_protected/ui/-guide-chrome";

describe("guide chrome", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders section nav links from GUIDE_NAV", () => {
    render(<GuideToc />);

    for (const { label } of GUIDE_NAV) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        expect.stringMatching(/^#/)
      );
    }
  });

  it("scrolls to in-page anchors when a nav link is clicked", () => {
    const scrollIntoView = vi.fn();
    const target = document.createElement("div");
    target.scrollIntoView = scrollIntoView;
    vi.spyOn(document, "querySelector").mockReturnValue(target);
    vi.spyOn(history, "replaceState").mockImplementation(() => {});

    render(<GuideToc />);
    fireEvent.click(screen.getByRole("link", { name: "Foundations" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "#foundations");
  });

  it("renders guide section, specimen, and swatch chrome", () => {
    render(
      <GuideSection id="demo" title="Demo" blurb="Demo blurb">
        <Specimen label="Sample" blurb="Sample blurb">
          <Swatch name="primary" className="bg-primary" />
        </Specimen>
      </GuideSection>
    );

    expect(screen.getByRole("heading", { name: "Demo" })).toBeInTheDocument();
    expect(screen.getByText("Demo blurb")).toBeInTheDocument();
    expect(screen.getByText("Sample")).toBeInTheDocument();
    expect(screen.getByText("primary")).toBeInTheDocument();
  });
});
