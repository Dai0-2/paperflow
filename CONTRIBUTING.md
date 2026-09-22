# Contributing

## Development

```bash
pnpm install
pnpm dev
```

Before submitting a change:

```bash
pnpm typecheck
pnpm build
```

Keep the side panel usable at 360, 400, and 440 px. Preserve keyboard navigation, focus states, reduced-motion support, dark mode, and long-content behavior.

## Product principles

- Paper-level memory comes before generic chat features.
- Keep the existing PDF reader intact.
- Prefer calm typography and spacing over nested cards.
- Do not add hidden data collection or transmit unnecessary PDF content.
- Do not add browser-cookie scraping, private ChatGPT endpoints, or plaintext token storage.
