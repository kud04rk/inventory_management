import { db } from "../db"
import type { Movement, ViewCtx } from "../types"
import { formatDateTime } from "../format"
import { h, toast } from "../ui"
import { confirmDialog } from "../modal"

type Filter = "all" | "in" | "out"
let filterState: Filter = "all"

export async function renderMovements(ctx: ViewCtx): Promise<HTMLElement> {
  let movements = await db.getMovements(500, null)
  if (filterState !== "all") movements = movements.filter((m) => m.type === filterState)

  const root = h("div", { class: "view movements-view" }, [])

  const setFilter = (f: Filter) => {
    filterState = f
    ctx.refresh()
  }
  const allBtn = h("button", { class: "seg", type: "button", onclick: () => setFilter("all") }, ["All"])
  const inBtn = h("button", { class: "seg", type: "button", onclick: () => setFilter("in") }, ["Stock in"])
  const outBtn = h("button", { class: "seg", type: "button", onclick: () => setFilter("out") }, ["Stock out"])
  allBtn.classList.toggle("seg-active", filterState === "all")
  inBtn.classList.toggle("seg-in", filterState === "in")
  outBtn.classList.toggle("seg-out", filterState === "out")

  const newBtn = h("button", { class: "btn btn-primary", type: "button", onclick: () => ctx.openTransactionForm() }, [
    h("span", { class: "plus", text: "+" }),
    " New transaction",
  ])

  const toolbar = h("div", { class: "toolbar" }, [
    h("div", { class: "segmented" }, [allBtn, inBtn, outBtn]),
    newBtn,
  ])
  root.append(toolbar)

  if (movements.length === 0) {
    root.append(
      h("div", { class: "empty-card big", text: "No stock movements recorded yet." }),
    )
    return root
  }

  const list = h("div", { class: "card-list" }, movements.map((m) => {
    const isIn = m.type === "in"
    return h("div", { class: "list-row" }, [
      h("div", { class: `move-icon ${isIn ? "move-in" : "move-out"}`, text: isIn ? "\u2191" : "\u2193" }),
      h("div", { class: "list-main" }, [
        h("div", { class: "list-title", text: m.item_name ?? "Unknown item" }),
        h("div", { class: "list-sub", text: `${isIn ? "Added" : "Removed"} ${m.quantity} \u00b7 ${m.reason ?? "No reason"}${m.note ? " \u00b7 " + m.note : ""}` }),
      ]),
      h("div", { class: "list-end" }, [
        h("span", { class: `pill ${isIn ? "pill-green" : "pill-red"}`, text: `${isIn ? "+" : "\u2212"}${m.quantity}` }),
        h("div", { class: "list-date", text: formatDateTime(m.created_at) }),
        h("button", { class: "btn btn-danger-ghost btn-sm", type: "button", onclick: () => confirmDeleteMovement(m, ctx) }, ["Undo"]),
      ]),
    ])
  }))
  root.append(
    h("section", { class: "panel" }, [
      h("div", { class: "section-head" }, [
        h("h2", { class: "section-title", text: "History" }),
        h("span", { class: "muted small", text: `${movements.length} ${movements.length === 1 ? "entry" : "entries"}` }),
      ]),
      list,
    ]),
  )
  return root
}

async function confirmDeleteMovement(m: Movement, ctx: ViewCtx): Promise<void> {
  const verb = m.type === "in" ? "Added" : "Removed"
  const ok = await confirmDialog(
    `Undo this transaction? ${verb} ${m.quantity} for "${m.item_name ?? "this item"}". Stock will be adjusted back to its previous level.`,
    { title: "Undo transaction", confirmText: "Undo", danger: true },
  )
  if (!ok) return
  try {
    await db.deleteMovement(m.id)
    toast("Transaction undone", "success")
    ctx.refresh()
  } catch (err) {
    toast("Could not undo: " + (err as Error).message, "error")
  }
}
