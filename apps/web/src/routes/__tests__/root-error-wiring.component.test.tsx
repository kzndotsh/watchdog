import { describe, expect, it } from "vitest";

import { Route as rootRoute } from "@/routes/__root";
import { Route as protectedRoute } from "@/routes/_protected";
import { RootError } from "@/shared/layout/root-error";

describe("root error boundary wiring", () => {
  it("the root route and the signed-in layout (the app shell) render the root error screen", () => {
    expect(rootRoute.options.errorComponent).toBe(RootError);
    expect(protectedRoute.options.errorComponent).toBe(RootError);
  });
});
