# AGENTS.md

## Project

Local inventory management desktop app (Tauri v2 + TypeScript + SQLite).
Targets macOS (Apple Silicon). Dev/preview can run on any OS with Node.

## Commands

- `npm install` — install dependencies
- `npm run dev` — Vite dev server (UI preview in browser, temporary localStorage data)
- `npm run tauri dev` — run the full native app (requires Rust + system deps)
- `npm run build` — **typecheck (`tsc --noEmit` via `tsc`) + Vite build**. Run this to verify changes.
- `npm run tauri build` — produce the macOS `.app` bundle

Always run `npm run build` after frontend changes to confirm the TypeScript compiles.

## Structure

- `src/` — frontend (TypeScript + CSS), entry `src/main.ts`
- `src/db.ts` — data layer. Real SQLite via `@tauri-apps/plugin-sql` when running in Tauri;
  localStorage-backed mock when running in a plain browser (preview).
- `src/views/` — dashboard, inventory, movements, settings, forms
- `src-tauri/` — Rust backend + Tauri config
- `src-tauri/migrations/` — SQLite schema (auto-applied on first run)

## Conventions

- TypeScript is in strict mode with `noUnusedLocals`/`noUnusedParameters`. Do not leave unused imports.
- No comments in code unless requested.
- Build the DOM with the `h()` helper in `src/ui.ts`. Use `h<HTMLButtonElement>(...)` when you need
  `.disabled` or other button-specific properties.
