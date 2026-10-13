import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DossierSection } from "@/domains/dossier/components/dossier-section";

describe("DossierSection", () => {
  it("renders section content when not empty", () => {
    render(
      <DossierSection title="Claims">
        <p>Claim body</p>
      </DossierSection>
    );
    expect(screen.getByRole("heading", { name: "Claims" })).toBeInTheDocument();
    expect(screen.getByText("Claim body")).toBeInTheDocument();
  });

  it("shows inline empty copy by default", () => {
    render(
      <DossierSection title="Events" isEmpty emptyText="No events recorded">
        <p>Hidden</p>
      </DossierSection>
    );
    expect(screen.getByText("No events recorded")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("renders a panel blank slate when emptyPresentation is panel", () => {
    render(
      <DossierSection
        title="Questions"
        isEmpty
        emptyPresentation="panel"
        emptyItems="questions"
        emptyDescription="Add a question to track gaps."
      >
        <p>Hidden</p>
      </DossierSection>
    );
    expect(screen.getByText(/No questions Yet/i)).toBeInTheDocument();
    expect(
      screen.getByText("Add a question to track gaps.")
    ).toBeInTheDocument();
  });
});
