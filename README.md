# Dropsea

Photos and files by Oxy. Dropsea organises what a person keeps in Oxy Files
into albums; the files themselves stay in Oxy Files. On the web it is
https://dropsea.net.

- `packages/frontend` — the app (Expo: iOS, Android, the web and OxyOS).
- `packages/backend` — the API (Express on Bun, Postgres through Drizzle, Oxy auth).
- `packages/shared-types` — the API's request and response shapes, shared with every client.

```bash
bun install
bun run --cwd packages/backend db:up       # local Postgres on 127.0.0.1:5434
bun run --cwd packages/backend db:migrate --target-database=dropsea_dev
bun run --cwd packages/backend dev
bun run test
```
