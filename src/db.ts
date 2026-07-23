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
  ): Promise<void>
  getMovements(limit: number, itemId: string | null): Promise<Movement[]>
  getStats(type: ItemType | null): Promise<Stats>
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
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
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

  async addMovement(itemId, type, quantity, reason, note) {
    const now = new Date().toISOString()
    let actual = quantity
    if (type === "out") {
      const rows = await pool!.select<{ quantity: number }[]>(
        "SELECT quantity FROM items WHERE id = ?",
        [itemId],
      )
      const current = rows[0]?.quantity ?? 0
      actual = Math.min(quantity, current)
    }
    const delta = type === "in" ? actual : -actual
    await pool!.execute(
      "UPDATE items SET quantity = quantity + ?, updated_at = ? WHERE id = ?",
      [delta, now, itemId],
    )
    await pool!.execute(
      `INSERT INTO movements (id, item_id, type, quantity, reason, note, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [uid(), itemId, type, actual, reason || null, note || null, now],
    )
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
    const params = type ? [type] : []
    const rows = await pool!.select<
      {
        totalItems: number
        totalUnits: number
        totalValue: number
        lowStockCount: number
        categories: number
      }[]
    >(
      `SELECT
         COUNT(*) AS totalItems,
         COALESCE(SUM(quantity),0) AS totalUnits,
         COALESCE(SUM(quantity*price),0) AS totalValue,
         COALESCE(SUM(CASE WHEN reorder_level > 0 AND quantity <= reorder_level THEN 1 ELSE 0 END),0) AS lowStockCount,
         COUNT(DISTINCT CASE WHEN category IS NOT NULL AND category <> '' THEN category END) AS categories
       FROM items ${where}`,
      params,
    )
    const r = rows[0] ?? {
      totalItems: 0,
      totalUnits: 0,
      totalValue: 0,
      lowStockCount: 0,
      categories: 0,
    }
    return {
      totalItems: Number(r.totalItems) || 0,
      totalUnits: Number(r.totalUnits) || 0,
      totalValue: Number(r.totalValue) || 0,
      lowStockCount: Number(r.lowStockCount) || 0,
      categories: Number(r.categories) || 0,
    }
  },

  async getSettings() {
    const rows = await pool!.select<{ key: string; value: string }[]>(
      "SELECT key, value FROM settings",
    )
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return {
      currency: map["currency"] ?? "$",
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
        `INSERT INTO movements (id,item_id,type,quantity,reason,note,created_at) VALUES (?,?,?,?,?,?,?)`,
        [
          mv.id,
          mv.item_id,
          mv.type,
          mv.quantity,
          mv.reason,
          mv.note,
          mv.created_at,
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
    mkItem("Rice 5kg Bag", "finished", "RICE-5KG", "Groceries", 24, "bag", 8.5, "Shelf A1", 10, now),
    mkItem("Cooking Oil 1L", "finished", "OIL-1L", "Groceries", 4, "bottle", 3.2, "Shelf A2", 8, now),
    mkItem("Notebook A5", "finished", "NB-A5", "Stationery", 52, "pcs", 1.2, "Drawer B1", 20, now),
    mkItem("Ballpoint Pen", "finished", "PEN-BLUE", "Stationery", 3, "pcs", 0.5, "Drawer B2", 15, now),
    mkItem("Bottled Water 500ml", "finished", "WATER-500", "Beverages", 120, "bottle", 0.4, "Cooler C1", 24, now),
    mkItem("Raw Flour 25kg", "raw", "FLR-25", "Ingredients", 40, "sack", 12.0, "Store Room", 12, now),
    mkItem("Sugar 50kg", "raw", "SUG-50", "Ingredients", 2, "sack", 35.0, "Store Room", 5, now),
    mkItem("Packaging Box", "raw", "PKG-BOX", "Packaging", 300, "pcs", 0.2, "Warehouse", 100, now),
  ]
  lsSave(KEYS.items, items)
  lsSave(KEYS.movements, [])
  lsSave(KEYS.settings, [
    { key: "currency", value: "$" },
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

  async addMovement(itemId, type, quantity, reason, note) {
    const items = lsLoad<Item[]>(KEYS.items, [])
    const idx = items.findIndex((i) => i.id === itemId)
    if (idx < 0) return
    let actual = quantity
    if (type === "out") actual = Math.min(quantity, items[idx].quantity)
    items[idx].quantity += type === "in" ? actual : -actual
    items[idx].updated_at = new Date().toISOString()
    lsSave(KEYS.items, items)
    const movements = lsLoad<Movement[]>(KEYS.movements, [])
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
    })
    lsSave(KEYS.movements, movements)
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
    const cats = new Set<string>()
    let totalUnits = 0
    let totalValue = 0
    let low = 0
    for (const i of items) {
      totalUnits += i.quantity
      totalValue += i.quantity * i.price
      if (i.category) cats.add(i.category)
      if (i.reorder_level > 0 && i.quantity <= i.reorder_level) low++
    }
    return {
      totalItems: items.length,
      totalUnits,
      totalValue,
      lowStockCount: low,
      categories: cats.size,
    }
  },

  async getSettings() {
    const rows = lsLoad<{ key: string; value: string }[]>(KEYS.settings, [])
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return { currency: map["currency"] ?? "$", storeName: map["store_name"] ?? "My Store" }
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
