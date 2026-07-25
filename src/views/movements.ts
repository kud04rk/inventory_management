import { db } from "../db"
import type { MovementQuery } from "../db"
import type { Movement, MovementType, ViewCtx } from "../types"
import { formatCurrency, formatDateTime } from "../format"
import { h, toast } from "../ui"
import { confirmDialog } from "../modal"

type Filter = "all" | "in" | "out"

const PAGE_SIZE = 100
const MAX_VISIBLE = 10000

let filterState: Filter = "all"
let fromDate = ""
let toDate = ""

let loaded: Movement[] = []
let offset = 0
let total = 0
let loading = false
let hasMore = true
let renderEpoch = 0

let listEl: HTMLElement | null = null
let countEl: HTMLElement | null = null
let loadMoreBtn: HTMLButtonElement | null = null
let exportAllWrap: HTMLElement | null = null
let scrollHandler: (() => void) | null = null

function buildQuery(): MovementQuery {
  return {
    itemId: null,
    type: filterState === "all" ? null : (filterState as MovementType),
    from: fromDate ? fromDate + "T00:00:00" : null,
    to: toDate ? toDate + "T23:59:59" : null,
  }
}

function buildRow(m: Movement, ctx: ViewCtx): HTMLElement {
  const isIn = m.type === "in"
  const priceBit =
    isIn && m.unit_price != null
      ? ` \u00b7 ${formatCurrency(m.unit_price, ctx.settings.currency)}/unit`
      : ""
  return h("div", { class: "list-row", "data-id": m.id }, [
    h("div", { class: `move-icon ${isIn ? "move-in" : "move-out"}`, text: isIn ? "\u2191" : "\u2193" }),
    h("div", { class: "list-main" }, [
      h("div", { class: "list-title", text: m.item_name ?? "Unknown item" }),
      h("div", { class: "list-sub", text: `${isIn ? "Added" : "Removed"} ${m.quantity} \u00b7 ${m.reason ?? "No reason"}${priceBit}${m.note ? " \u00b7 " + m.note : ""}` }),
    ]),
    h("div", { class: "list-end" }, [
      h("span", { class: `pill ${isIn ? "pill-green" : "pill-red"}`, text: `${isIn ? "+" : "\u2212"}${m.quantity}` }),
      h("div", { class: "list-date", text: formatDateTime(m.created_at) }),
      h("button", { class: "btn btn-danger-ghost btn-sm", type: "button", onclick: () => confirmDeleteMovement(m) }, ["Undo"]),
    ]),
  ])
}

function updateCountText(): void {
  if (!countEl) return
  const shown = loaded.length
  if (total > MAX_VISIBLE) {
    countEl.textContent = `Showing ${shown.toLocaleString()} of ${MAX_VISIBLE.toLocaleString()}+ of ${total.toLocaleString()} entries`
  } else {
    countEl.textContent = `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} ${total === 1 ? "entry" : "entries"}`
  }
}

function updateLoadMore(): void {
  if (!loadMoreBtn) return
  if (loading) {
    loadMoreBtn.style.display = ""
    loadMoreBtn.textContent = "Loading more..."
    loadMoreBtn.disabled = true
    return
  }
  if (hasMore && loaded.length > 0) {
    loadMoreBtn.style.display = ""
    loadMoreBtn.textContent = "Load more"
    loadMoreBtn.disabled = false
  } else {
    loadMoreBtn.style.display = "none"
  }
}

function updateExportAll(): void {
  if (!exportAllWrap) return
  exportAllWrap.style.display = total > MAX_VISIBLE ? "" : "none"
}

async function loadPage(ctx: ViewCtx, ep: number): Promise<void> {
  if (loading || !hasMore || ep !== renderEpoch || !listEl) return
  loading = true
  updateLoadMore()
  let page: Movement[] = []
  let failed = false
  try {
    const cap = Math.min(PAGE_SIZE, MAX_VISIBLE - offset)
    page = await db.getMovementsPage(Math.max(cap, 0), offset, buildQuery())
  } catch (err) {
    if (ep === renderEpoch) {
      toast("Could not load transactions: " + (err as Error).message, "error")
    }
    failed = true
  }
  if (ep !== renderEpoch) return
  if (failed) {
    hasMore = false
  } else {
    if (page.length > 0) {
      for (const m of page) {
        loaded.push(m)
        listEl!.append(buildRow(m, ctx))
      }
      offset += page.length
    }
    hasMore = page.length === PAGE_SIZE && offset < MAX_VISIBLE && offset < total
  }
  loading = false
  updateCountText()
  updateLoadMore()
  updateExportAll()
}

function setupScroll(ctx: ViewCtx, ep: number): void {
  const content = document.getElementById("content")
  if (!content) return
  if (scrollHandler) content.removeEventListener("scroll", scrollHandler)
  scrollHandler = () => {
    if (!listEl || !document.contains(listEl)) {
      content.removeEventListener("scroll", scrollHandler as () => void)
      scrollHandler = null
      return
    }
    if (content.scrollTop + content.clientHeight >= content.scrollHeight - 400) {
      void loadPage(ctx, ep)
    }
  }
  content.addEventListener("scroll", scrollHandler, { passive: true })
}

function setFilter(f: Filter, ctx: ViewCtx): void {
  filterState = f
  ctx.refresh()
}

function setDates(from: string, to: string, ctx: ViewCtx): void {
  fromDate = from
  toDate = to
  ctx.refresh()
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function toCsv(movements: Movement[]): string {
  const header = [
    "Date",
    "Item",
    "Type",
    "Quantity",
    "Reason",
    "Note",
    "Unit Price",
    "Remaining",
  ]
  const lines = [header.join(",")]
  for (const m of movements) {
    lines.push(
      [
        csvCell(m.created_at),
        csvCell(m.item_name ?? ""),
        csvCell(m.type === "in" ? "In" : "Out"),
        csvCell(m.quantity),
        csvCell(m.reason),
        csvCell(m.note),
        csvCell(m.unit_price ?? ""),
        csvCell(m.remaining ?? ""),
      ].join(","),
    )
  }
  return lines.join("\r\n")
}

function downloadCsv(csv: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function exportCsv(): Promise<void> {
  try {
    const all = await db.getMovementsAll(buildQuery())
    downloadCsv(toCsv(all))
    toast(`Exported ${all.length.toLocaleString()} transactions`, "success")
  } catch (err) {
    toast("Export failed: " + (err as Error).message, "error")
  }
}

export async function renderMovements(ctx: ViewCtx): Promise<HTMLElement> {
  const ep = ++renderEpoch
  loaded = []
  offset = 0
  total = 0
  loading = false
  hasMore = true

  const root = h("div", { class: "view movements-view" }, [])

  const allBtn = h<HTMLButtonElement>("button", { class: "seg", type: "button", onclick: () => setFilter("all", ctx) }, ["All"])
  const inBtn = h<HTMLButtonElement>("button", { class: "seg", type: "button", onclick: () => setFilter("in", ctx) }, ["Stock in"])
  const outBtn = h<HTMLButtonElement>("button", { class: "seg", type: "button", onclick: () => setFilter("out", ctx) }, ["Stock out"])
  allBtn.classList.toggle("seg-active", filterState === "all")
  inBtn.classList.toggle("seg-in", filterState === "in")
  outBtn.classList.toggle("seg-out", filterState === "out")

  const fromInput = h<HTMLInputElement>("input", {
    class: "input date-input",
    type: "date",
    value: fromDate,
    "aria-label": "From date",
  })
  fromInput.addEventListener("change", () => setDates(fromInput.value, toDate, ctx))

  const toInput = h<HTMLInputElement>("input", {
    class: "input date-input",
    type: "date",
    value: toDate,
    "aria-label": "To date",
  })
  toInput.addEventListener("change", () => setDates(fromDate, toInput.value, ctx))

  const clearBtn = h<HTMLButtonElement>("button", {
    class: "btn btn-ghost btn-sm",
    type: "button",
    onclick: () => setDates("", "", ctx),
  }, ["Clear"])
  clearBtn.style.display = fromDate || toDate ? "" : "none"

  const dateGroup = h("div", { class: "date-filter" }, [
    h("span", { class: "date-filter-label muted small", text: "From" }),
    fromInput,
    h("span", { class: "date-filter-label muted small", text: "To" }),
    toInput,
    clearBtn,
  ])

  const exportBtn = h<HTMLButtonElement>("button", {
    class: "btn btn-secondary",
    type: "button",
    onclick: () => void exportCsv(),
  }, ["Export CSV"])

  const newBtn = h("button", { class: "btn btn-primary", type: "button", onclick: () => ctx.openTransactionForm() }, [
    h("span", { class: "plus", text: "+" }),
    " New transaction",
  ])

  const toolbar = h("div", { class: "toolbar movements-toolbar" }, [
    h("div", { class: "segmented" }, [allBtn, inBtn, outBtn]),
    dateGroup,
    h("div", { class: "toolbar-right" }, [exportBtn, newBtn]),
  ])
  root.append(toolbar)

  listEl = h("div", { class: "card-list" }, [])
  countEl = h("span", { class: "muted small" })
  loadMoreBtn = h<HTMLButtonElement>("button", {
    class: "btn btn-secondary btn-sm load-more-btn",
    type: "button",
    onclick: () => void loadPage(ctx, ep),
  }, ["Load more"])
  loadMoreBtn.style.display = "none"

  const exportAllNote = h("p", {
    class: "muted small",
    text: `You have more than ${MAX_VISIBLE.toLocaleString()} transactions. Showing the most recent ${MAX_VISIBLE.toLocaleString()} here \u2014 export to view all.`,
  })
  const exportAllBtn = h<HTMLButtonElement>("button", {
    class: "btn btn-primary btn-sm",
    type: "button",
    onclick: () => void exportCsv(),
  }, ["Export all to CSV"])
  exportAllWrap = h("div", { class: "export-all-wrap", style: "display:none" }, [exportAllNote, exportAllBtn])

  const emptyCard = h("div", { class: "empty-card big", text: "No stock movements recorded yet.", style: "display:none" })

  const section = h("section", { class: "panel" }, [
    h("div", { class: "section-head" }, [
      h("h2", { class: "section-title", text: "History" }),
      countEl,
    ]),
    emptyCard,
    listEl,
    h("div", { class: "load-more-wrap" }, [loadMoreBtn]),
    exportAllWrap,
  ])
  root.append(section)

  try {
    total = await db.countMovements(buildQuery())
    if (ep !== renderEpoch) return root
    updateCountText()
    updateExportAll()
    if (total === 0) {
      emptyCard.style.display = ""
      listEl.style.display = "none"
      loadMoreBtn.style.display = "none"
      return root
    }
    await loadPage(ctx, ep)
    if (ep !== renderEpoch) return root
    setupScroll(ctx, ep)
  } catch (err) {
    toast("Could not load transactions: " + (err as Error).message, "error")
  }

  return root
}

async function confirmDeleteMovement(m: Movement): Promise<void> {
  const verb = m.type === "in" ? "Added" : "Removed"
  const ok = await confirmDialog(
    `Undo this transaction? ${verb} ${m.quantity} for "${m.item_name ?? "this item"}". Stock will be adjusted back to its previous level.`,
    { title: "Undo transaction", confirmText: "Undo", danger: true },
  )
  if (!ok) return
  try {
    await db.deleteMovement(m.id)
    toast("Transaction undone", "success")
    removeMovementFromDom(m.id)
  } catch (err) {
    toast("Could not undo: " + (err as Error).message, "error")
  }
}

function removeMovementFromDom(id: string): void {
  const idx = loaded.findIndex((m) => m.id === id)
  if (idx >= 0) loaded.splice(idx, 1)
  if (listEl) {
    const row = listEl.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
    if (row) row.remove()
  }
  total = Math.max(0, total - 1)
  if (listEl && loaded.length === 0) {
    listEl.style.display = "none"
    const panel = listEl.closest(".panel")
    const empty = panel?.querySelector<HTMLElement>(".empty-card")
    if (empty) {
      empty.textContent = "No stock movements recorded yet."
      empty.style.display = ""
    }
    if (loadMoreBtn) loadMoreBtn.style.display = "none"
  }
  updateCountText()
  updateExportAll()
}
