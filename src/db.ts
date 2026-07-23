import Database from "@tauri-apps/plugin-sql"
import type {
  Item,
  ItemInput,
  ItemType,
  Movement,
  MovementType,
  Settings,
  Stats,
} from "./types"

const isTauri =
  "__TAURI_INTERNALS__" in window || "__TAURI__" in window

export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36)
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
  ): Promise<void>
  deleteMovement(id: string): Promise<void>
  getMovements(limit: number, itemId: string | null): Promise<Movement[]>
  getStats(type: ItemType | null): Promise<Stats>
  getItemValues(type: ItemType | null): Promise<Record<string, number>>
  getSettings(): Promise<Settings>
  setSetting(key: string, value: string): Promise<void>
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

  async addMovement(itemId, type, quantity, reason, note, unitPrice) {
    const now = new Date().toISOString()
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
        now,
        type === "in" ? (unitPrice ?? 0) : null,
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

  async exportAll() {
    const items = await pool!.select<Item[]>("SELECT * FROM items")
    const movements = await pool!.select<Movement[]>(
      "SELECT * FROM movements",
    )
    const settings = await pool!.select<{ key: string; value: string }[]>(
      "SELECT * FROM settings",
    )
    return JSON.stringify(
      { exportedAt: new Date().toISOString(), items, movements, settings },
      null,
      2,
    )
  },

  async importAll(json) {
    const data = JSON.parse(json) as {
      items: Item[]
      movements: Movement[]
      settings: { key: string; value: string }[]
    }
    await pool!.execute("DELETE FROM movements")
    await pool!.execute("DELETE FROM items")
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
  },
}

// ---- Browser fallback (only used when running the UI without Tauri) ----

const KEYS = {
  items: "inv.items",
  movements: "inv.movements",
  settings: "inv.settings",
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
  lsSave(KEYS.settings, [
    { key: "currency", value: "₹" },
    { key: "store_name", value: "My Store" },
  ])
  localStorage.setItem(KEYS.seeded, "1")
}

function normItem(i: Item): Item {
  return { ...i, type: i.type ?? "finished" }
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

  async addMovement(itemId, type, quantity, reason, note, unitPrice) {
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
      created_at: new Date().toISOString(),
      item_name: item.name,
      unit_price: type === "in" ? (unitPrice ?? 0) : null,
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

  async exportAll() {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        items: lsLoad<Item[]>(KEYS.items, []),
        movements: lsLoad<Movement[]>(KEYS.movements, []),
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
      settings: { key: string; value: string }[]
    }
    lsSave(KEYS.items, data.items ?? [])
    lsSave(KEYS.movements, data.movements ?? [])
    lsSave(KEYS.settings, data.settings ?? [])
  },
}

export const db: Backend = isTauri ? tauriBackend : mockBackend
