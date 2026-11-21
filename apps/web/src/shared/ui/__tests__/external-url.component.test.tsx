import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExternalUrl } from "@/shared/ui/external-url";
import { testHttpUrl } from "@watchdog/domain/test-kit";

describe("ExternalUrl", () => {
  it("renders an external link with safe rel attributes", () => {
    render(<ExternalUrl href={testHttpUrl("example.com/path")} />);
    const link = screen.getByRole("link", { name: /example\.com/ });
    expect(link).toHaveAttribute("href", testHttpUrl("example.com/path"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
