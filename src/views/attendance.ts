import { db } from "../db"
import {
  FULL_DAY_HOURS,
  type Attendance,
  type AttendanceInput,
  type AttendanceQuery,
  type AttendanceStatus,
  type ViewCtx,
} from "../types"
import { formatDate } from "../format"
import { downloadCsv } from "../csv"
import { h, clear, toast } from "../ui"
import { closeModal, confirmDialog, openModal } from "../modal"

type Filter = "all" | AttendanceStatus

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  leave: "Leave",
  absent: "Absent",
}

let searchState = ""
let filterState: Filter = "all"
let fromDate = ""
let toDate = ""

function computeHours(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null
  const im = toMinutes(checkIn)
  const om = toMinutes(checkOut)
  if (im == null || om == null) return null
  let diff = om - im
  if (diff < 0) diff += 24 * 60
  return diff / 60
}

function toMinutes(t: string): number | null {
  const parts = t.split(":").map(Number)
  if (parts.some(isNaN)) return null
  return parts[0] * 60 + (parts[1] ?? 0)
}

function formatHours(hours: number | null): string {
  if (hours == null) return "\u2014"
  return `${hours.toFixed(1)}h`
}

function isShortDay(a: Attendance): boolean {
  if (a.status !== "present") return false
  const hrs = computeHours(a.check_in, a.check_out)
  return hrs != null && hrs < FULL_DAY_HOURS
}

function buildQuery(): AttendanceQuery {
  return {
    search: searchState,
    status: filterState === "all" ? null : (filterState as AttendanceStatus),
    from: fromDate || null,
    to: toDate || null,
  }
}

function statusPill(status: AttendanceStatus): HTMLElement {
  const cls =
    status === "present" ? "pill-green" : status === "leave" ? "pill-amber" : "pill-red"
  return h("span", { class: `pill ${cls}`, text: STATUS_LABEL[status] })
}

function hoursCell(a: Attendance): HTMLElement {
  const hrs = computeHours(a.check_in, a.check_out)
  if (hrs == null) return h("span", { class: "muted", text: "\u2014" })
  const short = a.status === "present" && hrs < FULL_DAY_HOURS
  return h(
    "span",
    { class: `hours ${short ? "hours-low" : "hours-ok"}`, text: formatHours(hrs) },
  )
}

function buildRow(a: Attendance, ctx: ViewCtx): HTMLElement {
  const nameCell = h("td", { class: "col-item" }, [
    h("div", { class: "cell-title", text: a.employee }),
    h("div", { class: "cell-sub", text: a.note ?? "" }),
  ])
  const dateCell = h("td", { class: "col-date", text: formatDate(a.date) })
  const inCell = h("td", { class: "col-time", text: a.check_in ?? "\u2014" })
  const outCell = h("td", { class: "col-time", text: a.check_out ?? "\u2014" })
  const hoursCol = h("td", { class: "col-hours" }, [hoursCell(a)])
  const statusCell = h("td", {}, [statusPill(a.status)])
  const actions = h("td", { class: "col-actions" }, [
    h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => openAttendanceForm(ctx, a) }, ["Edit"]),
    h("button", { class: "btn btn-danger-ghost btn-sm", type: "button", onclick: () => confirmDelete(a, ctx) }, ["Delete"]),
  ])
  return h("tr", {}, [nameCell, dateCell, inCell, outCell, hoursCol, statusCell, actions])
}

function computeStats(rows: Attendance[]): { present: number; leave: number; absent: number; shortDays: number } {
  let present = 0
  let leave = 0
  let absent = 0
  let shortDays = 0
  for (const a of rows) {
    if (a.status === "present") {
      present++
      if (isShortDay(a)) shortDays++
    } else if (a.status === "leave") {
      leave++
    } else {
      absent++
    }
  }
  return { present, leave, absent, shortDays }
}

function statTile(label: string, value: number, tone: string): HTMLElement {
  return h("div", { class: `stat-card tone-${tone}` }, [
    h("div", { class: "stat-label", text: label }),
    h("div", { class: "stat-value", text: value.toLocaleString() }),
  ])
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

export async function renderAttendance(ctx: ViewCtx): Promise<HTMLElement> {
  const rows = await db.getAttendance(buildQuery())
  const stats = computeStats(rows)

  const root = h("div", { class: "view attendance-view" }, [])

  root.append(
    h("div", { class: "stat-grid" }, [
      statTile("Entries", rows.length, "accent"),
      statTile("Present", stats.present, "green"),
      statTile("On leave", stats.leave, "amber"),
      statTile("Short days (<8h)", stats.shortDays, "red"),
    ]),
  )

  const search = h<HTMLInputElement>("input", {
    class: "input search-input",
    type: "search",
    placeholder: "Search by employee or note...",
    value: searchState,
    autocomplete: "off",
  })
  let debounce: number | undefined
  search.addEventListener("input", () => {
    searchState = search.value
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => ctx.refresh(), 200)
  })

  const filterBtns = (["all", "present", "leave", "absent"] as Filter[]).map((f) => {
    const btn = h<HTMLButtonElement>("button", { class: "seg", type: "button", onclick: () => setFilter(f, ctx) }, [
      f === "all" ? "All" : STATUS_LABEL[f as AttendanceStatus],
    ])
    btn.classList.toggle("seg-active", filterState === f)
    return btn
  })

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
    onclick: () => void exportReport(),
  }, ["Export report (CSV)"])

  const addBtn = h<HTMLButtonElement>("button", {
    class: "btn btn-primary",
    type: "button",
    onclick: () => openAttendanceForm(ctx),
  }, [
    h("span", { class: "plus", text: "+" }),
    " Add entry",
  ])

  const toolbar = h("div", { class: "toolbar movements-toolbar" }, [
    search,
    h("div", { class: "segmented" }, filterBtns),
    dateGroup,
    h("div", { class: "toolbar-right" }, [exportBtn, addBtn]),
  ])
  root.append(toolbar)

  const helpNote = h("p", {
    class: "muted small report-help",
    text: `Report export includes leaves and present days with less than ${FULL_DAY_HOURS} hours worked.`,
  })
  root.append(helpNote)

  if (rows.length === 0) {
    root.append(
      h("div", {
        class: "empty-card big",
        text: searchState || filterState !== "all" || fromDate || toDate
          ? "No attendance entries match your filters."
          : "No attendance entries yet. Click \u201cAdd entry\u201d to start tracking time.",
      }),
    )
    return root
  }

  const thead = h("thead", {}, [
    h("tr", {}, [
      h("th", { class: "col-item", text: "Employee" }),
      h("th", { class: "col-date", text: "Date" }),
      h("th", { class: "col-time", text: "Check in" }),
      h("th", { class: "col-time", text: "Check out" }),
      h("th", { class: "col-hours", text: "Hours" }),
      h("th", { text: "Status" }),
      h("th", { class: "col-actions", text: "Actions" }),
    ]),
  ])
  const tbody = h("tbody", {}, rows.map((a) => buildRow(a, ctx)))
  const tableWrap = h("div", { class: "table-wrap" }, [
    h("table", { class: "inv-table attendance-table" }, [thead, tbody]),
  ])
  root.append(tableWrap)

  return root
}

async function confirmDelete(a: Attendance, ctx: ViewCtx): Promise<void> {
  const ok = await confirmDialog(
    `Delete the attendance entry for "${a.employee}" on ${formatDate(a.date)}?`,
    { title: "Delete entry", confirmText: "Delete", danger: true },
  )
  if (!ok) return
  try {
    await db.deleteAttendance(a.id)
    toast("Entry deleted", "success")
    ctx.refresh()
  } catch (err) {
    toast("Could not delete: " + (err as Error).message, "error")
  }
}

async function openAttendanceForm(ctx: ViewCtx, existing?: Attendance): Promise<void> {
  const isEdit = !!existing
  let status: AttendanceStatus = existing?.status ?? "present"

  const employee = document.createElement("input")
  employee.className = "input"
  employee.name = "employee"
  employee.value = existing?.employee ?? ""
  employee.placeholder = "Employee name"
  employee.required = true

  const date = document.createElement("input")
  date.className = "input"
  date.type = "date"
  date.name = "date"
  date.value = existing?.date ?? new Date().toISOString().slice(0, 10)
  date.required = true

  const checkIn = document.createElement("input")
  checkIn.className = "input"
  checkIn.type = "time"
  checkIn.name = "check_in"
  checkIn.value = existing?.check_in ?? "09:00"

  const checkOut = document.createElement("input")
  checkOut.className = "input"
  checkOut.type = "time"
  checkOut.name = "check_out"
  checkOut.value = existing?.check_out ?? "17:00"

  const note = document.createElement("input")
  note.className = "input"
  note.name = "note"
  note.value = existing?.note ?? ""
  note.placeholder = "Optional note"

  const presentBtn = h<HTMLButtonElement>("button", { class: "seg", type: "button" }, ["Present"])
  const leaveBtn = h<HTMLButtonElement>("button", { class: "seg", type: "button" }, ["Leave"])
  const absentBtn = h<HTMLButtonElement>("button", { class: "seg", type: "button" }, ["Absent"])
  const segGroup = h("div", { class: "segmented type-toggle" }, [presentBtn, leaveBtn, absentBtn])

  const timesWrap = h("div", { class: "grid-2" }, [
    timeField("Check in", checkIn),
    timeField("Check out", checkOut),
  ])

  const liveHours = h("div", { class: "field-hint", text: "" })
  function refreshTimes(): void {
    const show = status === "present"
    timesWrap.style.display = show ? "" : "none"
    liveHours.style.display = show ? "" : "none"
    if (show) {
      const hrs = computeHours(checkIn.value, checkOut.value)
      if (hrs == null) {
        liveHours.textContent = ""
      } else if (hrs < FULL_DAY_HOURS) {
        liveHours.textContent = `${hrs.toFixed(1)}h \u2014 under ${FULL_DAY_HOURS}h (short day)`
        liveHours.classList.add("form-error")
      } else {
        liveHours.textContent = `${hrs.toFixed(1)}h`
        liveHours.classList.remove("form-error")
      }
    }
  }

  function setStatus(s: AttendanceStatus): void {
    status = s
    presentBtn.classList.toggle("seg-active", s === "present")
    leaveBtn.classList.toggle("seg-active", s === "leave")
    absentBtn.classList.toggle("seg-active", s === "absent")
    refreshTimes()
  }
  presentBtn.onclick = () => setStatus("present")
  leaveBtn.onclick = () => setStatus("leave")
  absentBtn.onclick = () => setStatus("absent")
  checkIn.addEventListener("input", refreshTimes)
  checkOut.addEventListener("input", refreshTimes)
  setStatus(status)

  const errorBox = h("div", { class: "form-error", role: "alert" }, [])
  const submitLabel = isEdit ? "Save changes" : "Add entry"
  const submitBtn = h<HTMLButtonElement>("button", { class: "btn btn-primary", type: "submit" }, [submitLabel])

  const form = h("form", { class: "stack" }, [
    field("Employee *", employee),
    field("Date *", date),
    field("Status", segGroup),
    timesWrap,
    liveHours,
    field("Note", note),
    errorBox,
    h("div", { class: "form-actions" }, [
      h("button", { class: "btn btn-ghost", type: "button", onclick: () => closeModal() }, ["Cancel"]),
      submitBtn,
    ]),
  ])

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    clear(errorBox)
    const emp = employee.value.trim()
    if (!emp) {
      errorBox.append("Please enter an employee name.")
      employee.focus()
      return
    }
    if (!date.value) {
      errorBox.append("Please pick a date.")
      date.focus()
      return
    }
    const input: AttendanceInput = {
      employee: emp,
      date: date.value,
      check_in: status === "present" ? checkIn.value || null : null,
      check_out: status === "present" ? checkOut.value || null : null,
      status,
      note: note.value.trim() || null,
    }
    submitBtn.disabled = true
    submitBtn.textContent = "Saving..."
    try {
      if (isEdit && existing) {
        await db.updateAttendance(existing.id, input)
        toast("Entry updated", "success")
      } else {
        await db.createAttendance(input)
        toast("Attendance added", "success")
      }
      closeModal()
      ctx.refresh()
    } catch (err) {
      submitBtn.disabled = false
      submitBtn.textContent = submitLabel
      errorBox.append("Could not save: " + (err as Error).message)
    }
  })

  openModal(isEdit ? "Edit attendance" : "Add attendance", form)
  setTimeout(() => employee.focus(), 80)
}

function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  const kids: (Node | string)[] = [h("label", { class: "field-label", text: label })]
  kids.push(input)
  if (hint) kids.push(h("div", { class: "field-hint", text: hint }))
  return h("div", { class: "field" }, kids)
}

function timeField(label: string, input: HTMLElement): HTMLElement {
  return h("div", { class: "field" }, [
    h("label", { class: "field-label", text: label }),
    input,
  ])
}

async function exportReport(): Promise<void> {
  try {
    const all = await db.getAttendance(buildQuery())
    const flagged = all.filter((a) => a.status === "leave" || isShortDay(a))
    if (flagged.length === 0) {
      toast("No leaves or short days in the current filters", "error")
      return
    }
    const headers = [
      "Employee",
      "Date",
      "Status",
      "Check In",
      "Check Out",
      "Hours",
      "Reason",
    ]
    const rows = flagged.map((a) => {
      const hrs = computeHours(a.check_in, a.check_out)
      return [
        a.employee,
        a.date,
        STATUS_LABEL[a.status],
        a.check_in ?? "",
        a.check_out ?? "",
        hrs != null ? hrs.toFixed(2) : "",
        a.note ?? "",
      ]
    })
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`attendance-report-${stamp}.csv`, headers, rows)
    toast(`Exported ${flagged.length} flagged entr${flagged.length === 1 ? "y" : "ies"}`, "success")
  } catch (err) {
    toast("Export failed: " + (err as Error).message, "error")
  }
}
