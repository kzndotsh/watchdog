import {
  render as baseRender,
  renderHook as baseRenderHook,
  type RenderHookOptions,
  type RenderOptions,
} from "@testing-library/react";
import type { ReactElement } from "react";

import { RouteCaseProvider } from "@/testing/route-case";

// oxlint-disable-next-line react/only-export-components -- test helper: re-exports the testing library next to the wrapped render
export * from "@testing-library/react";

/**
 * `render` / `renderHook` inside the Case route's context (Alpha unless the test
 * passes its own `wrapper`). For a Work screen or a part of one, which names its Case
 * from the URL.
 */
export function render(ui: ReactElement, options?: RenderOptions) {
  return baseRender(ui, { wrapper: RouteCaseProvider, ...options });
}

export function renderHook<Result, Props>(
  callback: (props: Props) => Result,
  options?: RenderHookOptions<Props>
) {
  return baseRenderHook(callback, { wrapper: RouteCaseProvider, ...options });
}
