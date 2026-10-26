/**
 * Pure half of the shared-worker leak canary (`leak-canary.ts` wires it into Vitest).
 * With `isolate: false` every file in a worker sees the globals the previous file left
 * behind, so a spy, a stub or a `defineProperty` that is never undone fails some later,
 * unrelated file depending on the order. The canary snapshots the shared globals when a
 * file starts and compares them when it ends, which blames the file that leaked.
 */

/**
 * What one property looked like. `seen` is its value by identity: the data value, or for
 * an accessor on `globalThis` what the getter returned (the DOM environment exposes every
 * window property as an accessor whose setter swaps the value, so the descriptor alone
 * does not change when a test assigns `globalThis.fetch`).
 */
type Slot = {
  readonly accessor: boolean;
  readonly get?: unknown;
  readonly set?: unknown;
  readonly seen?: unknown;
  readonly observed: boolean;
};

export type Snapshot = {
  /** `label -> property -> slot`, one entry per watched object. */
  readonly objects: ReadonlyMap<string, ReadonlyMap<string, Slot>>;
  readonly env: ReadonlyMap<string, string | undefined>;
  readonly fakeTimers: boolean;
};

/**
 * Own properties that tooling and libraries create the first time a file imports them
 * (process-wide singletons registered on `globalThis`, the React act flag, Vitest
 * internals). Not test state, so never a leak. Add a name here only for a library or
 * singleton that registers itself; a test's own global is a leak to fix, not to list.
 */
const TOOLING_PREFIXES = [
  "__vitest",
  "__zod_",
  "__MSW_",
  "~effect/",
  // React stamps its listener and resource markers on `document` and containers.
  "_reactListening",
  "__react",
];
const TOOLING_PROPERTIES = new Set([
  "globalThis.IS_REACT_ACT_ENVIRONMENT",
  // @watchdog/db keeps one Postgres pool per process on globalThis.
  "globalThis.__watchdogPool",
  // Third-party singletons registered on first import.
  "globalThis.__SEROVAL_REFS__",
  "globalThis.__PLATE_INSTANCES__",
  "globalThis.__TSR_ROUTER__",
  "globalThis.nanostoresGlobal",
  "globalThis.awslambda",
  // evlog >= 2.31 flags its own console output so its capture hook skips it.
  "globalThis.__evlogOwnOutput",
  // @testing-library/user-event installs a clipboard stub and wraps focus/blur on setup().
  "navigator.clipboard",
  "HTMLElement.prototype.focus",
  "HTMLElement.prototype.blur",
]);
/** tslib registers its helpers on globalThis when first imported. */
const TSLIB_HELPER =
  /^__(extends|assign|rest|decorate|param|esDecorate|runInitializers|propKey|setFunctionName|metadata|awaiter|generator|exportStar|createBinding|values|read|spread|spreadArrays|spreadArray|await|asyncGenerator|asyncDelegator|asyncValues|makeTemplateObject|importStar|importDefault|classPrivateField(Get|Set|In)|addDisposableResource|disposeResources|rewriteRelativeImportExtension)$/;

const ignored = (label: string, key: string) =>
  TOOLING_PROPERTIES.has(`${label}.${key}`) ||
  (label === "globalThis" && TSLIB_HELPER.test(key)) ||
  TOOLING_PREFIXES.some((prefix) => key.startsWith(prefix));

type Watch = readonly [label: string, target: object];

const protoOf = (name: string): object | undefined => {
  const ctor: unknown = Reflect.get(globalThis, name);
  const proto: unknown =
    typeof ctor === "function" ? Reflect.get(ctor, "prototype") : undefined;
  return typeof proto === "object" && proto !== null ? proto : undefined;
};

const isObjectLike = (value: unknown): value is object =>
  (typeof value === "object" || typeof value === "function") && value !== null;

/** The objects tests are known to patch (spies, stubs, `defineProperty`). */
const watched = (): Watch[] => {
  const list: Watch[] = [["globalThis", globalThis]];
  for (const name of [
    "console",
    "Math",
    "Date",
    "JSON",
    "performance",
    "document",
    "history",
    "navigator",
    "location",
  ]) {
    const target: unknown = Reflect.get(globalThis, name);
    if (isObjectLike(target)) {
      list.push([name, target]);
    }
  }
  for (const name of [
    "EventTarget",
    "Node",
    "Element",
    "HTMLElement",
    "Document",
    "Storage",
    "Window",
  ]) {
    const proto = protoOf(name);
    if (proto) {
      list.push([`${name}.prototype`, proto]);
    }
  }
  return list;
};

function ignoreWarning(): void {
  // Deliberately silent while a getter is read.
}

/** Reads a getter without letting a Node deprecation or experimental warning escape. */
const readGetter = (target: object, get: unknown): unknown => {
  if (typeof get !== "function") {
    return undefined;
  }
  const emitWarning = process.emitWarning.bind(process);
  process.emitWarning = ignoreWarning;
  try {
    return get.call(target);
  } catch {
    return undefined;
  } finally {
    process.emitWarning = emitWarning;
  }
};

const slotsOf = (target: object, observe: boolean): Map<string, Slot> => {
  const slots = new Map<string, Slot>();
  for (const key of Object.getOwnPropertyNames(target)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
    if (!descriptor) {
      continue;
    }
    if ("value" in descriptor) {
      slots.set(key, {
        accessor: false,
        seen: descriptor.value,
        observed: true,
      });
    } else {
      const seen = observe ? readGetter(target, descriptor.get) : undefined;
      slots.set(key, {
        accessor: true,
        get: descriptor.get,
        set: descriptor.set,
        seen,
        // A getter that builds a new object per read (happy-dom's `CSS`) has no identity.
        observed:
          observe && Object.is(seen, readGetter(target, descriptor.get)),
      });
    }
  }
  return slots;
};

export const takeSnapshot = (isFakeTimers: () => boolean): Snapshot => ({
  objects: new Map(
    watched().map(([label, target]) => [
      label,
      slotsOf(target, target === globalThis),
    ])
  ),
  env: new Map(Object.entries(process.env)),
  fakeTimers: isFakeTimers(),
});

const slotChange = (
  before: Slot | undefined,
  after: Slot | undefined
): string | undefined => {
  if (!before || !after) {
    if (before === after) {
      return undefined;
    }
    return before ? "removed" : "added";
  }
  if (before.accessor && after.accessor) {
    if (before.get !== after.get || before.set !== after.set) {
      return "replaced";
    }
  } else if (before.accessor !== after.accessor) {
    // A data property and an accessor differ in shape. Only a lazy accessor that turned
    // into a data property holding its own value (Node's `fetch`), or a data property that
    // became an accessor returning the same value, is no leak; anything unreadable is.
    const same =
      before.observed && after.observed && Object.is(before.seen, after.seen);
    return same ? undefined : "redefined";
  }
  // Same slot shape: compare what a read returns. A test that assigned the original back
  // through a setter is no leak.
  if (
    before.observed &&
    after.observed &&
    !Object.is(before.seen, after.seen)
  ) {
    return "replaced";
  }
  return undefined;
};

/** One human-readable line per global that differs between the two snapshots. */
export const diffSnapshots = (before: Snapshot, after: Snapshot): string[] => {
  // Fake timers rewrite Date, setTimeout and friends: one line says it all.
  if (!before.fakeTimers && after.fakeTimers) {
    return ["fake timers are still installed (call vi.useRealTimers())"];
  }
  const leaks: string[] = [];
  for (const [label, afterSlots] of after.objects) {
    const beforeSlots = before.objects.get(label);
    if (!beforeSlots) {
      continue;
    }
    for (const key of new Set([...beforeSlots.keys(), ...afterSlots.keys()])) {
      const change = ignored(label, key)
        ? undefined
        : slotChange(beforeSlots.get(key), afterSlots.get(key));
      if (change) {
        leaks.push(`${label}.${key} was ${change}`);
      }
    }
  }
  for (const key of new Set([...before.env.keys(), ...after.env.keys()])) {
    const was = before.env.get(key);
    // The env validator (@t3-oss/env-core, emptyStringAsUndefined) unsets empty variables
    // when a file first imports @watchdog/env: normalisation, not test state.
    if (was !== after.env.get(key) && !(was === "" && !after.env.has(key))) {
      leaks.push(`process.env.${key} was changed`);
    }
  }
  return leaks;
};

/** The failure text: names every leak and where the rule is stated. */
export const leakMessage = (leaks: readonly string[]): string =>
  [
    "This test file left shared-worker state changed (isolate: false: the next file in the worker inherits it):",
    ...leaks.map((leak) => `  - ${leak}`),
    "Undo it in afterEach/afterAll: restore spies (mockRestore / vi.restoreAllMocks), vi.useRealTimers(), reset process.env keys, and use vi.stubGlobal / vi.stubEnv instead of assigning globals (docs/contributing/testing/standards.md#test-speed-shared-workers).",
  ].join("\n");
