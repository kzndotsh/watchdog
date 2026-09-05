import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActorMention } from "@/shared/ui/actor-mention";

describe("ActorMention", () => {
  it("renders a user handle with an @ glyph, not an @ in the text", () => {
    const { container } = render(<ActorMention label="@kaizen" />);
    expect(screen.getByText("kaizen")).toBeInTheDocument();
    expect(screen.queryByText("@kaizen")).not.toBeInTheDocument();
    expect(screen.getByLabelText("@kaizen")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("treats a bare handle the same as a leading @", () => {
    render(<ActorMention label="kaizen" />);
    expect(screen.getByText("kaizen")).toBeInTheDocument();
    expect(screen.getByLabelText("@kaizen")).toBeInTheDocument();
  });

  it("leaves api-key labels unprefixed with no @ glyph", () => {
    const { container } = render(<ActorMention label="api-key:cli" />);
    expect(screen.getByText("api-key:cli")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a By prefix beside the handle", () => {
    render(<ActorMention prefix="By" label="kaizen" />);
    expect(screen.getByText("By")).toBeInTheDocument();
    expect(screen.getByText("kaizen")).toBeInTheDocument();
  });
});
