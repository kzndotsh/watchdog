import { responseGone, type Handler } from "./loopback-server";

export type RouteState = {
  /** Port of the plain server that redirects point at. */
  readonly otherPort: () => number;
  /** Port of the server being routed (for redirects to a name on it). */
  readonly port: () => number;
  /** Called when the client closes the endless `/big` response. */
  readonly onBigClosed: () => void;
};

/** The routes the protection tests talk to; the same on HTTP/1.1 and HTTP/2 servers. */
export function createRoute(state: RouteState): Handler {
  return (req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://x");
    const redirect = (status: number, location: string) => {
      res.writeHead(status, { location });
      res.end("");
    };
    switch (pathname) {
      case "/ok": {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("hello");
        return;
      }
      case "/to-ok": {
        redirect(302, "/ok");
        return;
      }
      case "/to-metadata": {
        redirect(302, "http://169.254.169.254/latest/meta");
        return;
      }
      case "/to-mapped": {
        redirect(302, "http://[::ffff:10.0.0.5]/");
        return;
      }
      case "/to-ipv6-loopback": {
        redirect(302, "http://[::1]/");
        return;
      }
      case "/to-name": {
        redirect(302, `http://internal.test:${state.port()}/ok`);
        return;
      }
      case "/to-file": {
        redirect(302, "file:///etc/hosts");
        return;
      }
      case "/to-other": {
        redirect(302, `http://127.0.0.1:${state.otherPort()}/headers`);
        return;
      }
      case "/to-other-307": {
        redirect(307, `http://127.0.0.1:${state.otherPort()}/headers`);
        return;
      }
      case "/to-same-307": {
        redirect(307, "/echo-body");
        return;
      }
      case "/echo-body": {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          res.writeHead(200);
          res.end(Buffer.concat(chunks).toString("utf-8"));
        });
        return;
      }
      case "/loop": {
        redirect(302, "/loop");
        return;
      }
      case "/big": {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.on("close", state.onBigClosed);
        const chunk = Buffer.alloc(64 * 1024, 97);
        const pump = () => {
          while (!responseGone(res) && res.write(chunk)) {
            // keep writing until the client backs off or goes away
          }
          if (!responseGone(res)) res.once("drain", pump);
        };
        pump();
        return;
      }
      case "/declared-big": {
        res.writeHead(200, { "content-length": String(50 * 1024 * 1024) });
        if (req.method === "HEAD") {
          res.end("");
          return;
        }
        res.write("start");
        break;
      }
      case "/stall-headers": {
        // Never answers: the request is left pending on purpose.
        break;
      }
      case "/stall-body": {
        res.writeHead(200, { "content-length": "1000" });
        res.write("partial");
        return;
      }
      default: {
        res.writeHead(404);
        res.end("");
      }
    }
  };
}
