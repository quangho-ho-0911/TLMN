# Repository Guidelines

## Project Structure & Module Organization
- Root is an npm workspace with two packages: `client/` (React + Vite + TypeScript) and `server/` (Node + Express + Socket.IO + TypeScript).
- Client app code lives in `client/src/` (`App.tsx`, `lib/`, `assets/`); static files are in `client/public/`.
- Server runtime code lives in `server/src/` (`game/`, `rules/`, `index.ts`); compiled output goes to `server/dist/`.
- Tests are currently server-focused in `server/test/` with `*.test.ts` naming.
- Product and rules docs are in `docs/`.

## Build, Test, and Development Commands
- `npm install`: install workspace dependencies.
- `npm run dev`: run server and client concurrently for local development.
- `npm run build`: build client bundle and compile server TypeScript.
- `npm start`: build, then run the server from `server/dist/index.js`.
- `npm test`: run server tests with Vitest (`vitest run`).
- `npm -w client run lint`: lint client TypeScript/React files with ESLint.

## Coding Style & Naming Conventions
- Use TypeScript with `strict` mode; keep types explicit at public boundaries.
- Match existing style: semicolons in server code, 2-space indentation, single quotes.
- Use `camelCase` for variables/functions, `PascalCase` for React components/types, and descriptive domain names (`roomPublic`, `applyPlay`).
- Keep modules small and domain-oriented (`server/src/game`, `server/src/rules`, `client/src/lib`).

## Testing Guidelines
- Framework: Vitest (`server/vitest.config.ts`, Node environment).
- Add tests under `server/test/` as `*.test.ts`; prefer behavior-first names (example: `scoring.integration.test.ts`).
- Cover gameplay engine and scoring rule changes with deterministic fixtures/seeds where possible.
- Run `npm test` before opening a PR.

## Commit & Pull Request Guidelines
- Follow existing history style: concise imperative subject; Conventional Commit style is preferred (example: `feat: ...`, `fix: ...`).
- Keep commits focused by scope (`client`, `server`, or `docs`).
- PRs should include:
  - clear summary of user-visible and technical changes,
  - linked issue/task (if available),
  - screenshots or short recordings for UI updates,
  - confirmation that `npm test` and relevant lint/build commands pass.

## Security & Configuration Tips
- Runtime tuning uses env vars: `TURN_MS`, `REMATCH_MS`, `PAIR_WHITE_RATE`.
- Do not commit secrets or machine-specific `.env` files.
- Validate server-side game actions; client state is not authoritative.
