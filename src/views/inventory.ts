import { db } from "../db"
import type { Item, ItemInput, ItemType, ViewCtx } from "../types"
import { formatCurrency } from "../format"
import { h, toast } from "../ui"
import { confirmDialog } from "../modal"
import { downloadCsv, parseCsv } from "../csv"

let searchState = ""
let categoryState = ""

export async function renderInventory(ctx: ViewCtx): Promise<HTMLElement> {
  const [items, categories, values] = await Promise.all([
    db.getItems(searchState, categoryState, ctx.stockType),
    db.getCategories(ctx.stockType),
    db.getItemValues(ctx.stockType),
  ])

  const root = h("div", { class: "view inventory-view" }, [])

  // Toolbar
  const search = document.createElement("input")
  search.className = "input search-input"
  search.type = "search"
  search.placeholder = "Search by name, code or category..."
  search.value = searchState
  search.setAttribute("autocomplete", "off")
  let debounce: number | undefined
  search.addEventListener("input", () => {
    searchState = search.value
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => ctx.refresh(), 200)
  })

  const catSelect = document.createElement("select")
  catSelect.className = "input filter-select"
  catSelect.append(h("option", { value: "", text: "All categories" }))
  for (const c of categories) catSelect.append(h("option", { value: c, text: c }))
  catSelect.value = categoryState
  catSelect.addEventListener("change", () => {
    categoryState = catSelect.value
    ctx.refresh()
  })

  const csvBtn = h("button", { class: "btn btn-secondary", type: "button", onclick: () => exportStockCsv(ctx) }, [
    h("span", { html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' }),
    " Export CSV",
  ])

  const importFile = document.createElement("input")
  importFile.type = "file"
  importFile.accept = ".csv,text/csv"
  importFile.style.display = "none"
  importFile.addEventListener("change", () => { void importStockCsv(ctx, importFile) })
  const importBtn = h("button", { class: "btn btn-secondary", type: "button", onclick: () => importFile.click() }, [
    h("span", { html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' }),
    " Import CSV",
  ])

  const addBtn = h("button", { class: "btn btn-primary", type: "button", onclick: () => ctx.openItemForm() }, [
    h("span", { class: "plus", text: "+" }),
    " Add item",
  ])

  const toolbar = h("div", { class: "toolbar" }, [search, catSelect, csvBtn, importBtn, addBtn])
  root.append(toolbar, importFile)

  // Table
  if (items.length === 0) {
    root.append(
      h("div", { class: "empty-card big", text: searchState || categoryState ? "No items match your search." : "No items yet. Click \u201cAdd item\u201d to get started." }),
    )
    return root
  }

  const thead = h("thead", {}, [
    h("tr", {}, [
      h("th", { class: "col-item", text: "Item" }),
      h("th", { class: "col-stock", text: "In stock" }),
      h("th", { class: "col-price", text: "Unit price" }),
      h("th", { class: "col-value", text: "Value" }),
      h("th", { class: "col-actions", text: "Actions" }),
    ]),
  ])

  const tbody = h("tbody", {}, items.map((it) => itemRow(it, values, ctx)))

  const tableWrap = h("div", { class: "table-wrap" }, [
    h("table", { class: "inv-table" }, [thead, tbody]),
  ])
  root.append(tableWrap)

  return root
}

function itemRow(it: Item, values: Record<string, number>, ctx: ViewCtx): HTMLElement {
  const low = it.reorder_level > 0 && it.quantity <= it.reorder_level
  const out = it.quantity <= 0
  const stockClass = out ? "stock-out" : low ? "stock-low" : "stock-ok"

  const nameCell = h("td", { class: "col-item" }, [
    h("div", { class: "cell-title", text: it.name }),
    h("div", { class: "cell-sub", text: [it.sku, it.category].filter(Boolean).join(" \u00b7 ") || (it.location ?? "") }),
  ])

  const stockCell = h("td", { class: `col-stock ${stockClass}` }, [
    h("span", { class: "stock-num", text: String(it.quantity) }),
    it.unit ? h("span", { class: "stock-unit", text: " " + it.unit }) : "",
  ])

  const value = values[it.id] ?? it.price * it.quantity
  const unitPrice = it.quantity > 0 ? value / it.quantity : it.price
  const priceCell = h("td", { class: "col-price", text: formatCurrency(unitPrice, ctx.settings.currency) })
  const valueCell = h("td", { class: "col-value", text: formatCurrency(value, ctx.settings.currency) })

  const actions = h("td", { class: "col-actions" }, [
    h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => ctx.openStockModal(it) }, ["Stock"]),
    h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => ctx.openItemForm(it) }, ["Edit"]),
    h("button", { class: "btn btn-danger-ghost btn-sm", type: "button", onclick: () => confirmDelete(it, ctx) }, ["Delete"]),
  ])

  return h("tr", {}, [nameCell, stockCell, priceCell, valueCell, actions])
}

async function confirmDelete(it: Item, ctx: ViewCtx): Promise<void> {
  const ok = await confirmDialog(
    `Delete "${it.name}"? This also removes its stock history. This cannot be undone.`,
    { title: "Delete item", confirmText: "Delete", danger: true },
  )
  if (!ok) return
  try {
    await db.deleteItem(it.id)
    toast("Item deleted", "success")
    ctx.refresh()
  } catch (err) {
    toast("Could not delete: " + (err as Error).message, "error")
  }
}

export async function exportStockCsv(ctx: ViewCtx): Promise<void> {
  try {
    const [items, values] = await Promise.all([
      db.getItems("", "", ctx.stockType),
      db.getItemValues(ctx.stockType),
    ])
    if (items.length === 0) {
      toast("Nothing to export for this stock type", "error")
      return
    }
    const headers = [
      "Name", "Type", "SKU", "Category", "Quantity", "Unit",
      "Unit Price", "Total Value", "Reorder Level", "Status", "Location",
    ]
    const rows = items.map((it) => {
      const status =
        it.quantity <= 0
          ? "Out of stock"
          : it.reorder_level > 0 && it.quantity <= it.reorder_level
            ? "Low stock"
            : "OK"
      const value = values[it.id] ?? it.price * it.quantity
      const unitPrice = it.quantity > 0 ? value / it.quantity : it.price
      return [
        it.name,
        it.type === "raw" ? "Raw material" : "Finished good",
        it.sku ?? "",
        it.category ?? "",
        it.quantity,
        it.unit ?? "",
        unitPrice.toFixed(2),
        value.toFixed(2),
        it.reorder_level,
        status,
        it.location ?? "",
      ]
    })
    const typeLabel = ctx.stockType === "raw" ? "raw-materials" : "finished-goods"
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(`stock-statement-${typeLabel}-${date}.csv`, headers, rows)
    toast("Stock statement exported", "success")
  } catch (err) {
    toast("Export failed: " + (err as Error).message, "error")
  }
}

export async function importStockCsv(ctx: ViewCtx, input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0]
  if (!file) return
  input.value = ""
  try {
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length < 2) {
      toast("CSV is empty or has no data rows", "error")
      return
    }
    const headers = rows[0].map((h) => h.trim().toLowerCase())
    const col = (name: string): number => headers.indexOf(name)
    const idxName = col("name")
    if (idxName < 0) {
      toast('CSV must have a "Name" column', "error")
      return
    }
    const at = (cells: string[], i: number): string => (i >= 0 ? (cells[i] ?? "").trim() : "")
    let imported = 0
    for (const cells of rows.slice(1)) {
      const name = at(cells, idxName)
      if (!name) continue
      const typeRaw = at(cells, col("type")).toLowerCase()
      const type: ItemType = typeRaw.startsWith("raw")
        ? "raw"
        : typeRaw.startsWith("finished")
          ? "finished"
          : ctx.stockType
      const quantity = Math.max(0, Math.floor(Number(at(cells, col("quantity"))) || 0))
      const inputItem: ItemInput = {
        name,
        type,
        sku: at(cells, col("sku")),
        category: at(cells, col("category")),
        quantity,
        unit: at(cells, col("unit")),
        price: Math.max(0, Number(at(cells, col("unit price"))) || 0),
        location: at(cells, col("location")),
        reorder_level: Math.max(0, Math.floor(Number(at(cells, col("reorder level"))) || 0)),
        notes: "",
      }
      const created = await db.createItem({ ...inputItem, quantity: 0 })
      if (quantity > 0) {
        await db.addMovement(created.id, "in", quantity, "Opening balance", "", inputItem.price)
      }
      imported++
    }
    toast(`Imported ${imported} item${imported === 1 ? "" : "s"}`, "success")
    ctx.refresh()
  } catch (err) {
    toast("Import failed: " + (err as Error).message, "error")
  }
}
