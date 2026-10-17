import {
  render as baseRender,
  type RenderOptions,
} from "@testing-library/react";
import type { ReactElement } from "react";

import { RouteCaseProvider } from "@/testing/route-case";

// oxlint-disable-next-line react/only-export-components -- test helper: re-exports the testing library next to the wrapped render
export * from "@testing-library/react";

/**
 * `render` inside the Case route's context (Alpha unless the test
 * passes its own `wrapper`). For a Work screen or a part of one, which names its Case
 * from the URL.
 */
export function render(ui: ReactElement, options?: RenderOptions) {
  return baseRender(ui, { wrapper: RouteCaseProvider, ...options });
}
