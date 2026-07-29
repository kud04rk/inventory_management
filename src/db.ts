import Database from "@tauri-apps/plugin-sql"
import type {
  Attendance,
  AttendanceInput,
  AttendanceQuery,
  DashboardMetrics,
  Employee,
  EmployeeInput,
  Item,
  ItemInput,
  ItemType,
  Movement,
  MovementType,
  Settings,
  Stats,
  TopSeller,
} from "./types"

export interface MovementQuery {
  itemId: string | null
  type: MovementType | null
  from: string | null
  to: string | null
}

const isTauri =
  "__TAURI_INTERNALS__" in window || "__TAURI__" in window

function buildMovementWhere(q: MovementQuery): { clause: string; params: unknown[] } {
  const where: string[] = []
  const params: unknown[] = []
  if (q.itemId) {
    where.push("m.item_id = ?")
    params.push(q.itemId)
  }
  if (q.type) {
    where.push("m.type = ?")
    params.push(q.type)
  }
  if (q.from) {
    where.push("m.created_at >= ?")
    params.push(q.from)
  }
  if (q.to) {
    where.push("m.created_at <= ?")
    params.push(q.to)
  }
  return { clause: where.length ? "WHERE " + where.join(" AND ") : "", params }
}

export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function monthBounds(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const fmt = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return { start: fmt(start), end: fmt(end) }
}

let pool: Database | null = null

export async function initDb(): Promise<void> {
  if (!isTauri) {
    mockSeed()
    return
  }
  pool = await Database.load("sqlite:inventory.db")
  await pool.execute("PRAGMA foreign_keys = ON;")
}

export function isPreview(): boolean {
  return !isTauri
}

interface Backend {
  getItems(search: string, category: string, type: ItemType | null): Promise<Item[]>
  getCategories(type?: ItemType | null): Promise<string[]>
  createItem(input: ItemInput): Promise<Item>
  updateItem(id: string, input: ItemInput): Promise<void>
  deleteItem(id: string): Promise<void>
  addMovement(
    itemId: string,
    type: MovementType,
    quantity: number,
    reason: string,
    note: string,
    unitPrice?: number,
    createdAt?: string,
  ): Promise<void>
  deleteMovement(id: string): Promise<void>
  getMovements(limit: number, itemId: string | null): Promise<Movement[]>
  getMovementsPage(limit: number, offset: number, query: MovementQuery): Promise<Movement[]>
  countMovements(query: MovementQuery): Promise<number>
  getMovementsAll(query: MovementQuery): Promise<Movement[]>
  getStats(type: ItemType | null): Promise<Stats>
  getItemValues(type: ItemType | null): Promise<Record<string, number>>
  getDashboardMetrics(type: ItemType | null): Promise<DashboardMetrics>
  getTopSellers(type: ItemType | null, limit: number): Promise<TopSeller[]>
  getSettings(): Promise<Settings>
  setSetting(key: string, value: string): Promise<void>
  getAttendance(query: AttendanceQuery): Promise<Attendance[]>
  createAttendance(input: AttendanceInput): Promise<Attendance>
  updateAttendance(id: string, input: AttendanceInput): Promise<void>
  deleteAttendance(id: string): Promise<void>
  getEmployees(): Promise<Employee[]>
  createEmployee(input: EmployeeInput): Promise<Employee>
  deleteEmployee(id: string): Promise<void>
  exportAll(): Promise<string>
  importAll(json: string): Promise<void>
}

const tauriBackend: Backend = {
  async getItems(search, category, type) {
    const params: unknown[] = []
    const where: string[] = []
    if (type) {
      where.push("type = ?")
      params.push(type)
    }
    const s = search.trim()
    if (s) {
      const like = `%${s}%`
      where.push(
        "(LOWER(name) LIKE LOWER(?) OR LOWER(COALESCE(sku,'')) LIKE LOWER(?) OR LOWER(COALESCE(category,'')) LIKE LOWER(?))",
      )
      params.push(like, like, like)
    }
    if (category) {
      where.push("category = ?")
      params.push(category)
    }
    const sql =
      "SELECT * FROM items " +
      (where.length ? "WHERE " + where.join(" AND ") : "") +
      " ORDER BY LOWER(name) ASC"
    return pool!.select<Item[]>(sql, params)
  },

  async getCategories(type = null) {
    const sql =
      "SELECT DISTINCT category FROM items WHERE category IS NOT NULL AND category <> ''" +
      (type ? " AND type = ?" : "") +
      " ORDER BY LOWER(category) ASC"
    const params = type ? [type] : []
    const rows = await pool!.select<{ category: string }[]>(sql, params)
    return rows.map((r) => r.category)
  },

  async createItem(input) {
    const id = uid()
    const now = new Date().toISOString()
    await pool!.execute(
      `INSERT INTO items (id, name, type, sku, category, quantity, unit, price, location, reorder_level, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.name,
        input.type,
        input.sku || null,
        input.category || null,
        input.quantity,
        input.unit || null,
        input.price,
        input.location || null,
        input.reorder_level,
        input.notes || null,
        now,
        now,
      ],
    )
    return { ...input, id, created_at: now, updated_at: now }
  },

  async updateItem(id, input) {
    const now = new Date().toISOString()
    await pool!.execute(
      `UPDATE items SET name=?, type=?, sku=?, category=?, quantity=?, unit=?, price=?, location=?, reorder_level=?, notes=?, updated_at=? WHERE id=?`,
      [
        input.name,
        input.type,
        input.sku || null,
        input.category || null,
        input.quantity,
        input.unit || null,
        input.price,
        input.location || null,
        input.reorder_level,
        input.notes || null,
        now,
        id,
      ],
    )
  },

  async deleteItem(id) {
    await pool!.execute("DELETE FROM movements WHERE item_id = ?", [id])
    await pool!.execute("DELETE FROM items WHERE id = ?", [id])
  },

  async addMovement(itemId, type, quantity, reason, note, unitPrice, createdAt) {
    const now = new Date().toISOString()
    const moveDate = createdAt ?? now
    let actual = quantity
    let consumedJson: string | null = null
    if (type === "out") {
      const rows = await pool!.select<{ quantity: number }[]>(
        "SELECT quantity FROM items WHERE id = ?",
        [itemId],
      )
      const current = rows[0]?.quantity ?? 0
      actual = Math.min(quantity, current)
      const batches = await pool!.select<{ id: string; remaining: number }[]>(
        "SELECT id, remaining FROM movements WHERE item_id = ? AND type = 'in' AND remaining > 0 ORDER BY created_at ASC, id ASC",
        [itemId],
      )
      const consumed: { id: string; qty: number }[] = []
      let toRemove = actual
      for (const b of batches) {
        if (toRemove <= 0) break
        const take = Math.min(b.remaining, toRemove)
        await pool!.execute(
          "UPDATE movements SET remaining = remaining - ? WHERE id = ?",
          [take, b.id],
        )
        consumed.push({ id: b.id, qty: take })
        toRemove -= take
      }
      if (consumed.length) consumedJson = JSON.stringify(consumed)
    }
    const delta = type === "in" ? actual : -actual
    await pool!.execute(
      "UPDATE items SET quantity = quantity + ?, updated_at = ? WHERE id = ?",
      [delta, now, itemId],
    )
    await pool!.execute(
      `INSERT INTO movements (id, item_id, type, quantity, reason, note, created_at, unit_price, remaining, consumed)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        uid(),
        itemId,
        type,
        actual,
        reason || null,
        note || null,
        moveDate,
        type === "in" ? (unitPrice ?? 0) : (unitPrice ?? null),
        type === "in" ? actual : null,
        consumedJson,
      ],
    )
  },

  async deleteMovement(id) {
    const rows = await pool!.select<
      { type: MovementType; quantity: number; item_id: string; consumed: string | null }[]
    >("SELECT type, quantity, item_id, consumed FROM movements WHERE id = ?", [id])
    const mv = rows[0]
    if (!mv) return
    const now = new Date().toISOString()
    if (mv.type === "out" && mv.consumed) {
      const consumed = JSON.parse(mv.consumed) as { id: string; qty: number }[]
      for (const c of consumed) {
        await pool!.execute(
          "UPDATE movements SET remaining = remaining + ? WHERE id = ?",
          [c.qty, c.id],
        )
      }
      await pool!.execute(
        "UPDATE items SET quantity = quantity + ?, updated_at = ? WHERE id = ?",
        [mv.quantity, now, mv.item_id],
      )
    } else if (mv.type === "in") {
      const b = await pool!.select<{ remaining: number | null }[]>(
        "SELECT remaining FROM movements WHERE id = ?",
        [id],
      )
      const rem = b[0]?.remaining ?? 0
      const onHand = await pool!.select<{ quantity: number }[]>(
        "SELECT quantity FROM items WHERE id = ?",
        [mv.item_id],
      )
      const removeQty = Math.min(rem, onHand[0]?.quantity ?? 0)
      await pool!.execute(
        "UPDATE items SET quantity = quantity - ?, updated_at = ? WHERE id = ?",
        [removeQty, now, mv.item_id],
      )
    } else {
      await pool!.execute(
        "UPDATE items SET quantity = quantity + ?, updated_at = ? WHERE id = ?",
        [mv.quantity, now, mv.item_id],
      )
    }
    await pool!.execute("DELETE FROM movements WHERE id = ?", [id])
  },

  async getMovements(limit, itemId) {
    const params: unknown[] = []
    const where: string[] = []
    if (itemId) {
      where.push("m.item_id = ?")
      params.push(itemId)
    }
    const sql =
      "SELECT m.*, i.name AS item_name FROM movements m LEFT JOIN items i ON i.id = m.item_id " +
      (where.length ? "WHERE " + where.join(" AND ") : "") +
      " ORDER BY m.created_at DESC LIMIT ?"
    params.push(limit)
    return pool!.select<Movement[]>(sql, params)
  },

  async getMovementsPage(limit, offset, query) {
    const { clause, params } = buildMovementWhere(query)
    const sql =
      "SELECT m.*, i.name AS item_name FROM movements m LEFT JOIN items i ON i.id = m.item_id " +
      clause +
      " ORDER BY m.created_at DESC LIMIT ? OFFSET ?"
    return pool!.select<Movement[]>(sql, [...params, limit, offset])
  },

  async countMovements(query) {
    const { clause, params } = buildMovementWhere(query)
    const rows = await pool!.select<{ c: number }[]>(
      "SELECT COUNT(*) AS c FROM movements m " + clause,
      params,
    )
    return Number(rows[0]?.c) || 0
  },

  async getMovementsAll(query) {
    const { clause, params } = buildMovementWhere(query)
    const sql =
      "SELECT m.*, i.name AS item_name FROM movements m LEFT JOIN items i ON i.id = m.item_id " +
      clause +
      " ORDER BY m.created_at DESC"
    return pool!.select<Movement[]>(sql, params)
  },

  async getStats(type) {
    const where = type ? "WHERE type = ?" : ""
    const valWhere = type ? "WHERE i.type = ?" : ""
    const params = type ? [type] : []
    const rows = await pool!.select<
      {
        totalItems: number
        totalUnits: number
        lowStockCount: number
        categories: number
      }[]
    >(
      `SELECT
         COUNT(*) AS totalItems,
         COALESCE(SUM(quantity),0) AS totalUnits,
         COALESCE(SUM(CASE WHEN reorder_level > 0 AND quantity <= reorder_level THEN 1 ELSE 0 END),0) AS lowStockCount,
         COUNT(DISTINCT CASE WHEN category IS NOT NULL AND category <> '' THEN category END) AS categories
       FROM items ${where}`,
      params,
    )
    const valRows = await pool!.select<{ totalValue: number }[]>(
      `SELECT COALESCE(SUM(m.remaining * COALESCE(m.unit_price, i.price)),0) AS totalValue
       FROM items i
       JOIN movements m ON m.item_id = i.id AND m.type = 'in' AND m.remaining > 0
       ${valWhere}`,
      params,
    )
    const r = rows[0] ?? {
      totalItems: 0,
      totalUnits: 0,
      lowStockCount: 0,
      categories: 0,
    }
    return {
      totalItems: Number(r.totalItems) || 0,
      totalUnits: Number(r.totalUnits) || 0,
      totalValue: Number(valRows[0]?.totalValue) || 0,
      lowStockCount: Number(r.lowStockCount) || 0,
      categories: Number(r.categories) || 0,
    }
  },

  async getItemValues(type) {
    const where = type ? "WHERE i.type = ?" : ""
    const params = type ? [type] : []
    const rows = await pool!.select<{ item_id: string; value: number }[]>(
      `SELECT i.id AS item_id,
         COALESCE(SUM(m.remaining * COALESCE(m.unit_price, i.price)),0) AS value
       FROM items i
       LEFT JOIN movements m ON m.item_id = i.id AND m.type = 'in' AND m.remaining > 0
       ${where}
       GROUP BY i.id`,
      params,
    )
    const map: Record<string, number> = {}
    for (const r of rows) map[r.item_id] = Number(r.value) || 0
    return map
  },

  async getDashboardMetrics(type) {
    const typeAnd = type ? "AND i.type = ?" : ""
    const tp = type ? [type] : []
    const today = todayStr()
    const { start, end } = monthBounds()

    const finWhere: string[] = ["m.created_at >= ?", "m.created_at < ?"]
    const finParams: unknown[] = [start, end]
    if (type) {
      finWhere.push("i.type = ?")
      finParams.push(type)
    }
    const fin = await pool!.select<{
      revenue: number
      unitsSold: number
      salesCount: number
      purchaseCost: number
      unitsPurchased: number
      purchaseCount: number
    }[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN m.type='out' AND m.unit_price IS NOT NULL THEN m.quantity*m.unit_price ELSE 0 END),0) AS revenue,
         COALESCE(SUM(CASE WHEN m.type='out' AND m.unit_price IS NOT NULL THEN m.quantity ELSE 0 END),0) AS unitsSold,
         COALESCE(SUM(CASE WHEN m.type='out' AND m.unit_price IS NOT NULL THEN 1 ELSE 0 END),0) AS salesCount,
         COALESCE(SUM(CASE WHEN m.type='in' THEN m.quantity*COALESCE(m.unit_price,0) ELSE 0 END),0) AS purchaseCost,
         COALESCE(SUM(CASE WHEN m.type='in' THEN m.quantity ELSE 0 END),0) AS unitsPurchased,
         COALESCE(SUM(CASE WHEN m.type='in' THEN 1 ELSE 0 END),0) AS purchaseCount
       FROM movements m LEFT JOIN items i ON i.id=m.item_id WHERE ${finWhere.join(" AND ")}`,
      finParams,
    )
    const cogs = await pool!.select<{ cogs: number }[]>(
      `SELECT COALESCE(SUM(json_extract(c.value,'$.qty')*b.unit_price),0) AS cogs
       FROM movements o
       LEFT JOIN items i ON i.id=o.item_id
       JOIN json_each(o.consumed) c
       JOIN movements b ON b.id=json_extract(c.value,'$.id')
       WHERE o.type='out' AND o.unit_price IS NOT NULL AND o.consumed IS NOT NULL AND json_valid(o.consumed)
         AND o.created_at >= ? AND o.created_at < ? ${typeAnd}`,
      [start, end, ...tp],
    )
    const att = await pool!.select<{
      total: number
      present: number
      onleave: number
      absent: number
      todayPresent: number
    }[]>(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN status='present' THEN 1 ELSE 0 END),0) AS present,
         COALESCE(SUM(CASE WHEN status='leave' THEN 1 ELSE 0 END),0) AS onleave,
         COALESCE(SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END),0) AS absent,
         COALESCE(SUM(CASE WHEN status='present' AND date=? THEN 1 ELSE 0 END),0) AS todayPresent
       FROM attendance
       WHERE date >= ? AND date < ?`,
      [today, start, end],
    )
    const emp = await pool!.select<{ c: number }[]>(
      "SELECT COUNT(*) AS c FROM employees",
    )
    const f = fin[0] ?? {}
    const a = att[0] ?? {}
    return {
      revenue: Number(f.revenue) || 0,
      unitsSold: Number(f.unitsSold) || 0,
      salesCount: Number(f.salesCount) || 0,
      purchaseCost: Number(f.purchaseCost) || 0,
      unitsPurchased: Number(f.unitsPurchased) || 0,
      purchaseCount: Number(f.purchaseCount) || 0,
      cogs: Number(cogs[0]?.cogs) || 0,
      attendanceTotal: Number(a.total) || 0,
      present: Number(a.present) || 0,
      leave: Number(a.onleave) || 0,
      absent: Number(a.absent) || 0,
      todayPresent: Number(a.todayPresent) || 0,
      employeeCount: Number(emp[0]?.c) || 0,
    }
  },

  async getTopSellers(type, limit) {
    const typeAnd = type ? "AND i.type = ?" : ""
    const tp = type ? [type] : []
    const rows = await pool!.select<
      { item_id: string; item_name: string | null; units: number; revenue: number }[]
    >(
      `SELECT m.item_id AS item_id, i.name AS item_name,
         SUM(m.quantity) AS units, SUM(m.quantity*m.unit_price) AS revenue
       FROM movements m LEFT JOIN items i ON i.id=m.item_id
       WHERE m.type='out' AND m.unit_price IS NOT NULL ${typeAnd}
       GROUP BY m.item_id
       ORDER BY units DESC
       LIMIT ?`,
      [...tp, limit],
    )
    return rows.map((r) => ({
      item_id: r.item_id,
      item_name: r.item_name ?? null,
      units: Number(r.units) || 0,
      revenue: Number(r.revenue) || 0,
    }))
  },

  async getSettings() {
    const rows = await pool!.select<{ key: string; value: string }[]>(
      "SELECT key, value FROM settings",
    )
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return {
      currency: map["currency"] ?? "₹",
      storeName: map["store_name"] ?? "My Store",
    }
  },

  async setSetting(key, value) {
    await pool!.execute(
      "INSERT INTO settings(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    )
  },

  async getAttendance(query) {
    const where: string[] = []
    const params: unknown[] = []
    const s = query.search.trim().toLowerCase()
    if (s) {
      where.push("(LOWER(employee) LIKE LOWER(?) OR LOWER(COALESCE(note,'')) LIKE LOWER(?))")
      params.push(`%${s}%`, `%${s}%`)
    }
    if (query.status) {
      where.push("status = ?")
      params.push(query.status)
    }
    if (query.employeeId) {
      where.push("employee_id = ?")
      params.push(query.employeeId)
    }
    if (query.from) {
      where.push("date >= ?")
      params.push(query.from)
    }
    if (query.to) {
      where.push("date <= ?")
      params.push(query.to)
    }
    const sql =
      "SELECT * FROM attendance " +
      (where.length ? "WHERE " + where.join(" AND ") : "") +
      " ORDER BY date DESC, created_at DESC"
    return pool!.select<Attendance[]>(sql, params)
  },

  async createAttendance(input) {
    const id = uid()
    const now = new Date().toISOString()
    await pool!.execute(
      `INSERT INTO attendance (id, employee, employee_id, date, check_in, check_out, status, note, overtime, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.employee,
        input.employee_id ?? null,
        input.date,
        input.check_in || null,
        input.check_out || null,
        input.status,
        input.note || null,
        input.overtime ?? null,
        now,
        now,
      ],
    )
    return { ...input, id, created_at: now, updated_at: now }
  },

  async updateAttendance(id, input) {
    const now = new Date().toISOString()
    await pool!.execute(
      `UPDATE attendance SET employee=?, employee_id=?, date=?, check_in=?, check_out=?, status=?, note=?, overtime=?, updated_at=? WHERE id=?`,
      [
        input.employee,
        input.employee_id ?? null,
        input.date,
        input.check_in || null,
        input.check_out || null,
        input.status,
        input.note || null,
        input.overtime ?? null,
        now,
        id,
      ],
    )
  },

  async deleteAttendance(id) {
    await pool!.execute("DELETE FROM attendance WHERE id = ?", [id])
  },

  async getEmployees() {
    return pool!.select<Employee[]>("SELECT * FROM employees ORDER BY LOWER(name) ASC")
  },

  async createEmployee(input) {
    const id = uid()
    const now = new Date().toISOString()
    await pool!.execute(
      `INSERT INTO employees (id, name, created_at, updated_at) VALUES (?,?,?,?)`,
      [id, input.name, now, now],
    )
    return { id, name: input.name, created_at: now, updated_at: now }
  },

  async deleteEmployee(id) {
    await pool!.execute("DELETE FROM attendance WHERE employee_id = ?", [id])
    await pool!.execute("DELETE FROM employees WHERE id = ?", [id])
  },

  async exportAll() {
    const items = await pool!.select<Item[]>("SELECT * FROM items")
    const movements = await pool!.select<Movement[]>(
      "SELECT * FROM movements",
    )
    const attendance = await pool!.select<Attendance[]>(
      "SELECT * FROM attendance",
    )
    const employees = await pool!.select<Employee[]>("SELECT * FROM employees")
    const settings = await pool!.select<{ key: string; value: string }[]>(
      "SELECT * FROM settings",
    )
    return JSON.stringify(
      { exportedAt: new Date().toISOString(), items, movements, attendance, employees, settings },
      null,
      2,
    )
  },

  async importAll(json) {
    const data = JSON.parse(json) as {
      items: Item[]
      movements: Movement[]
      attendance?: Attendance[]
      employees?: Employee[]
      settings: { key: string; value: string }[]
    }
    await pool!.execute("BEGIN")
    try {
      await pool!.execute("DELETE FROM movements")
      await pool!.execute("DELETE FROM items")
      await pool!.execute("DELETE FROM attendance")
      await pool!.execute("DELETE FROM employees")
      await pool!.execute("DELETE FROM settings")
      for (const it of data.items ?? []) {
        await pool!.execute(
          `INSERT INTO items (id,name,type,sku,category,quantity,unit,price,location,reorder_level,notes,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            it.id,
            it.name,
            it.type ?? "finished",
            it.sku,
            it.category,
            it.quantity,
            it.unit,
            it.price,
            it.location,
            it.reorder_level,
            it.notes,
            it.created_at,
            it.updated_at,
          ],
        )
      }
      for (const mv of data.movements ?? []) {
        await pool!.execute(
          `INSERT INTO movements (id,item_id,type,quantity,reason,note,created_at,unit_price,remaining,consumed) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            mv.id,
            mv.item_id,
            mv.type,
            mv.quantity,
            mv.reason,
            mv.note,
            mv.created_at,
            mv.unit_price ?? null,
            mv.remaining ?? null,
            mv.consumed ?? null,
          ],
        )
      }
      for (const s of data.settings ?? []) {
        await pool!.execute(
          "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          [s.key, s.value],
        )
      }
      for (const e of data.employees ?? []) {
        await pool!.execute(
          `INSERT INTO employees (id, name, created_at, updated_at) VALUES (?,?,?,?)`,
          [e.id, e.name, e.created_at, e.updated_at],
        )
      }
      for (const a of data.attendance ?? []) {
        await pool!.execute(
          `INSERT INTO attendance (id, employee, employee_id, date, check_in, check_out, status, note, overtime, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            a.id,
            a.employee,
            a.employee_id ?? null,
            a.date,
            a.check_in ?? null,
            a.check_out ?? null,
            a.status,
            a.note ?? null,
            a.overtime ?? null,
            a.created_at,
            a.updated_at,
          ],
        )
      }
      await pool!.execute("COMMIT")
    } catch (err) {
      await pool!.execute("ROLLBACK")
      throw err
    }
  },
}

// ---- Browser fallback (only used when running the UI without Tauri) ----

const KEYS = {
  items: "inv.items",
  movements: "inv.movements",
  settings: "inv.settings",
  attendance: "inv.attendance",
  employees: "inv.employees",
  seeded: "inv.seeded",
}

function lsLoad<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function lsSave(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function mockSeed(): void {
  if (localStorage.getItem(KEYS.seeded)) return
  const now = Date.now()
  const items: Item[] = [
    mkItem("Rice 5kg Bag", "finished", "RICE-5KG", "Groceries", 24, "bag", 450, "Shelf A1", 10, now),
    mkItem("Cooking Oil 1L", "finished", "OIL-1L", "Groceries", 4, "pcs", 180, "Shelf A2", 8, now),
    mkItem("Notebook A5", "finished", "NB-A5", "Stationery", 52, "pcs", 45, "Drawer B1", 20, now),
    mkItem("Ballpoint Pen", "finished", "PEN-BLUE", "Stationery", 3, "pcs", 10, "Drawer B2", 15, now),
    mkItem("Bottled Water 500ml", "finished", "WATER-500", "Beverages", 120, "pcs", 15, "Cooler C1", 24, now),
    mkItem("Raw Flour 25kg", "raw", "FLR-25", "Ingredients", 40, "bag", 1100, "Store Room", 12, now),
    mkItem("Sugar 50kg", "raw", "SUG-50", "Ingredients", 2, "bag", 2600, "Store Room", 5, now),
    mkItem("Packaging Box", "raw", "PKG-BOX", "Packaging", 300, "pcs", 6, "Warehouse", 100, now),
  ]
  const movements: Movement[] = items.map((it) => ({
    id: uid(),
    item_id: it.id,
    type: "in",
    quantity: it.quantity,
    reason: "Opening balance",
    note: null,
    created_at: it.created_at,
    item_name: it.name,
    unit_price: it.price,
    remaining: it.quantity,
    consumed: null,
  }))
  lsSave(KEYS.items, items)
  lsSave(KEYS.movements, movements)
  const employees = seedEmployees()
  lsSave(KEYS.employees, employees)
  lsSave(KEYS.attendance, seedAttendance(employees))
  lsSave(KEYS.settings, [
    { key: "currency", value: "₹" },
    { key: "store_name", value: "My Store" },
  ])
  localStorage.setItem(KEYS.seeded, "1")
}

function seedEmployees(): Employee[] {
  const now = new Date().toISOString()
  const mk = (name: string): Employee => ({
    id: uid(),
    name,
    created_at: now,
    updated_at: now,
  })
  return [mk("Aarav Sharma"), mk("Priya Nair"), mk("Rahul Verma")]
}

function seedAttendance(employees: Employee[]): Attendance[] {
  const out: Attendance[] = []
  const today = new Date()
  const ymd = (offset: number): string => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  const byName = new Map(employees.map((e) => [e.name, e.id]))
  const push = (
    employee: string,
    date: string,
    status: Attendance["status"],
    note: string | null,
    overtime: number | null = null,
  ): void => {
    const now = new Date().toISOString()
    out.push({
      id: uid(),
      employee,
      employee_id: byName.get(employee) ?? null,
      date,
      check_in: null,
      check_out: null,
      status,
      note,
      overtime,
      created_at: now,
      updated_at: now,
    })
  }
  push("Aarav Sharma", ymd(2), "present", null, 1.5)
  push("Aarav Sharma", ymd(1), "present", "Left early")
  push("Aarav Sharma", ymd(0), "leave", "Sick leave")
  push("Priya Nair", ymd(2), "present", null, 2)
  push("Priya Nair", ymd(1), "leave", "Personal")
  push("Priya Nair", ymd(0), "present", null)
  push("Rahul Verma", ymd(1), "absent", "No notice")
  return out
}

function normItem(i: Item): Item {
  return { ...i, type: i.type ?? "finished" }
}

function mockQueryMovements(query: MovementQuery): Movement[] {
  const movements = lsLoad<Movement[]>(KEYS.movements, [])
  const items = lsLoad<Item[]>(KEYS.items, [])
  const nameMap = new Map(items.map((i) => [i.id, i.name]))
  let result = movements.map((m) => ({
    ...m,
    item_name: m.item_name ?? nameMap.get(m.item_id),
  }))
  if (query.itemId) result = result.filter((m) => m.item_id === query.itemId)
  if (query.type) result = result.filter((m) => m.type === query.type)
  if (query.from) result = result.filter((m) => m.created_at >= query.from!)
  if (query.to) result = result.filter((m) => m.created_at <= query.to!)
  result.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return result
}

function mkItem(
  name: string,
  type: ItemType,
  sku: string,
  category: string,
  quantity: number,
  unit: string,
  price: number,
  location: string,
  reorder_level: number,
  now: number,
): Item {
  return {
    id: uid(),
    name,
    type,
    sku,
    category,
    quantity,
    unit,
    price,
    location,
    reorder_level,
    notes: null,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  }
}

const mockBackend: Backend = {
  async getItems(search, category, type) {
    let items = lsLoad<Item[]>(KEYS.items, []).map(normItem)
    if (type) items = items.filter((i) => i.type === type)
    const s = search.trim().toLowerCase()
    if (s) {
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(s) ||
          (i.sku ?? "").toLowerCase().includes(s) ||
          (i.category ?? "").toLowerCase().includes(s),
      )
    }
    if (category) items = items.filter((i) => i.category === category)
    return [...items].sort((a, b) => a.name.localeCompare(b.name))
  },

  async getCategories(type = null) {
    let items = lsLoad<Item[]>(KEYS.items, []).map(normItem)
    if (type) items = items.filter((i) => i.type === type)
    const set = new Set<string>()
    for (const i of items) if (i.category) set.add(i.category)
    return [...set].sort((a, b) => a.localeCompare(b))
  },

  async createItem(input) {
    const items = lsLoad<Item[]>(KEYS.items, [])
    const item = { ...input, id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    items.push(item)
    lsSave(KEYS.items, items)
    return item
  },

  async updateItem(id, input) {
    const items = lsLoad<Item[]>(KEYS.items, [])
    const idx = items.findIndex((i) => i.id === id)
    if (idx >= 0) {
      items[idx] = { ...items[idx], ...input, updated_at: new Date().toISOString() }
      lsSave(KEYS.items, items)
    }
  },

  async deleteItem(id) {
    let items = lsLoad<Item[]>(KEYS.items, [])
    items = items.filter((i) => i.id !== id)
    let movements = lsLoad<Movement[]>(KEYS.movements, [])
    movements = movements.filter((m) => m.item_id !== id)
    lsSave(KEYS.items, items)
    lsSave(KEYS.movements, movements)
  },

  async addMovement(itemId, type, quantity, reason, note, unitPrice, createdAt) {
    const items = lsLoad<Item[]>(KEYS.items, [])
    const idx = items.findIndex((i) => i.id === itemId)
    if (idx < 0) return
    const movements = lsLoad<Movement[]>(KEYS.movements, [])
    let actual = quantity
    let consumedJson: string | null = null
    if (type === "out") {
      actual = Math.min(quantity, items[idx].quantity)
      const batches = movements
        .filter((m) => m.item_id === itemId && m.type === "in" && (m.remaining ?? 0) > 0)
        .sort((a, b) =>
          a.created_at < b.created_at
            ? -1
            : a.created_at > b.created_at
              ? 1
              : a.id < b.id
                ? -1
                : 1,
        )
      const consumed: { id: string; qty: number }[] = []
      let toRemove = actual
      for (const b of batches) {
        if (toRemove <= 0) break
        const rem = b.remaining ?? 0
        const take = Math.min(rem, toRemove)
        b.remaining = rem - take
        consumed.push({ id: b.id, qty: take })
        toRemove -= take
      }
      if (consumed.length) consumedJson = JSON.stringify(consumed)
    }
    items[idx].quantity += type === "in" ? actual : -actual
    items[idx].updated_at = new Date().toISOString()
    lsSave(KEYS.items, items)
    const item = items[idx]
    movements.push({
      id: uid(),
      item_id: itemId,
      type,
      quantity: actual,
      reason: reason || null,
      note: note || null,
      created_at: createdAt ?? new Date().toISOString(),
      item_name: item.name,
      unit_price: type === "in" ? (unitPrice ?? 0) : (unitPrice ?? null),
      remaining: type === "in" ? actual : null,
      consumed: type === "out" ? consumedJson : null,
    })
    lsSave(KEYS.movements, movements)
  },

  async deleteMovement(id) {
    const movements = lsLoad<Movement[]>(KEYS.movements, [])
    const mv = movements.find((m) => m.id === id)
    if (!mv) return
    const items = lsLoad<Item[]>(KEYS.items, [])
    const idx = items.findIndex((i) => i.id === mv.item_id)
    if (idx >= 0) {
      if (mv.type === "out" && mv.consumed) {
        const consumed = JSON.parse(mv.consumed) as { id: string; qty: number }[]
        for (const c of consumed) {
          const bm = movements.find((m) => m.id === c.id)
          if (bm) bm.remaining = (bm.remaining ?? 0) + c.qty
        }
        items[idx].quantity += mv.quantity
      } else if (mv.type === "in") {
        const removeQty = Math.min(mv.remaining ?? 0, items[idx].quantity)
        items[idx].quantity -= removeQty
      } else {
        items[idx].quantity += mv.quantity
      }
      items[idx].updated_at = new Date().toISOString()
      lsSave(KEYS.items, items)
    }
    lsSave(
      KEYS.movements,
      movements.filter((m) => m.id !== id),
    )
  },

  async getMovements(limit, itemId) {
    let movements = lsLoad<Movement[]>(KEYS.movements, [])
    const items = lsLoad<Item[]>(KEYS.items, [])
    const nameMap = new Map(items.map((i) => [i.id, i.name]))
    let result = movements.map((m) => ({
      ...m,
      item_name: m.item_name ?? nameMap.get(m.item_id),
    }))
    if (itemId) result = result.filter((m) => m.item_id === itemId)
    result.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return result.slice(0, limit)
  },

  async getMovementsPage(limit, offset, query) {
    const all = await mockQueryMovements(query)
    return all.slice(offset, offset + limit)
  },

  async countMovements(query) {
    return (await mockQueryMovements(query)).length
  },

  async getMovementsAll(query) {
    return mockQueryMovements(query)
  },

  async getStats(type) {
    let items = lsLoad<Item[]>(KEYS.items, []).map(normItem)
    if (type) items = items.filter((i) => i.type === type)
    const movements = lsLoad<Movement[]>(KEYS.movements, [])
    const ids = new Set(items.map((i) => i.id))
    const priceMap = new Map(items.map((i) => [i.id, i.price]))
    const cats = new Set<string>()
    let totalUnits = 0
    let low = 0
    let totalValue = 0
    for (const i of items) {
      totalUnits += i.quantity
      if (i.category) cats.add(i.category)
      if (i.reorder_level > 0 && i.quantity <= i.reorder_level) low++
    }
    for (const m of movements) {
      if (m.type === "in" && (m.remaining ?? 0) > 0 && ids.has(m.item_id)) {
        const price = m.unit_price ?? priceMap.get(m.item_id) ?? 0
        totalValue += (m.remaining ?? 0) * price
      }
    }
    return {
      totalItems: items.length,
      totalUnits,
      totalValue,
      lowStockCount: low,
      categories: cats.size,
    }
  },

  async getItemValues(type) {
    let items = lsLoad<Item[]>(KEYS.items, []).map(normItem)
    if (type) items = items.filter((i) => i.type === type)
    const movements = lsLoad<Movement[]>(KEYS.movements, [])
    const priceMap = new Map(items.map((i) => [i.id, i.price]))
    const map: Record<string, number> = {}
    for (const i of items) map[i.id] = 0
    for (const m of movements) {
      if (m.type === "in" && (m.remaining ?? 0) > 0 && m.item_id in map) {
        const price = m.unit_price ?? priceMap.get(m.item_id) ?? 0
        map[m.item_id] += (m.remaining ?? 0) * price
      }
    }
    return map
  },

  async getDashboardMetrics(type) {
    const items = lsLoad<Item[]>(KEYS.items, []).map(normItem)
    const movements = lsLoad<Movement[]>(KEYS.movements, [])
    const { start, end } = monthBounds()
    const typeIds = type
      ? new Set(items.filter((i) => i.type === type).map((i) => i.id))
      : null
    const inType = (itemId: string): boolean => !typeIds || typeIds.has(itemId)
    const inMonth = (ts: string): boolean => ts >= start && ts < end

    const inPrice = new Map<string, number>()
    for (const m of movements) {
      if (m.type === "in") inPrice.set(m.id, m.unit_price ?? 0)
    }

    let revenue = 0
    let unitsSold = 0
    let salesCount = 0
    let purchaseCost = 0
    let unitsPurchased = 0
    let purchaseCount = 0
    let cogs = 0
    for (const m of movements) {
      if (!inType(m.item_id) || !inMonth(m.created_at)) continue
      if (m.type === "out" && m.unit_price != null) {
        revenue += m.quantity * m.unit_price
        unitsSold += m.quantity
        salesCount += 1
        if (m.consumed) {
          try {
            const consumed = JSON.parse(m.consumed) as { id: string; qty: number }[]
            for (const c of consumed) {
              cogs += c.qty * (inPrice.get(c.id) ?? 0)
            }
          } catch {
            /* ignore malformed consumed payload */
          }
        }
      } else if (m.type === "in") {
        purchaseCost += m.quantity * (m.unit_price ?? 0)
        unitsPurchased += m.quantity
        purchaseCount += 1
      }
    }

    const attendance = lsLoad<Attendance[]>(KEYS.attendance, []).filter(
      (a) => a.date >= start && a.date < end,
    )
    const today = todayStr()
    let present = 0
    let leave = 0
    let absent = 0
    let todayPresent = 0
    for (const a of attendance) {
      if (a.status === "present") {
        present++
        if (a.date === today) todayPresent++
      } else if (a.status === "leave") leave++
      else if (a.status === "absent") absent++
    }
    const employees = lsLoad<Employee[]>(KEYS.employees, [])

    return {
      revenue,
      unitsSold,
      salesCount,
      purchaseCost,
      unitsPurchased,
      purchaseCount,
      cogs,
      attendanceTotal: attendance.length,
      present,
      leave,
      absent,
      todayPresent,
      employeeCount: employees.length,
    }
  },

  async getTopSellers(type, limit) {
    const items = lsLoad<Item[]>(KEYS.items, []).map(normItem)
    const nameMap = new Map(items.map((i) => [i.id, i.name]))
    const typeIds = type
      ? new Set(items.filter((i) => i.type === type).map((i) => i.id))
      : null
    const movements = lsLoad<Movement[]>(KEYS.movements, [])
    const agg = new Map<string, { units: number; revenue: number }>()
    for (const m of movements) {
      if (m.type !== "out" || m.unit_price == null) continue
      if (typeIds && !typeIds.has(m.item_id)) continue
      const cur = agg.get(m.item_id) ?? { units: 0, revenue: 0 }
      cur.units += m.quantity
      cur.revenue += m.quantity * m.unit_price
      agg.set(m.item_id, cur)
    }
    return [...agg.entries()]
      .map(([item_id, v]) => ({
        item_id,
        item_name: nameMap.get(item_id) ?? null,
        units: v.units,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.units - a.units)
      .slice(0, limit)
  },

  async getSettings() {
    const rows = lsLoad<{ key: string; value: string }[]>(KEYS.settings, [])
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return { currency: map["currency"] ?? "₹", storeName: map["store_name"] ?? "My Store" }
  },

  async setSetting(key, value) {
    const rows = lsLoad<{ key: string; value: string }[]>(KEYS.settings, [])
    const idx = rows.findIndex((r) => r.key === key)
    if (idx >= 0) rows[idx].value = value
    else rows.push({ key, value })
    lsSave(KEYS.settings, rows)
  },

  async getAttendance(query) {
    let rows = lsLoad<Attendance[]>(KEYS.attendance, [])
    const s = query.search.trim().toLowerCase()
    if (s) {
      rows = rows.filter(
        (a) =>
          a.employee.toLowerCase().includes(s) ||
          (a.note ?? "").toLowerCase().includes(s),
      )
    }
    if (query.status) rows = rows.filter((a) => a.status === query.status)
    if (query.employeeId) rows = rows.filter((a) => a.employee_id === query.employeeId)
    if (query.from) rows = rows.filter((a) => a.date >= query.from!)
    if (query.to) rows = rows.filter((a) => a.date <= query.to!)
    return rows.sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : -1,
    )
  },

  async createAttendance(input) {
    const rows = lsLoad<Attendance[]>(KEYS.attendance, [])
    const item: Attendance = {
      ...input,
      employee_id: input.employee_id ?? null,
      id: uid(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    rows.push(item)
    lsSave(KEYS.attendance, rows)
    return item
  },

  async updateAttendance(id, input) {
    const rows = lsLoad<Attendance[]>(KEYS.attendance, [])
    const idx = rows.findIndex((a) => a.id === id)
    if (idx >= 0) {
      rows[idx] = {
        ...rows[idx],
        ...input,
        employee_id: input.employee_id ?? null,
        updated_at: new Date().toISOString(),
      }
      lsSave(KEYS.attendance, rows)
    }
  },

  async deleteAttendance(id) {
    const rows = lsLoad<Attendance[]>(KEYS.attendance, []).filter((a) => a.id !== id)
    lsSave(KEYS.attendance, rows)
  },

  async getEmployees() {
    return lsLoad<Employee[]>(KEYS.employees, []).sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    )
  },

  async createEmployee(input) {
    const rows = lsLoad<Employee[]>(KEYS.employees, [])
    const item: Employee = {
      id: uid(),
      name: input.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    rows.push(item)
    lsSave(KEYS.employees, rows)
    return item
  },

  async deleteEmployee(id) {
    const attendance = lsLoad<Attendance[]>(KEYS.attendance, []).filter(
      (a) => a.employee_id !== id,
    )
    lsSave(KEYS.attendance, attendance)
    const rows = lsLoad<Employee[]>(KEYS.employees, []).filter((e) => e.id !== id)
    lsSave(KEYS.employees, rows)
  },

  async exportAll() {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        items: lsLoad<Item[]>(KEYS.items, []),
        movements: lsLoad<Movement[]>(KEYS.movements, []),
        attendance: lsLoad<Attendance[]>(KEYS.attendance, []),
        employees: lsLoad<Employee[]>(KEYS.employees, []),
        settings: lsLoad(KEYS.settings, []),
      },
      null,
      2,
    )
  },

  async importAll(json) {
    const data = JSON.parse(json) as {
      items: Item[]
      movements: Movement[]
      attendance?: Attendance[]
      employees?: Employee[]
      settings: { key: string; value: string }[]
    }
    lsSave(KEYS.items, data.items ?? [])
    lsSave(KEYS.movements, data.movements ?? [])
    lsSave(KEYS.attendance, data.attendance ?? [])
    lsSave(KEYS.employees, data.employees ?? [])
    lsSave(KEYS.settings, data.settings ?? [])
  },
}

export const db: Backend = isTauri ? tauriBackend : mockBackend
