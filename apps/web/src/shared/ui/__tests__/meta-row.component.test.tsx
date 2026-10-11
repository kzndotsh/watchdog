import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetaGrid } from "@/shared/ui/meta-grid";
import { MetaGridItem } from "@/shared/ui/meta-grid-item";
import { MetaRow } from "@/shared/ui/meta-row";

describe("MetaRow", () => {
  it("renders label/value rows and grid items", () => {
    render(
      <MetaRow label="Status">
        <span>Active</span>
      </MetaRow>
    );
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();

    render(
      <MetaGrid>
        <MetaGridItem label="Owner">
          <span>Alice</span>
        </MetaGridItem>
      </MetaGrid>
    );
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});
