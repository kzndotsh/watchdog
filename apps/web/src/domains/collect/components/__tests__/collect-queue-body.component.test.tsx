import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CollectQueueBody } from "@/domains/collect/components/collect-queue-body";

describe("CollectQueueBody", () => {
  it("shows loading before queue load errors", () => {
    render(
      <CollectQueueBody
        queuePending
        queueLoadError="Queue unavailable"
        onRetryQueue={vi.fn()}
        queuePlaceholder={false}
        indexRows={[]}
        visibleRows={[]}
        filters={{ q: "", hiddenOnly: false }}
        selectionRowId={null}
        blankSlateAction={null}
        onFiltersChange={vi.fn()}
        onIdChange={vi.fn()}
      />
    );

    expect(screen.getByText("Loading collect queue")).toBeInTheDocument();
    expect(screen.queryByText("Queue unavailable")).not.toBeInTheDocument();
  });
});
