import type { AddressInfo } from "node:net";

/**
 * Ports the fetch standard refuses to connect to ("bad port"). The OS can hand one out as an
 * ephemeral port (where the local range starts low, e.g. 1024-65535), and then every request
 * to that server fails with `bad port` before it reaches the wire.
 */
export const FETCH_BAD_PORTS: ReadonlySet<number> = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10_080,
]);

/** The part of a `node:net` server (HTTP, HTTPS and HTTP/2 included) this helper uses. */
export type ListenableServer = {
  listen: (port: number, host: string, listening: () => void) => unknown;
  address: () => AddressInfo | string | null;
  close: (closed: () => void) => unknown;
  once: (event: "error", listener: (error: Error) => void) => unknown;
  off: (event: "error", listener: (error: Error) => void) => unknown;
};

function portOf(server: ListenableServer): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the server is not listening on a TCP port");
  }
  return address.port;
}

async function listenOnce(
  server: ListenableServer,
  host: string
): Promise<number> {
  // oxlint-disable-next-line promise/avoid-new -- wraps the callback listen API
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.off("error", reject);
      resolve(portOf(server));
    });
  });
}

async function unlisten(server: ListenableServer): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wraps the callback close API
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

/**
 * Listen on a free port of `host` that `fetch` will call, and return it. A test server must
 * use this instead of `listen(0)`: an ephemeral port on the fetch bad-port list fails every
 * request to it, a different test each run.
 */
export async function listenFetchable(
  server: ListenableServer,
  host = "127.0.0.1"
): Promise<number> {
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one port at a time until a usable one
    const port = await listenOnce(server, host);
    if (!FETCH_BAD_PORTS.has(port)) return port;
    // oxlint-disable-next-line eslint/no-await-in-loop -- free the bad port before the next try
    await unlisten(server);
  }
}
