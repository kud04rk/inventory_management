import { db } from "../db"
import { UNITS } from "../types"
import type { Item, ItemInput, ItemType, ViewCtx } from "../types"
import { h, clear, toast } from "../ui"
import { closeModal, openModal } from "../modal"

function field(
  label: string,
  input: HTMLElement,
  hint?: string,
): HTMLElement {
  const kids: (Node | string)[] = [h("label", { class: "field-label", text: label })]
  kids.push(input)
  if (hint) kids.push(h("div", { class: "field-hint", text: hint }))
  return h("div", { class: "field" }, kids)
}

function textInput(
  name: string,
  value: string,
  opts: { type?: string; placeholder?: string; required?: boolean; list?: string; min?: string; step?: string } = {},
): HTMLInputElement {
  const input = document.createElement("input")
  input.className = "input"
  input.name = name
  input.value = value
  input.type = opts.type ?? "text"
  if (opts.placeholder) input.placeholder = opts.placeholder
  if (opts.required) input.required = true
  if (opts.list) input.setAttribute("list", opts.list)
  if (opts.min != null) input.min = opts.min
  if (opts.step != null) input.step = opts.step
  return input
}

function unitSelect(value: string | null): HTMLSelectElement {
  const select = document.createElement("select")
  select.className = "input"
  select.name = "unit"
  select.append(h("option", { value: "" }, ["\u2014 Select unit \u2014"]))
  for (const u of UNITS) select.append(h("option", { value: u }, [u]))
  const isKnown = !!value && (UNITS as readonly string[]).includes(value)
  if (value && !isKnown) select.append(h("option", { value }, [value]))
  select.value = value ?? ""
  return select
}

export async function openItemForm(ctx: ViewCtx, existing?: Item): Promise<void> {
  const categories = await db.getCategories()
  const isEdit = !!existing

  let itemType: ItemType = existing?.type ?? ctx.stockType
  const rawBtn = h<HTMLButtonElement>("button", { class: "seg", type: "button" }, ["Raw material"])
  const finBtn = h<HTMLButtonElement>("button", { class: "seg", type: "button" }, ["Finished good"])
  const setType = (t: ItemType) => {
    itemType = t
    rawBtn.classList.toggle("seg-active", t === "raw")
    finBtn.classList.toggle("seg-active", t === "finished")
  }
  rawBtn.onclick = () => setType("raw")
  finBtn.onclick = () => setType("finished")
  setType(itemType)
  const typeToggle = h("div", { class: "segmented type-toggle" }, [rawBtn, finBtn])

  const name = textInput("name", existing?.name ?? "", { placeholder: "e.g. Rice 5kg Bag", required: true })
  const sku = textInput("sku", existing?.sku ?? "", { placeholder: "e.g. RICE-5KG (optional)" })
  const category = textInput("category", existing?.category ?? "", { placeholder: "e.g. Groceries", list: "cat-list" })
  const quantity = textInput("quantity", String(existing?.quantity ?? 0), { type: "number", min: "0", step: "1" })
  const unit = unitSelect(existing?.unit ?? null)
  const price = textInput("price", String(existing?.price ?? 0), { type: "number", min: "0", step: "0.01" })
  const location = textInput("location", existing?.location ?? "", { placeholder: "e.g. Shelf A1" })
  const reorder = textInput("reorder_level", String(existing?.reorder_level ?? 0), { type: "number", min: "0", step: "1" })
  const notes = document.createElement("textarea")
  notes.className = "input"
  notes.name = "notes"
  notes.rows = 2
  notes.value = existing?.notes ?? ""

  const dataList = h("datalist", { id: "cat-list" }, categories.map((c) => h("option", { value: c })))

  const errorBox = h("div", { class: "form-error", role: "alert" }, [])

  const form = h("form", { class: "stack" }, [
    typeToggle,
    dataList,
    field("Item name *", name),
    h("div", { class: "grid-2" }, [
      field("SKU / Code", sku),
      field("Category", category),
    ]),
    h("div", { class: "grid-2" }, [
      field(isEdit ? "Quantity in stock" : "Initial quantity (opening stock)", quantity),
      field("Unit", unit),
    ]),
    h("div", { class: "grid-2" }, [
      field("Unit price", price),
      field("Low-stock alert level", reorder, "Alert when stock falls to this number. Set 0 for no alert."),
    ]),
    field("Location", location),
    field("Notes", notes),
    errorBox,
    h("div", { class: "form-actions" }, [
      h("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal() }, ["Cancel"]),
      h("button", { class: "btn btn-primary", type: "submit" }, [isEdit ? "Save changes" : "Add item"]),
    ]),
  ])

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    clear(errorBox)
    const nm = name.value.trim()
    if (!nm) {
      errorBox.append("Please enter an item name.")
      name.focus()
      return
    }
    const input: ItemInput = {
      name: nm,
      type: itemType,
      sku: sku.value.trim(),
      category: category.value.trim(),
      quantity: Math.max(0, Math.floor(Number(quantity.value) || 0)),
      unit: unit.value,
      price: Math.max(0, Number(price.value) || 0),
      location: location.value.trim(),
      reorder_level: Math.max(0, Math.floor(Number(reorder.value) || 0)),
      notes: notes.value.trim(),
    }
    const saveBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement
    saveBtn.disabled = true
    saveBtn.textContent = "Saving..."
    try {
      if (isEdit && existing) {
        await db.updateItem(existing.id, input)
        toast("Item updated", "success")
      } else {
        const opening = input.quantity
        const created = await db.createItem({ ...input, quantity: 0 })
        if (opening > 0) {
          await db.addMovement(created.id, "in", opening, "Opening balance", "", input.price)
        }
        toast("Product added", "success")
      }
      closeModal()
      ctx.refresh()
    } catch (err) {
      saveBtn.disabled = false
      saveBtn.textContent = isEdit ? "Save changes" : "Add item"
      errorBox.append("Could not save: " + (err as Error).message)
    }
  })

  openModal(isEdit ? "Edit item" : "Add new item", form)
  setTimeout(() => name.focus(), 80)
}

export async function openStockModal(ctx: ViewCtx, item: Item): Promise<void> {
  let mode: "in" | "out" = "in"
  const qty = textInput("qty", "1", { type: "number", min: "1", step: "1" })
  qty.style.fontSize = "1.6rem"
  qty.style.textAlign = "center"
  qty.style.width = "5rem"

  const reasonSelect = document.createElement("select")
  reasonSelect.className = "input"
  const buildReasons = (m: "in" | "out") => {
    const list = m === "in" ? ["Purchase", "Return", "Stocktake adjustment", "Other"] : ["Sale", "Damaged", "Expired", "Stocktake adjustment", "Other"]
    reasonSelect.innerHTML = ""
    reasonSelect.append(h("option", { value: "" }, ["(optional) Reason"]))
    for (const r of list) reasonSelect.append(h("option", { value: r }, [r]))
  }
  buildReasons(mode)

  const note = textInput("note", "", { placeholder: "Optional note" })

  const unitPrice = textInput("unit_price", String(item.price || 0), { type: "number", min: "0", step: "0.01" })
  const unitPriceField = field(
    `Unit price (${ctx.settings.currency})`,
    unitPrice,
    "Cost per unit for this batch of stock. Used to value inventory (FIFO).",
  )

  const currentLabel = h("div", { class: "stock-current", html: `Current stock: <b>${item.quantity}${item.unit ? " " + item.unit : ""}</b>` })

  const inBtn = h("button", { class: "seg seg-active", type: "button", onclick: () => setMode("in") }, ["+ Add stock"])
  const outBtn = h("button", { class: "seg", type: "button", onclick: () => setMode("out") }, ["\u2212 Remove stock"])
  const segGroup = h("div", { class: "segmented" }, [inBtn, outBtn])

  function setMode(m: "in" | "out"): void {
    mode = m
    inBtn.classList.toggle("seg-active", m === "in")
    outBtn.classList.toggle("seg-active", m === "out")
    inBtn.classList.toggle("seg-in", m === "in")
    outBtn.classList.toggle("seg-out", m === "out")
    buildReasons(m)
    unitPriceField.style.display = m === "in" ? "" : "none"
    updateWarning()
  }

  const warning = h("div", { class: "form-error", role: "alert" }, [])
  function updateWarning(): void {
    clear(warning)
    const q = Math.floor(Number(qty.value) || 0)
    if (mode === "out" && q > item.quantity) {
      warning.append(`Only ${item.quantity} in stock. This will bring stock to 0.`)
    }
  }
  qty.addEventListener("input", updateWarning)

  const stepper = h("div", { class: "stepper" }, [
    h("button", { class: "step-btn", type: "button", "aria-label": "Decrease", onclick: () => { qty.value = String(Math.max(1, (Number(qty.value) || 0) - 1)); updateWarning() } }, ["\u2212"]),
    qty,
    h("button", { class: "step-btn", type: "button", "aria-label": "Increase", onclick: () => { qty.value = String((Number(qty.value) || 0) + 1); updateWarning() } }, ["+"]),
  ])

  const confirmBtn = h<HTMLButtonElement>("button", { class: "btn btn-primary", type: "submit" }, ["Confirm"])
  const form = h("form", { class: "stack" }, [
    h("div", { class: "modal-item-name", text: item.name }),
    currentLabel,
    segGroup,
    field("Quantity", stepper),
    unitPriceField,
    field("Reason", reasonSelect),
    field("Note", note),
    warning,
    h("div", { class: "form-actions" }, [
      h("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal() }, ["Cancel"]),
      confirmBtn,
    ]),
  ])

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const q = Math.max(1, Math.floor(Number(qty.value) || 0))
    confirmBtn.disabled = true
    confirmBtn.textContent = "Saving..."
    try {
      const up = mode === "in" ? Math.max(0, Number(unitPrice.value) || 0) : undefined
      await db.addMovement(item.id, mode, q, reasonSelect.value, note.value.trim(), up)
      toast(mode === "in" ? "Stock added" : "Stock removed", "success")
      closeModal()
      ctx.refresh()
    } catch (err) {
      confirmBtn.disabled = false
      confirmBtn.textContent = "Confirm"
      clear(warning)
      warning.append("Could not save: " + (err as Error).message)
    }
  })

  openModal("Adjust stock", form)
  setTimeout(() => qty.focus(), 80)
}

export async function openTransactionForm(ctx: ViewCtx): Promise<void> {
  const items = await db.getItems("", "", null)
  if (items.length === 0) {
    toast("Add an item first before recording a transaction.", "error")
    return
  }

  let mode: "in" | "out" = "in"
  const product = document.createElement("select")
  product.className = "input"
  product.append(h("option", { value: "" }, ["\u2014 Select a product \u2014"]))
  for (const it of items) {
    product.append(
      h("option", { value: it.id }, [
        `${it.name}  \u00b7  ${it.quantity}${it.unit ? " " + it.unit : ""} in stock`,
      ]),
    )
  }

  const qty = textInput("qty", "1", { type: "number", min: "1", step: "1" })
  qty.style.fontSize = "1.6rem"
  qty.style.textAlign = "center"
  qty.style.width = "10rem"

  const reasonSelect = document.createElement("select")
  reasonSelect.className = "input"
  const buildReasons = (m: "in" | "out") => {
    const list = m === "in" ? ["Purchase", "Return", "Stocktake adjustment", "Other"] : ["Sale", "Sent to production", "Damaged", "Expired", "Stocktake adjustment", "Other"]
    reasonSelect.innerHTML = ""
    reasonSelect.append(h("option", { value: "" }, ["(optional) Reason"]))
    for (const r of list) reasonSelect.append(h("option", { value: r }, [r]))
  }
  buildReasons(mode)

  const note = textInput("note", "", { placeholder: "Optional note" })

  const unitPrice = textInput("unit_price", "0", { type: "number", min: "0", step: "0.01" })
  const unitPriceField = field(
    `Unit price (${ctx.settings.currency})`,
    unitPrice,
    "Cost per unit for this batch of stock. Used to value inventory (FIFO).",
  )

  const inBtn = h<HTMLButtonElement>("button", { class: "seg seg-active", type: "button", onclick: () => setMode("in") }, ["+ Stock in"])
  const outBtn = h<HTMLButtonElement>("button", { class: "seg", type: "button", onclick: () => setMode("out") }, ["\u2212 Stock out"])
  const segGroup = h("div", { class: "segmented" }, [inBtn, outBtn])

  const currentLabel = h("div", { class: "stock-current", text: "Select a product to begin." })
  const warning = h("div", { class: "form-error", role: "alert" }, [])

  function selectedItem(): Item | undefined {
    return items.find((i) => i.id === product.value)
  }
  function updateWarning(): void {
    clear(warning)
    const it = selectedItem()
    const q = Math.floor(Number(qty.value) || 0)
    if (it && mode === "out" && q > it.quantity) {
      warning.append(`Only ${it.quantity} in stock. This will bring stock to 0.`)
    }
  }
  function refreshCurrent(): void {
    const it = selectedItem()
    clear(currentLabel)
    if (!it) {
      currentLabel.append("Select a product to begin.")
    } else {
      currentLabel.append(`Current stock: ${it.quantity}${it.unit ? " " + it.unit : ""}`)
      unitPrice.value = String(it.price || 0)
    }
    updateWarning()
  }
  product.addEventListener("change", refreshCurrent)
  qty.addEventListener("input", updateWarning)

  function setMode(m: "in" | "out"): void {
    mode = m
    inBtn.classList.toggle("seg-active", m === "in")
    outBtn.classList.toggle("seg-active", m === "out")
    inBtn.classList.toggle("seg-in", m === "in")
    outBtn.classList.toggle("seg-out", m === "out")
    buildReasons(m)
    unitPriceField.style.display = m === "in" ? "" : "none"
    updateWarning()
  }

  const stepper = h("div", { class: "stepper" }, [
    h("button", { class: "step-btn", type: "button", "aria-label": "Decrease", onclick: () => { qty.value = String(Math.max(1, (Number(qty.value) || 0) - 1)); updateWarning() } }, ["\u2212"]),
    qty,
    h("button", { class: "step-btn", type: "button", "aria-label": "Increase", onclick: () => { qty.value = String((Number(qty.value) || 0) + 1); updateWarning() } }, ["+"]),
  ])

  const errorBox = h("div", { class: "form-error", role: "alert" }, [])
  const confirmBtn = h<HTMLButtonElement>("button", { class: "btn btn-primary", type: "submit" }, ["Record transaction"])

  const form = h("form", { class: "stack" }, [
    field("Product", product),
    currentLabel,
    field("Direction", segGroup),
    field("Quantity", stepper),
    unitPriceField,
    field("Reason", reasonSelect),
    field("Note", note),
    warning,
    errorBox,
    h("div", { class: "form-actions" }, [
      h("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal() }, ["Cancel"]),
      confirmBtn,
    ]),
  ])

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    clear(errorBox)
    const it = selectedItem()
    if (!it) {
      errorBox.append("Please choose a product.")
      product.focus()
      return
    }
    const q = Math.max(1, Math.floor(Number(qty.value) || 0))
    confirmBtn.disabled = true
    confirmBtn.textContent = "Saving..."
    try {
      const up = mode === "in" ? Math.max(0, Number(unitPrice.value) || 0) : undefined
      await db.addMovement(it.id, mode, q, reasonSelect.value, note.value.trim(), up)
      toast(mode === "in" ? "Stock added" : "Stock removed", "success")
      closeModal()
      ctx.refresh()
    } catch (err) {
      confirmBtn.disabled = false
      confirmBtn.textContent = "Record transaction"
      errorBox.append("Could not save: " + (err as Error).message)
    }
  })

  openModal("New transaction", form)
  setTimeout(() => product.focus(), 80)
}
