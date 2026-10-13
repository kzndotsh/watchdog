import { useDebouncer } from "@tanstack/react-pacer";
import { useEffect, useState } from "react";

type DebouncedValue<T> = {
  /** The last value that stayed unchanged for `waitMs`; `initial` until one does. */
  value: T;
  /** `true` once the current input has stayed unchanged for `waitMs`. */
  isSettled: boolean;
};

type DebounceState<T> = {
  input: T;
  output: T;
  isSettled: boolean;
};

/**
 * The one debounce for typed input, built on TanStack Pacer's `useDebouncer`. Every change
 * of `input`, including a return to an earlier value, marks it unsettled at once and starts
 * the wait again; the pending timer is cancelled on change and on unmount. `waitMs` is read
 * at each change, so it can depend on the input (`0` commits on the next tick). Take the
 * delay from `@/shared/lib/debounce`.
 */
export function useDebouncedValue<T>(
  input: T,
  waitMs: number,
  initial: T
): DebouncedValue<T> {
  const [state, setState] = useState<DebounceState<T>>({
    input: initial,
    output: initial,
    isSettled: false,
  });
  const debouncer = useDebouncer(
    (next: T) => {
      setState({ input: next, output: next, isSettled: true });
    },
    { wait: waitMs }
  );
  if (!Object.is(state.input, input)) {
    setState({ ...state, input, isSettled: false });
  }
  const { maybeExecute } = debouncer;
  // oxlint-disable-next-line react-doctor/no-derived-state-effect -- the effect starts the Pacer timer (an external system); the committed value is what the timer sets, so it cannot be derived during render
  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-derived-state -- same: the timer, not render, commits the value
    maybeExecute(input);
  }, [input, maybeExecute]);
  return {
    value: state.output,
    isSettled: Object.is(state.input, input) && state.isSettled,
  };
}
