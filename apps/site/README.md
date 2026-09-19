# `@watchdog/site`

Static marketing site for Watchdog (Astro 7 + Tailwind v4). Deploy artifact: `dist/`. Product app remains `apps/web` (`app.watchdog.com` / `:3000` locally).

## Deploy / env

- **`PUBLIC_APP_URL`** (root `.env`, Astro build-time): base URL for **Sign in** and product CTAs. Local default: `http://127.0.0.1:3000`. Production: `https://app.watchdog.com`.
- Docs links on the page point at GitHub `docs/README.md` (not served from this app).

## Dev

```bash
pnpm dev:site    # http://127.0.0.1:3001
pnpm build:site  # apps/site/dist/
```

Set `PUBLIC_APP_URL` in root `.env` (default local: `http://127.0.0.1:3000`) so **Sign in** links to the product app.

## Deviations from product DS

Marketing-only primitives: pill `PrimaryButton` inverted on the primary variant (accent reserved for small highlights, not CTA fill). No shadcn / React islands in v1.

Contracts and product nouns: [`docs/`](../../docs/README.md) · [`AGENTS.md`](AGENTS.md)
