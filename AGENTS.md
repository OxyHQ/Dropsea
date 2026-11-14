# Dropsea

Photos and files by Oxy: organises what a person keeps in Oxy Files into albums; it never stores bytes.

## Commands

```bash
bun install
bun run --cwd packages/backend db:up        # local Postgres on 127.0.0.1:5434
bun run --cwd packages/backend db:migrate --target-database=dropsea_dev
bun run --cwd packages/backend dev          # API
bun run --cwd packages/frontend web         # Expo web app
bun run typecheck                           # shared-types, backend, frontend
bun run test                                # backend + frontend
bun run lint                                # Biome; lint:fix and format write
bun run doctor:oxy                          # Oxy dependency freshness
bun run --cwd packages/backend db:generate  # Drizzle migration after a schema change
```

## Map

- `packages/frontend` (Expo app), `packages/backend` (Express on Bun, Drizzle), `packages/shared-types` (API shapes shared with clients).
- `docs/adr/` holds design decisions; read the ADR before changing tags or undo.
- `docs/agent-rules.md` holds the code, error-handling, security and verification rules.
- `.github/workflows/` holds CI and the web deploy.

## Conventions that differ from defaults

- Package manager is bun; use `bunx`, never npm, npx or yarn. CI installs with `--frozen-lockfile`.
- Commit `bun.lock` in the same commit as the `package.json` change that caused it, or the next PR fails CI.
- Dropsea stores no bytes. The person's own client uploads (`oxy.assets.upload`) and links the file to this application (`oxy.assets.link`); the link is how the person adds it to Dropsea, and without it the backend cannot read the file (`files:linked:read`, oxy ADR 0021).
- First-party never asks people for permissions: this app acts for a person with `actingFor` on what oxy's first-party registry declares (oxy ADR 0066); permissions, scopes and consent are only for third parties.
- The backend returns asset ids and never mints a URL; each client resolves ids with its own session (`oxy.assets.urls`), so a private photo is only readable by someone Oxy allows.
- Seed colours are computed once when an item is added (`@oxy.so/bloom/color-engine` over a 48x48 thumbnail) and travel with the item, so screens theme without reading pixels.
- Size and capture time are read from the bytes when the item is added and copied onto the row, because Oxy Files keeps no capture time and a page must not need a call per photo.
- Every environment-dependent value comes from an environment variable; document it in the package's `.env.example`.

## Boundaries

Never:
- Commit `.env`, tokens or credentials; they leak through git history.
- Add `as any`, `@ts-ignore`, `!` assertions or `console.log`; the full list is in `docs/agent-rules.md`.
- Force-push a shared branch; others rebase on it.

Ask first:
- Before changing the Oxy-linked asset flow above; it decides which files the backend can read.
- When the first approach fails or is rejected; ask which direction to take rather than stacking workarounds.

## Testing

- Run `bun run typecheck` and `bun run test` for any code change; CI also runs `biome ci .`, `doctor:oxy` and the migrations against `dropsea_test`.
- Layout, navigation and animation changes need a check in a real foregrounded browser or device build; types and unit tests do not catch them.
- Done means CI green and the original symptom re-checked against the real request path.

## PR and commit rules

- Imperative commit messages that say why; one logical change per commit; PR title under 70 characters.
- PR body states what changed, why and how it was tested.
- Scope `git add` to the paths you touched; never `git add -A` where another session may have uncommitted work.

## Secrets

Values come from environment variables (see `packages/backend/.env.example` and `packages/frontend/.env.example`) and repository variables for the web deploy. Never print or paste them.

## Links

- [Engineering rules](docs/agent-rules.md)
- [Oxy engineering standards](https://github.com/OxyHQ/oxy/blob/main/docs/engineering/standards.md)
- [Lint and format](https://github.com/OxyHQ/oxy/blob/main/docs/engineering/lint-and-format.md)
- [npm releases](https://github.com/OxyHQ/oxy/blob/main/docs/npm-releases.md)
- [Postgres and Drizzle](https://github.com/OxyHQ/oxy/blob/main/docs/postgres-and-drizzle.md)
- [Bloom app conventions](https://github.com/OxyHQ/Bloom/blob/main/docs/app-conventions.mdx)

Owner: Nate Isern (OxyHQ). Last reviewed: 2026-11-11.
