import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActiveTabBody } from "@/shared/ui/active-tab-body";

describe("ActiveTabBody", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(
      <ActiveTabBody isActive={false}>
        <p>Hidden</p>
      </ActiveTabBody>
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows a skeleton while pending", () => {
    render(
      <ActiveTabBody isActive isPending pendingSections={2}>
        <p>Ready</p>
      </ActiveTabBody>
    );
    expect(screen.queryByText("Ready")).toBeNull();
  });

  it("renders children when active and not pending", () => {
    render(
      <ActiveTabBody isActive>
        <p>Ready</p>
      </ActiveTabBody>
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
});
