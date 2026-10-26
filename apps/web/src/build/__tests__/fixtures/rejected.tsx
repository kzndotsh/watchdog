import { useRef } from "react";

// Fixture for react-compiler-coverage.test.ts: the compiler rejects a ref write during
// render, so this must report a CompileError.
export function Rejected({ count }: { count: number }) {
  const ref = useRef(0);
  ref.current = count;
  return <span>{ref.current}</span>;
}
