// Development-only, loopback-bound allowlist gateway for Auvrion IoT devices.
// Use instead of the previous port-8787 gateway, never run both simultaneously.
// Cloudflare Tunnel HTTPS terminates before localhost. This gateway never opens
// browser/admin routes and does not print bearer tokens or body contents.
import http from "node:http";

const allowed = new Set([
  "POST /api/device/recordings",
  "GET /api/device/remote",
  "POST /api/device/remote",
]);
const port = 8787;
const host = "127.0.0.1";
const maxAudioBytes = 10 * 1024 * 1024;
const server = http.createServer((req, res) => {
  const action = `${req.method} ${req.url}`;
  if (!allowed.has(action) || req.headers.origin || req.headers.cookie) {
    res.writeHead(404, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end('{"error":"NOT_FOUND"}');
    return;
  }
  if (
    req.headers.authorization?.startsWith("Bearer abdev_v1_") !== true ||
    typeof req.headers["x-device-id"] !== "string"
  ) {
    res.writeHead(401, { "Cache-Control": "no-store" });
    res.end();
    return;
  }
  const max = action === "POST /api/device/recordings" ? maxAudioBytes : 512;
  if (Number(req.headers["content-length"] ?? 0) > max) {
    res.writeHead(413, { "Cache-Control": "no-store" });
    res.end();
    return;
  }
  const headers = { ...req.headers, host: "127.0.0.1:3000" };
  delete headers["x-forwarded-proto"];
  delete headers["x-forwarded-host"];
  delete headers["x-forwarded-for"];
  delete headers.forwarded;
  const upstream = http.request(
    {
      host,
      port: 3000,
      method: req.method,
      path: req.url,
      headers,
      timeout: 45_000,
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, {
        "Content-Type": response.headers["content-type"] ?? "application/json",
        "Cache-Control": "no-store",
      });
      response.pipe(res);
    },
  );
  let received = 0;
  req.on("data", (chunk) => {
    received += chunk.length;
    if (received > max) {
      req.unpipe(upstream);
      upstream.destroy();
      if (!res.headersSent) res.writeHead(413, { "Cache-Control": "no-store" });
      res.end();
    }
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Cache-Control": "no-store" });
    res.end();
  });
  upstream.on("timeout", () => upstream.destroy());
  req.pipe(upstream);
});
server.listen(port, host, () => {
  console.log(
    `LISTEN device gateway on http://${host}:${port}; allowed POST recordings + GET/POST remote`,
  );
});
