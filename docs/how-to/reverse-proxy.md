# Reverse proxy and TLS

**What this is:** publishing a self-hosted Watchdog on HTTPS: a Caddy (and an nginx) example for the app and for the object store, `BETTER_AUTH_URL`, `S3_PUBLIC_URL`, and the CORS rule browsers need for Evidence uploads.  
**What this is not:** the install itself ([`self-host`](self-host.md)), or app-level origins and security headers.

The compose stack binds the app and the store to loopback only (`127.0.0.1:3000` and `127.0.0.1:9100`). Nothing is reachable from the network until a proxy publishes it. You need two public names, both with TLS:

| Name | Proxies to | Used by |
| --- | --- | --- |
| `app.example.com` | `127.0.0.1:3000` (web) | everyone: the app and `/api/v1` |
| `files.example.com` | `127.0.0.1:9100` (object store) | the browser, for presigned Evidence uploads and downloads |

Why the second name: the browser sends Evidence files straight to object storage with presigned URLs, so the store must be reachable from the user's machine over HTTPS (a page served over HTTPS cannot call `http://s3:8333`). The server still reaches the store on the compose network.

## Configure Watchdog

In `.env.production`:

```bash
# The exact URL users type, scheme included, no trailing slash. Also the CORS origin of the bucket.
BETTER_AUTH_URL=https://app.example.com
# Where browsers reach the store. Presigned URLs are signed for this address.
S3_PUBLIC_URL=https://files.example.com
# Leave S3_ENDPOINT unset: web and worker keep using http://s3:8333 inside the compose network.
```

Then recreate the containers so they read it (`BETTER_AUTH_URL` also sets the bucket's CORS origin, which `s3-init` applies on `up`):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

The Content Security Policy follows it: the page may connect to and load images from the origin of `S3_PUBLIC_URL` (else `S3_ENDPOINT`) and nowhere else, so the public store name needs no other setting ([`self-host`](self-host.md#security-headers-and-cross-origin-access)). `S3_PUBLIC_URL` only changes the host of presigned links. Without it they point at `S3_ENDPOINT`, which works on a single machine and nowhere else. Presigned URLs carry a SigV4 signature over the `Host` header, so the proxy must hand the store the same host the browser used: both examples below do, and `proxy_set_header Host` in nginx or `header_up Host` is the line to check if uploads fail with `SignatureDoesNotMatch`.

## Caddy

Caddy gets and renews certificates by itself. On the Docker host:

```caddyfile
app.example.com {
	reverse_proxy 127.0.0.1:3000
}

files.example.com {
	reverse_proxy 127.0.0.1:9100
}
```

That is the whole file. Caddy keeps the original `Host`, streams the live-update connection (`/api/events`, server-sent events) without buffering, and has no body limit. Point both DNS names at the host and open ports 80 and 443; keep 3000 and 9100 closed to the outside.

## nginx

With certificates from certbot (paths are the Let's Encrypt defaults):

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name app.example.com;
    ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Live updates are server-sent events: do not buffer them.
    location /api/events {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name files.example.com;
    ssl_certificate     /etc/letsencrypt/live/files.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/files.example.com/privkey.pem;

    # Evidence files are uploaded in one request; nginx's default limit is 1 MB.
    client_max_body_size 0;

    location / {
        proxy_pass http://127.0.0.1:9100;
        # The presigned signature covers the host: pass it through unchanged.
        proxy_set_header Host $host;
        proxy_request_buffering off;
    }
}

server {
    listen 80;
    server_name app.example.com files.example.com;
    return 301 https://$host$request_uri;
}
```

Do not add CORS headers in nginx or Caddy: the store answers the browser's preflight itself from the bucket rule below, and a second `Access-Control-Allow-Origin` makes browsers reject the response.

## CORS for browser uploads

The browser `PUT`s the file to `https://files.example.com/...` from a page on `https://app.example.com`, a cross-origin request, so the bucket must allow that origin. The rule:

| Setting | Value |
| --- | --- |
| Allowed origin | exactly `BETTER_AUTH_URL` (`https://app.example.com`), no trailing slash, not `*` |
| Allowed methods | `PUT`, `GET`, `HEAD` |
| Allowed headers | `*` (the upload sends `content-type` and `x-amz-meta-sha256`) |
| Exposed headers | `ETag` |

- **The bundled store (SeaweedFS):** nothing to do. `s3-init` sets this rule on every `up` from `BETTER_AUTH_URL`. To allow another origin as well (a second hostname for the app), run the script by hand with the origins listed, space-separated: `S3_ENDPOINT=http://127.0.0.1:9100 S3_ACCESS_KEY=... S3_SECRET_KEY=... S3_CORS_ORIGINS="https://app.example.com https://other.example.com" sh scripts/s3-init.sh`.
- **An external store (AWS S3, Cloudflare R2, MinIO):** set `S3_ENDPOINT` to its API URL, drop `S3_PUBLIC_URL` if that URL is already public, and apply the rule in the provider. For AWS S3 (Permissions, Cross-origin resource sharing):

  ```json
  [
    {
      "AllowedOrigins": ["https://app.example.com"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```

  R2 and MinIO take the same rule in their own format (`mc cors set` for MinIO, the bucket's CORS policy in the Cloudflare dashboard). The bundled `s3` and `s3-init` services are then unused; remove them and their `depends_on` entries from your copy of the compose file.

Check it from a terminal. A preflight for an allowed origin returns `Access-Control-Allow-Origin` with that origin:

```bash
curl -si -X OPTIONS "https://files.example.com/watchdog-evidence/x" \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type,x-amz-meta-sha256" | grep -i "^access-control"
```

## Check the whole path

```bash
curl -fsS https://app.example.com/api/v1/ready   # {"ok":true,"database":"ok","storage":"ok"}
```

Then sign in and upload an Evidence file in a Case. A browser console error naming CORS means the bucket rule does not list the exact app origin; `SignatureDoesNotMatch` means the proxy changed the `Host` header; a hang on upload means `files.example.com` is not reachable from the user's network.
