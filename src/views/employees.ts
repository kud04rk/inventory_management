import { db } from "../db"
import type { Employee, ViewCtx } from "../types"
import { h, clear, toast } from "../ui"

let root: HTMLElement
let nameInput: HTMLInputElement

export async function renderEmployees(ctx: ViewCtx): Promise<HTMLElement> {
  root = h("div", { class: "view employees-view" })
  await paint(ctx)
  return root
}

async function paint(ctx: ViewCtx): Promise<void> {
  clear(root)

  nameInput = h<HTMLInputElement>("input", {
    class: "input emp-name-input",
    type: "text",
    placeholder: "Employee name",
    autocomplete: "off",
  })
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void add(ctx)
    }
  })

  const addBtn = h<HTMLButtonElement>(
    "button",
    { class: "btn btn-primary", type: "button", onclick: () => void add(ctx) },
    [h("span", { class: "plus", text: "+" }), " Add"],
  )

  const addPanel = h("div", { class: "panel emp-add-panel" }, [
    h("div", { class: "section-head" }, [
      h("h2", { class: "section-title", text: "Add employee" }),
    ]),
    h("div", { class: "emp-add-row" }, [nameInput, addBtn]),
  ])
  root.append(addPanel)

  const employees = await db.getEmployees()

  const head = h("div", { class: "section-head" }, [
    h("h2", { class: "section-title", text: `Employees (${employees.length})` }),
    employees.length
      ? h(
          "span",
          { class: "muted small" },
          [`Deleting an employee also clears their attendance history.`],
        )
      : h("span", {}),
  ])

  let body: HTMLElement
  if (employees.length === 0) {
    body = h("div", {
      class: "empty-card big",
      text: "No employees yet. Add one above to start tracking attendance.",
    })
  } else {
    const rows = employees.map((emp) => buildRow(emp, ctx))
    body = h("div", { class: "panel emp-list-panel" }, [
      head,
      h("div", { class: "card-list" }, rows),
    ])
    root.append(body)
    return
  }

  root.append(h("div", { class: "panel emp-list-panel" }, [head, body]))
}

function buildRow(emp: Employee, ctx: ViewCtx): HTMLElement {
  const del = h<HTMLButtonElement>(
    "button",
    {
      class: "btn btn-danger-ghost btn-sm",
      type: "button",
      "aria-label": `Delete ${emp.name}`,
      title: "Delete",
      onclick: () => void remove(emp, ctx),
    },
    ["Delete"],
  )
  return h("div", { class: "list-row emp-row" }, [
    h("div", { class: "emp-avatar", text: initials(emp.name) }),
    h("div", { class: "list-main" }, [
      h("div", { class: "list-title", text: emp.name }),
    ]),
    h("div", { class: "list-end" }, [del]),
  ])
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

async function add(ctx: ViewCtx): Promise<void> {
  const name = nameInput.value.trim()
  if (!name) {
    toast("Enter an employee name", "error")
    nameInput.focus()
    return
  }
  const list = await db.getEmployees()
  if (list.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    toast("That employee already exists", "error")
    nameInput.select()
    return
  }
  try {
    await db.createEmployee({ name })
    toast("Employee added", "success")
    await paint(ctx)
    nameInput.focus()
  } catch (err) {
    toast("Could not add: " + (err as Error).message, "error")
  }
}

async function remove(emp: Employee, ctx: ViewCtx): Promise<void> {
  try {
    await db.deleteEmployee(emp.id)
    toast(`Deleted ${emp.name}`, "success")
    await paint(ctx)
  } catch (err) {
    toast("Could not delete: " + (err as Error).message, "error")
  }
}
