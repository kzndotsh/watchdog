import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormInlineWarning } from "@/shared/ui/form-inline-message";

describe("FormInlineWarning", () => {
  it("renders a status message", () => {
    render(<FormInlineWarning>Check spelling</FormInlineWarning>);
    expect(screen.getByRole("status")).toHaveTextContent("Check spelling");
  });

  it("renders nothing for empty children", () => {
    const { container } = render(<FormInlineWarning>{null}</FormInlineWarning>);
    expect(container).toBeEmptyDOMElement();
  });
});
