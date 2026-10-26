// Fixture for react-compiler-coverage.test.ts: `Compiled` is memoized, `Skipped` opts out.
export function Compiled({ label = "x" }: { label?: string }) {
  return <span>{label}</span>;
}

export function Skipped({ label = "y" }: { label?: string }) {
  "use no memo";
  return <span>{label}</span>;
}
