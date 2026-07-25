import { db } from "../db"
import type { Employee, ViewCtx } from "../types"
import { h, clear, toast } from "../ui"
import { downloadCsv } from "../csv"

const MONTHS_SHORT = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(undefined, { month: "short" }),
)
const MONTHS_LONG = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(undefined, { month: "long" }),
)
const NOW = new Date()
const YEARS = Array.from({ length: 6 }, (_, i) => NOW.getFullYear() - 4 + i)

let root: HTMLElement
let nameInput: HTMLInputElement

const exportState = new Map<string, { month: number; year: number }>()

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function getExportState(id: string): { month: number; year: number } {
  let st = exportState.get(id)
  if (!st) {
    st = { month: NOW.getMonth(), year: NOW.getFullYear() }
    exportState.set(id, st)
  }
  return st
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "employee"
}

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
          [`Pick a month/year on a row and export that person's attendance to CSV.`],
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
  const st = getExportState(emp.id)

  const monthSelect = h<HTMLSelectElement>(
    "select",
    { class: "input emp-sel", "aria-label": "Month", title: "Month" },
    MONTHS_SHORT.map((m, i) =>
      h<HTMLOptionElement>("option", { value: String(i), text: m }, []),
    ),
  )
  monthSelect.value = String(st.month)
  monthSelect.addEventListener("change", () => {
    st.month = Number(monthSelect.value)
  })

  const yearSelect = h<HTMLSelectElement>(
    "select",
    { class: "input emp-sel", "aria-label": "Year", title: "Year" },
    YEARS.map((y) =>
      h<HTMLOptionElement>("option", { value: String(y), text: String(y) }, []),
    ),
  )
  yearSelect.value = String(st.year)
  yearSelect.addEventListener("change", () => {
    st.year = Number(yearSelect.value)
  })

  const exportBtn = h<HTMLButtonElement>(
    "button",
    {
      class: "btn btn-secondary btn-sm",
      type: "button",
      onclick: () => void exportCsv(emp, st),
    },
    ["Export CSV"],
  )

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
    h("div", { class: "emp-controls" }, [monthSelect, yearSelect, exportBtn, del]),
  ])
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function statusLabel(status: string): string {
  if (status === "present") return "Present"
  if (status === "leave") return "Leave"
  if (status === "absent") return "Absent"
  return status
}

async function exportCsv(
  emp: Employee,
  st: { month: number; year: number },
): Promise<void> {
  try {
    const from = ymd(new Date(st.year, st.month, 1))
    const to = ymd(new Date(st.year, st.month + 1, 0))
    const entries = await db.getAttendance({
      search: "",
      status: null,
      employeeId: emp.id,
      from,
      to,
    })
    if (entries.length === 0) {
      toast(`No attendance for ${emp.name} in ${MONTHS_LONG[st.month]} ${st.year}`, "error")
      return
    }
    const byDate = new Map(entries.map((a) => [a.date, a]))
    const daysInMonth = new Date(st.year, st.month + 1, 0).getDate()

    const data: (string | number)[][] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(st.year, st.month, d)
      const key = ymd(date)
      const a = byDate.get(key)
      const weekday = date.toLocaleDateString(undefined, { weekday: "short" })
      data.push([key, weekday, a ? statusLabel(a.status) : ""])
    }

    const headers = ["Date", "Day", "Status"]
    const filename = `attendance-${sanitizeFilename(emp.name)}-${MONTHS_SHORT[st.month]}-${st.year}.csv`
    downloadCsv(filename, headers, data)
    toast(`Exported ${emp.name} \u2014 ${MONTHS_LONG[st.month]} ${st.year}`, "success")
  } catch (err) {
    toast("Export failed: " + (err as Error).message, "error")
  }
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
    exportState.delete(emp.id)
    toast(`Deleted ${emp.name}`, "success")
    await paint(ctx)
  } catch (err) {
    toast("Could not delete: " + (err as Error).message, "error")
  }
}
