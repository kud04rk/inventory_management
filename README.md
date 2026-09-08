# 📦 Inventory Manager

### Run your stock, sales, and staff — all from one private, offline desktop app.

**Inventory Manager** is a blazing-fast, privacy-first desktop app that helps small
businesses and workshops track **raw materials, finished goods, sales, purchases,
profitability, and employee attendance** — without a single byte leaving your computer.

No subscriptions. No cloud. No internet required. Just you, your data, and a clean,
distraction-free interface that gets out of your way.

> Built with [Tauri v2](https://tauri.app) · TypeScript · SQLite · runs natively on Windows, Linux, and macOS.

---

## ✨ Why Inventory Manager?

| | |
| :-- | :-- |
| 🔒 **100% Private & Offline** | All data lives in a local SQLite file on your computer. Nothing is ever uploaded. |
| ⚡ **Lightning Fast** | A tiny native app — not a sluggish browser tab. Opens instantly, runs smooth. |
| 💰 **Know Your Numbers** | Real-time revenue, gross profit, margins, and inventory value at a glance. |
| 🧮 **Smart Costing (FIFO)** | Cost of goods sold is calculated automatically using FIFO — no spreadsheets needed. |
| 🗓️ **Staff Attendance Built-In** | Track who showed up, overtime, and export payroll-ready CSVs. |
| 🎯 **Never Run Out of Stock** | Low-stock alerts and a one-click restocking panel keep your shelves full. |
| 🖥️ **Native Desktop Experience** | Double-click the installer and you're done — on Windows, Linux, or Mac. No setup gymnastics. |

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

There are two ways to get Inventory Manager: **install a pre-built app**, or **build it yourself**. The app runs natively on **Windows, Linux, and macOS**.

### Option A — Use a pre-built app (end users)

#### 🪟 Windows

1. Get the installer: `Inventory Manager_0.1.0_x64-setup.exe`.
2. Double-click it and follow the prompts (the bundled WebView2 runtime installs automatically if needed).
3. Launch **Inventory Manager** from the **Start menu**.

> If SmartScreen shows "Windows protected your PC", click **More info → Run anyway** — the app isn't code-signed.

#### 🐧 Linux

Pick the format that matches your distribution:

```sh
# Ubuntu / Debian (.deb)
sudo apt install ./inventory-manager_0.1.0_amd64.deb

# Fedora / RHEL (.rpm)
sudo dnf install ./inventory-manager-0.1.0-1.x86_64.rpm
```

Or use the distro-agnostic **AppImage** (the recommended option for Arch and other distros):

```sh
chmod +x inventory-manager_0.1.0_amd64.AppImage
./inventory-manager_0.1.0_amd64.AppImage
```

> If the AppImage won't launch, install FUSE (`sudo apt install libfuse2`) or run it with `--appimage-extract-and-run`.

#### 🍎 macOS

1. Get the `Inventory Manager.app` bundle.
2. Drag it into your **Applications** folder.
3. Launch it from **Launchpad** or **Spotlight**.

> If macOS warns it "can't be opened" (unidentified developer), **right-click** the app → **Open** → **Open** to approve it once.

### Option B — Build it yourself (developers)

#### 1. One-time prerequisites

**🪟 Windows**

- [Node.js LTS](https://nodejs.org)
- [Rust (MSVC toolchain)](https://www.rust-lang.org/tools/install)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **"Desktop development with C++"** workload and the **Windows 10/11 SDK**
- WebView2 Runtime — pre-installed on Windows 10/11; the installer downloads it if missing

**🐧 Linux (Debian / Ubuntu)**

```sh
sudo apt update
sudo apt install -y build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev \
  librsvg2-dev libwebkit2gtk-4.1-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

**🐧 Linux (Fedora)**

```sh
sudo dnf install -y gcc gcc-c++ curl wget file \
  libxdo-devel libssl-devel ayatana-appindicator3-devel \
  librsvg2-devel webkit2gtk4.1-devel
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

**🐧 Linux (Arch)**

```sh
sudo pacman -Syu
sudo pacman -S --needed base-devel curl wget file \
  libxdo libayatana-appindicator librsvg webkit2gtk-4.1
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

**🍎 macOS**

```sh
# Xcode Command Line Tools (build tools)
xcode-select --install

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

**All platforms:** install [Node.js LTS](https://nodejs.org) if you don't have it, and verify with `node -v` (v18 or newer).

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

The app window opens, and edits to files in `src/` hot-reload instantly. Close the window/terminal to stop.

#### 4. Build the installable production app

```sh
npm run tauri build
```

The first build downloads Rust crates and may take a few minutes. When it finishes, the installers are in `src-tauri/target/release/bundle/`:

| OS | Installer(s) |
| :-- | :-- |
| 🪟 Windows | `nsis\Inventory Manager_0.1.0_x64-setup.exe` · `msi\Inventory Manager_0.1.0_x64_en-US.msi` |
| 🐧 Linux | `debian/inventory-manager_0.1.0_amd64.deb` · `appimage/inventory-manager_0.1.0_amd64.AppImage` · `rpm/inventory-manager-0.1.0-1.x86_64.rpm` |
| 🍎 macOS | `macos/Inventory Manager.app` |

Install the artifact for your OS (double-click the `.exe`, `sudo apt install ./…deb`, or drag the `.app` to Applications). To rebuild after code updates, run `npm run tauri build` again and replace the installed app.

> 💻 **No Rust toolchain handy?** You can still preview the interface in any browser (data is temporary and browser-only):
> ```sh
> npm run dev
> ```
> Then open the URL it prints (e.g. http://localhost:1420).

---

## 📖 Using the App

1. **First launch** — go to **Settings**, set your store name and currency symbol.
2. **Add items** — click **+ Add item** in the top bar. Include SKU, category, unit, price, and a reorder level to enable low-stock alerts.
3. **Record stock** — use **Stock in** for purchases and **Stock out** for sales. Quantities and FIFO costs update automatically.
4. **Watch the Dashboard** — monthly revenue, gross profit, inventory value, top sellers, and restock alerts update as you work.
5. **Track staff** — add people under **Employees**, then mark attendance on the calendar in **Attendance**.
6. **Export when needed** — download stock statements as CSV (opens cleanly in Excel/LibreOffice) and per-employee attendance as payroll-ready CSV.
7. **Back up regularly** — **Settings → Export backup (.json)**. Keep the file anywhere; restore it later with **Restore from backup**.

---

## 🗃️ Where Your Data Lives

Everything is stored privately on your computer in a local SQLite file:

| OS | Database location |
| :-- | :-- |
| 🪟 Windows | `%APPDATA%\com.inventory.management\inventory.db` |
| 🐧 Linux | `~/.config/com.inventory.management/inventory.db` |
| 🍎 macOS | `~/Library/Application Support/com.inventory.management/inventory.db` |

**Nothing is sent over the internet.** Use **Settings → Backup & restore** to keep a safe `.json` copy — backups are plain JSON and can be restored on any OS (e.g. move from Windows to Linux).

---

## 🛠️ Tech Stack

| Layer | Technology |
| :-- | :-- |
| **Desktop shell** | [Tauri v2](https://tauri.app) (Rust) — tiny, fast, native |
| **Frontend** | Plain TypeScript + CSS, bundled by [Vite](https://vitejs.dev) |
| **Database** | SQLite via `tauri-plugin-sql`; schema in `src-tauri/migrations/` (auto-applied on first run) |
| **Costing** | Automatic FIFO cost-of-goods-sold engine |
| **Platform** | Windows 10/11 · Linux (deb/rpm/AppImage) · macOS (Apple Silicon) |

**Verification:** `npm run build` runs a `tsc` type-check + Vite build to confirm everything compiles.

---

## 🎨 Customize the App Icon

Replace `src-tauri/icons/icon.png` (1024×1024) with your own, then regenerate all sizes:

```sh
npm run tauri icon src-tauri/icons/icon.png
```

---

## 🧯 Troubleshooting

**All platforms**

- **`tauri: command not found`** — run `npm install` first.
- **Build fails on the Rust step** — confirm Rust is installed (`rustc --version`), then re-run `npm run tauri build`.

**🪟 Windows**

- **SmartScreen blocks the installer** — click **More info → Run anyway**.
- **`link.exe not found`** — install Visual Studio Build Tools with the "Desktop development with C++" workload, then rebuild.
- **Blank window** — install the [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) and relaunch.

**🐧 Linux**

- **`error: linker cc not found`** — install `build-essential` (Debian/Ubuntu), `gcc gcc-c++` (Fedora), or `base-devel` (Arch).
- **AppImage doesn't launch** — install `libfuse2`, or run with `--appimage-extract-and-run`.
- **`.deb`/`.rpm` install fails on dependencies** — use `sudo apt install ./inventory-manager_*.deb` so apt resolves dependencies automatically; avoid `dpkg -i` alone.

**🍎 macOS**

- **App window is blank on first launch** — macOS may quarantine the app. Right-click it and choose **Open** once to approve it.

---

<p align="center"><strong>Your business. Your data. Your computer.</strong></p>
