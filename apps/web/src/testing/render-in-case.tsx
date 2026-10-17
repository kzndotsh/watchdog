import {
  render as baseRender,
  type RenderOptions,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { RouteCaseProvider } from "@/testing/route-case";
import type { CaseRecord } from "@watchdog/core/cases";

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

/** A `render` bound to one Case route, for a test file whose subject is one Case's screen. */
export function renderIn(routeCase: CaseRecord) {
  return (ui: ReactElement, options?: RenderOptions) =>
    baseRender(ui, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RouteCaseProvider routeCase={routeCase}>{children}</RouteCaseProvider>
      ),
      ...options,
    });
}
