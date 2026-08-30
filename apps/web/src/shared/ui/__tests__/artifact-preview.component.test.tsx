import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/shadcn/collapsible", () => ({
  Collapsible: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-slot="collapsible" {...props}>
      {children}
    </div>
  ),
  CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/shared/ui/json-view", () => ({
  JsonView: ({ data }: { data: unknown }) => (
    <pre data-testid="json-view">{JSON.stringify(data)}</pre>
  ),
}));

vi.mock("@/shared/ui/code-block", () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

vi.mock("@/shared/ui/shadcn/spinner", () => ({
  Spinner: () => <span aria-label="Loading" />,
}));

import { ArtifactPreview } from "@/shared/ui/artifact-preview";

describe("ArtifactPreview", () => {
  it("renders header mime chip and json body", () => {
    render(
      <ArtifactPreview
        name="artifact.json"
        mime="application/json"
        body={{ kind: "json", data: { ok: true } }}
      />
    );

    expect(screen.getByText("artifact.json")).toBeInTheDocument();
    expect(screen.getByText("application/json")).toBeInTheDocument();
    expect(screen.getByTestId("json-view")).toHaveTextContent('{"ok":true}');
  });

  it("renders binary placeholder copy", () => {
    render(<ArtifactPreview name="blob.bin" body={{ kind: "binary" }} />);

    expect(
      screen.getByText("Binary artifact — not renderable.")
    ).toBeInTheDocument();
  });

  it("renders headerAction inside the collapsible trigger row", () => {
    render(
      <ArtifactPreview
        name="dns-example.com.json"
        headerAction={<button type="button">Copy hash</button>}
        body={{ kind: "binary" }}
      />
    );

    expect(
      screen.getByRole("button", { name: "Copy hash" })
    ).toBeInTheDocument();
  });
});
