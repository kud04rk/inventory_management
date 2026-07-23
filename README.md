# Inventory Manager

A simple, offline inventory management app for your Mac (Apple Silicon / M1). It runs as a normal
double-click application, stores all data **privately on your computer** in a local SQLite database,
and needs **no internet connection**.

Built with [Tauri v2](https://tauri.app) (tiny native app) + TypeScript + SQLite.

## Features

- **Raw materials / Finished goods toggle** — switch the top-bar toggle to view either stock type;
  the Dashboard and Inventory instantly filter to the selected type.
- **Dashboard** — totals at a glance: item count, units in stock, inventory value, low-stock alerts
  (for the selected stock type).
- **Inventory** — add, edit, delete items. Each item is a raw material or finished good. Live search
  by name/code/category and a category filter.
- **Transactions** — record stock in/out for any product from one place (pick a product, choose
  Add/Remove, enter quantity). Stock updates automatically. Full history with filters.
- **Low-stock alerts** — set a reorder level per item; items running low are highlighted and listed.
- **CSV stock statement** — export the current stock (raw materials or finished goods) to a `.csv`
  file, ready for Excel/Numbers.
- **Backup & restore** — export all data to a `.json` file and restore from a backup.
- Large, high-contrast, low-click interface designed to be easy to read and use.

## Requirements (one-time setup on your Mac)

1. **Xcode Command Line Tools**
   ```sh
   xcode-select --install
   ```
2. **Rust** (via rustup)
   ```sh
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
   Then restart your terminal (or run `source "$HOME/.cargo/env"`).
3. **Node.js 18+** — install from https://nodejs.org if you don't already have it.

> The first build downloads Rust dependencies and may take a few minutes. Subsequent builds are fast.

## Install dependencies

```sh
npm install
```

## Run the app (development)

```sh
npm run tauri dev
```

This opens the app window. Edits to files in `src/` hot-reload instantly.

## Build the double-click application

```sh
npm run tauri build
```

The finished app is created at:

```
src-tauri/target/release/bundle/macos/Inventory Manager.app
```

Copy `Inventory Manager.app` to your **Applications** folder and launch it like any other Mac app
(double-click, or via Spotlight). No terminal needed after this.

## Where your data is stored

All data lives in a local SQLite file on your Mac:

```
~/Library/Application Support/com.inventory.management/inventory.db
```

Nothing is sent over the internet. Use **Settings → Backup & restore** to keep a safe copy.

## Preview the interface in a browser (quick look)

You can view the UI in any browser without building the full app (uses temporary browser storage,
so changes won't be saved to the real database):

```sh
npm run dev
```

Then open the URL it prints (e.g. http://localhost:1420).

## Customise the app icon

Replace `src-tauri/icons/icon.png` (1024×1024) with your own, then regenerate all sizes:

```sh
npm run tauri icon src-tauri/icons/icon.png
```

## Tech notes

- **Frontend:** `src/` — plain TypeScript + CSS, bundled by Vite.
- **Backend:** `src-tauri/` — Rust; uses `tauri-plugin-sql` for SQLite. Schema lives in
  `src-tauri/migrations/` and is applied automatically on first run.
- **Verification:** `npm run build` (runs `tsc` type-check + Vite build).

## Troubleshooting

- **"tauri: command not found"** — run `npm install` first.
- **Build fails on Rust step** — ensure Xcode CLI tools and Rust are installed, then re-run.
- **App window is blank on first launch** — macOS may quarantine the app. Right-click the app and
  choose **Open** once to approve it.
