import { db } from "../db"
import type { Attendance, AttendanceStatus, Employee, ViewCtx } from "../types"
import { h, clear, toast } from "../ui"

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

let root: HTMLElement
let selectedEmployeeId = ""
let viewYear = new Date().getFullYear()
let viewMonth = new Date().getMonth()

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function todayKey(): string {
  return ymd(new Date())
}

function monthLabel(): string {
  return new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })
}

function shiftMonth(delta: number): void {
  let m = viewMonth + delta
  let y = viewYear
  if (m < 0) {
    m = 11
    y--
  } else if (m > 11) {
    m = 0
    y++
  }
  viewMonth = m
  viewYear = y
}

export async function renderAttendance(ctx: ViewCtx): Promise<HTMLElement> {
  root = h("div", { class: "view attendance-cal-view" })
  await paint(ctx)
  return root
}

async function paint(ctx: ViewCtx): Promise<void> {
  clear(root)

  const employees = await db.getEmployees()
  if (employees.length && !employees.some((e) => e.id === selectedEmployeeId)) {
    selectedEmployeeId = employees[0].id
  }
  if (!employees.length) selectedEmployeeId = ""

  const select = h<HTMLSelectElement>(
    "select",
    { class: "input cal-employee-select", "aria-label": "Select employee" },
    employees.map((e) =>
      h<HTMLOptionElement>("option", { value: e.id, text: e.name }, []),
    ),
  )
  select.value = selectedEmployeeId
  select.addEventListener("change", () => {
    selectedEmployeeId = select.value
    void paint(ctx)
  })

  const prevBtn = h<HTMLButtonElement>(
    "button",
    {
      class: "btn btn-secondary btn-sm cal-nav-btn",
      type: "button",
      "aria-label": "Previous month",
      onclick: () => {
        shiftMonth(-1)
        void paint(ctx)
      },
    },
    ["\u2039"],
  )
  const nextBtn = h<HTMLButtonElement>(
    "button",
    {
      class: "btn btn-secondary btn-sm cal-nav-btn",
      type: "button",
      "aria-label": "Next month",
      onclick: () => {
        shiftMonth(1)
        void paint(ctx)
      },
    },
    ["\u203a"],
  )
  const todayBtn = h<HTMLButtonElement>(
    "button",
    {
      class: "btn btn-ghost btn-sm",
      type: "button",
      onclick: () => {
        const t = new Date()
        viewYear = t.getFullYear()
        viewMonth = t.getMonth()
        void paint(ctx)
      },
    },
    ["Today"],
  )

  const toolbar = h("div", { class: "cal-toolbar" }, [
    h("div", { class: "cal-employee" }, [
      h("label", { class: "cal-inline-label", text: "Employee" }),
      select,
    ]),
    h("div", { class: "cal-monthnav segmented" }, [
      prevBtn,
      h("span", { class: "cal-month-label", text: monthLabel() }),
      nextBtn,
    ]),
    todayBtn,
  ])
  root.append(toolbar)

  const legend = h("div", { class: "cal-legend" }, [
    legendDot("cal-present", "Present"),
    legendDot("cal-leave", "Leave"),
    legendDot("cal-empty", "Unmarked"),
  ])
  root.append(legend)

  if (!employees.length) {
    root.append(
      h("div", { class: "empty-card big" }, [
        h("div", { text: "No employees yet." }),
        h("div", { class: "muted small", text: "Add employees first, then mark attendance here." }),
        h(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onclick: () => ctx.go("employees"),
          },
          ["Go to Employees"],
        ),
      ]),
    )
    return
  }

  const emp = employees.find((e) => e.id === selectedEmployeeId) ?? employees[0]

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const from = ymd(firstOfMonth)
  const to = ymd(new Date(viewYear, viewMonth + 1, 0))
  const rows = await db.getAttendance({
    search: "",
    status: null,
    employeeId: emp.id,
    from,
    to,
  })
  const map = new Map<string, Attendance>()
  for (const a of rows) map.set(a.date, a)

  root.append(buildGrid(ctx, emp, map))

  const present = rows.filter((a) => a.status === "present").length
  const leave = rows.filter((a) => a.status !== "present").length
  root.append(
    h("div", { class: "cal-summary" }, [
      h("span", { class: "cal-sum-present", text: `${present} present` }),
      h("span", { class: "cal-sum-leave", text: `${leave} leave` }),
      h("span", { class: "cal-sum-hint muted small", text: "Click a day to cycle: unmarked \u2192 present \u2192 leave \u2192 unmarked" }),
    ]),
  )
}

function legendDot(cls: string, label: string): HTMLElement {
  return h("span", { class: "cal-legend-item" }, [
    h("span", { class: `cal-dot ${cls}` }),
    h("span", { text: label }),
  ])
}

function buildGrid(
  ctx: ViewCtx,
  emp: Employee,
  map: Map<string, Attendance>,
): HTMLElement {
  const today = todayKey()
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const lead = (firstDow + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const cells: HTMLElement[] = DOW.map((d) =>
    h("div", { class: "cal-dow", text: d }),
  )

  for (let i = 0; i < lead; i++) {
    cells.push(h("div", { class: "cal-day cal-empty-cell" }))
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = ymd(new Date(viewYear, viewMonth, day))
    const a = map.get(dateKey)
    const statusCls = a ? (a.status === "present" ? "cal-present" : "cal-leave") : "cal-empty"
    const isToday = dateKey === today
    const title = a
      ? `${dateKey} \u2014 ${a.status === "present" ? "Present" : "Leave"}`
      : `${dateKey} \u2014 Unmarked`
    const btn = h<HTMLButtonElement>(
      "button",
      {
        class: `cal-day ${statusCls}${isToday ? " cal-today" : ""}`,
        type: "button",
        title,
        onclick: () => void cycleDay(ctx, emp, map, dateKey),
      },
      [
        h("span", { class: "cal-day-num", text: String(day) }),
        a ? h("span", { class: "cal-day-mark", text: a.status === "present" ? "P" : "L" }) : h("span", {}),
      ],
    )
    cells.push(btn)
  }
  const trailing = (7 - (cells.length % 7)) % 7
  for (let i = 0; i < trailing; i++) {
    cells.push(h("div", { class: "cal-day cal-empty-cell" }))
  }

  return h("div", { class: "cal-grid" }, cells)
}

async function cycleDay(
  ctx: ViewCtx,
  emp: Employee,
  map: Map<string, Attendance>,
  dateKey: string,
): Promise<void> {
  const current = map.get(dateKey)
  let next: AttendanceStatus | null
  if (!current) next = "present"
  else if (current.status === "present") next = "leave"
  else next = null

  try {
    if (next == null) {
      if (current) await db.deleteAttendance(current.id)
    } else if (!current) {
      await db.createAttendance({
        employee: emp.name,
        employee_id: emp.id,
        date: dateKey,
        check_in: null,
        check_out: null,
        status: next,
        note: null,
      })
    } else {
      await db.updateAttendance(current.id, {
        employee: emp.name,
        employee_id: emp.id,
        date: dateKey,
        check_in: null,
        check_out: null,
        status: next,
        note: current.note,
      })
    }
    await paint(ctx)
  } catch (err) {
    toast("Could not update attendance: " + (err as Error).message, "error")
  }
}
