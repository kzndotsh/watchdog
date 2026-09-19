# `@watchdog/site`

Static marketing site for Watchdog (Astro 6 + Tailwind v4). Deploy artifact: `dist/`.

## Dev

```bash
pnpm dev:site    # http://127.0.0.1:3001
pnpm build:site  # apps/site/dist/
```

Set `PUBLIC_APP_URL` in root `.env` (default local: `http://127.0.0.1:3000`) so **Sign in** links to the product app.

## Deviations from product DS

Marketing-only primitives: pill `PrimaryButton` inverted on the primary variant (accent reserved for small highlights, not CTA fill). No shadcn / React islands in v1.

Contracts and product nouns: [`docs/`](../../docs/README.md) · [`AGENTS.md`](AGENTS.md)
