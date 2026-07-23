import "./styles.css"
import { db, initDb, isPreview } from "./db"
import type { Item, ItemType, Settings, ViewCtx, ViewName } from "./types"
import { clear, h } from "./ui"
import { renderDashboard } from "./views/dashboard"
import { renderInventory } from "./views/inventory"
import { renderMovements } from "./views/movements"
import { renderSettings } from "./views/settings"
import { openItemForm, openStockModal, openTransactionForm } from "./views/forms"

// ---- icons ----
const ICON_LOGO = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`

const ICON_GRID = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`

const ICON_BOX = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`

const ICON_SWAP = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`

const ICON_GEAR = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`

const NAV: { view: ViewName; label: string; icon: string }[] = [
  { view: "dashboard", label: "Dashboard", icon: ICON_GRID },
  { view: "inventory", label: "Inventory", icon: ICON_BOX },
  { view: "movements", label: "Transactions", icon: ICON_SWAP },
  { view: "settings", label: "Settings", icon: ICON_GEAR },
]

const TITLES: Record<ViewName, string> = {
  dashboard: "Dashboard",
  inventory: "Inventory",
  movements: "Transactions",
  settings: "Settings",
}

const TYPE_LABEL: Record<ItemType, string> = {
  raw: "Raw materials",
  finished: "Finished goods",
}

let currentView: ViewName = "dashboard"
let stockType: ItemType = "finished"
let settings: Settings = { currency: "₹", storeName: "My Store" }
let navButtons: HTMLButtonElement[] = []
let typeToggleBtns: HTMLButtonElement[] = []
let pageTitle: HTMLElement
let content: HTMLElement

async function boot(): Promise<void> {
  await initDb()
  settings = await db.getSettings()
  renderShell()
  await renderView(currentView)
}

function renderShell(): void {
  clear(document.body)

  const brand = h("div", { class: "brand" }, [
    h("div", { class: "brand-mark", html: ICON_LOGO }),
    h("div", { class: "brand-text" }, [
      h("div", { class: "brand-name", text: settings.storeName }),
      h("div", { class: "brand-sub", text: "Inventory" }),
    ]),
  ])

  navButtons = NAV.map((n) =>
    h("button", {
      class: "nav-btn",
      type: "button",
      "data-view": n.view,
      onclick: () => go(n.view),
    }, [
      h("span", { class: "nav-icon", html: n.icon }),
      h("span", { class: "nav-label", text: n.label }),
    ]),
  )

  const footer = h("div", { class: "sidebar-footer" }, [
    isPreview()
      ? h("span", { class: "muted small", text: "Preview mode" })
      : h("span", { class: "muted small", text: "Saved on this Mac" }),
  ])

  const sidebar = h("aside", { class: "sidebar" }, [
    brand,
    h("nav", { class: "nav" }, navButtons),
    footer,
  ])

  const addBtn = h("button", { class: "btn btn-primary btn-add", type: "button", onclick: () => openItemForm(ctx()) }, [
    h("span", { class: "plus", text: "+" }),
    " Add item",
  ])

  pageTitle = h("h1", { class: "page-title", text: TITLES[currentView] })

  typeToggleBtns = (["raw", "finished"] as ItemType[]).map((t) =>
    h<HTMLButtonElement>("button", {
      class: "seg",
      type: "button",
      "data-type": t,
      onclick: () => setType(t),
    }, [TYPE_LABEL[t]]),
  )
  const typeToggle = h("div", { class: "segmented type-switch", "aria-label": "Stock type" }, typeToggleBtns)

  const topbarLeft = h("div", { class: "topbar-left" }, [pageTitle, typeToggle])
  const topbar = h("header", { class: "topbar" }, [topbarLeft, addBtn])

  content = h("main", { class: "content", id: "content" }, [
    h("div", { class: "loading", text: "Loading..." }),
  ])

  const main = h("div", { class: "main" }, [topbar, content])
  const app = h("div", { class: "app" }, [sidebar, main])
  document.body.appendChild(app)

  updateNavActive()
  updateTypeActive()
}

function setType(t: ItemType): void {
  stockType = t
  updateTypeActive()
  void renderView(currentView)
}

function updateTypeActive(): void {
  const show = currentView === "dashboard" || currentView === "inventory"
  for (const btn of typeToggleBtns) {
    const parent = btn.parentElement
    if (parent) parent.style.display = show ? "" : "none"
    btn.classList.toggle("seg-active", btn.dataset.type === stockType)
  }
}

function ctx(): ViewCtx {
  return {
    settings,
    stockType,
    refresh: () => { void renderView(currentView) },
    go,
    openItemForm: (item?: Item) => { void openItemForm(ctx(), item) },
    openStockModal: (item: Item) => { void openStockModal(ctx(), item) },
    openTransactionForm: () => { void openTransactionForm(ctx()) },
  }
}

function go(view: ViewName): void {
  currentView = view
  pageTitle.textContent = TITLES[view]
  updateNavActive()
  updateTypeActive()
  void renderView(view)
}

function updateNavActive(): void {
  for (const btn of navButtons) {
    btn.classList.toggle("active", btn.dataset.view === currentView)
  }
}

async function renderView(view: ViewName): Promise<void> {
  clear(content)
  content.append(h("div", { class: "loading", text: "Loading..." }))
  try {
    const c = ctx()
    let node: HTMLElement
    if (view === "dashboard") node = await renderDashboard(c)
    else if (view === "inventory") node = await renderInventory(c)
    else if (view === "movements") node = await renderMovements(c)
    else node = await renderSettings(c)
    settings = await db.getSettings()
    clear(content)
    content.append(node)
  } catch (err) {
    clear(content)
    content.append(
      h("div", { class: "empty-card big", text: "Something went wrong: " + (err as Error).message }),
    )
  }
}

window.addEventListener("DOMContentLoaded", () => {
  void boot()
})
