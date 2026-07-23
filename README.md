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

## How to run / install on Mac

### 1. One-time setup (prerequisites)

Open **Terminal** and install the three tools Tauri needs:

```sh
# Xcode Command Line Tools (build tools)
xcode-select --install

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Node.js — download from https://nodejs.org (LTS) if you don't have it
node -v   # should print v18 or newer
```

### 2. Get the project & install dependencies

```sh
cd /path/to/inventory_management
npm install
```

### 3. Run it (development)

```sh
npm run tauri dev
```

The app window opens; edits to files in `src/` hot-reload instantly. Close the window/Terminal
to stop.

### 4. Build the installable app (production)

```sh
npm run tauri build
```

The first build downloads Rust crates and may take a few minutes. When it finishes, your app is at:

```
src-tauri/target/release/bundle/macos/Inventory Manager.app
```

### 5. Install it like any Mac app

1. Open that folder in Finder: `open src-tauri/target/release/bundle/macos`
2. Drag **Inventory Manager.app** into your **Applications** folder.
3. Launch it from Launchpad/Spotlight.

If macOS says it "can't be opened" (unidentified developer), right-click the app → **Open** →
**Open** to approve it once.

> To rebuild after code updates, run `npm run tauri build` again and replace the `.app`.

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
