# 📦 Inventory Manager

### Run your stock, sales, and staff — all from one private, offline Mac app.

**Inventory Manager** is a blazing-fast, privacy-first desktop app that helps small
businesses and workshops track **raw materials, finished goods, sales, purchases,
profitability, and employee attendance** — without a single byte leaving your computer.

No subscriptions. No cloud. No internet required. Just you, your data, and a clean,
distraction-free interface that gets out of your way.

> Built with [Tauri v2](https://tauri.app) · TypeScript · SQLite · designed for macOS (Apple Silicon).

---

## ✨ Why Inventory Manager?

| | |
| :-- | :-- |
| 🔒 **100% Private & Offline** | All data lives in a local SQLite file on your Mac. Nothing is ever uploaded. |
| ⚡ **Lightning Fast** | A tiny native app — not a sluggish browser tab. Opens instantly, runs smooth. |
| 💰 **Know Your Numbers** | Real-time revenue, gross profit, margins, and inventory value at a glance. |
| 🧮 **Smart Costing (FIFO)** | Cost of goods sold is calculated automatically using FIFO — no spreadsheets needed. |
| 🗓️ **Staff Attendance Built-In** | Track who showed up, overtime, and export payroll-ready CSVs. |
| 🎯 **Never Run Out of Stock** | Low-stock alerts and a one-click restocking panel keep your shelves full. |
| 🖥️ **Native Mac Experience** | Double-click `.app`, drag to Applications, and you're done. No setup gymnastics. |

---

## 🚀 Features

### 📊 Dashboard — Your Business at a Glance
- **Financial KPIs** for the month: Revenue, Gross Profit (with live margin %), Purchases, and total Inventory Value.
- **Stock overview**: item count, units in stock, number of categories, and low-stock alerts.
- **Needs restocking** panel highlighting every item below its reorder level — restock in one click.
- **Top sellers** leaderboard showing your best-performing products by units and revenue.
- **Attendance snapshot**: present today, attendance rate, headcount, and a present/leave/absent breakdown bar.
- **Recent activity** feed of the latest stock movements.

### 🗄️ Inventory — Total Control Over Your Stock
- Toggle between **Raw Materials** and **Finished Goods** — the whole app filters instantly.
- Add, edit, and delete items with rich details: SKU/code, category, unit (kg, pcs, bag, drum, liter), price, location, reorder level, and notes.
- **Live search** by name, code, or category, plus a category filter.
- Set a **reorder level** per item to trigger low-stock alerts.

### 🔄 Transactions — Every Movement, Perfectly Tracked
- Record **stock in** (purchases) and **stock out** (sales) from one place.
- Stock quantities update **automatically** with every transaction.
- **Automatic FIFO costing** — cost of goods sold is computed from your purchase history.
- Full, filterable **movement history** with reasons and notes.

### 🗓️ Attendance — Staff Timekeeping, Simplified
- Beautiful **monthly calendar** per employee.
- One click to mark a day: **Present → Leave → Unmarked**.
- Track **overtime hours** on any present day.
- Monthly summary: days present, on leave, and total overtime.
- Color-coded legend and "today" highlighting.

### 👥 Employees — Your Team Directory
- Add and manage employees in seconds.
- Pick a month/year per person and **export their attendance to CSV** — ready for payroll, Excel, or Numbers.

### 🔧 Settings & Data Safety
- Set your **store name** and **currency symbol**.
- **Backup & restore**: export your entire database to a `.json` file and restore it anytime.
- **CSV export** of current stock statements (raw materials or finished goods).
- **Danger zone** to safely reset data when needed.

---

## 📥 Installation

There are two ways to get Inventory Manager: **install a pre-built app**, or **build it yourself**.

### Option A — Use a pre-built app (end users)

1. Get the `Inventory Manager.app` bundle.
2. Drag it into your **Applications** folder.
3. Launch it from **Launchpad** or **Spotlight**.

> If macOS warns it "can't be opened" (unidentified developer), **right-click** the app → **Open** → **Open** to approve it once.

### Option B — Build it yourself (developers)

#### 1. One-time prerequisites

Open **Terminal** and install the tools Tauri needs:

```sh
# Xcode Command Line Tools (build tools)
xcode-select --install

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Node.js (LTS) — download from https://nodejs.org if you don't have it
node -v   # should print v18 or newer
```

#### 2. Get the project & install dependencies

```sh
git clone <your-repo-url> inventory_management
cd inventory_management
npm install
```

#### 3. Run it in development

```sh
npm run tauri dev
```

The app window opens, and edits to files in `src/` hot-reload instantly. Close the window/Terminal to stop.

#### 4. Build the installable production app

```sh
npm run tauri build
```

The first build downloads Rust crates and may take a few minutes. When it finishes, your app is at:

```
src-tauri/target/release/bundle/macos/Inventory Manager.app
```

Then install it like any Mac app:

```sh
open src-tauri/target/release/bundle/macos
```

Drag **Inventory Manager.app** into your **Applications** folder. To rebuild after code updates, run `npm run tauri build` again and replace the `.app`.

> 💻 **Not on a Mac?** You can still preview the interface in any browser (changes won't be saved to the real database):
> ```sh
> npm run dev
> ```
> Then open the URL it prints (e.g. http://localhost:1420).

---

## 🗃️ Where Your Data Lives

Everything is stored privately on your Mac in a local SQLite file:

```
~/Library/Application Support/com.inventory.management/inventory.db
```

**Nothing is sent over the internet.** Use **Settings → Backup & restore** to keep a safe `.json` copy.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :-- | :-- |
| **Desktop shell** | [Tauri v2](https://tauri.app) (Rust) — tiny, fast, native |
| **Frontend** | Plain TypeScript + CSS, bundled by [Vite](https://vitejs.dev) |
| **Database** | SQLite via `tauri-plugin-sql`; schema in `src-tauri/migrations/` (auto-applied on first run) |
| **Costing** | Automatic FIFO cost-of-goods-sold engine |
| **Platform** | macOS (Apple Silicon / M1+) |

**Verification:** `npm run build` runs a `tsc` type-check + Vite build to confirm everything compiles.

---

## 🎨 Customize the App Icon

Replace `src-tauri/icons/icon.png` (1024×1024) with your own, then regenerate all sizes:

```sh
npm run tauri icon src-tauri/icons/icon.png
```

---

## 🧯 Troubleshooting

- **`tauri: command not found`** — run `npm install` first.
- **Build fails on the Rust step** — ensure Xcode CLI tools and Rust are installed, then re-run.
- **App window is blank on first launch** — macOS may quarantine the app. Right-click the app and choose **Open** once to approve it.

---

<p align="center"><strong>Your business. Your data. Your Mac.</strong></p>
