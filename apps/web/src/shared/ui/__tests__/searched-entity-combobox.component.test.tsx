import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EntityOption } from "@/shared/ui/entity-combobox";
import { entityMatchesQuery } from "@/shared/ui/entity-match";
import { SearchedEntityCombobox } from "@/shared/ui/searched-entity-combobox";
import {
  memoryPickerPort,
  pickerTestWrapper,
} from "@/testing/memory-picker-port";
import { testId } from "@watchdog/test-kit";

const ALICE = {
  id: testId(1),
  name: "Alice",
  kind: "person" as const,
  slug: "alice",
};
const ACME = {
  id: testId(2),
  name: "Acme Corp",
  kind: "org" as const,
  slug: "acme",
};
const ZED = {
  id: testId(3),
  name: "Zed Host",
  kind: "infra" as const,
  slug: "zed",
};

function setup(value = "", excludeIds: string[] = []) {
  const fake = memoryPickerPort<EntityOption>([ALICE, ACME, ZED], {
    matches: (row, q) => entityMatchesQuery(row, q),
    limit: 2,
  });
  const onValueChange = vi.fn();
  const onEntityChange = vi.fn();
  render(
    <SearchedEntityCombobox
      port={fake.port}
      value={value}
      onValueChange={onValueChange}
      onEntityChange={onEntityChange}
      excludeIds={excludeIds}
      aria-label="Entity"
    />,
    { wrapper: pickerTestWrapper() }
  );
  return { ...fake, onValueChange, onEntityChange, user: userEvent.setup() };
}

describe("SearchedEntityCombobox", () => {
  it("offers one page of recent Entities, then searches on the server", async () => {
    const { user, search, onValueChange, onEntityChange } = setup();
    const box = screen.getByRole("combobox", { name: "Entity" });

    await user.click(box);
    expect(
      await screen.findByRole("option", { name: "Alice" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Zed Host" })
    ).not.toBeInTheDocument();
    expect(search).toHaveBeenCalledWith(null);

    await user.paste("zed");
    await user.click(await screen.findByRole("option", { name: "Zed Host" }));
    expect(search).toHaveBeenCalledWith("zed");
    expect(onValueChange).toHaveBeenCalledWith(ZED.id);
    expect(onEntityChange).toHaveBeenCalledWith(ZED);
  });

  it("titles its value by id when the value is not on the page", async () => {
    const { byIds } = setup(ZED.id);
    expect(
      await screen.findByDisplayValue("Zed Host", undefined, { timeout: 1000 })
    ).toBeInTheDocument();
    expect(byIds).toHaveBeenCalledWith([ZED.id]);
  });

  it("never offers an excluded Entity", async () => {
    const { user } = setup("", [ALICE.id]);
    await user.click(screen.getByRole("combobox", { name: "Entity" }));
    expect(
      await screen.findByRole("option", { name: "Acme Corp" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Alice" })
    ).not.toBeInTheDocument();
  });
});
