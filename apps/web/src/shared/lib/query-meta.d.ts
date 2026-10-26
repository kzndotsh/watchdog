import "@tanstack/react-query";

declare module "@tanstack/react-query" {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- module augmentation merges only as an interface
  interface Register {
    queryMeta: {
      /** Skip global QueryCache.onError toast for this query. */
      silentError?: boolean;
      /** A declared list's view (`listView`): `softInvalidate` throttles its refetch per view. */
      isListView?: boolean;
    };
  }
}
